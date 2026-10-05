# Lab redesign v13: Italian colours, one awake face, wall UX, Ask strategy

## Colour, from what these things look like in Italy
| Mode | Colour | Where it comes from |
|---|---|---|
| Metro | rosso #FF5147 / #D52B20 | the red "M" signs of the Milan and Rome metros |
| Bus | arancio ministeriale #FF8F1F / #BF5700 | the orange that Italian buses wore for decades |
| Train | verde #3BBF6E / #178043 | regional trains (Trenord, the old "treni verdi"); red is taken by the metro |
| Airport | azzurro #4DA3FF / #1F6FD1 | the national azure, as on ITA Airways tails |

- **Guaranteed hours** are now drawn in timetable ivory (#EDE6D3), not green. They mean "the service runs as timetabled", and green would clash with the trains.
- **"OK" verdicts** use mint (#4AD9A7).
- **Pixel scenes, widget and cards** follow the palette: the bus is ministerial orange, the plane's fin is azzurro, the train keeps its Trenord green and blue.

## The face is awake in one place only
- **The page face** (calm-day board, strike-day bar) is the assistant at rest. It never keeps an answer's mood.
- **The answer sheet's face** carries the result. While the sheet is open, the page face shuts its eyes and goes dark, so two faces are never awake at once.

## Graffiti wall
- **Panels.** About 55 px wide and the full side's height (two rows on double-deckers), so there is room to draw. The zoom is about 2×.
- **Paint gauge.** A thick arc to the left of the finger, like a game's stamina bar, kept out from under the thumb.
- **Buttons.** While spraying, the card's two buttons become "撤销一笔" and "喷好了 · 余漆 x%", in the same places.
- **Zoomed frame.** It fades on all four sides.
- **Caption.** "这块车身归你：喷几笔，把火气留在车上" ("this panel is yours: spray a few strokes and leave your anger on the train").
- **Marks.** They are angry and wordless: 💢, a big X, !!, a cross face, a fist, 🤌, thumbs down, a crossed-out clock, a no-service sign, a splat and a tangle.
- **How a mark is drawn.** Each one is built like a real spray piece: overspray haze, a fill with volume, outline, shine, drips. The body's highlights are laid back over all paint, so it sits on lit metal.
- **Train.** It is now two cars (cab plus the next car running off-frame). The windscreen follows the nose down to half height, with a separate cab side window.

## Day changes and the rail
- **Day change.** Days slide side by side: the old day leaves as the new one enters, on the rail's spring. Nothing fades first.
- **Selected day.** It is slightly larger and has no pointer notch.
- **Overnight strike.** A thick bar in the mode's colour runs from one day's badge to the next under the badges, like a multi-day calendar event. It is strong when either day is selected and faint otherwise.

## Sheets
- **Swiping down always closes.** From the full height it no longer parks at the medium detent.
- **City switch.** The tapped city shows "正在打开…" ("opening…") at once. The new page takes 2–3 s to build, which previously looked like an ignored tap.

## Card and sources
- **Guarantee line.** All guaranteed gaps go on one line, by the guarantees' own times. Gaps that only fall between strike windows go on a second line. The details row is not repeated when the line above already says it.
- **Bar labels.** A strike edge one minute off a guarantee edge (05:59/06:00) is labelled once.
- **Wording.** "时段仅见报道" ("hours only reported") becomes "时段来源自报道" ("hours from press reports").
- **Translation toggle.** It moves under the text it applies to: "译自意大利语 · 看原文" ("translated from Italian · show original").

## Safari
- `theme-color` and the page background are the lab's near-black, with `color-scheme: dark` and `viewport-fit=cover`.
- On strike days, `theme-color` takes the glow colour at the top of the page, so the bars run seamlessly into it.

## Ask: reading what people mean
Questions rarely follow a template. Rather than ask back, or answer for every mode, the answer reads the likely meaning **and says so**, correctable in place.

**What the question is for:**
- **Everyday travel** (school, work, commuting) means metro, bus/tram and local trains, never flights. The answer says "日常出行，查地铁、公交、火车（不含机场）" ("everyday travel: checking metro, bus and train, not flights") with a "改交通" ("change transport") link that opens a multi-select.
- **Trips abroad** (Switzerland, France, Austria, Germany, Slovenia, Monaco) are judged as trains, with the cross-border rule given to the judge. The answer says plainly that only the Italian section is covered: Trenord/Trenitalia up to the border; SBB (or the local railway) after it is outside Italy's register.
- **Parts of the day** ("晚上", evening) are read as a span (18–24). Any strike minute inside counts, said as "部分在罢工时段内" ("partly inside the strike hours").

**Supporting a "no strike" answer:**
- A "no strike" answer lists what was checked: the register and operator notices, the modes, the dates, and the data time.

**Choosing transport:**
- Several modes can now be picked at once, followed by an explicit confirm. Picked modes replace the guessed ones rather than adding to them.

**Quota:**
- A question counts only when it is answered, both on the device and per IP.
- A budget-ledger error now runs unmetered instead of saying "额度用完" ("allowance used up"). Only a ledger that actually answers "no" shows that.
