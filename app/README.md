# צג חלל · מנהלת החלל — the display (v4)

The 1920×1080 lobby wall, ported from the Claude Design file "Space Wall v4". Static files, no build step:
React 18 (vendored UMD), three.js for the emblem, all fonts, textures, images and the 12:00 promo video
are local, so the page works offline once loaded. The stage scales to any screen.

Content comes from `/api/feed` and is polled every minute. If the API is unreachable on the first load, the
bundled sample `data/feed.json` (the design's own week, 13–19.9) is shown instead.

## Screen

| Area | Content | Source |
| --- | --- | --- |
| Header | logo, "updated X ago" with a live dot (amber when stale), Israel clock + date, UTC | feed `generatedAt` |
| Right column, top | אירועים במנהלת: the week's internal events, the next one highlighted | Telegram → `directorate_events` |
| Right column, bottom | אנשים במנהלת: rotating spotlight + six tiles (birthdays, births, weddings, promotions, discharges, new people) | Telegram → `people`, `life_events` |
| Centre | the 3D emblem (holographic globe, orbits, satellites, wordmark) | — |
| Left column | ניוזלטר החלל השבועי: rotating feature card with QR to the article, then a scrolling list | weekly newsletter import |
| Ticker | אירועים והזדמנויות, colour-coded by kind | newsletter + Telegram → `industry_events` |
| Footer | four next launches with live countdowns, the next one highlighted | Launch Library via the runner |

**Moments** take over the whole screen: launch mode for the last ten minutes before any listed launch, a
personal celebration with fireworks every hour at :30 (cycling through the people panel), and the 12:00 show
(a 10-second countdown around the logo, then `assets/promo.mp4` with sound).

## URL options

| Param | Default | Meaning |
| --- | --- | --- |
| `key` | | `DISPLAY_KEY`, if the backend requires one |
| `demo` | `off` | `launch`, `greeting` or `noon`: trigger a moment on load (keys L, G, N do the same; Esc closes) |
| `noon` | `1` | `0` disables the 12:00 show |
| `qr` | `1` | `0` hides the QR codes |
| `feature` | `12` | seconds per featured article (6–30) |
| `list` | `4` | seconds per headline in the scrolling list (2–10) |
| `fx` | `1` | `0` turns off ambient effects (grain, flare, scan line, parallax) for weak hardware |
| `globe` | `90` | seconds per globe rotation |
| `globeStyle` | `holo` | `real` for the photographic Earth |
| `sway` | `1` | `0` stops the slow camera sway |
| `refresh` | `60` | feed poll interval, seconds |

Example for the lobby: `https://space-wall.vercel.app/?fx=1&noon=1`.

## Feed shape (`/api/feed`)

```jsonc
{
  "generatedAt": "2026-09-20T06:00:00Z",
  "issue":   { "range": "13–19.9", "url": "https://rakia-weekly.vercel.app/" },
  "summary": ["one-line takeaways", "..."],
  "featured": [0, 1, 16],                      // indexes into news, shown as the rotating card
  "news": [{ "cat": "ביטחון", "il": false, "date": "14–15.09", "src": "Air & Space Forces",
             "title": "…", "dek": "…", "url": "https://…", "image": null }],
  "catColor": { "ביטחון": "#f2a37a" },         // category → colour
  "catImage": { "ביטחון": "/assets/img/….jpg" }, // category → fallback image when an item has none
  "ticker":   [{ "kind": "אירוע" | "הזדמנות", "date": "5–9.10", "name": "IAC 2026 · אנטליה" }],
  "launches": [{ "vehicle": "Falcon 9 · SpaceX", "mission": "Crew-13", "site": "קייפ קנוורל", "at": "2026-10-01T18:10:00+03:00", "status": "אושר" | "ממתין" }],
  "directorate": [{ "day": "27", "dow": "א׳", "mon": "ספט׳", "time": "09:00", "name": "…", "place": "…" }],
  "people": [{ "type": "יום הולדת", "color": "#e9b872", "name": "…", "line": "…", "date": "27.9", "photo": null, "celebrate": true }],
  "tracked":  [ … ],                           // SSA objects, reserved for a future panel
  "promoVideo": "/assets/promo.mp4"
}
```

`photo` is a URL when the person has one (`people.photo_url`); otherwise the wall draws an initials badge.
It never shows a stock portrait next to a real name.

## Files

```
index.html            page shell
styles.css            keyframes and globals, verbatim from the design
src/wall.js           the wall (React, no JSX)
src/overlays.js       full-screen moments: launch mode, celebration, 12:00 show, toast
src/emblem-v2.js      <space-emblem-v2>, the 3D emblem (three.js)
data/feed.json        sample feed = the design's own week
assets/               logo, promo video, category images, Earth textures, fonts (Heebo, Lexend, IBM Plex Mono, Open Sans)
vendor/               react, react-dom, three.module.js, qrcode.js
```
