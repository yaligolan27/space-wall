# המעבד המקומי — הרצה על המנוי

כל עבודת המודל בפרויקט רצה דרך ה-CLI של Claude Code על מחשב אחד שנשאר דלוק. אין מפתח API בשום מקום: לא בקוד, לא ב-Vercel ולא ב-GitHub.

## מה רץ איפה

| רץ | איפה | צריך מנוי | צריך אינטרנט |
| --- | --- | --- | --- |
| הצג ו-`/api/feed` | Vercel | לא | כן |
| webhook של טלגרם | Vercel | לא | כן |
| איסוף RSS, שיגורים, מזג אוויר חללי | המחשב שלך | לא | כן |
| סיווג וניסוח בעברית, פירוש הודעות טלגרם, מספרי השבוע | המחשב שלך, דרך Claude Code | כן | כן |

אם המחשב נכבה, הצג ממשיך להציג את המצב האחרון והנקודה בכותרת נעשית כתומה. שום דבר לא נמחק, והתור מתמלא וממתין.

## התקנה

**1. Claude Code והתחברות**

```
npm install -g @anthropic-ai/claude-code
claude
```

הריצה הראשונה פותחת התחברות בדפדפן. התחבר עם החשבון שנושא את מנוי Max. צא עם `/exit`. אימות שהכול תקין:

```
claude --version
```

**2. הריפו והתלויות**

```
git clone https://github.com/yaligolan27/space-wall.git
cd space-wall
npm install
```

**3. קובץ `.env`**

```
cp .env.example .env
```

מלא שני שדות חובה:

| שדה | מאיפה |
| --- | --- |
| `SUPABASE_URL` | `https://rrbivwhratkmzcfxqjih.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API Keys → `service_role` |

`TELEGRAM_BOT_TOKEN` ו-`TELEGRAM_ALERT_CHAT_ID` מומלצים: הראשון כדי שהבוט יוכל לשלוח כרטיסי אישור, השני כדי לקבל התראה כשריצה נכשלת או כשנגמרה המכסה.

**4. בדיקת מצב**

```
npm run doctor
```

צפוי לראות את גרסת ה-CLI, את המודל, ואישור ששני מפתחות Supabase קיימים.

**5. ריצה ראשונה, ידנית**

```
npm run agent -- launches weather collect enrich
```

זה ממלא את הצג: שיגורים, מזג אוויר, ואיסוף וסיווג של מחזור ידיעות אחד. אחרי זה `npm run feed:preview` מדפיס את ה-JSON שהצג יקבל.

**6. הרצה רציפה**

```
npm run runner
```

המעבד מתזמן את עצמו, בלי cron. מה שהוא מדפיס: ריצה מוצלחת עם מספר הפריטים, כשל, או השהיה בגלל מכסה.

## תדירויות ברירת מחדל

| משימה | כל | מודל |
| --- | --- | --- |
| הודעות טלגרם | 45 שניות | כן, רק אם יש הודעה בתור |
| איסוף RSS | 10 דקות | לא |
| סיווג וניסוח | 10 דקות | כן, רק אם יש ידיעות חדשות |
| שיגורים | 15 דקות | לא |
| מזג אוויר חללי | 30 דקות | לא |
| מספרי השבוע | 01:30 | כן |

כל אלה נשלטים ב-`.env`. שתי הערות חשובות:

- **קריאה למודל נעשית רק כשיש עבודה.** בשעות שקטות המעבד לא נוגע במנוי בכלל.
- **קריאה אחת בכל רגע נתון.** אין ריצות במקביל, כך שהשימוש נשאר צפוי.

אם תרצה לחסוך במכסה, הגדל את `COLLECT_EVERY_SEC` ואת `ENRICH_EVERY_SEC` ל-1800. אם תרצה צג טרי יותר, הקטן אותם ל-300. `CLAUDE_MODEL=opus` נותן ניסוח עברי טוב יותר וצורך יותר מהמכסה; `sonnet` הוא ברירת המחדל ומספיק טוב לסיווג.

## הרצה אוטומטית בעלייה

הדרך הפשוטה והחוצה-פלטפורמית, כולל הפעלה מחדש אחרי קריסה ואחרי אתחול:

```
npm install -g pm2
pm2 start npm --name space-wall -- run runner
pm2 save
pm2 startup      # מדפיס פקודה אחת להרצה עם הרשאות מנהל
```

פקודות שימושיות: `pm2 logs space-wall`, `pm2 restart space-wall`, `pm2 status`.

**חלופות מקוריות לכל מערכת**

macOS, קובץ `~/Library/LaunchAgents/com.spacewall.runner.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>com.spacewall.runner</string>
  <key>ProgramArguments</key><array>
    <string>/usr/local/bin/npm</string><string>run</string><string>runner</string>
  </array>
  <key>WorkingDirectory</key><string>/Users/YOU/space-wall</string>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>/tmp/space-wall.log</string>
  <key>StandardErrorPath</key><string>/tmp/space-wall.err</string>
