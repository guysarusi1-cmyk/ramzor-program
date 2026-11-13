-- CORE: the first admin of a new database, and the organisation's profile for the two-week schedule. Run after core-v1.sql and the
-- product files. Safe to run again. (Guy 2026-11-13)
-- Before running: create ONE user in the dashboard (Authentication > Users > Add user, with a password). This file links the oldest
-- user of the project to a new admin row. It does nothing when an admin already exists.
do $$
declare u record; sid uuid;
begin
  if exists (select 1 from public.staff s left join public.staff_private p on p.staff_id = s.id where s.kind = 'admin' or p.is_admin) then
    raise notice 'an admin already exists: nothing to do'; return;
  end if;
  select id, email into u from auth.users order by created_at limit 1;
  if u.id is null then raise exception 'אין עדיין משתמש בפרויקט. יוצרים קודם משתמש אחד בלוח הבקרה: Authentication > Users > Add user'; end if;
  insert into public.staff (display_name, first_name, kind) values ('מנהל המערכת', 'מנהל', 'admin') returning id into sid;
  insert into public.staff_private (staff_id, email, auth_user_id, is_admin) values (sid, u.email, u.id, true);
end $$;

update public.org_profile set name = 'מרקורי שיבוצים', products = array['schedule2w'], words = '{"person":"איש צוות","people":"הצוות"}'::jsonb, updated_at = now()
 where name = 'ארגון חדש';

select 'core_first_admin' as part, (select count(*) from public.staff where kind = 'admin') as admins, (select name from public.org_profile) as organisation, (select products from public.org_profile) as products;
