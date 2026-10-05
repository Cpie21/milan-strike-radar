# Redesign v5 — card reading order, evidence, graffiti wall

The owner's feedback after the v4 phone test, and the changes made in response.

## Card reading order
- Before, the header stacked the title, the scope and a long provider line, so readers met a block of text before any facts.
- The card now has one band per question:
  - **what / how sure**: icon, title, a small `全国` and `✓ 已确认`;
  - **when**: one display line;
  - **how far off**: a pill;
  - **the day**: the bar;
  - **does it hit me**: label/value rows;
  - **act**: the buttons plus the wall;
  - **why we believe it**: evidence.
- The provider and the scope moved into the detail rows. In those rows the label sits on the left and the value on the right, so long Italian or Chinese values wrap neatly under themselves instead of sitting centred.

## Split strike windows: one line, not two
- Stacking `08:45–15:00` over `18:00–运营结束` read as two strikes and put a large block in the middle of the card.
- **Precedent**: a flight itinerary shows the journey as one span and names the layover. Opening hours do the same ("Closed · reopens 18:00").
- **Change**: show one span (`08:45 – 运营结束`), plus a green note `中间 15:00–18:00 恢复运行`.
- The bar still shows the shape of the day. Green already means "service runs", so the note reuses an existing colour meaning.

## Confirmed vs unconfirmed
- Confirmation matters most when it is missing.
- **Confirmed** is now quiet: a small grey tick under the title, and "官方登记在案" in the sources header.
- **Unconfirmed** is a hatched chip outlined in the mode colour, and it says *why*:
  - 官方未公布时段 (no official hours yet);
  - 各来源时段不一致 (sources disagree);
  - 时段仅见报道 (hours only reported);
  - 官方状态未定 (official status not final).
- An operator's official quote outranks the aggregate `confidence: 'reported'`. See the handoff note.

## Card-specific sources
- Before, every card ended with the same line, "来源: 意大利交通部官网 (MIT)". When every card says the same thing, it tells the reader nothing.
- Each card now shows two kinds of evidence. Both come from data already stored with the strike.
- **The MIT register entry**: the union(s) and the date each one proclaimed the strike, MIT's own Italian wording for the workforce, the relevance and area, and MIT's description of how the strike runs. The MIT list page has no per-strike URL, so the entry also says what to look for in the list (`在公示表中查找 9日 · AL-COBAS`).
- **The operator's own sentence**, with the times *marked inside the quote* (`dalle [8:45] alle [15] e dopo le [18]…`), plus the date we last checked it. This makes it visible that the hours on the card come from this specific text.
- Why not screenshots: they are heavy to capture, store and refresh, and they go stale. A quoted sentence is a few bytes, stays searchable and can be checked against the live page.

## The graffiti wall
- **Open from the start.** It sits directly under the buttons, and a notch points up at "我受影响了" (the same notch as the selected date on the rail).
- Before you tap, an empty dashed spot pulses and a spray can bobs over it. The caption reads 「已有 N 人在这节地铁上涂鸦 · 点上方「我受影响了」加入」.
- **Visuals.** Each mode has its own side-view illustration with a livery stripe in the mode colour. Paint is clipped to the vehicle body. Tags are marker lettering in Italian ("BASTA!", "ANCORA?!", "MAI PIÙ"), plus scribbles and drips, all with a spray filter that roughens edges and adds overspray. Tags sit on a jittered grid so the words stay legible. Past ten tags, the extras fade into the background.
- **Free drawing.** After marking, "自己画一笔" opens a spray brush clipped to the vehicle. It has the mode colour plus six spray colours, three sizes, undo and clear.
- Strokes are stored as vectors on the 360×150 stage: a few KB of JSON, redrawable at any size. Limits are 80 strokes and 4000 points.
- **Upload is local-only in the lab.** The backend contract is in `AI_HANDOFF.md`. Publishing free drawings to other people needs moderation first.

## One rule for controls
- **Filled** (white or a mode colour) always takes ink text. Every mode colour clears 6:1 against ink; white on orange would not.
- **Tonal** (surface3) takes the normal text colour.
- **Tinted** (a colour's soft fill with its main colour as text) is reserved for state, never for something you press.
- "我受影响了" goes from filled to tonal once pressed. The mode icon circle uses an ink glyph.
