# Lab redesign v12 — vehicles, panels, the board's life, the dock, sheets, widget

## 1. Vehicles (pixel wall)
**References.** The side-view vehicle pixel artists (Alessio Conti, Etherfield, PXLCRS, Jude Buffum). What they share:
- one honest side view filling the frame;
- 2–3 tones per material;
- edges in a darker tone of the fill (sel-out), not black everywhere;
- glass that carries light;
- clear wheels;
- a plain background so the vehicle reads first.

**Ambient light.**
- White paint under station lamps at night is not white. Bodies use a cool silver ramp: the roof line catches the ceiling light, the band edges are dithered, and the skirt sinks into shadow.
- Warm lamp streaks fall on the upper body.
- Windows are tinted glass on an empty, parked car: a glowing ceiling strip, seat backs against far-side windows, and no reflections.

**Real Italian vehicles.**
- **Metro:** Milan M1 "Leonardo" cab car. Silver with a red cab and red doors, and the white M.
- **Train:** Trenord "Caravaggio" double-decker. A curved, raked nose; continuous tinted window bands on both decks; green doors, a green band and a blue line; a pantograph.
- **Bus:** orange low-floor city bus with the LED route sign.
- **Plane:** A320 side view. A swept fin, a thin edge-on wing, a round CFM nacelle with pylon and intake, and gear.

## 2. Graffiti panels
- **Zoomed panel.** Picking up the can zooms ×2–4 into your own panel, roughly 30×22 wall pixels. The rest dims and the panel's edge marches in your colour. A 1-px nozzle makes detail possible.
- **Allocation.** Centre-out panels, hashed among the first three free (so simultaneous arrivals spread), the oldest painted over when the wall is full, and an atomic server claim with retry. See `slots.ts` and AI_HANDOFF v13.
- **Default marks.** Italian street-art stencils with no words: 🤌 pinched fingers, moka pot, Vespa, raised fist, a cross face, letterless bubble throw-ups, crown, star, dripping heart, bolt.

## 3. The board (calm days)
- **No hanging.** The board is set flush into the top of the module, full width, like a screen in a platform wall. The question and field sit below it.
- **No words.** It speaks in pictures, so everyone reads it. The clock is the one exception, as digits.
- **Opening.** It wakes once per visit: noise flickers on, a scan sweeps across, the eyes open from a line, then glance left and right.

**Idle life.** It rotates the following, with rests (open eyes, blinks) in between:
- a tram drives by *in front of* the eyes, which follow it, then a thumbs-up and happy eyes;
- looking around;
- the time;
- a heartbeat trace scrolling across;
- a wink;
- a steaming coffee in the morning;
- sleeping with z's after midnight.

**Day change.** When the calm day changes, it glances in the direction you moved.

## 4. Query field (after mobile Gemini, kept quiet)
- **Text row.** It grows to three lines. Examples take turns in the empty field instead of a row of suggestions.
- **Bottom row.** Only what the answer assumes (the city) and what is left today (five dots), with send at the thumb.
- **While working.** A warm light travels around the edge, the board's glow.

## 5. Dock (strike days)
**The face inside the pill.** The face now sits inside the pill on the left, with the text starting after it. This fixes the tangent face and the odd padding.

**Strike-day alert, explored.** Options considered:
- a blinking "!!";
- a rail snapping with sparks;
- startled wide eyes;
- cross brows;
- a warning triangle;
- shaking;
- a red tint.

**Converged set:**
- Startled entry: noise, then wide eyes.
- Cross brows at rest, with a twitch.
- Every few seconds, alternating:
  - "!!" flashing three times;
  - a rail snapping, its ends drooping, sparks.

The board morphs into this face (shared layout), and the face boots into the alert as it lands.

## 6. Sheets: gesture conflict
The grabber and header drag the sheet. The content belongs to the content:
- **Medium detent:** swipe up expands, swipe down closes.
- **Full height:** content scrolls natively. Only a pull that *starts* at scroll top moves the sheet; it follows the finger, then settles a detent down or closes past the threshold.
- **Sideways swipes:** left alone.

Verified with synthetic touch: scrolling down never moves the sheet.

## 7. Widget
- **Look.** A new Scriptable widget in the page's style: near-black ground, mode badges, and the same amber LED face (open-eyed when calm, cross on strike days).
- **Content.** Today's strikes with planned hours, ending at "运营结束" ("end of service"), and the next strike with a countdown.
- **Sizes.** Small, medium and large.
- **Preview.** The lab sheet shows a calm/strike preview.
