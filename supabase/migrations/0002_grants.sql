-- The hosted Supabase platform grants table privileges to anon/
-- authenticated/service_role automatically via a project-wide default-
-- privileges setup; the local CLI's bootstrap doesn't replicate that, so
-- new tables end up with no SELECT/INSERT/UPDATE/DELETE grants for those
-- roles at all. Granting explicitly here makes the schema self-contained
-- and behave the same locally and on a hosted project, instead of relying
-- on a platform default this repo doesn't control.
--
-- This does not weaken anything: RLS (enabled with no policies, in
-- 0001_init.sql) still blocks anon/authenticated from ever reading or
-- writing a row. Only the server-side service-role client — which has the
-- BYPASSRLS role attribute — is exempt, exactly as documented in the
-- README's security model.
grant usage on schema public to anon, authenticated, service_role;
grant select, insert, update, delete on all tables in schema public to anon, authenticated, service_role;
