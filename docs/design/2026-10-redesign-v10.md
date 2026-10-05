# Redesign v10: the pixel wall, the LED assistant, Ask that stays on topic

## Ask
- **Bug.** "周五早上 9 点坐 M1 会受影响吗？" ("Will the M1 be affected at 9 on Friday?") returned bus strikes. The understanding step let the model add BUS (p ≥ 0.85) even though the user had named a line. Fix: when a mode or line is named, the model may not add modes.
- **What is shown.** Results are limited to the named modes and to items with relevance ≥ 0.5. Two unions striking the same staff at the same hours collapse into one row.
- **Removed.** The footnote about rule and Jev labels is gone. "我是这样理解并核对的" ("how I understood and checked this") is replaced by a good/bad feedback control. A bad rating asks what went wrong: misread, irrelevant results, wrong answer, or missing something.
- **Feedback storage.** Each rating stores the question, the full answer and the trace, so bad cases can be replayed. It goes to `POST /api/ask/feedback` and is written into the `ask_feedback` table (schema in AI_HANDOFF). Until that table exists, the row is logged.
- **Trace.** The full decision trace now opens directly under its toggle, with a caret instead of +/−.

## Card
- **Explicit end times.** "运营结束" ("end of service") becomes an explicit time only where a published source supports it. Milan metro shows "次日 00:30" (next day, 00:30), with a note and a link to ATM's own page ("fino alle 00:30 circa"). Every other case says "末班车" (last service) instead of the vaguer phrase. The table is in `lib/lab/serviceHours.ts`.
- **Links.** Every link in the sources section is blue and underlined.

## Assistant
The assistant is now an amber LED dot-matrix panel, like the yellow-pixel boards over Italian platforms:
- a 19×9 grid of dots where the eyes are made of lit dots;
- unlit dots stay faintly visible;
- each change re-lights the matrix column by column, as those boards refresh;
- lit dots bloom slightly, behind a bezel and glass;
- the glow rises when the assistant is thinking or alarmed.

## Graffiti wall, rebuilt as pixel art
The owner found the 3D version over-simplified, too glossy and too motion-heavy for a strike.

- **Static scene.** The vehicle is parked. Nothing drives away.
- **Where it stands.** Each vehicle is somewhere you could deface: a tiled station wall with posters, a bus depot with shutters, or an apron at night. The station and depot scenes add an amber LED sign scrolling "SCIOPERO" (strike) and dust in the lamp light.
- **Each vehicle has its own memory hooks:**
  - **metro:** silver car, red band, sliding doors, gangways;
  - **train:** double-deck windows, a green line, a pantograph up to the catenary;
  - **bus:** ATM orange with a white roof band, an LED route sign "90", raked windscreen, wheel arches and a mirror;
  - **plane:** fuselage at a jet bridge, tail fin, wing and engine.
- **Depth without reflections.** For rail, the next cars are drawn out of focus with a box blur, and a near post blurs the left edge.
- **Paint.** Hard pixels with a dithered fringe, clipped to a body mask, so nothing paints outside the vehicle. Holding still makes a one-pixel drip. Others' tags are thresholded to crisp pixels.
- **No colour picker.** Each person has one colour from a palette tuned to sit together on grey, silver and orange bodies. The backend should key the colour by IP; the lab keys it by device.
- **Auto-finish.** One can per strike; an empty can finishes the session by itself.
- **Link to the button.**
  - Every 7 seconds a puff flies in from the button and the button's can shakes.
  - While you press the button, the sign flips to "!!!" and the headlights flash.
- **Cleanup.** three.js is removed.
