-- Create table for tracking GCP GPU nodes
create table if not exists public.gpu_nodes (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  instance_name text not null,
  project_id text not null,
  zone text not null,
  machine_type text,
  external_ip text,
  status text not null, -- 'PROVISIONING', 'RUNNING', 'STOPPED', 'TERMINATED'
  provider_resource_id text, -- GCP Instance ID
  metadata jsonb default '{}'::jsonb,
  last_seen_at timestamptz default now(),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Enable RLS
alter table public.gpu_nodes enable row level security;

-- Policies
create policy "Users can view their own nodes"
  on public.gpu_nodes for select
  using (auth.uid() = user_id);

create policy "Users can insert their own nodes"
  on public.gpu_nodes for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own nodes"
  on public.gpu_nodes for update
  using (auth.uid() = user_id);

create policy "Users can delete their own nodes"
  on public.gpu_nodes for delete
  using (auth.uid() = user_id);

-- Service Role Policy (needed for Webhook if standard RLS blocks it, though service role bypasses RLS usually)
-- Adding explicit policy just in case we use a restricted client later.
-- For now, reliance on Service Role key bypasses these.

-- Function to update updated_at
create extension if not exists moddatetime schema extensions;

create trigger handle_updated_at before update on public.gpu_nodes
  for each row execute procedure extensions.moddatetime (updated_at);
