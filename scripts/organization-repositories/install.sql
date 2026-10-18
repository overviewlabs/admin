-- Content-free notifications are delivered only after the creating transaction
-- commits. The worker independently validates the canonical owner/membership.
CREATE OR REPLACE FUNCTION public.overview_notify_organization_repository()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_TABLE_NAME = 'companies' THEN
    PERFORM pg_notify('overview_organization_repositories', NEW.id::text);
  ELSE
    PERFORM pg_notify('overview_organization_repositories', NEW.company_id::text);
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS overview_organization_repository_company ON public.companies;
CREATE TRIGGER overview_organization_repository_company AFTER INSERT OR UPDATE OF status,default_responsible_user_id
ON public.companies FOR EACH ROW EXECUTE FUNCTION public.overview_notify_organization_repository();
DROP TRIGGER IF EXISTS overview_organization_repository_owner ON public.company_memberships;
CREATE TRIGGER overview_organization_repository_owner AFTER INSERT OR UPDATE OF status,membership_role,principal_id
ON public.company_memberships FOR EACH ROW EXECUTE FUNCTION public.overview_notify_organization_repository();
