-- scheduling v61 (2026-11-05): first name and family name (Guy). Run once on each project, TEST first; on LIVE just before the release. Safe to run again.
--   * everybody on the staff shows by the first name only, everywhere; the first letter of the family name only when two active people have the same first name.
--   * staff.first_name (everybody may see it), staff_private.last_name (the coordinator and the admin only).
--   * staff.display_name stays the name that the site, the engine, the e-mails and the kids' TV read. It is now worked out here, so all of them follow.
--   * a name of two words today is split: the first word is the first name, the rest the family name. "בת שבע" stays whole. The list at the end shows the result, to check.
--   * the name as it was stays in staff.display_name_before (the way back).
alter table public.staff add column if not exists first_name text;
alter table public.staff add column if not exists display_name_before text;
alter table public.staff_private add column if not exists last_name text;

-- today's names, once (a person with a first name already is not touched)
do $$
declare r record; nm text; f text; l text;
begin
  for r in select s.id, s.display_name, p.staff_id as has_private from public.staff s left join public.staff_private p on p.staff_id = s.id where s.first_name is null loop
    nm := regexp_replace(btrim(r.display_name), '\s+', ' ', 'g');
    if nm = 'בת שבע' or nm like 'בת שבע %' then f := 'בת שבע'; l := btrim(substr(nm, 7));
    elsif position(' ' in nm) = 0 or r.has_private is null then f := nm; l := '';
    else f := split_part(nm, ' ', 1); l := btrim(substr(nm, length(f) + 2)); end if;
    update public.staff set first_name = f, display_name_before = r.display_name where id = r.id;
    if l <> '' then update public.staff_private set last_name = regexp_replace(l, '[''׳]$', '') where staff_id = r.id and last_name is null; end if;
  end loop;
end $$;

