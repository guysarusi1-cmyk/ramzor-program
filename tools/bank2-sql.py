# The goal bank, version 2 (Guy's walkthrough, Q31-40): supabase/bank2/*.json -> supabase/scheduling-v44-bank.sql
# A goal has, per age group (2-5, 5-8; over 8 gets 5-8), targets (professional + plain for the staff + 5 spiral stations) and interventions
# (name, what, why, frequency, approach, the targets it fits, sentences). Everything Claude writes is a draft until the admin approves it.
# The old bank (version 1 goals and the whole-plan templates) goes to the archive (active = false), kept as raw material.
# Run: python tools/bank2-sql.py
import io, json, glob, os, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
AGES = ['2-5', '5-8']
METHODS = [
    ('ARC', 'Attachment, Regulation and Competency', 'מסגרת לעבודה עם ילדים אחרי טראומה מורכבת, דרך המבוגרים והשגרה שסביבם.', 'ילדים בסידור חוץ ביתי וצוותים של מסגרות מגורים.',
     ['התקשרות: מבוגרים קשובים, עקביים וצפויים', 'ויסות: לזהות רגשות ולהירגע, קודם יחד ואחר כך לבד', 'מסוגלות: בחירה, זהות חיובית ותפקוד'], 'טקס בוקר קבוע עם אותו מבוגר, ומד רגשות שבודקים פעמיים ביום.',
     'Blaustein & Kinniburgh, Treating Traumatic Stress in Children and Adolescents'),
    ('DDP/PACE', 'Dyadic Developmental Psychotherapy', 'גישה שמתמקדת ביחסים בין הילד למבוגר אחרי טראומת היקשרות. PACE היא הדרך היומיומית: שובבות, קבלה, סקרנות ואמפתיה.', 'ילדים שקשה להם לסמוך על מבוגרים.',
     ['מקבלים את הרגש, גם כשמציבים גבול להתנהגות', 'סקרנים לגבי מה שמאחורי ההתנהגות, בלי האשמה', 'המבוגר אחראי לתקן את הקשר אחרי ריב'], 'אחרי התפרצות: מה קרה לך שם? במקום למה עשית את זה?',
     'Daniel Hughes, Building the Bonds of Attachment'),
    ('TF-CBT', 'Trauma-Focused Cognitive Behavioral Therapy', 'טיפול קוגניטיבי-התנהגותי ממוקד טראומה, עם מחקר רב על יעילותו.', 'ילדים מגיל 3 עם תסמיני טראומה.',
     ['מיומנויות הרגעה ונשימה, מתורגלות בזמן רגוע', 'זיהוי רגשות ומחשבות, והחלפת מחשבה קשה במשפט מעודד', 'הנרטיב של הטראומה רק אצל המטפל/ת; הצוות מתרגל את המיומנויות'], 'נשימת בלון שמתרגלים כל יום, וברגע של כעס עושים אותה יחד.',
     'Cohen, Mannarino & Deblinger, Treating Trauma and Traumatic Grief in Children and Adolescents'),
    ('Theraplay', 'Theraplay', 'טיפול דרך משחק משותף של מבוגר וילד, שבונה קשר והיקשרות.', 'ילדים עם קושי בקשר ובקבלת קרבה.',
     ['מבנה: המבוגר מוביל משחק צפוי ובטוח', 'מעורבות וטיפוח: משחק נעים, קרוב ושמח', 'אתגר קטן שמצליחים בו יחד'], '5 דקות ביום של ספירת אצבעות, קרם על הידיים או בועות.',
     'Booth & Jernberg, Theraplay: Helping Parents and Children Build Better Relationships Through Attachment-Based Play'),
    ('ויסות חושי', 'Sensory regulation', 'התאמת הסביבה והגירויים כדי שהגוף יוכל להירגע ולהשתתף.', 'ילדים שמוצפים מרעש, ממגע או מתנועה, או שמחפשים גירוי.',
     ['קודם הגוף: ילד/ה מוצף/ת לא יכול/ה להקשיב', 'כלים פשוטים: תנועה, לחץ עמוק, הפחתת רעש ואור', 'הכלים זמינים תמיד, לא כפרס'], 'קופסת הרגעה אישית עם כדור לחיץ, אוזניות ושמיכה כבדה.',
     'A. Jean Ayres, Sensory Integration and the Child'),
    ('NMT', 'Neurosequential Model of Therapeutics', 'מודל של ברוס פרי: מתערבים לפי סדר ההתפתחות של המוח.', 'כל ילד/ה אחרי טראומה מוקדמת.',
     ['קודם ויסות: קצב, תנועה וביטחון', 'אחר כך קשר: מבוגר קשוב', 'רק אז חשיבה ולמידה'], 'קפיצות או נדנוד קצבי לפני ששואלים מה קרה.',
     'Bruce Perry & Maia Szalavitz, The Boy Who Was Raised as a Dog'),
    ('סמכות חדשה', 'Nonviolent Resistance (NVR)', 'גישה של חיים עומר: סמכות של נוכחות ושל עקביות, בלי מאבק כוח ובלי אלימות.', 'מצבי התנגדות, תוקפנות והתנהגות מסכנת; צוותים והורים.',
     ['נוכחות: אני כאן ולא הולך/ת, גם כשקשה', 'דחייה: לא מגיבים ברגע הסערה, חוזרים לנושא כשרגוע', 'תמיכה: הצוות פועל יחד, לא מבוגר אחד לבד'], 'במקום להתווכח בסערה: נדבר על זה אחר כך, ואז חוזרים לנושא בערב.',
     'Haim Omer, Nonviolent Resistance: A New Approach to Violent and Self-Destructive Children'),
    ('TBRI', 'Trust-Based Relational Intervention', 'גישה לילדים מאומנה ומסידור חוץ ביתי: חיבור, העצמה ותיקון.', 'ילדים שעברו פגיעה ומסגרות שאין בהן רק אנשי מקצוע.',
     ['חיבור: מבט, שם ומגע לפני כל בקשה', 'העצמה: לענות על צרכים בסיסיים (מים, אוכל, תנועה) לפני שמצפים להתנהגות', 'תיקון: עם בחירות ועשייה מחדש, לא עם עונש'], 'מה את/ה צריך/ה עכשיו? מים, הפסקה או חיבוק?',
     'Karyn Purvis, David Cross & Wendy Sunshine, The Connected Child'),
    ('CPS', 'Collaborative & Proactive Solutions', 'גישה של רוס גרין: ילדים מתנהגים טוב כשהם יכולים. במקום עונש, פותרים בעיה יחד.', 'ילדים עם התפרצויות והתנהגות מאתגרת.',
     ['מזהים מראש את המצבים שקשים לילד/ה', 'שואלים מה קורה, ומקשיבים באמת', 'מחפשים יחד פתרון שמתאים לשני הצדדים'], 'בזמן רגוע: שמתי לב שקשה לך במעבר לארוחה. מה קורה?',
     'Ross Greene, The Explosive Child'),
    ('מעגל הביטחון', 'Circle of Security', 'מודל של היקשרות: המבוגר הוא בסיס בטוח לצאת ממנו ונמל מבטחים לחזור אליו.', 'כל ילד/ה, ובמיוחד צעירים; שפה פשוטה לצוות.',
     ['בסיס בטוח: המבוגר זמין כשהילד/ה יוצא/ת לשחק ולחקור', 'נמל מבטחים: המבוגר מקבל כשהילד/ה חוזר/ת במצוקה', 'תמיד גדול, חזק, חכם וטוב יותר'], 'כשהילד/ה בא/ה בבכי: מתכופפים, מקבלים, ואחרי שנרגע/ת עוזרים לחזור לשחק.',
     'Powell, Cooper, Hoffman & Marvin, The Circle of Security Intervention'),
    ('טיפול נרטיבי', 'Narrative therapy', 'גישה שמתייחסת לחיים כסיפור, ומפרידה בין הילד/ה לבין הבעיה.', 'ילדים עם דימוי עצמי שלילי, ועבודה על סיפור החיים.',
     ['הבעיה היא הבעיה, הילד/ה הוא/היא לא הבעיה', 'מחפשים רגעים שבהם הבעיה לא ניצחה', 'בונים יחד סיפור חלופי, של כוחות'], 'במקום אתה כועס: מתי הכעס מנסה לנצח אותך? ומתי ניצחת אותו?',
     'Michael White & David Epston, Narrative Means to Therapeutic Ends'),
]

