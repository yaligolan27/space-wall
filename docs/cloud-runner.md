# הרצה בענן על המנוי — Routine של Claude Code

זו החלופה למחשב שנשאר דלוק: אותו קוד בדיוק, אבל מי שמפעיל אותו הוא Routine של Claude Code בענן, שפותח סשן קצר לפי לוח זמנים, מריץ מחזור עדכון אחד, ונסגר. הסשן רץ על המנוי, ולכן אין מפתח API.

## מה כן ומה לא

| רכיב | איפה רץ | הערה |
| --- | --- | --- |
| הצג בדומיין | Vercel | הדומיין קבוע, התוכן מגיע מ-`/api/feed` |
| webhook של טלגרם | Vercel | עונה מיד, מכניס לתור |
| איסוף, סיווג, פירוש הודעות, מספרי השבוע | סשן ענן של Claude Code | מופעל על ידי Routine |

**Vercel לא יכול להריץ את עבודת המודל.** פונקציה ב-Vercel לא יכולה להיות מחוברת למנוי Claude, ושימוש בהרשאות המנוי בתוך קוד שרת גם אינו מותר. לכן עבודת המודל חייבת לרוץ בתוך Claude Code עצמו: או על מחשב מקומי (`local-runner.md`), או בסשן ענן כמו כאן.

## ההבדל המהותי: תדירות

Routine יכול לרוץ **לכל היותר פעם בשעה**. המשמעות:

| מה | מקומי | ענן |
| --- | --- | --- |
| ידיעה חדשה מופיעה בצג | תוך כ-10 דקות | תוך עד שעה |
| כרטיס אישור בטלגרם | תוך פחות מדקה | תוך עד שעה |
| שיגורים ומזג אוויר | כל 15–30 דקות | כל שעה |
| תלות במחשב שלך | כן | לא |

הבוט עונה "קיבלתי, מעבד" מיד בכל מקרה, אבל כרטיס האישור מגיע רק כשהסשן הבא רץ. אם זה חשוב לך, אפשר לשלב: המחשב המקומי כשהוא דלוק, וה-Routine כגיבוי שעתי. שני המסלולים משתמשים באותן טבלאות ולא מפריעים זה לזה.

## הגדרת הסביבה בענן (פעם אחת)

ה-Routine רץ בסביבת הענן של Claude Code שמחוברת לריפו הזה. בהגדרות הסביבה (תפריט הסביבה בכותרת הסשן → Edit) צריך שני דברים:

**1. גישה לרשת.** ברירת המחדל חוסמת יציאה החוצה. או לבחור רמת גישה רחבה, או להוסיף לרשימת הדומיינים המותרים:

```
rrbivwhratkmzcfxqjih.supabase.co
ll.thespacedevs.com
services.swpc.noaa.gov
api.telegram.org
```

וגם את דומייני המקורות: `spacenews.com`, `breakingdefense.com`, `payloadspace.com`, `airandspaceforces.com`, `defensenews.com`, `nasaspaceflight.com`, `thespacereview.com`, `esa.int`, `space.com`, `arstechnica.com`, `israeldefense.co.il`, `calcalist.co.il`. רמת גישה רחבה חוסכת את התחזוקה של הרשימה כשמוסיפים מקור.

**2. משתני סביבה.** אותם שמות כמו ב-`.env.example`:

```
SUPABASE_URL=https://rrbivwhratkmzcfxqjih.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<מ-Supabase → Project Settings → API Keys → service_role>
TELEGRAM_BOT_TOKEN=<מ-BotFather>
TELEGRAM_ALERT_CHAT_ID=<chat id שלך>
CLAUDE_MODEL=sonnet
```

אף פעם לא להדביק את הערכים בצ׳אט; רק בהגדרות הסביבה.

## ה-Routine

הפקודה שהוא מריץ בכל פעם:

```
npm run agent:cloud
```

זה מריץ `scripts/cloud-run.sh`: מתקין תלויות אם חסרות, ואז `launches weather collect enrich intake`. פעם ביום, בריצת הלילה, מוסיפים `numbers`.

לוח זמנים מומלץ, בשעון ישראל:

| Routine | cron (UTC) | משימות |
| --- | --- | --- |
| שעתי, 07:00–23:00 | `5 4-20 * * *` | `launches weather collect enrich intake` |
| לילה | `30 22 * * *` | `launches weather collect enrich intake numbers` |

בדיקה ידנית לפני שמפעילים את הלוח: בסשן ענן חדש להריץ `npm run doctor` ואז `npm run agent:cloud`. אם שניהם עוברים, ה-Routine יעבוד.

## מכסת המנוי

כל הפעלה היא סשן Claude Code קצר: פתיחת סביבה, הרצת הסקריפט, ובתוכו קריאה אחת או שתיים ל-`claude` דרך הגשר (`agent/src/cc.ts`). כשאין ידיעות חדשות ואין הודעות בתור, הסשן לא קורא למודל בכלל, רק מושך RSS ושיגורים. עשרים ריצות ביום הן עומס סביר למנוי Max, אבל שווה לעקוב בשבוע הראשון דרך `/status` בטלגרם ודרך טבלת `agent_runs`.

אם נגמרת המכסה באמצע ריצה, הגשר מזהה זאת, הריצה מסתיימת בסטטוס `limited`, ונשלחת התראה לטלגרם. הריצה הבאה תנסה שוב.

## תקלות

| תסמין | סיבה | פתרון |
| --- | --- | --- |
| הריצה נכשלת על `connect_rejected` או `ENOTFOUND` | הרשת חסומה בסביבה | סעיף 1 למעלה |
| `Missing environment variable SUPABASE_URL` | חסר משתנה בסביבה | סעיף 2 למעלה, ואז סשן חדש |
| הריצה עוברת אבל הצג לא מתעדכן | Vercel | `npm run feed:preview` בסשן; אם ה-JSON תקין, הבעיה בפריסה |
| שתי הודעות אישור על אותה הודעת טלגרם | מחשב מקומי ו-Routine רצו יחד | נפתר במיגרציה 0003 (claim); ודאו שהיא הוחלה |
