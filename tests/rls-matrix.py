# The rights matrix gate (Guy 2026-11-12, task 3). TEST project only: it never touches the live database.
# What every kind of user may read, add, change and delete is written in tests/rls-expected.json (approved by Guy).
#
#   python tests/rls-matrix.py --auto
#       The automatic part, no hands needed: signs in to the TEST project as each test user (and as a visitor who is not signed in)
#       and READS one row of every table. Reading more than the expectations allow = a deviation, exit code 1 (stops a live release).
#       It only reads; nothing is written.
#   python tests/rls-matrix.py --result <file.json | clipboard>
#       Compares a full result of supabase/rls-matrix-test.sql (Guy runs it in the SQL Editor of TEST and copies the cell): reads,
#       adds, changes, deletes, the functions and the pointed tries. Run both parts of the SQL, one after the other.
#   python tests/rls-matrix.py --approve <tables.json> [<functions.json>]
#       Writes tests/rls-expected.json from results that Guy approved. Only after his OK.
#
# A deviation = somebody can do MORE than the expectations say. Somebody who can do less is printed as a note (the site's own checks
# catch a broken screen), and does not stop a release.
import sys, os, io, re, json, subprocess, urllib.request, urllib.error

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
EXPECTED = os.path.join(ROOT, 'tests', 'rls-expected.json')
PERSONA_MAIL = {'shared': 'staff', 'oldmanager': 'manager', 'instructor': 'instructor-test', 'instructor2': 'instructor2-test', 'service': 'service-test',
                'secretary': 'secretary-test', 'therapist': 'therapist-test', 'coordinator': 'coordinator-test', 'manager': 'manager-test'}
PERSONA_PW = {'shared': 'testPassword', 'oldmanager': 'testManagerPassword'}          # (the rest: testPersonalPassword; all from config/test.json, never printed)
try: sys.stdout.reconfigure(encoding='utf-8')
except Exception: pass


def norm_read(v):            # X = no right at all, 0 = sees no row, + = sees rows
    v = str(v)
    return 'X' if v.startswith('X') else ('0' if v == '0' else ('E' if v.startswith('E') else '+'))

def norm_write(v):           # add: X no right, P stopped by a row rule, A passed. change / delete: X, 0, + (A = passed, stopped later)
    v = str(v).rstrip('~')
    if v.startswith('A'): return 'A'
    if v in ('X', 'P', '0'): return v
    return 'E' if v.startswith('E') else '+'

OWN = re.compile(r'my_staff_id\(\)|my_kind\(\)|in_conv\(|can_see_child_therapy\(|can_oncall\(|can_diary_child\(|can_control\(|can_edit_timetable\(|status = ')
RANK = {'X': 0, 'P': 1, '0': 1, 'E': 1, 'A': 2, '+': 2}          # more to the right = more access

def norm_fun(v):             # X no right; E:<code> refused inside; R=true / R=false; R:0 nothing came back; R:+ something came back
    v = str(v)
    if v.startswith('X'): return 'X'
    if v.startswith('E:'): return 'E'
    if v.startswith('R='): return v
    if v.startswith('R:'):
        n, ln = (int(x) for x in v[2:].split('/'))
        return 'R:0' if n == 0 or ln <= 2 else 'R:+'          # (no row, null, or an empty list / object)
    return v

def shape(tables, functions=None, pointed=None):
    out = {'tables': {}, 'functions': {}, 'pointed': pointed or {}}
    for name, t in sorted(tables.items()):
        per = {}
        for who, c in sorted(t['p'].items()):
            per[who] = {'s': norm_read(c.get('s', 'X')), 'i': norm_write(c.get('i', 'X')), 'u': norm_write(c.get('u', 'X')), 'd': norm_write(c.get('d', 'X'))}
            if 'j' in c: per[who]['j'] = norm_write(c['j'])
        # "own": a read rule that depends on who the person is or on their own rows (my notices, my children, my conversations...): for
        # such a table "sees no row" and "sees rows" change with the data, so for signed-in staff that difference is only a note
        own = any(pl.get('cmd') in ('SELECT', 'ALL') and OWN.search(pl.get('using') or '') for pl in (t.get('policies') or []))
        out['tables'][name] = {'empty': int(t.get('rows') or 0) == 0, 'own': bool(own), 'rls': bool(t.get('rls')), 'p': per}
    for f in functions or []:
        out['functions'][f['n'] + '(' + f['args'] + ')'] = {'anon': bool(f['anon']), 'auth': bool(f['auth']), 'r': {k: norm_fun(v) for k, v in sorted(f['r'].items())}}
    return out

