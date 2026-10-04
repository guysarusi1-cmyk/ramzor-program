-- ================================================================
-- Hardening for "תכנית הרמזור" — run ONCE in the Supabase SQL Editor of each project
-- (the test project first, then the live one). Safe to run again.
-- ================================================================

-- 1) PRIVACY: someone who is not signed in (the kids' TV, or anyone who just knows the address and the
--    public key in the page) may read only first name + last initial of each child.
--    Age, the social worker's name and phone, and everything else stay visible to signed-in staff only.
revoke select on public.roster from anon;
grant  select (id, first_name, last_initial) on public.roster to anon;
grant  select on public.roster to authenticated;

-- 2) UNDO for "גריעת בונוס": staff can take back a revocation they just made.
grant delete on public.bonus_revocations to authenticated;
drop policy if exists "staff delete" on public.bonus_revocations;
create policy "staff delete" on public.bonus_revocations for delete to authenticated using (true);

-- To check afterwards (should fail with "permission denied"):
--   curl "<project url>/rest/v1/roster?select=sw_phone" -H "apikey: <anon key>"
