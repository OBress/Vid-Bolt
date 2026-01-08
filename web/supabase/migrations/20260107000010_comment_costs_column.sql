-- Add comment to costs column to document JSON structure
COMMENT ON COLUMN public.monthly_statements.costs IS 'JSON: [{id, name, amount}] or legacy [{title, amount_usd}]';
