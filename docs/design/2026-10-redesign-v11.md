# Redesign v11: the board, the module, sheets that behave, a better wall

## The assistant's face
- The face is now drawn on canvas with two forms.
  - **Hanging board** (calm-day module). It has an anodised housing with a chamfer, recessed smoked glass, screws and two hanger rods.
  - **Compact face** (input bar, sheet header).
- **Idle programme.** The board behaves like a real platform board. It shows eyes with blinks, then the Rome time, then a line of true information scrolled through, then eyes again. The lines are "OGGI NESSUNO SCIOPERO" ("no strike today") and "PROSSIMO SCIOPERO 9 OTT" ("next strike 9 Oct"). Content changes either wipe column by column or scroll a column at a time, never cut. Unlit dots stay visible.
- **Lubricant between days.** The module is mounted outside the per-day transition, so it never restarts on calm days. When the day changes, the board scrolls the new day through, for example "13 OTT · NESSUNO SCIOPERO".
- **Naming.** The UI never names the assistant and never says "AI". The module asks "有什么想确认的？" ("anything you want to check?").
- **Fix.** Canvas backing stores are sized on the client. Server-rendered sizes kept the device-pixel-ratio-1 size, which clipped the panel.

## Calm-day layout
1. **Status card.** "无交通罢工" (no transport strike) with "安心出行" (travel as normal) under it. The next strike is a chip inside the card, as a footnote of the day's answer, not a sibling row.
2. **Module.** A separate card in the spirit of the Gemini/Stitch prompt boxes. It holds the board, one question, one large field with a slow warm ring and an amber send button, and a "back to last answer" link. There are no suggestion chips: people arrive with intent.
3. **Calm → strike day.** The field and the face share layoutIds with the docked bar, so they travel to the bottom as the strike card comes in. The reverse happens on the way back.

## Header
The month title sits on the left and "全部日期" (all dates) on the right, on one baseline.

## Sheets (vaul)
- **Tall sheets** (answer, cities, support) open at 62% height, with content visibly continuing off the bottom edge.
- **At 62%:** a drag anywhere moves the whole sheet.
- **At full height:** the content scrolls. A downward drag moves the sheet only once the content is at the top.
- **Answers dismiss from full height:** pulling down at the top closes the answer outright.
- **Short sheets** open at their own height.

## Ask
- **Thinking.** One line at a time ("正在查官方记录…", checking official records) and four progress dots, nothing more. The answer then fades and rises in.
- **Share.** "分享这个回答" (share this answer) sends the question, the verdict and a link to the day.
- **Session cache.** Repeated questions and reopened answers come from a session cache and never spend a question. "回到上一个回答" (back to the last answer) appears above the bar and in the module.

## Card
- **Next-day times.** "08:45 – 00:30⁺¹": the "+1" is absolutely positioned, so the dash stays centred, as on boarding passes. The note under the time explains it.
- **Support section.** Renamed "支持与反馈" (support and feedback).

## Pixel wall
- **Craft**, after side-view vehicle pixel art (Etherfield, Alessio Conti, PXLCRS):
  - every material has a 3–4 step ramp, with light from above;
  - 1px dark outlines;
  - glass is one band with warm cabins, heads and a reflection;
  - roof gear, bogies and underframes;
  - Milan metro has red doors and a red band;
  - Trenord-style double decker with two glass bands, a green band and a pantograph to the catenary;
  - ATM orange bus with a white roof, LED route "90", raked screen and mirror;
  - plane at a jet bridge.
- **Making many sprayers still look like a painted train:**
  - every painted area gets a dark keyline, so it reads as a "piece", not a scribble;
  - paint is multiplied by the body's own light map, so seams, door edges and glass show through it;
  - older tags are slightly weathered;
  - the brush is thinner (1.4px).
- **Paint gauge.** It is now a stamina-style ring beside your finger. It drains live during a stroke and flashes red under 20%.
- **Edges and copy.**
  - No black strip on the left; both edges fade into the card.
  - The chip reads "已有 N 人在车上涂鸦" ("N people have sprayed this vehicle").
