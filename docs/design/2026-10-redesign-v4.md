# Redesign v4 — from phone testing

Five problems the owner found using the v3 lab on a phone, and what changed.

| # | Problem | Change |
|---|---|---|
| 1 | Past and future days look the same, and most people only care about the future | The rail opens with **today at the left edge** and a 30px sliver of the past showing. Past days are a different form: 40px wide (future tiles are 54px), no surface, 50% opacity, and one mode mark at most. Snapping is `snap-start` with the same 30px inset, so every resting position keeps that sliver. Later selections scroll only when the tile is out of view. |
| 2 | Left-aligned content feels scattered when a screen holds so little | The brand sits centred between "添加到桌面" and the city. The month title and date picker are centred. The hero of each card (mode, title, hours, state) is centred, and so are the detail cells and footnotes. The bar and the actions stay full width. |
| 3 | A single accent colour doesn't fit the situation | Colour now has two jobs. **Hue identifies the mode**: metro `#FF5A4E` (Milan metro red), bus `#FF9F2E` (ATM orange), train `#4C8DFF`, air `#A97FFF`. **Green means service still runs** (guarantees). Calm days carry no colour. The page glow, the card wash, the icon, the time bar, the jump chips and the "我受影响了" button all take the mode's hue, so "is my mode hit?" can be answered at a glance. Amber is gone. Pending and staff-only rail hours are now *hatched* in the mode colour, with outline glyphs on the rail. |
| 4 | Folded calm days don't say how many days they hide; the rail mixes too many styles | A fold's **length is its day count** (20px + 8px per day), with one tick per day and the date range on top. Dashed borders, the red gradient on strike tiles and the filled-versus-empty surfaces are all gone. A tile now says one thing: which modes strike, as filled glyphs in their colour. |
| 5 | Type was not chosen for the context | Digits are what people read, so they get their own face: **Barlow Semi Condensed**, which comes from highway signage. It has open counters, tabular figures, and is narrow enough to keep "21:00 3日 → 21:00 4日" on one centred line. Chinese falls back to PingFang. Strokes read heavier on a dark ground, so weights step down: 600 for display and titles (was 700–800), 400 for reading, and 500 only for small labels. The roughly 12 ad-hoc sizes collapse into a 7-step scale (`TYPE` in `components/lab/theme.ts`). |

Open questions for the next round:
- Metro red and bus orange are close at 14px. The glyph shapes carry the difference, but this should be checked outdoors.
- Do past strike days need a mark at all, or just the date?
