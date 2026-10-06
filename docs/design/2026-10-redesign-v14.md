# Lab redesign v14: a livelier face, real graffiti, a calmer rail

## The face
- **Living eyes (`components/lab/eyes.ts`).**
  - Each eye is a soft rounded shape with gaze, openness, lid slant and a smile cut. All of these move on springs.
  - The eyes are drawn into the LED dots by coverage, so movement stays smooth on a 9-dot panel.
  - Behaviour follows the robot faces people find alive (Vector, EMO):
    - darting saccades with a hair of overshoot;
    - blinks that close fast, open slower and squash a little, with occasional double blinks;
    - a slight perspective when looking sideways.
- **Expressions belong to the assistant, not the strike.**
  - **idle:** curious, looking around.
  - **happy:** crescent eyes.
  - **thinking:** half-lidded, looking up from side to side.
  - **concerned (strike days):** inner corners raised; glances up at the card, then back to you. Never cross, never "evil".
  - **sorry:** lids lowered, looking down.
  - **unsure:** one eye squinting.
- **Where it looks.** Both faces look at the field when you type in it.
- **Scenes.** The snapping rail and the "!!" are gone. The board keeps its scenes (tram + thumbs-up, clock, heartbeat, coffee, sleep). The eyes follow the tram as it passes in front of them.

## The calm-day module
- **Hanging board.** The board hangs again, this time from a rail fixed along the module's top edge, so the rods visibly attach. It sits in its anodised housing with screws.
- **Input.** Grows to three lines, examples take turns in the empty field, and send sits at the right. The city and question-count chips are gone.

## The bar on strike days
- **Housing.** The small face is back in its housing with screws, cut to 15 columns.
- **Centring.** It is centred on the pill's round end, the way Apple centres a leading icon in a capsule: the face's middle sits on the centre of the end circle.

## The wall
- **Two resolutions.** The vehicle stays a pixel scene. Paint is real spray, drawn at 3× resolution with a soft core, overspray and drips. It is lit by the vehicle: its light map, a faint surface mottle, and its shine laid over the paint.
- **Others' pieces (`wall/tags.ts`).**
  - Handstyle tags, white-on-colour outlined tags, bubbly throw-ups and neon loop scrawls.
  - Invented letters with slant, joins and a flourish, plus drips.
  - They overlap across the body like a real wall. There are no stickers or cute icons.
- **Your stroke.** A can's line: a 1.5 px core with soft overspray. No dark keyline and no scattered fringe.
- **Your panel.** About half a carriage side at full height. The zoom is now about 1.3–2.5×, so the space feels like yours.
- **One can per strike.** Less paint than before. Once it is used up or you say you're done, that's it: no "spray more", no remaining amount.
- **Station sign.** It now carries the wall's news: "已有 N 人在车上涂鸦" ("N people have sprayed this train") alternating with the strike's status line. It is readable, and too-long messages scroll through.
- **Pixel vehicles.** Brief for Codex in `docs/design/pixel-brief/`. Generated art in `public/lab/wall/<mode>.png` (plus an optional `-mask.png`) replaces the code drawing automatically.

## Colour
- **Train → blu FS.** Italian station signs, and Trenitalia's marks, are white on blue.
- **Airport → viola,** kept clear of the rail blue.
- **Pixel train.** Doors and band in FS blue.

## The rail
- **Months.** Each new month gets extra space, a hairline rule and its name at full strength.
- **The past.** The past strip is split and labelled by month too.
- **Overnight strikes.** One opaque capsule holds the badge on either side and runs between them. The joined mode sits at the inner end of each badge row. Each day draws its half, meeting in the gap, with equal weight.
- **Selected day.** Its white surface is 3 px larger than the tile, without moving its content (no more scaled, misaligned parts).

## Codex integration
- **PR #8.** Gemini translation removed. Translation is free-only; originals are shown until a free method exists.
- **PR #9.** Paid Ask runs only when `reserve_ai_budget` returns `true`. Until the ledger RPCs exist, Ask answers "unavailable".
