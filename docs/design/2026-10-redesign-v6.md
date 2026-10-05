# Redesign v6: past vs future, AI placement, the wall, sources

## Past vs future: two materials, not two opacities
v4 separated past from future through width and opacity alone, which still read as one row of the same kind of thing. Now:
- **The future** is a row of raised, coloured tiles. These are the days you plan with.
- **The past** is a single sunken strip: an inset shadow, monochrome, small numbers, a grey dot for each day that had a strike, and the label "过去". Shape, depth, colour and size all change together.
- Only the right edge of the past strip shows at first. Today sits at the left of the view.

## AI query
**After the answer.** The step-by-step trace was useful while the answer was loading, but too much once it arrived. Now one block stays visible: "我是这样理解并核对的" ("how I read and checked this"). It holds:
- chips for how the question was read: date, time, city, mode, line;
- one line showing how many official records were checked and how many matched, ending "说错了可以换个说法再问" ("if I misread you, rephrase and ask again");
- the model's confidence, shown as "把握 92%" rather than a model name.

The full trace is still one tap away.

**Where the field lives.**

| Day | Field position | Reasoning |
|---|---|---|
| No strike | Inside the "无交通罢工" (no strikes) card, under "下一次罢工" (next strike), with the prompt "想确认别的日子、线路或听到的消息？" ("checking another day, line or rumour?") | The page is short, and checking another day or a rumour is the natural next step. A floating bar here would sit over empty space. |
| Strike | Docked at the bottom | Strike days are long pages, so the field has to stay within thumb reach. |

**Transition.** Both placements share one `layoutId`, inside a `LayoutGroup`. When the day changes, the field travels with a spring between the card and the dock while the cards cross-fade. This tells the user it is the same tool that moved, not two different tools. With reduced motion the travel is skipped.

**Daily limit.**
- Each device gets 5 new questions a day, tracked in localStorage. Refinements (picking a date or a mode) don't count.
- The API also caps each IP at 12 per day, plus the existing per-minute limit.
- When two or fewer are left, the field says how many. At zero the field is disabled and says "明天再来" ("come back tomorrow").
- The per-IP cap counts per server instance. A hard ceiling needs the shared budget, which is in the handoff.

## Header
- The language toggle (中 / EN) is now top-left.
- "添加到桌面" (add to home screen) moved into the tools row, which now has three tiles. It was crowding the header and overlapped with the tools.

## Time bar
Changes follow progress-bar practice:
- One slim track, 8 px.
- Segments are separated by a hairline gap instead of colours butting together.
- Guaranteed hours are drawn as a thinner inset band.
- Labels appear only at the strike's own edges (08:45, 15:00, 18:00), thinned so they never collide.
- Hour ticks give scale without numbers.
- An open end ("运营结束", end of service) tapers out instead of cutting off.
- The "now" marker is a crisp line.

## Every fact once
- If the guaranteed hours equal the break already named under the time ("中间 15:00–18:00 恢复运行"), the guarantee row is hidden.
- The "已确认" (confirmed) tick appears only in the hero.
- The per-announcement expander that repeated the same line twice (two unions, one workforce) is gone. Announcements now live in the sources section, one row per union, with times shown only where they differ from the card.

## Sources
- **Collapsed by default** to one line, for example "来源 · 交通部登记 · ATM Milano · 2 篇报道" (MIT register, ATM Milano, 2 reports). Most people only want to know that there is a source and whose it is.
- **Expanded**, it shows three groups by authority:
  - **The register**: unions with the date each proclaimed the strike, the workforce, and level · area · how the strike runs.
  - **The operator's notice**: the times marked inside it, and the date it was checked.
  - **Other references**: links only, no long quotes.
- **Translation.** Italian text (and backend labels stored in Chinese) is translated server-side into the reader's language. One batched call goes out per new set of texts and is cached for 7 days; if it fails, the original is shown. A single "看意大利语原文" (show Italian original) toggle switches back to the original.

## Controls on dark: white labels, deep fills
- Every button label is white. Each mode has a `deep` fill colour that passes 4.6:1 contrast with white:
  - metro `#D63B30`
  - bus `#B85C00`
  - train `#2F6BE0`
  - air `#7A4FE0`
- Secondary buttons are tonal grey.
- White surfaces are now reserved for selection, such as the chosen date, and are never used for buttons.

## The wall
- **Order.** The wall comes first, then Share and "我受影响了" (I'm affected) below it, because the buttons act on the wall.
- **Before reacting.** The vehicle is running: seen at an angle with CSS 3D (perspective plus rotateY/X), wheels turning, the track scrolling, light sliding over the glass, speed streaks and a slight bob. Everything is transform-only and paused off-screen with an IntersectionObserver.
- **"我受影响了" stops it.** The vehicle brakes on a slow spring, swings square to you, and your mark is stamped on. The spray can in the button flies (shared `layoutId`) into the toolbar, where its fill shows how much paint is left.
- **Language-neutral marks.** Others' tags are symbols, not words: angry face, !!, ?!, ✗, anger vein, broken heart, stopped clock, scribbles. Each has a dark outline, and the whole layer gets a spray filter.
- **Finite paint.** One can per strike per person, 160 units. Paint is spent by length × width, so a fat line drains it fast; undo gives paint back. An empty can shakes, and the caption reports it. A "继续喷" (keep spraying) button shows the remaining percentage.
- **Tactile spray.** The brush is a halo plus a core plus speckle. Holding still for about 0.4 s makes paint run: a drip grows under the nozzle, and that drip also costs paint.
- **Persistence.** Drawings are still saved on the device only. The backend contract is in `AI_HANDOFF.md`, and moderation is required before anyone else sees a drawing.
