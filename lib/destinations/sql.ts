// Setup SQL shown to owners (isomorphic: rendered in the Connect tab).

export const SUPABASE_TABLE_SQL = `create table if not exists public.form_responses (
  response_id uuid primary key,
  form_id text not null,
  submitted_at timestamptz not null,
  data jsonb not null
);
-- Keep responses private: RLS on, no public policies.
-- Use your project's secret key in AIESEC Forms; it bypasses RLS.
alter table public.form_responses enable row level security;`;

export const POSTGRES_TABLE_SQL = `create table if not exists public.form_responses (
  response_id uuid primary key,
  form_id text not null,
  submitted_at timestamptz not null,
  data jsonb not null
);`;