def compare(exp, got, parts):
    bad, notes = [], []
    if 'tables' in parts:
        for name, t in got['tables'].items():
            e = exp['tables'].get(name)
            if e is None: bad.append(f'טבלה חדשה שאין לה ציפיות: {name}'); continue
            if e['rls'] and not t['rls']: bad.append(f'{name}: כללי השורות (RLS) כבויים')
            for who, c in t['p'].items():
                ec = e['p'].get(who)
                if ec is None: continue
                for op, label in (('s', 'קריאה'), ('i', 'הוספה'), ('j', 'הוספה של שורה זרה'), ('u', 'שינוי'), ('d', 'מחיקה')):
                    if op not in c or op not in ec: continue
                    a, b = ec[op], c[op]
                    if a == b: continue
                    if e['empty'] and {a, b} <= {'0', '+', 'A', 'P'} and op != 'i' and op != 'j': continue          # (an empty table at approval time says nothing about rows)
                    if e.get('own') and who not in ('anon', 'stranger') and {a, b} <= {'0', '+'}: notes.append(f'{name} / {who} / {label}: מצופה {a}, בפועל {b} (תלוי בנתונים)'); continue
                    line = f'{name} / {who} / {label}: מצופה {a}, בפועל {b}'
                    (bad if RANK.get(b, 2) > RANK.get(a, 0) else notes).append(line)
        for name in exp['tables']:
            if name not in got['tables']: notes.append(f'טבלה שנעלמה: {name}')
    if 'functions' in parts:
        for name, f in got['functions'].items():
            e = exp['functions'].get(name)
            if e is None:
                if f['anon'] or f['auth']: bad.append(f'פונקציה חדשה שאין לה ציפיות: {name}')
                continue
            if f['anon'] and not e['anon']: bad.append(f'{name}: נפתחה למי שאינו מחובר')
            if f['auth'] and not e['auth']: bad.append(f'{name}: נפתחה לכל מחובר')
            for who, v in f['r'].items():
                a = e['r'].get(who)
                if a is None or a == v: continue
                more = (a in ('X', 'E', 'R:0', 'R=false') and v in ('R:+', 'R=true')) or (a == 'X' and v != 'X')
                (bad if more else notes).append(f'{name} / {who}: מצופה {a}, בפועל {v}')
        for who, tries in (got.get('pointed') or {}).items():
            for k, v in tries.items():
                a = (exp.get('pointed') or {}).get(who, {}).get(k)
                if a is None or a == v: continue
                (bad if RANK.get(norm_write(v), 2) > RANK.get(norm_write(a), 0) else notes).append(f'ניסיון ממוקד {who} / {k}: מצופה {a}, בפועל {v}')
    return bad, notes

def report(bad, notes, what):
    for n in notes: print('  הערה (פחות מהמצופה): ' + n)
    if bad:
        print(f'\n{what}: {len(bad)} חריגות — מישהו יכול יותר ממה שאושר:')
        for b in bad: print('  ✗ ' + b)
        return 1
    print(f'{what}: אין חריגות' + (f' ({len(notes)} הערות)' if notes else ''))
    return 0

def load_result(src):
    if src == 'clipboard':
        txt = subprocess.run(['powershell', '-NoProfile', '-Command', '[Console]::OutputEncoding = [Text.Encoding]::UTF8; Get-Clipboard -Raw'], capture_output=True).stdout.decode('utf-8', 'replace')
    else:
        txt = io.open(src, encoding='utf-8-sig').read()
    return json.loads(txt)