-- the shown name of everybody: the first name, and the letter only when another active person has the same first name
create or replace function public.staff_names_refresh() returns void language plpgsql security definer set search_path = public as $$
begin
  perform set_config('staff.names', 'on', true);
  update public.staff s set display_name = x.nm from (
    select a.id, case when coalesce(btrim(p.last_name), '') <> '' and exists (select 1 from public.staff o where o.id <> a.id and o.active and o.removed_at is null and btrim(o.first_name) = btrim(a.first_name))
                      then btrim(a.first_name) || ' ' || left(btrim(p.last_name), 1) || '''' else btrim(a.first_name) end as nm
    from public.staff a left join public.staff_private p on p.staff_id = a.id where a.first_name is not null) x
  where x.id = s.id and s.display_name is distinct from x.nm;
  perform set_config('staff.names', '', true);
end $$;
revoke all on function public.staff_names_refresh() from public, anon, authenticated;

-- a page that still writes display_name (the old site until the release): it counts as the first name
create or replace function public.staff_name_in() returns trigger language plpgsql set search_path = public as $$
begin
  if coalesce(current_setting('staff.names', true), '') = 'on' then return new; end if;
  if tg_op = 'INSERT' then
    new.first_name := coalesce(nullif(btrim(new.first_name), ''), btrim(new.display_name));
    new.display_name := coalesce(nullif(btrim(new.display_name), ''), new.first_name);
  elsif new.display_name is distinct from old.display_name and new.first_name is not distinct from old.first_name then
    new.first_name := btrim(new.display_name);
  end if;
  return new;
end $$;
create or replace function public.staff_name_after() returns trigger language plpgsql security definer set search_path = public as $$
begin perform public.staff_names_refresh(); return null; end $$;
revoke all on function public.staff_name_in(), public.staff_name_after() from public, anon, authenticated;

drop trigger if exists staff_name_in on public.staff;
create trigger staff_name_in before insert or update on public.staff for each row execute function public.staff_name_in();
drop trigger if exists staff_name_new on public.staff;
create trigger staff_name_new after insert or delete on public.staff for each statement execute function public.staff_name_after();
drop trigger if exists staff_name_change on public.staff;
create trigger staff_name_change after update on public.staff for each row
  when (old.first_name is distinct from new.first_name or old.active is distinct from new.active or old.removed_at is distinct from new.removed_at)
  execute function public.staff_name_after();
drop trigger if exists staff_last_new on public.staff_private;
create trigger staff_last_new after insert on public.staff_private for each row execute function public.staff_name_after();
drop trigger if exists staff_last_change on public.staff_private;
create trigger staff_last_change after update on public.staff_private for each row when (old.last_name is distinct from new.last_name) execute function public.staff_name_after();

select public.staff_names_refresh();

-- the kids' TV: the same name as everywhere (it was the first name and a letter for everybody: Guy 2026-11-05)
create or replace function public.tv_label(sid uuid) returns text language sql stable security definer set search_path = public as $$
  select display_name from public.staff where id = sid
$$;
revoke all on function public.tv_label(uuid) from public, anon;

-- the welcome e-mail: "שלום בת שבע", not "שלום בת"
create or replace function public.welcome_staff(p_staff uuid, p_url text) returns boolean language plpgsql security definer set search_path = public as $$
declare who text; mail text; url text := regexp_replace(coalesce(p_url, ''), '[#?].*$', ''); he text; ar text;
begin
  if not public.is_coordinator() then raise exception 'not allowed'; end if;
  if url !~ '^https://[a-z0-9.-]+(/[A-Za-z0-9._/-]*)?$' then url := ''; end if;
  select s.display_name, p.email into who, mail from public.staff s join public.staff_private p on p.staff_id = s.id where s.id = p_staff and s.active;
  if mail is null then return false; end if;
  if exists (select 1 from public.email_outbox where kind = 'welcome-' || p_staff::text and error is null) then return false; end if;          -- (once per person)
  he := 'שלום ' || regexp_replace(who, ' [^ ]''$', '') || ',' || E'\n\n' ||
    'שמחים לבשר שנפתח לך חשבון אישי במערכת של מרכז החירום: פורטל המשמרות ותכנית הרמזור, בכניסה אחת.' || E'\n\n' ||
    'הכניסה הראשונה:' || E'\n' ||
    '1. נכנסים לכתובת: ' || coalesce(nullif(url, ''), 'האתר של מרכז החירום') || E'\n' ||
    '2. בוחרים "כניסה אישית".' || E'\n' ||
    '3. מקלידים את כתובת המייל הזו (' || mail || ') ולוחצים "שלחו לי קוד למייל".' || E'\n' ||
    '4. למייל הזה יגיע קוד. מקלידים אותו.' || E'\n' ||
    '5. בוחרים סיסמה אישית. מהפעם הבאה נכנסים עם המייל והסיסמה, בלי קוד.' || E'\n\n' ||
    'שכחת את הסיסמה? אפשר תמיד לבקש קוד חדש למייל. כדאי גם להוסיף את האתר למסך הבית של הטלפון.' || E'\n\n' ||
    'אנחנו כאן בשבילך לכל שאלה.' || E'\n\n' || 'בהוקרה,' || E'\n' || 'הצוות שלך במרכז חירום';
  if public.lang_of(p_staff) = 'ar' then
    ar := 'مرحبًا ' || regexp_replace(who, ' [^ ]''$', '') || '،' || E'\n\n' ||
      'يسعدنا إبلاغك أنه فُتح لك حساب شخصي في نظام مركز الطوارئ: بوابة المناوبات وبرنامج الإشارة الضوئية، بدخول واحد. البوابة متوفرة باللغة العربية.' || E'\n\n' ||
      'الدخول الأول:' || E'\n' ||
      '1. ادخلوا إلى العنوان: ' || coalesce(nullif(url, ''), 'موقع مركز الطوارئ') || E'\n' ||
      '2. اختاروا "دخول شخصي" (כניסה אישית).' || E'\n' ||
      '3. اكتبوا عنوان البريد الإلكتروني هذا (' || mail || ') واضغطوا "أرسلوا لي رمزًا للبريد الإلكتروني".' || E'\n' ||
      '4. سيصل رمز إلى هذا البريد. اكتبوه.' || E'\n' ||
      '5. اختاروا كلمة مرور شخصية. من المرة القادمة يكون الدخول بالبريد الإلكتروني وكلمة المرور، بدون رمز.' || E'\n\n' ||
      'نسيت كلمة المرور؟ يمكن دائمًا طلب رمز جديد للبريد الإلكتروني. يُستحسن أيضًا إضافة الموقع إلى الشاشة الرئيسية للهاتف.' || E'\n\n' ||
      'نحن هنا من أجلك لأي سؤال.' || E'\n\n' || 'مع التقدير،' || E'\n' || 'طاقمك في مركز الطوارئ';
  end if;
  insert into public.email_outbox (to_email, subject, body, kind) values (mail,
    case when ar is not null then 'أهلًا وسهلًا في نظام مركز الطوارئ | ברוכים הבאים למערכת של מרכז החירום' else 'ברוכים הבאים למערכת של מרכז החירום' end,
    case when ar is not null then ar || E'\n\n— בעברית —\n\n' || he else he end, 'welcome-' || p_staff::text);
  return true;
end $$;
revoke all on function public.welcome_staff(uuid, text) from public, anon;
grant execute on function public.welcome_staff(uuid, text) to authenticated;

-- to check: who became what. A first name of two words that was split by mistake is fixed in the admin portal.
select s.display_name as shown, s.first_name, p.last_name, s.display_name_before as before, s.kind, s.active
from public.staff s left join public.staff_private p on p.staff_id = s.id order by s.active desc, s.kind, s.first_name;
