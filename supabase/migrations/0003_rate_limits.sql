-- Shared rate-limit counters for the routes that make billed Anthropic calls.
--
-- Why Postgres and not an in-memory counter: this app runs on Vercel's
-- serverless functions, which don't share memory across invocations, so an
-- in-process limiter would silently limit nothing. Supabase is already the
-- shared store, so no extra account is needed.
--
-- Counters are fixed windows keyed by an opaque string (a hashed client id,
-- or a global budget key). Rows older than two days are purged
-- opportunistically.

create table if not exists rate_limits (
  key text not null,
  window_start timestamptz not null,
  hits integer not null default 0,
  primary key (key, window_start)
);

-- Same deny-by-default posture as the other tables: no policies, so only the
-- server-side service-role client can touch it.
alter table rate_limits enable row level security;

create or replace function consume_rate_limit(
  p_key text,
  p_window_seconds integer,
  p_limit integer,
  p_cost integer default 1
)
returns table (out_allowed boolean, out_hits integer, out_retry_after integer)
language plpgsql
as $$
declare
  v_window timestamptz;
  v_hits integer;
begin
  if p_window_seconds <= 0 or p_limit < 0 or p_cost < 1 then
    raise exception 'invalid rate limit arguments';
  end if;

  v_window := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);

  insert into rate_limits as r (key, window_start, hits)
  values (p_key, v_window, p_cost)
  on conflict (key, window_start) do update set hits = r.hits + p_cost
  returning r.hits into v_hits;

  if random() < 0.01 then
    delete from rate_limits where window_start < now() - interval '2 days';
  end if;

  return query select
    v_hits <= p_limit,
    v_hits,
    greatest(
      1,
      ceil(extract(epoch from (v_window + make_interval(secs => p_window_seconds) - now())))::integer
    );
end;
$$;

-- Without this, anyone holding the public anon key could call the function
-- through the REST API and burn the shared budget on purpose.
revoke all on function consume_rate_limit(text, integer, integer, integer) from public, anon, authenticated;
grant execute on function consume_rate_limit(text, integer, integer, integer) to service_role;
