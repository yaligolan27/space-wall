# צג חלל · מנהלת החלל — Space Wall

A 1920×1080 lobby display (one canvas across the 9-screen wall, bezels ignored) that shows OSINT space news for the directorate.
Implemented from the Claude Design handoff in `../project/Space Wall v2.dc.html` and the transcript in `../chats/chat1.md`.

Static HTML/CSS/JS, no build step, works fully offline: three.js, the QR encoder, the NASA Blue Marble textures and the
Heebo / IBM Plex Mono fonts are all vendored. Content comes from `data/feed.json`, which the backend (Claude, 24/7) regenerates;
the page polls it and re-renders when it changes.

## Run

Serve the `app/` folder with any static server (ES modules and `fetch` need `http://`, not `file://`):

```
cd app
python3 -m http.server 8080
# open http://localhost:8080/ in Chrome, full-screen / kiosk mode
```

For the wall itself: `chrome --kiosk --autoplay-policy=no-user-gesture-required http://<host>:8080/`.
The 1920×1080 stage scales to fit any window (letterboxed), so a 4K or 5760×3240 wall just renders larger.

## Screen structure

| Area | What it shows | Motion |
| --- | --- | --- |
| Header | Title, live dot + "updated X ago", Israel clock + Hebrew date, UTC clock | breathing dot, ticking clocks |
| Right column | **24 שעות אחרונות** — small headlines in a continuous vertical loop, then **במנהלת השבוע** | vertical loop, `loop` seconds per headline |
| Centre | The living emblem (real-3D Earth inside the directorate's spire, two orbit rings, four satellites) + four numbers of the week | Earth rotation, satellites orbiting, spire breathing |
| Left column | **השבוע בחלל** — two feature cards with image, tag, source, Hebrew + English title, QR to the article, "למה חשוב למנהלת" | none |
| Events bar | Upcoming conferences, right-to-left ticker | horizontal loop |
| Footer | Four upcoming launches with live T-minus countdowns | ticking |

## Configuration (URL query)

| Param | Default | Meaning |
| --- | --- | --- |
| `feed` | `./data/feed.json` | Feed URL |
| `refresh` | `60` | Seconds between feed polls (min 10) |
| `loop` | `7` | Seconds per headline in the 24h loop (3–15) |
| `globe` | `60` | Seconds per Earth rotation (15–180) |
| `qr` | `1` | Show QR codes on the weekly cards (`0` to hide) |
| `directorate` | `1` | Show the "במנהלת השבוע" block (`0` to hide) |
| `stale` | `180` | Minutes after which the live dot turns amber if the feed has not been regenerated |

Example: `index.html?loop=9&globe=90&qr=0`.

## Feed contract — `data/feed.json`

The backend writes this file atomically (write to a temp file, then rename). Every field is plain text the page shows as-is;
Hebrew text should already be final copy. `generatedAt` drives the "updated X ago" indicator.

```jsonc
{
  "generatedAt": "2026-09-15T06:40:00Z",     // ISO-8601, required
  "weekRange": "8.9 – 15.9",                  // shown next to "השבוע בחלל"
  "orbital":      { "line1": "ORBITAL PICTURE · LEO / GEO", "line2": "54,120 עצמים >10 ס״מ במעקב" },
  "spaceWeather": { "line1": "Kp 3 · QUIET",  "line2": "SPACE WEATHER · NOAA SWPC" },

  "push": [                                   // 24h headlines, ~5–9 items, oldest → newest
    { "category": "defense", "source": "SpaceNews", "time": "03:40",
      "title": "כותרת בעברית", "titleEn": "Original English headline", "url": "https://…" }
  ],
  "weekly": [                                 // exactly 2 feature stories
    { "category": "industry", "source": "Payload · 27.08",
      "title": "…", "titleEn": "…", "why": "למה זה חשוב למנהלת — משפט אחד.",
      "url": "https://…",                     // QR target
      "image": "https://… or ./data/images/x.jpg", "imageNote": "placeholder text if no image",
      "credit": "Photo: Payload", "creditHref": "https://…" }   // credit is optional
  ],
  "numbers": [ { "value": "5", "label": "שיגורים מסלוליים השבוע" } ],   // 4 items
  "directorate": [ { "date": "ג׳ 15.9", "name": "הרמת כוסית · 12:00 · לובי" } ],  // up to 5; [] hides the block
  "events": [ { "date": "5.10", "name": "IAC 2026", "place": "אנטליה, טורקיה" } ],
  "launches": [                               // 4 items, soonest first
    { "name": "Falcon 9 · Starlink 17-9", "site": "ונדנברג, קליפורניה",
      "net": "2026-09-15T21:02:00Z",          // ISO-8601 NET; countdown is computed client-side
      "actor": "us" }                         // us | ru | cn | il | eu | other → countdown colour; or "color": "#hex"
  ]
}
```

`category` → tag label and colour: `defense` ביטחון, `geopolitics` גאופוליטיקה, `launches` שיגורים, `industry` תעשייה,
`israel` ישראל, `policy` מדיניות, `tech` טכנולוגיה, `ssa` SSA, `exploration` חקר החלל, `weather` מזג אוויר חללי.
A `tag` / `tagColor` on an item overrides the mapping.

## Files

```
index.html          markup (1920×1080 stage, RTL)
styles.css          all styling, ported 1:1 from the design's inline styles
src/main.js         feed polling, rendering, loops, clocks, countdowns, QR
src/emblem.js       <space-emblem> — the 3D emblem (three.js)
data/feed.json      sample feed (the design's mock content)
data/images/        sample article images
assets/earth/       Blue Marble day / night / topology / water textures
assets/fonts/       Heebo + IBM Plex Mono (woff2) + fonts.css
vendor/             three.module.js (0.160.0), qrcode.js (qrcode-generator 1.4.4)
```

## The emblem

`src/emblem.js` builds the logo in real 3D, with every dimension expressed in globe radii (R ≈ 186px on screen):
orbit rings 1.4R at ±30° tilted 76° with a 3px stroke; spire 2.4R tall and 1.74R wide with the fin tips level with its base;
four satellites (two per ring, opposite sides) that shrink as they pass behind the planet and carry a soft blue glow;
the wordmark 1.28R below the globe centre. A single key light from the upper-left lights the Earth, spire, rings and satellites,
and casts the spire's shadow on the planet; a matching studio environment gives the satin, clear-coated finish.
The wordmark is CSS text (glossy steel-blue gradient, extruded shadow) so it stays crisp at any scale.
