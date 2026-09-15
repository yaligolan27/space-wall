# חיבור הבוט בטלגרם — מדריך צעד אחר צעד

הבוט הוא ערוץ העדכון של הצג: כותבים לו בעברית חופשית, הוא מציג סיכום, ואחרי אישור הנתונים נכנסים ל-Supabase ומופיעים בצג תוך דקה.

## 1. יצירת הבוט (2 דקות)

1. בטלגרם פתחו שיחה עם **@BotFather** ושלחו `/newbot`.
2. שם תצוגה: למשל `צג חלל · מנהלת החלל`. שם משתמש: חייב להסתיים ב-`bot`, למשל `spacewall_directorate_bot`.
3. BotFather יחזיר **token** בפורמט `123456789:AAF...`. זה הסוד של הבוט. שמרו אותו, אל תשלחו אותו בצ׳אט ואל תעלו אותו לגיט.
4. מומלץ: `/setprivacy` → הבוט → `Disable` רק אם תרצו להוסיף אותו לקבוצה ושיקרא הודעות שלא מתחילות ב-`/`. לשימוש בצ׳אט פרטי אין צורך.
5. אופציונלי: `/setcommands` והדביקו:
   ```
   help - הסבר ודוגמאות
   list - מה מופיע בבלוק המנהלת
   events - רצועת האירועים
   people - אנשים במערכת
   whoami - מזהה הצ׳אט שלי
   cancel - ביטול בקשה פתוחה
   ```

## 2. משתני סביבה ב-Vercel

Vercel → הפרויקט `space-wall` → **Settings → Environment Variables** → הוסיפו ל-Production (וגם Preview אם רוצים לבדוק):

| שם | ערך |
| --- | --- |
| `TELEGRAM_BOT_TOKEN` | ה-token מ-BotFather |
| `TELEGRAM_WEBHOOK_SECRET` | מחרוזת אקראית משלכם, 20–60 תווים, אותיות ומספרים בלבד (למשל מ-`openssl rand -hex 24`) |
| `TELEGRAM_ADMIN_IDS` | ריק בינתיים; ממלאים בשלב 4 |
| `SUPABASE_URL` | `https://rrbivwhratkmzcfxqjih.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API Keys → `service_role` |
| `ANTHROPIC_API_KEY` | מ-console.anthropic.com (הבוט משתמש ב-Claude כדי להבין את ההודעה) |

אחרי שינוי משתנים: **Deployments → ⋯ → Redeploy** על הפריסה האחרונה, אחרת הפונקציות לא רואות את הערכים החדשים.

## 3. רישום ה-webhook (פעם אחת)

טלגרם צריך לדעת לאן לשלוח הודעות. פתחו בדפדפן את הכתובת הבאה, אחרי שהחלפתם את שלושת הערכים:

```
https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://<הדומיין-של-הפרויקט-ב-vercel>/api/telegram&secret_token=<TELEGRAM_WEBHOOK_SECRET>&drop_pending_updates=true
```

דוגמה: `https://api.telegram.org/bot123456789:AAF.../setWebhook?url=https://space-wall.vercel.app/api/telegram&secret_token=k9d2...`

תשובה תקינה: `{"ok":true,"result":true,"description":"Webhook was set"}`.

לבדיקה בכל רגע: `https://api.telegram.org/bot<TOKEN>/getWebhookInfo`. השדה `last_error_message` ריק = הכול תקין. אם יש שם `401` סימן שה-secret ב-Vercel לא זהה לזה שב-URL.

## 4. הרשאות: מי רשאי לעדכן

1. שלחו לבוט `/whoami`. הוא עונה עם מספר, זה ה-chat id שלכם (עובד גם למי שעדיין לא מורשה).
2. הוסיפו את המספר ל-`TELEGRAM_ADMIN_IDS` ב-Vercel (כמה אנשים: מופרד בפסיקים, `123456,987654`) ועשו Redeploy.
   או, בלי Redeploy: ב-Supabase → Table Editor → `telegram_users` הוסיפו שורה עם `chat_id`, `name`, `role`.
3. מי שלא ברשימה מקבל "הבוט סגור למורשים בלבד" ואת ה-chat id שלו, כדי שיוכל לבקש הרשאה.

## 5. בדיקה ראשונה

שלחו לבוט:

```
יום הולדת לדנה כהן מאגף תכנון ב-3.10
```

צפוי: הודעת "לאשר?" עם שורה `🎉 birthday · דנה כהן · 2026-10-03` וכפתורי ✅/❌. אחרי ✅: "בוצע" והפריט יופיע ב-`/list` ובצג בבלוק "במנהלת השבוע" כשהתאריך בטווח (ברירת מחדל: 10 ימים קדימה).

עוד דוגמאות שהבוט מבין:

- `יוסי לוי התחתן בשבת` → אירוע אישי מסוג wedding, יוצר את יוסי אם לא קיים
- `עומר בר קיבל דרגת סרן היום` → promotion, ומעדכן את הדרגה בכרטיס האדם
- `נקלטה חיילת חדשה: נועה שלו, יחידת בקרה, נולדה 12.5.2004` → add_person + joined, ומעכשיו יום ההולדת שלה עולה אוטומטית כל שנה
- `הרמת כוסית לחג ביום ג׳ 12:00 בלובי` → אירוע מנהלת
- `תערוכה ב-9900 ב-20.11, כל אנשי המנהלת` → אירוע מנהלת מסוג exhibition
- `כנס Space Tech Expo בברמן 17–19.11` → אירוע תעשייה לרצועה התחתונה
- `בטל את המפגש עם מפא״ת` → הסרה
- `תעדכן שיש 55,000 עצמים במעקב` → מעדכן את שורת ORBITAL PICTURE

אם חסר פרט מהותי הבוט שואל שאלה אחת ומחכה להודעה חדשה.

## 6. התראות תקלה מהסוכן (אופציונלי)

כדי לקבל הודעה כשריצת OSINT נכשלת: ב-GitHub → Settings → Secrets → Actions הוסיפו `TELEGRAM_BOT_TOKEN` (אותו token) ו-`TELEGRAM_ALERT_CHAT_ID` (ה-chat id שלכם או של קבוצת ops). אפשר להוסיף את הבוט לקבוצה; ה-chat id של קבוצה מתחיל במינוס.

## 7. תקלות נפוצות

| תסמין | סיבה | פתרון |
| --- | --- | --- |
| הבוט לא עונה בכלל | webhook לא רשום או URL שגוי | `getWebhookInfo`, בדקו `url` ו-`last_error_message` |
| `last_error_message: Wrong response from the webhook: 401` | secret לא תואם | ודאו שהערך ב-Vercel זהה ל-`secret_token` ב-URL, ועשו Redeploy |
| "שגיאה: Missing environment variable" | חסר משתנה ב-Vercel | הוסיפו ו-Redeploy |
| "הבוט סגור למורשים בלבד" | chat id לא ברשימה | שלב 4 |
| הבוט מבין לא נכון תאריכים | שנה חסרה | הוא מניח את המופע הבא של התאריך; ציינו שנה אם זה תאריך לידה |
| הפריט לא מופיע בצג | מחוץ לחלון ההצגה | `/list` מציג רק 10 ימים קדימה; אירוע רחוק יופיע כשיתקרב |

כל הודעה נשמרת ב-`intake_messages` עם הפירוש של Claude, כך שאפשר לבדוק בדיעבד מה הובן ומה בוצע.
