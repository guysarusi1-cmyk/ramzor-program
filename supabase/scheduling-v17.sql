-- ================================================================
-- Scheduling, part 17 — run in the SQL Editor after scheduling-v16.sql. Safe to run again.
--   * a "welcome" e-mail to a person whose sign-in the coordinator just created: what the system is, the address, and how to enter
--     (sent by the hourly job, like the other e-mails). The address is the one of the site the coordinator works in.
-- ================================================================
create or replace function public.welcome_staff(p_staff uuid, p_url text) returns boolean language plpgsql security definer set search_path = public as $$
declare who text; mail text; url text := regexp_replace(coalesce(p_url, ''), '[#?].*$', '');
begin
  if not public.is_coordinator() then raise exception 'not allowed'; end if;
  if url !~ '^https://[a-z0-9.-]+(/[A-Za-z0-9._/-]*)?$' then url := ''; end if;
  select s.display_name, p.email into who, mail from public.staff s join public.staff_private p on p.staff_id = s.id where s.id = p_staff and s.active;
  if mail is null then return false; end if;
  if exists (select 1 from public.email_outbox where kind = 'welcome-' || p_staff::text and error is null) then return false; end if;          -- (once per person)
  insert into public.email_outbox (to_email, subject, body, kind) values (mail, 'ברוכים הבאים למערכת של מרכז החירום',
    'שלום ' || split_part(who, ' ', 1) || ',' || E'\n\n' ||
    'שמחים לבשר שנפתח לך חשבון אישי במערכת של מרכז החירום: פורטל המשמרות ותכנית הרמזור, בכניסה אחת.' || E'\n\n' ||
    'איך נכנסים (פעם אחת בכל מכשיר):' || E'\n' ||
    '1. נכנסים לכתובת: ' || coalesce(nullif(url, ''), 'האתר של מרכז החירום') || E'\n' ||
    '2. בוחרים "כניסה אישית (מייל וקוד)".' || E'\n' ||
    '3. מקלידים את כתובת המייל הזו (' || mail || ') ולוחצים "שלחו לי קוד".' || E'\n' ||
    '4. למייל הזה יגיע קוד בן 6 ספרות. מקלידים אותו, ונכנסים.' || E'\n\n' ||
    'מאותו רגע המכשיר זוכר אותך, ואין צורך בסיסמה. כדאי גם להוסיף את האתר למסך הבית של הטלפון.' || E'\n\n' ||
    'אנחנו כאן בשבילך לכל שאלה.' || E'\n\n' || 'בהוקרה,' || E'\n' || 'הצוות שלך במרכז חירום',
    'welcome-' || p_staff::text);
  return true;
end $$;
revoke all on function public.welcome_staff(uuid, text) from public, anon;
grant execute on function public.welcome_staff(uuid, text) to authenticated;
select 'scheduling_v17' as part, 'ok' as result;
