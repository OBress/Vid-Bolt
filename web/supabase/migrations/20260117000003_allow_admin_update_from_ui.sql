-- Allow postgres role (Dashboard/SQL Editor) to update is_admin
-- This enables changing admin status from the Supabase Web UI

CREATE OR REPLACE FUNCTION public.protect_admin_column()
RETURNS TRIGGER AS $$
BEGIN
  -- Check if is_admin is being changed
  IF NEW.is_admin IS DISTINCT FROM OLD.is_admin THEN
    -- 1. Allow service_role (used by backend/workers)
    IF (current_setting('request.jwt.claim.role', true) = 'service_role') THEN
      RETURN NEW;
    END IF;

    -- 2. Allow postgres role (used by Supabase Dashboard / SQL Editor)
    -- This allows the owner to change status from the Web UI
    IF (session_user = 'postgres') THEN
      RETURN NEW;
    END IF;

    -- If neither, block the update
    RAISE EXCEPTION 'You are not authorized to change the is_admin status. This action is restricted to the Supabase Dashboard or Service Role.';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
