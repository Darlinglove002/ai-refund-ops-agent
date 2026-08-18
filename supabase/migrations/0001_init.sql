-- AI Refund Ops Agent — initial schema
-- Run this in the Supabase SQL Editor (Dashboard -> SQL Editor -> New query)
-- or via `supabase db push` if you're using the CLI with this project linked.

-- ============================================================
-- mock_users: stand-in for a real customer/billing table
-- ============================================================
create table if not exists mock_users (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null unique,
  plan text not null check (plan in ('starter', 'pro', 'business')),
  signup_date timestamptz not null,
  last_active_at timestamptz,
  created_at timestamptz not null default now()
);

-- ============================================================
-- mock_transactions: mock Stripe-style payment history
-- ============================================================
create table if not exists mock_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references mock_users(id) on delete cascade,
  amount numeric(10, 2) not null,
  currency text not null default 'USD',
  occurred_at timestamptz not null,
  status text not null default 'succeeded' check (status in ('succeeded', 'refunded')),
  created_at timestamptz not null default now()
);

create index if not exists mock_transactions_user_id_idx on mock_transactions (user_id);

-- ============================================================
-- tickets: incoming refund/support requests
-- ============================================================
create table if not exists tickets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references mock_users(id) on delete set null,
  customer_message text not null,
  status text not null default 'new'
    check (status in ('new', 'analyzing', 'awaiting_approval', 'approved', 'rejected', 'completed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists tickets_status_idx on tickets (status);

create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists tickets_set_updated_at on tickets;
create trigger tickets_set_updated_at
  before update on tickets
  for each row
  execute function set_updated_at();

-- ============================================================
-- ticket_actions: append-only log of every step the agent takes.
-- This is what makes state recovery and evals possible — the full
-- decision trail lives in the DB, not in server memory.
-- ============================================================
create table if not exists ticket_actions (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references tickets(id) on delete cascade,
  action_type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists ticket_actions_ticket_id_idx on ticket_actions (ticket_id, created_at);

-- ============================================================
-- Row Level Security: deny all direct access by default.
-- No policies are added on purpose — the app only ever talks to
-- these tables through a server-side service-role client
-- (src/lib/supabase/server.ts), never from the browser. This keeps
-- the anon key harmless even though it ships to the client.
-- ============================================================
alter table mock_users enable row level security;
alter table mock_transactions enable row level security;
alter table tickets enable row level security;
alter table ticket_actions enable row level security;
