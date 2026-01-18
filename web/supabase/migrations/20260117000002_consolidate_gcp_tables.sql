-- Drop the separate gpu_nodes table
drop table if exists public.gpu_nodes;

-- Add state columns to user_gcp_config
alter table public.user_gcp_config 
  add column if not exists instance_name text default 'vidbolt-workflow',
  add column if not exists machine_type text,
  add column if not exists external_ip text,
  add column if not exists status text default 'STOPPED',
  add column if not exists metadata jsonb default '{}'::jsonb,
  add column if not exists last_seen_at timestamptz default now();

-- Ensure policies cover new columns (existing policies on the table cover all columns automatically)