def q(s): return "'" + str(s).replace("'", "''") + "'"
def arr(l): return "array[" + ", ".join(q(x) for x in l) + "]::text[]" if l else "'{}'::text[]"
def js(o): return q(json.dumps(o, ensure_ascii=False)) + "::jsonb"

themes = []
for f in sorted(glob.glob(os.path.join(ROOT, 'supabase', 'bank2', '*.json'))):
    with io.open(f, encoding='utf-8') as h: themes.append(json.load(h))
names = [m[0] for m in METHODS]
errors = []
for t in themes:
    for g in t['goals']:
        if sorted(g['ages']) != sorted(AGES): errors.append(g['title'] + ': ages')
        for a, w in g['ages'].items():
            ids = [x['id'] for x in w['targets']]
            if len(w['targets']) != 5: errors.append('%s %s: 5 targets' % (g['title'], a))
            if len(w['interventions']) != 8: errors.append('%s %s: 8 interventions' % (g['title'], a))
            for x in w['targets']:
                if len(x.get('scale', [])) != 5 or not x.get('staff') or not x.get('text'): errors.append('%s %s %s: target fields' % (g['title'], a, x['id']))
            for x in w['interventions']:
                if x['approach'] not in names: errors.append('%s %s %s: approach %s' % (g['title'], a, x['id'], x['approach']))
                if not all(k in ids for k in x['targets']): errors.append('%s %s %s: target ids' % (g['title'], a, x['id']))
                if not (2 <= len(x['sentences']) <= 3): errors.append('%s %s %s: sentences' % (g['title'], a, x['id']))
                for k in ['name', 'what', 'why', 'freq']:
                    if not x.get(k): errors.append('%s %s %s: no %s' % (g['title'], a, x['id'], k))
