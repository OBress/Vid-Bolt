-- Enable the pgvector extension to work with embedding vectors
create extension if not exists vector;

-- Create a table to store your stock media assets
create table if not exists stock_media (
  id uuid primary key default gen_random_uuid(),
  source text not null check (source in ('wikimedia', 'youtube', 'other')), -- Enforce known sources
  external_id text, -- The ID on the source platform (e.g., YouTube Video ID)
  r2_key text not null, -- The file path in your R2 bucket 'vid-bolt-stock'
  metadata jsonb not null default '{}'::jsonb, -- Stores title, description, tags, width, height, etc.
  embedding vector(768), -- 768 dimensions for BGE-Base-en-v1.5 and similar models
  created_at timestamptz default now()
);

-- Create a search function that uses cosine similarity
-- This will be called via supabase.rpc('match_stock_media', { ... })
create or replace function match_stock_media (
  query_embedding vector(768),
  match_threshold float,
  match_count int
)
returns table (
  id uuid,
  r2_key text,
  metadata jsonb,
  similarity float
)
language sql stable
as $$
  select
    stock_media.id,
    stock_media.r2_key,
    stock_media.metadata,
    1 - (stock_media.embedding <=> query_embedding) as similarity
  from stock_media
  where 1 - (stock_media.embedding <=> query_embedding) > match_threshold
  order by similarity desc
  limit match_count;
$$;

-- Create an index to speed up vector searches
-- 'ivfflat' is good for approximate nearest neighbor search
-- We create it 'with (lists = 100)' as a starting point, can leverage HNSW index if on newer pgvector versions
create index on stock_media using ivfflat (embedding vector_cosine_ops)
with (lists = 100);
