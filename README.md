# AI Refund Ops Agent

A human-in-the-loop billing support agent. It reads a customer's refund
request, pulls their account and payment history, applies the refund policy,
and drafts a decision — but it never executes anything financial without a
human clicking Approve. Built as a demonstration of production-grade
patterns for LLM agents that touch real business processes: code-level
guardrails independent of the prompt, durable state so nothing is lost on a
crash/restart, and measured accuracy via an eval suite instead of "it seems
to work."

Status: work in progress. This README will grow with architecture notes,
a demo GIF, and eval results as later phases land.

## Stack

- Next.js (App Router, TypeScript, Tailwind CSS)
- shadcn/ui
- Supabase (Postgres) for storage
- Claude API (tool calling) for the agent
- Vercel for deployment

## Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create a Supabase project (or reuse an existing one) at
   [supabase.com](https://supabase.com).

3. In the Supabase Dashboard, open **SQL Editor** and run, in order:
   - [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql) — creates the schema
   - [`supabase/seed.sql`](supabase/seed.sql) — loads mock customers, payments, and starter tickets

4. Copy `.env.example` to `.env.local` and fill in:
   - `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` — Project Settings -> API
   - `SUPABASE_SERVICE_ROLE_KEY` — same page, server-side only, **never** commit this
   - `ANTHROPIC_API_KEY` — from [console.anthropic.com](https://console.anthropic.com)

5. Run the dev server:

   ```bash
   npm run dev
   ```

## Data model

- `mock_users` / `mock_transactions` — stand-ins for a real customer and billing table.
- `tickets` — incoming refund requests, one state machine each (`new -> analyzing -> awaiting_approval -> approved|rejected -> completed`).
- `ticket_actions` — append-only log of every step the agent takes (tool calls, proposed decisions, guardrail blocks, human decisions). This is what makes state recovery and evals possible: the full decision trail lives in the database, not in server memory.

Row Level Security is enabled on every table with no policies — the app only
ever talks to Supabase through a server-side service-role client
([`src/lib/supabase/server.ts`](src/lib/supabase/server.ts)), never directly
from the browser.
