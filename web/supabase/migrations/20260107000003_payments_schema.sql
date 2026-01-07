-- Create payment status enum
DO $$ BEGIN
    CREATE TYPE public.payment_status AS ENUM ('draft', 'pending_verification', 'paid');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Create monthly statements table
CREATE TABLE IF NOT EXISTS public.monthly_statements (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
    month_date date NOT NULL, -- We'll store the first of the month, e.g. '2024-01-01'
    total_revenue numeric DEFAULT 0,
    costs jsonb DEFAULT '[]'::jsonb, -- Array of { name: string, amount: number }
    commission_rate numeric DEFAULT 0.1, -- 10% default
    status public.payment_status DEFAULT 'draft',
    payment_proof_url text,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    
    -- Ensure one statement per month per user
    UNIQUE(user_id, month_date)
);

-- Enable RLS
ALTER TABLE public.monthly_statements ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users can view their own statements"
    ON public.monthly_statements FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own statements"
    ON public.monthly_statements FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own statements"
    ON public.monthly_statements FOR UPDATE
    USING (auth.uid() = user_id);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_monthly_statements_user_date 
    ON public.monthly_statements(user_id, month_date);