</dict></plist>
```

טען עם `launchctl load ~/Library/LaunchAgents/com.spacewall.runner.plist`. חשוב: בהגדרות המערכת כבו שינה לדיסק ולמעבד, אחרת המחשב יירדם והמעבד ייעצר.

Linux, `systemd --user`, קובץ `~/.config/systemd/user/space-wall.service`:

```ini
[Unit]
Description=Space Wall runner
[Service]
WorkingDirectory=/home/YOU/space-wall
ExecStart=/usr/bin/npm run runner
Restart=always
RestartSec=30
[Install]
WantedBy=default.target
```

```
systemctl --user enable --now space-wall
loginctl enable-linger $USER      # כדי שירוץ גם בלי התחברות
```

Windows: הדרך הקלה היא pm2. לחלופין Task Scheduler עם טריגר "At log on", פעולה `npm`, ארגומנטים `run runner`, ו-Start in על תיקיית הריפו.

## מה קורה כשנגמרת המכסה

ה-CLI מדפיס הודעה כמו "You've hit your weekly limit". המעבד מזהה אותה, משהה **רק** את עבודת המודל לחצי שעה, מכפיל את ההשהיה בכל פעם עד ארבע שעות, ושולח התראה לטלגרם. איסוף ה-RSS, השיגורים ומזג האוויר ממשיכים כרגיל, כך שהצג לא קופא. ידיעות שלא סווגו נשארות בתור וייקלטו כשהמכסה תתאפס. ריצה מוצלחת אחת מאפסת את סולם ההשהיה.

לבדיקה מרחוק: שלח `/status` לבוט בטלגרם. הוא מחזיר אם המעבד דיווח לאחרונה, כמה ידיעות ממתינות, כמה הודעות בתור, ואם עבודת המודל בהשהיה.

## תקלות

| תסמין | סיבה | פתרון |
| --- | --- | --- |
| `Claude Code CLI not found` | ה-CLI לא ב-PATH | הגדר `CLAUDE_BIN` לנתיב המלא |
| כל ריצות המודל נכשלות מיד | ה-CLI לא מחובר | הרץ `claude` ידנית והתחבר |
| `result.json failed validation` | המודל החזיר מבנה לא תקין | נורמלי מדי פעם; הפריטים נשארים בתור ונסרקים שוב במחזור הבא |
| הצג לא מתעדכן אבל המעבד רץ | Vercel או Supabase | `npm run feed:preview`; אם ה-JSON תקין הבעיה בפריסה |
| ידיעות נתקעות ב"ממתין לעיבוד" | המכסה נגמרה, או שהמודל מדלג עליהן | `/status` בטלגרם; פריטים שממתינים מעל 24 שעות מוסתרים אוטומטית |
| הודעות טלגרם לא מקבלות כרטיס אישור | המעבד לא רץ | הבוט עונה "המעבד המקומי לא מגיב"; הפעל את המעבד |

## בדיקות

```
npm run typecheck
npm test
```

`npm test` מריץ את הגשר ל-Claude Code מול בינאריים מדומים: מסלול תקין, מכסה שנגמרה, פלט חסר ומבנה שגוי. אין צורך ברשת, במנוי או בבסיס נתונים. עובד על macOS ועל Linux.
