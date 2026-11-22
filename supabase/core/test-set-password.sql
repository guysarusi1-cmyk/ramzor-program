-- "בדיקות בית מאזן" ONLY (the product's TEST project). Guy 23.11: the two test sign-ins (an instructor, and a coordinator who is also one
-- of the staff) got no code by mail (the TEST project has no mail server of its own yet), so their password is set here instead.
-- BEFORE RUNNING: replace the words  הסיסמה-כאן  below with a password of your own (8 characters at least). Nobody else sees it.
-- Afterwards: in the site, "כניסה אישית", the e-mail of the test sign-in and this password.
-- safety: TEST only. On any other database this stops here, before any change
do $$ begin
  if to_regclass('ops.environment') is null or not exists (select 1 from ops.environment where name = 'test') then
    raise exception 'עצירה: זה לא מסד בדיקות בית מאזן (TEST). לא שונה דבר.';
  end if;
end $$;

do $$
declare pw text := 'הסיסמה-כאן';
begin
  if pw = 'הסיסמה-כאן' or length(pw) < 8 then raise exception 'צריך להחליף את המילים הסיסמה-כאן בסיסמה (8 תווים לפחות). לא שונה דבר.'; end if;
  update auth.users set encrypted_password = extensions.crypt(pw, extensions.gen_salt('bf')), email_confirmed_at = coalesce(email_confirmed_at, now()), updated_at = now()
   where email like '%+madricha@%' or email like '%+rakezet@%';
end $$;

-- which sign-ins got the password (only the test ones, by the word after the "+")
select split_part(split_part(email, '+', 2), '@', 1) as sign_in, email_confirmed_at is not null as confirmed
from auth.users where email like '%+madricha@%' or email like '%+rakezet@%';
