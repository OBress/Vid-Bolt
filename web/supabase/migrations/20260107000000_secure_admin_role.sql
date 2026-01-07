-- Secure is_admin column
-- Only allow service_role to update the is_admin column.

CREATE OR REPLACE FUNCTION public.protect_admin_column()
RETURNS TRIGGER AS $$
BEGIN
  -- Check if is_admin is being changed
  IF NEW.is_admin IS DISTINCT FROM OLD.is_admin THEN
    -- Check if the current role is service_role
    -- We check the configuration parameter or the specialized function if available.
    -- session_user is often the role connected to Postgres. 
    -- auth.role() is Supabase specific.
    -- A robust way in trigger context is checking current_setting('request.jwt.claim.role', true).
    
    IF (current_setting('request.jwt.claim.role', true) = 'service_role') THEN
      RETURN NEW;
    END IF;

    -- If not service_role, raise an exception or revert the change.
    RAISE EXCEPTION 'You are not authorized to change the is_admin status.';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop trigger if exists to allow idempotency during dev
DROP TRIGGER IF EXISTS protect_admin_column_trigger ON public.users;

CREATE TRIGGER protect_admin_column_trigger
BEFORE UPDATE ON public.users
FOR EACH ROW
EXECUTE FUNCTION public.protect_admin_column();
