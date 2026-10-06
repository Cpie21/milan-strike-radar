# Lab redesign v17: guarantees in the table, a real pixel face for the sign

## The card
- **"N 天后" is gone.** People choose a date on the rail, so they already know which day it is. Only today keeps a status line ("罢工时段内 · 至 15:00").
- **Guaranteed hours lead the details table.**
  - **Left:** the label (a green shield, "保障时段") and, beneath it, where the guarantee comes from ("运营方规定", "据罢工公告", "法定最低服务").
  - **Right:** the windows stacked, in green.
  - **Why:** one or two windows (the usual case) fit the table's own two-column shape, so there's no separate box and no empty corner. Green only marks the hours you can still travel.

## The station sign
- **Typeface.** Fusion Pixel Font 12px proportional, by TakWolf (https://github.com/TakWolf/fusion-pixel-font, SIL OFL 1.1; licence in `docs/licenses/`). Its thin one-dot strokes are drawn for 12-dot screens, the way Chinese station and bus boards are lettered.
- **No runtime font.** Only the characters the sign can show are pre-rendered into `components/lab/wall/pixelFont.ts`, about 8 KB.
- **Regenerating the glyph table** (when the sign's wording gains new characters):
  1. Download the woff2 release.
  2. In a headless browser, load the zh_hans face with `FontFace` and draw each character at `12px` on a canvas at baseline y = 12.
  3. Keep rows 2–13 with alpha > 127.
  4. Write width (hex) followed by 12 rows of 3 hex digits per character.
  5. The character set is every Han character in `lib/lab/model.ts`, the sign's own wording, and ASCII.
- **Rendering.** Every dot is a lamp, lit or dim. The message crawls right to left one column at a time and loops.
