-- Daily reset for the public demo (called by the cron route, service role only).
--
-- Two things drift on a public demo with no login, and both break it:
--
--  1. Visitors resolve tickets. Anything a human did (approve / reject /
--     modify / feedback) is rolled back, and tickets return to the state the
--     agent left them in. The agent's own work is kept, so no Anthropic call
--     is needed to restore a ticket — the reset costs nothing.
--
--  2. The seed data is dated relative to the moment it was loaded, so the
--     "paid 3 days ago, never used it" customer slowly turns into "paid 78
--     days ago" and the refund scenario quietly becomes a denial. Dates are
--     re-anchored to now() using the same offsets as supabase/seed.sql.
--
-- Keep the offsets below in sync with seed.sql.

create or replace function reset_demo()
returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_human_actions integer;
  v_visitor_refunds integer;
  v_tickets_restored integer;
  v_users_redated integer;
begin
  -- 1a. Everything a human decided or wrote.
  with d as (
    delete from ticket_actions
    where action_type in ('human_approved', 'human_rejected', 'human_modified', 'human_feedback')
    returning 1
  )
  select count(*) into v_human_actions from d;

  -- 1b. A mock refund that wasn't the agent's own auto-approval belongs to a
  --     visitor's approval, which was just undone.
  with d as (
    delete from ticket_actions a
    where a.action_type = 'mock_refund_executed'
      and not exists (
        select 1 from ticket_actions b
        where b.ticket_id = a.ticket_id and b.action_type = 'auto_approved'
      )
    returning 1
  )
  select count(*) into v_visitor_refunds from d;

  -- 1c. Put each ticket back where the agent left it. Tickets mid-analysis
  --     are left alone.
  with restored as (
    update tickets t
    set status = case
      when exists (select 1 from ticket_actions a where a.ticket_id = t.id and a.action_type = 'auto_approved')
        then 'completed'
      when exists (
        select 1 from ticket_actions a
        where a.ticket_id = t.id
          and a.action_type in ('decision_proposed', 'guardrail_blocked', 'agent_incomplete')
      ) then 'awaiting_approval'
      else 'new'
    end
    where t.status <> 'analyzing'
      and t.status is distinct from case
        when exists (select 1 from ticket_actions a where a.ticket_id = t.id and a.action_type = 'auto_approved')
          then 'completed'
        when exists (
          select 1 from ticket_actions a
          where a.ticket_id = t.id
            and a.action_type in ('decision_proposed', 'guardrail_blocked', 'agent_incomplete')
        ) then 'awaiting_approval'
        else 'new'
      end
    returning 1
  )
  select count(*) into v_tickets_restored from restored;

  -- 2. Re-anchor the seed customers' dates to now().
  with offsets (email, signup_ago, active_ago) as (
    values
      ('alice@example.com',  interval '3 days',  null::interval),
      ('bob@example.com',    interval '5 days',  null),
      ('isabel@example.com', interval '1 day',   null),
      ('leo@example.com',    interval '4 days',  null),
      ('olivia@example.com', interval '6 days',  null),
      ('quinn@example.com',  interval '12 days', null),
      ('frank@example.com',  interval '13 days', null),
      ('carol@example.com',  interval '20 days', interval '2 days'),
      ('dave@example.com',   interval '30 days', null),
      ('maria@example.com',  interval '21 days', null),
      ('jack@example.com',   interval '60 days', interval '1 day'),
      ('pete@example.com',   interval '45 days', interval '40 days'),
      ('erin@example.com',   interval '2 days',  interval '1 day'),
      ('noah@example.com',   interval '9 days',  interval '8 days'),
      ('rita@example.com',   interval '2 days',  interval '0 days'),
      ('grace@example.com',  interval '14 days', null),
      ('henry@example.com',  interval '15 days', null),
      ('karen@example.com',  interval '7 days',  interval '7 days' - interval '3 hours')
  ),
  u as (
    update mock_users m
    set signup_date = now() - o.signup_ago,
        last_active_at = case when o.active_ago is null then null else now() - o.active_ago end
    from offsets o
    where m.email = o.email
    returning m.id, m.signup_date
  ),
  t as (
    update mock_transactions x
    set occurred_at = u.signup_date, status = 'succeeded'
    from u
    where x.user_id = u.id
    returning 1
  )
  select count(*) into v_users_redated from u;

  return jsonb_build_object(
    'human_actions_removed', v_human_actions,
    'visitor_refunds_removed', v_visitor_refunds,
    'tickets_restored', v_tickets_restored,
    'customers_redated', v_users_redated
  );
end;
$$;

revoke all on function reset_demo() from public, anon, authenticated;
grant execute on function reset_demo() to service_role;
