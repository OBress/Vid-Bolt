-- Add revenue_proof_url to monthly_statements
ALTER TABLE public.monthly_statements 
ADD COLUMN IF NOT EXISTS revenue_proof_url text;
