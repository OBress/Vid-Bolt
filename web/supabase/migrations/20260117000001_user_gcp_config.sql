-- Create table for user-specific GCP configuration
create table if not exists public.user_gcp_config (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  project_id text,
  region text default 'us-east4',
  zone text default 'us-east4-c',
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  
  -- Ensure one config per user
  unique(user_id)
);

-- Enable RLS
alter table public.user_gcp_config enable row level security;

-- Policies
create policy "Users can view their own config"
  on public.user_gcp_config for select
  using (auth.uid() = user_id);

create policy "Users can insert their own config"
  on public.user_gcp_config for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own config"
  on public.user_gcp_config for update
  using (auth.uid() = user_id);

create policy "Users can delete their own config"
  on public.user_gcp_config for delete
  using (auth.uid() = user_id);

-- Trigger for updated_at
create trigger handle_updated_at before update on public.user_gcp_config
  for each row execute procedure extensions.moddatetime (updated_at);