if errors: print('\n'.join(errors)); sys.exit(1)

up = "on conflict (scope, institution, kind, title) do update set description = excluded.description, themes = excluded.themes, category = excluded.category, methods = excluded.methods, content = excluded.content, active = true, draft = true where public.mercury_library.draft;"
out = ["-- scheduling v44 bank (2026-10-28): the goal bank, version 2, written by Claude as drafts (Guy's walkthrough). Run after scheduling-v44.sql, on TEST.",
       "-- Safe to run again: a template the admin already approved or changed is left as it is. Generated by tools/bank2-sql.py from supabase/bank2/*.json.", "",
       "-- the old bank (version 1 goals, the whole-plan templates) to the archive: kept as raw material, not offered any more",
       "update public.mercury_library set active = false where scope = 'mercury' and ((kind = 'goal' and content ? 'ages' and not (content ? 'v')) or kind = 'plan');", "",
       "-- the 11 treatment methods: what it is, who it fits, 3 principles, an example from the field, a well-known book"]
for name, en, what, who, pr, ex, src in METHODS:
    desc = 'מה היא: %s (%s)\nלמי מתאימה: %s\nעקרונות:\n• %s\n• %s\n• %s\nדוגמה מהשטח: %s\nלקריאה: %s' % (what, en, who, pr[0], pr[1], pr[2], ex, src)
    out.append("insert into public.mercury_library (scope, kind, title, description, draft) values ('mercury', 'method', %s, %s, true) on conflict (scope, institution, kind, title) do update set description = excluded.description, active = true, draft = true where public.mercury_library.draft;" % (q(name), q(desc)))
n = 0
for t in themes:
    out.append(""); out.append("-- " + t['theme'])
    for g in t['goals']:
        content = {'v': 2, 'bank': 1, 'review': g['review'], 'avoid': g['avoid'], 'strengths': g['strengths'], 'skills': g['skills'], 'ages': g['ages']}
        out.append("insert into public.mercury_library (scope, kind, title, description, themes, category, methods, content, draft) values ('mercury', 'goal', %s, %s, %s, %s, %s, %s, true) %s"
                   % (q(g['title']), q(g['line']), arr([t['theme']]), q(t['theme']), arr(g['methods']), js(content), up)); n += 1
out.append(""); out.append("select 'scheduling_v44_bank' as part, 'ok' as result, (select count(*) from public.mercury_library where kind = 'goal' and content ->> 'v' = '2' and active) as goals_v2, (select count(*) from public.mercury_library where kind = 'method' and active) as methods;")
with io.open(os.path.join(ROOT, 'supabase', 'scheduling-v44-bank.sql'), 'w', encoding='utf-8', newline='\n') as h: h.write('\n'.join(out) + '\n')
print('ok: %d goals, %d methods' % (n, len(METHODS)))
