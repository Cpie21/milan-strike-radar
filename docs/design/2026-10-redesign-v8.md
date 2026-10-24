# Redesign v8: the 3D wall, the Solari assistant, and the calm-day entry

## The wall, rebuilt in three.js
The owner found the SVG wall thin and cheap-looking. They also pointed out that once you had sprayed, the vehicle never moved again: the journey had a dead end.

**The journey now has a beginning and an end.**

| Phase | What happens | Caption |
|---|---|---|
| run | The vehicle runs. The camera sits at three-quarters, the wheels turn, the ties or road dashes stream past, distant lights move in parallax, speed streaks appear, and the car bobs slightly. | "已有 N 人在这节地铁上留下不满 · 点下方「我受影响了」让它停下" (N people have left their anger on this car; tap "I'm affected" below to stop it) |
| brake | "我受影响了" (I'm affected), or "继续喷" (keep spraying), makes it decelerate. The nose dips with the braking and the camera swings square to the side. | "正在停车…" (stopping…) |
| parked | You hold an acrylic spray can. Its liquid column drops in real time as you spray, its surface sloshes when you move, and mist flies from the nozzle to where the paint lands. Paint is clipped to the body. Holding still makes the paint run. | — |
| depart | "完成" (done) swings the camera back and the vehicle pulls away. | "你的涂鸦跟着车出发了" (your graffiti has left with the car) |
| run | It keeps running with your mark on it. | "你和 N 人的涂鸦正跟着这节地铁跑" (your graffiti and N others' are riding along) and "继续喷 · 剩 x%" (keep spraying · x% left) |

**How it is built:**
- **Body.** The body is the vehicle's own side profile (the same SVG path as before), extruded and bevelled into a rounded shell. Its two sides wear one canvas texture: livery, glazing, everyone's tags, and your strokes. Strokes stay in the same 360×150 stage units, so stored drawings are unchanged.
- **Hit-testing.** A raycast on the body gives texture UVs, so you paint the actual surface.
- **Materials.** Clearcoat PBR materials under a RoomEnvironment reflection, ACES tone mapping, and a rim light in the mode's colour. The floor fades out at its edges.
- **Plane.** The fuselage is a heavily bevelled extrusion, with separate wings and engines. It floats with a slow bank instead of running on a track.
- **Performance.** three.js is loaded with `next/dynamic` only when a card's wall is on screen. Rendering pauses off-screen via an IntersectionObserver. Pixel ratio is capped at 2 and the renderer asks for low power. If WebGL fails, the page falls back to the SVG wall.

## The Solari assistant
The assistant's face is two split-flap units from a Solari departure board, each showing one eye. Expressions come from the eyes alone, the way Cozmo and EMO robots do it, and they stay readable at 15px.

**Built from close-up photos of real Solari boards:**
- each flap has two halves with a dark split between them, plus hinge pins at the sides;
- the glyph is cut by the split;
- the top half falls first, darkening as it goes, and its shadow sweeps over the lower half;
- the new lower half lands with a small overshoot;
- the housing is matt black with an inner bevel.

Everything uses CSS 3D transforms only.

**Moods:**

| Mood | Eyes |
|---|---|
| idle | open, with an irregular blink |
| thinking | looking left, up and right, then squinting, one flip every 330 ms |
| happy | `^ ^` |
| alarm | wide, then worried |
| unsure | one eye squinting |
| sorry | eyes looking down |

The mood is derived from Ask's state and verdict (`moodOf`). The face appears in three places: in the dock input (replacing the sparkle), at the head of the answer sheet, and in the calm-day card.

Every mood can be previewed at three sizes on `/lab/solari`.

## The calm-day entry, after Google
The owner found that putting the whole input box inside the calm card felt uncomfortable. Google's AI entries instead offer likely next questions as chips, phrased from what you are looking at, with typing as a secondary path. So the calm card now ends with:
- a short heading: the face plus "还想确认什么？问问站牌" (anything else to check? ask the board);
- suggestion chips built from today's data, for example "10月9日地铁会停吗？" (is the metro running on 9 Oct?) and "这周还有别的罢工吗？" (any other strikes this week?);
- "核实一条听到的消息" (check something you heard), which opens the input prefilled with "群里说" ("someone in the group chat said");
- "问点别的" (ask something else).

The last two raise the dock input from the bottom, already focused. If you leave it empty, it slides away again. On strike days the dock stays as before.
