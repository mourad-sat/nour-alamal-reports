-- One-time, privileged setup for the FIRST ADMIN only.
-- Run from the Supabase SQL Editor of project nkrbnwvccnsanetmmuqm,
-- after the invited admin has accepted the invitation and verified their email.
-- Do NOT execute this in a public client or in the GitHub Actions runner.
-- Replace the email below IN THE DASHBOARD SQL EDITOR; never commit the actual email.

begin;

do $bootstrap_admin$
declare
  admin_email text := 'REPLACE_WITH_CONFIRMED_ADMIN_EMAIL';
  verified_user_id uuid;
begin
  if admin_email = 'REPLACE_WITH_CONFIRMED_ADMIN_EMAIL'
     or position('@' in admin_email) < 2 then
    raise exception 'Replace the placeholder with the verified admin email before running';
  end if;

  select id into verified_user_id
  from auth.users
  where lower(email) = lower(admin_email)
    and email_confirmed_at is not null;

  if verified_user_id is null then
    raise exception 'A verified invited user with the provided email was not found';
  end if;

  -- Do not upgrade an existing staff account silently.
  insert into public.staff_profiles (user_id, full_name, role, is_active)
  values (verified_user_id, 'مسؤول جمعية نور الأمل', 'admin'::public.staff_role, true);

  raise notice 'First admin profile created. Confirm its role in staff_profiles.';
end
$bootstrap_admin$;

commit;
