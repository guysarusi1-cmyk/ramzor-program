-- Links 3 test login accounts to 3 of the (made-up or real) staff rows in the TEST project, so the portal can be tried with real sign-ins.
-- Before running: Authentication -> Users -> Add user -> Create new user (tick "Auto Confirm User") for these three e-mails, same password for all:
--     coordinator-test@merkaz-cherum.local   instructor-test@merkaz-cherum.local   service-test@merkaz-cherum.local
-- Safe to run again.
update public.staff_private p set email = 'coordinator-test@merkaz-cherum.local', auth_user_id = (select id from auth.users where email = 'coordinator-test@merkaz-cherum.local')
  where p.staff_id = (select id from public.staff where kind = 'coordinator' and active order by sort_order limit 1);
update public.staff_private p set email = 'instructor-test@merkaz-cherum.local', auth_user_id = (select id from auth.users where email = 'instructor-test@merkaz-cherum.local')
  where p.staff_id = (select s.id from public.staff s join public.staff_private x on x.staff_id = s.id where s.kind = 'instructor' and s.active and not x.manual_only and not x.no_nights and x.female order by s.sort_order limit 1);
update public.staff_private p set email = 'service-test@merkaz-cherum.local', auth_user_id = (select id from auth.users where email = 'service-test@merkaz-cherum.local')
  where p.staff_id = (select id from public.staff where kind = 'service' and active order by sort_order limit 1);
select s.kind, p.email, (p.auth_user_id is not null) as linked from public.staff s join public.staff_private p on p.staff_id = s.id where p.email like '%-test@merkaz-cherum.local' order by s.kind;