# The safety line of every SQL file meant for the TEST project only (Guy 2026-10-29): it stops at once, before any change, on any other database.
# The marker it checks is made once, on TEST only, by supabase/test-marker.sql. Used by the generators (bank*-sql.py, test-demo-sql.py).
GUARD = [
    "-- safety: TEST only. On any other database this stops here, before any change (the marker: supabase/test-marker.sql, run once on TEST)",
    "do $$ begin",
    "  if to_regclass('ops.environment') is null or not exists (select 1 from ops.environment where name = 'test') then",
    "    raise exception 'עצירה: זה לא מסד הבדיקות (TEST). לא שונה דבר.';",
    "  end if;",
    "end $$;",
]

def add(lines):
    """The guard right after the header comments of a list of SQL lines."""
    if GUARD[0] in lines: return lines
    k = 0
    while k < len(lines) and lines[k].startswith('--'): k += 1
    return lines[:k] + GUARD + [''] + lines[k:]