# ---------------------------------------------------------------- the automatic part (reads only, TEST only)
def auto():
    cfg = json.load(io.open(os.path.join(ROOT, 'config', 'test.json'), encoding='utf-8-sig'))
    if cfg.get('env') != 'test': print('config/test.json is not the test config — stopping'); return 2
    url, key = cfg['supabaseUrl'].rstrip('/'), cfg['anonKey']
    exp = json.load(io.open(EXPECTED, encoding='utf-8'))
    def call(path, token, body=None, method=None):
        req = urllib.request.Request(url + path, data=None if body is None else json.dumps(body).encode(), method=method or ('POST' if body is not None else 'GET'),
                                     headers={'apikey': key, 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json'})
        try:
            with urllib.request.urlopen(req, timeout=30) as r: return r.status, json.loads(r.read().decode() or 'null')
        except urllib.error.HTTPError as e:
            try: return e.code, json.loads(e.read().decode() or 'null')
            except Exception: return e.code, None
    tokens = {'anon': key}
    for who, mail in PERSONA_MAIL.items():
        st, d = call('/auth/v1/token?grant_type=password', key, {'email': mail + '@merkaz-cherum.local', 'password': cfg[PERSONA_PW.get(who, 'testPersonalPassword')]})
        if st == 200 and d and d.get('access_token'): tokens[who] = d['access_token']
        else: print(f'  (לא נכנסתי בתור {who}: {st} — מדלג עליו)')
    bad, notes, n = [], [], 0
    for name, e in exp['tables'].items():
        for who, tok in tokens.items():
            ec = e['p'].get(who)
            if ec is None: continue
            st, d = call(f'/rest/v1/{name}?select=*&limit=1', tok)
            got = '+' if (st == 200 and isinstance(d, list) and d) else ('0' if st == 200 else ('X' if st in (401, 403) or (isinstance(d, dict) and d.get('code') in ('42501', 'PGRST301', 'PGRST205', '42P01')) else 'E'))
            n += 1
            a = ec['s']
            if got == a or got == 'E':
                if got == 'E': notes.append(f'{name} / {who}: תשובה לא צפויה מהשרת ({st})')
                continue
            if e['empty'] and {a, got} <= {'0', '+'}: continue
            if e.get('own') and who != 'anon' and {a, got} <= {'0', '+'}: continue          # (their own rows: depends on the data)
            line = f'{name} / {who} / קריאה: מצופה {a}, בפועל {got}'
            (bad if RANK[got] > RANK[a] else notes).append(line)
    # the kids' screen functions: a visitor with no joined screen gets nothing
    for fn, empty in (('tv_today', []), ('tv_shifts_today', None), ('tv_timetable_today', None), ('tv_events_today', []), ('tv_birthdays_today', []), ('duty_board', None), ('tv_display', None)):
        st, d = call('/rest/v1/rpc/' + fn, key, {}); n += 1
        if st == 200 and d != empty: bad.append(f'{fn}: מי שאינו מחובר ואין לו מסך עם קוד קיבל נתונים')
    print(f'נבדקו {n} קריאות בתור {len(tokens)} סוגי משתמשים (מסד הבדיקות בלבד, קריאה בלבד)')
    return report(bad, notes, 'מטריצת ההרשאות (החלק האוטומטי)')

def main(a):
    if not a or a[0] not in ('--auto', '--result', '--approve'): print(__doc__ or 'usage: --auto | --result <file|clipboard> | --approve <tables.json> [<functions.json>]'); return 2
    if a[0] == '--auto': return auto()
    if a[0] == '--approve':
        t = load_result(a[1]); f = load_result(a[2]) if len(a) > 2 else None
        old = json.load(io.open(EXPECTED, encoding='utf-8')) if os.path.exists(EXPECTED) else {}
        new = shape(t['tables'], f['functions'] if f else None, f.get('pointed') if f else None)
        if not f: new['functions'], new['pointed'] = old.get('functions', {}), old.get('pointed', {})
        new = {'about': 'What every kind of user may do in the database (TEST). Made by tests/rls-matrix.py --approve from results of supabase/rls-matrix-test.sql that Guy approved. '
                        'read: X no right, 0 sees no row, + sees rows. add (i own row, j foreign row): X no right, P stopped by a row rule, A passed. change / delete: X, 0, + rows.',
               'approved': (f or t)['made'][:10], **new}
        io.open(EXPECTED, 'w', encoding='utf-8', newline='\n').write(json.dumps(new, ensure_ascii=False, indent=1, sort_keys=True) + '\n')
        print(f"נכתב: {len(new['tables'])} טבלאות, {len(new['functions'])} פונקציות"); return 0
    r = load_result(a[1]); exp = json.load(io.open(EXPECTED, encoding='utf-8'))
    got = shape(r.get('tables') or {}, r.get('functions') or [], r.get('pointed') or {})
    part = 'tables' if r.get('part') == 'tables' else 'functions'
    return report(*compare(exp, got, [part]), f"מטריצת ההרשאות (התוצאה המלאה, חלק {'הטבלאות' if part == 'tables' else 'הפונקציות'})")

if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
