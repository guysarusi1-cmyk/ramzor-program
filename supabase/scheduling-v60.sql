-- v60 (Guy 2026-11-05): two small additions. Safe to run again.
--   * staff.removed_at: "הסרה מהרשימה": the person is gone from every list, the old schedules keep the name. (active stays the switch for everything else; removed = active false + this date.)
--   * staff_settings.max_nights: the most nights a week this person chose in her settings (empty = no limit). The engine never goes over it.
alter table public.staff add column if not exists removed_at timestamptz;
alter table public.staff_settings add column if not exists max_nights smallint check (max_nights between 1 and 7);
