# Pixel vehicle brief (for Codex)

The graffiti wall draws its four vehicles in code (`components/lab/wall/pixelScene.ts`). The owner wants them better, and asked for this pipeline:
1. Codex generates pixel art from the prompts below.
2. Codex downsamples it to the exact grid.
3. It goes into `public/lab/wall/`.

The wall loads `public/lab/wall/<mode>.png` automatically when it exists: `metro`, `train`, `bus`, `plane`. If a file is missing, the code drawing stays. So each image can land on its own, with no code change.

`current-*.png` here are today's code renders, scaled 4×, for reference: the framing, light and colours to keep, and the shapes to beat.

## Deliverable (each vehicle)
- **Size.** `public/lab/wall/<mode>.png`: exactly 240×140 px, 1 px per art pixel, no anti-aliasing.
- **Background.** Transparent. Only the vehicle: no station, track, platform, sign, or ground shadow (the scene draws those).
- **Placement.** The vehicle sits in the box given per vehicle below. The paintable panels are computed from that box, so it must match within ±2 px.
- **Paint mask (optional).** `public/lab/wall/<mode>-mask.png`, 240×140: white where graffiti may land (the body side, windows included), transparent elsewhere (wheels, bogies, cab glass, the plane's wing and engine). Without it, the code's own body mask is used.
- **Palette.** At most 32 colours.

## Style (all four)
Paste this before each vehicle prompt:

> Pixel art, strict side view, the vehicle parked and still, facing right. In the manner of the great side-view vehicle pixel artists (Alessio Conti, PXLCRS, Etherfield): crisp hard-edged pixels, no anti-aliasing, a limited palette of 24–32 colours, 3-tone ramps per material, sel-out edges (outlines in a darker tone of the adjacent colour, never flat black everywhere). Night, inside a station: warm ceiling lamps above and slightly in front light the roof line and upper body; the lower body falls into cool blue-grey shadow. Painted white reads as cool silver under this light, not pure white. Glass is tinted and shows a dim, empty cabin: a faint lit ceiling strip and dark seat-back silhouettes; no reflections or glare streaks. Wheels and bogies are clearly drawn. No text, no logos, no people. Transparent background.

## Vehicles
Coordinates are in the 240×140 grid, with x to the right and y down.

**metro.png — Milan M1 "Leonardo" cab car (ATM)**
- **Box.** Body x 22–216, roof y 54, floor y 100; roof equipment up to y 50; bogies below to y 110.
> A Milan metro M1 line "Leonardo" train, cab car on the right: light silver-grey body with a rounded red front cab, a large dark windscreen, three red double sliding doors along the side, a thin red skirt stripe, small square side windows between the doors. The white "M" on red is allowed as the only mark, small, beside the middle door.

**train.png — Trenitalia regional double-decker (Hitachi "Rock" family)**
- **Box.** The cab car runs x 36–226 with roof y 34 and floor y 102. The next car, coupled at x 29–35, runs on out of the frame at x 0. Pantograph on the cab car's roof up to y 16.
> An Italian regional double-deck electric train, cab car on the right with a long, smoothly sloped aerodynamic nose and a large black wraparound windscreen running down to half height; white/silver body; doors and a lower band in FS blue (#2E64C8); two decks of continuous tinted window bands split by thin mullions; a pantograph on the roof; the next carriage coupled on the left, cut by the frame edge.

**bus.png — Italian city bus in "arancio ministeriale"**
- **Box.** Body x 26–214, roof y 52, floor y 104. Wheels centred at x 64 and 178, y 104, radius 12. The front is on the right.
> An Italian low-floor city bus (Iveco Urbanway / Mercedes Citaro shape) in the classic Italian "arancio ministeriale" orange, a white roof band, three double doors, large side windows, a dark front windscreen, an amber LED route display above it showing only the number "90", black wheels with grey hubs, and a roof equipment pod.

**plane.png — Airbus A320 side view**
- **Box.** Fuselage centre line y 78, half-height 12, from tail cone x 20 to nose x 224. Fin x 24–66, rising to y 30. Wing root and CFM56 engine under the fuselage around x 120–170. Gear down to y 110.
> An Airbus A320, parked on a night apron, strict side view facing right: a silver-white fuselage with a single window row and a cheat line, cockpit windows, a violet tail fin (#B08CFF ramp) with no airline logo, a near wing seen edge-on, a round CFM56 engine nacelle on a pylon under the wing, and the main and nose gear down.

## Post-processing
- **Generate.** Generate large, at about 1536×896, using the prompt.
- **Downsample.** Use nearest-neighbour to 240×140, then quantise to ≤32 colours, e.g. `magick in.png -filter point -resize 240x140! -colors 32 -alpha set out.png`.
- **Clean up.** Remove stray semi-transparent pixels (alpha must be 0 or 255). Then check that the box above still matches, by overlaying `current-*.png`.
- **Commit.** Commit the PNGs (and masks) in a PR to `claude/redesign-lab`. The wall picks them up without code changes.
