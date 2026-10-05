# Redesign v9: night wall, amber assistant, readable guarantees, sources that lead

- **Guarantees inside a strike.** Protected hours, such as 07–10 and 18–21 inside a 24-hour airline strike, are now cut out of the strike segment and drawn full-height in green. Their edge times get green labels. Two equal-weight colours replace the old thin line on a line (`carveGuarantees`, tested).
- **"我受影响了" ("I'm affected") is part of the wall.**
  - Share and "我受影响了" now sit on the wall's own floor, inside its panel.
  - The instruction sentence is gone. A small count sits in the scene's corner instead: "N 人的不满在车上" ("N people's complaints are on the train").
  - Every 7 seconds a puff of paint flies in from where the button is and lands on the body. At the same moment, the can icon in the button gives a shake. The cause-and-effect is felt, not read.
  - Pressing the button already slows the vehicle under your finger, before you release it. Letting go without tapping lets it speed up again.
- **Sources lead with who stands behind them.**
  - The collapsed state is one surface with a seal icon and the conclusion in bold. Examples: "意大利交通部已登记" ("registered with the Italian transport ministry"), "ATM 已发公告" ("ATM has announced it"), "目前仅见媒体报道" ("only press reports so far"). The rest sits underneath in small type.
  - Expanded content stays inside the same surface, with group headings and 20px bottom padding. The section keeps clear space below it.
- **Assistant.** It now uses the amber Solari boards from Italian stations, not the white one: black flaps, orange glyphs with a bloom, faint blade lines across each flap, a brushed bezel, a glass reflection and an amber halo. The halo grows when the assistant is thinking or alarmed.
  - The face floats with a slow bob. In the input bar it sits on the bar's edge rather than inside it, so it reads as a presence, not an icon.
  - Every mood can be previewed on `/lab/solari`.
- **Night wall.**
  - The vehicle is no longer white. It has a graphite clearcoat body, lit cabins with seat silhouettes, a glowing livery stripe, and neon paint that glows faintly. All of this is done through an emissive map.
  - The scene adds headlight halos, cabin light spilling on the floor, a yellow platform edge for rail, and a wet-floor reflection. The reflection is a mirrored clone under a translucent floor.
  - The SVG fallback uses the same night palette.
  - Scene setup no longer fails if reflections can't be generated on a weak GPU.
