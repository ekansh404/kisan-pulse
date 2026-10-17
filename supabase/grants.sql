-- Run in Supabase -> SQL Editor if the app shows "permission denied for table ...".
-- Newer Supabase projects don't automatically give the server key access to tables made in the SQL editor.
-- This gives ONLY the server-side key (service_role) full access. The browser keys (anon/authenticated) get nothing,
-- so the database still can't be read from the browser.
grant usage on schema public to service_role;
grant all privileges on all tables in schema public to service_role;
grant all privileges on all sequences in schema public to service_role;
alter default privileges in schema public grant all on tables to service_role;
alter default privileges in schema public grant all on sequences to service_role;
