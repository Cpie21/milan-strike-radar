// The lab's Home Screen widget (Scriptable), in the page's language and with
// the page's assistant in it.
//
// The assistant is the point of the widget: it reads the day for you. So
// it is the widget's character, as Duolingo's owl is: its amber LED face
// fills the left, its expression is the day at a glance (at ease, or
// concerned), and the right side is what it is telling you.
// Top band: the face and its line. Bottom: the day's picture, full width.
//   Calm – "今天没有罢工", the next strike, the coming week.
//   One strike – the mode, the state now ("罢工时段内" over "至 15:00"),
//     the day as one track (strike hours in the mode's colour, guaranteed
//     hours green, a white dot for now), the guaranteed hours in words.
//   Several – one line per strike (badges, which, its own state), then a
//     single day chart: a thin lane per strike on one time axis with one
//     "now" line, so overlaps and gaps read at once.
// Modes with identical hours count as one strike. It never says a line
// "is stopped": planned hours are planned hours; an open end is "运营结束".
//
// The production widget (lib/widgetScript.ts, WidgetGuideModal) is left as
// it is; this one ships from the lab sheet only.

export type LabWidgetOptions = { origin: string; region: string; types: string[]; cityName: string; path: string; lang: 'zh' | 'en' };

const LABELS = {
  zh: {
    modes: { SUBWAY: '地铁', BUS: '公交', TRAIN: '火车', AIRPORT: '机场' },
    calm: '今天没有罢工', next: '下一次', later: '再往后一周', over: '已过', today: '今天', none: '近期没有已公布的罢工', inside: '罢工时段内', until: '至',
    past: '今天的罢工时段已过', end: '运营结束', pending: '时段待公布', guaranteed: '保障',
    error: '暂时无法更新', weekday: ['日', '一', '二', '三', '四', '五', '六'], week: ['周日', '周一', '周二', '周三', '周四', '周五', '周六'],
  },
  en: {
    modes: { SUBWAY: 'Metro', BUS: 'Bus', TRAIN: 'Train', AIRPORT: 'Airport' },
    calm: 'No strikes today', next: 'Next', later: 'The week after', over: 'Over', today: 'today', none: 'No strikes announced', inside: 'In strike hours', until: 'until',
    past: 'Today’s strike hours are over', end: 'end of service', pending: 'Hours pending', guaranteed: 'Guaranteed',
    error: 'Can’t update right now', weekday: ['S', 'M', 'T', 'W', 'T', 'F', 'S'], week: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
  },
};

export function buildLabWidgetScript({ origin, region, types, cityName, path, lang }: LabWidgetOptions) {
  const text = LABELS[lang];
  // Phrases with numbers in them, as small functions in the script.
  const fns = lang === 'zh'
    ? `const inDays = n => n === 1 ? "明天" : n + " 天后";
const dateText = (m, d, w) => m + "月" + d + "日 " + w;
const fromText = t => t + " 起罢工";
const manyText = n => "今天 " + n + " 项罢工";`
    : `const inDays = n => n === 1 ? "Tomorrow" : "In " + n + " days";
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const dateText = (m, d, w) => w + " " + d + " " + MONTHS[m - 1];
const fromText = t => "Strike from " + t;
const manyText = n => n + " strikes today";`;
  return `// ${cityName} · strike radar widget. Medium is the main size; small and large work too.
const API_URL = ${JSON.stringify(`${origin}/api/strikes?region=${region}`)};
const OPEN_URL = ${JSON.stringify(`${origin}${path}`)};
const TYPES = ${JSON.stringify(types)};
const CITY = ${JSON.stringify(cityName)};
const T = ${JSON.stringify(text)};
${fns}

const COL = {
  bg: "#0E0F12", surface: "#1A1C21", text: "#F5F6F7", text2: "#A9AEB7", text3: "#6E737C",
  run: "#EDE6D3", ok: "#4AD9A7", amber: "#FFB12E", amberOff: "#2A1E0C", track: "#2A2D33",
  mode: { SUBWAY: "#D52B20", BUS: "#BF5700", TRAIN: "#2559C9", AIRPORT: "#7650DB" },
  main: { SUBWAY: "#FF5147", BUS: "#FF8F1F", TRAIN: "#5B93FF", AIRPORT: "#B08CFF" },
};
const c = (hex, a) => new Color(hex, a === undefined ? 1 : a);
const family = config.widgetFamily || "medium";
const ORDER = { SUBWAY: 0, BUS: 1, TRAIN: 2, AIRPORT: 3 };

// ── The face: the page's amber dot matrix ──
const EYES = {
  open: ["..###..", ".#####.", ".#####.", ".#####.", ".#####.", ".#####.", "..###.."],
  // concerned: inner corners raised (the left eye's inner side is its right)
  worryL: [".......", "......#", "....###", "..#####", ".######", ".#####.", "..###.."],
  worryR: [".......", "#......", "###....", "#####..", "######.", ".#####.", "..###.."],
  down: [".......", ".......", "#.....#", "#.....#", ".#...#.", "..###..", "......."],
  happy: [".......", "..###..", ".#...#.", "#.....#", "#.....#", ".......", "......."],
};
function face(pair, pitch) {
  const cols = 17, rows = 9, pad = pitch * 0.9;
  const w = cols * pitch + pad * 2, h = rows * pitch + pad * 2;
  const dc = new DrawContext();
  dc.size = new Size(w, h); dc.opaque = false; dc.respectScreenScale = true;
  const frame = new Path(); frame.addRoundedRect(new Rect(0, 0, w, h), pitch * 2.6, pitch * 2.6);
  dc.addPath(frame); dc.setFillColor(c("#060606")); dc.fillPath();
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
    const l = x - 1, r = x - 9;
    const k = l >= 0 && l < 7 ? EYES[pair[0]] : r >= 0 && r < 7 ? EYES[pair[1]] : null;
    const ex = l >= 0 && l < 7 ? l : r;
    const on = !!k && y >= 1 && y <= 7 && k[y - 1][ex] === "#";
    const cx = pad + (x + 0.5) * pitch, cy = pad + (y + 0.5) * pitch, rr = pitch * 0.36;
    if (on) { dc.setFillColor(c("#FF9A1A", 0.22)); dc.fillEllipse(new Rect(cx - rr * 2, cy - rr * 2, rr * 4, rr * 4)); }
    dc.setFillColor(c(on ? COL.amber : COL.amberOff)); dc.fillEllipse(new Rect(cx - rr, cy - rr, rr * 2, rr * 2));
  }
  return dc.getImage();
}

// ── Data ──
const romeToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()).slice(0, 10);
function romeMinutes() {
  const p = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Rome", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date()).split(":");
  return Number(p[0]) * 60 + Number(p[1]);
}
const mins = v => { const p = String(v || "0:0").split(":"); return Number(p[0]) * 60 + Number(p[1] || 0); };
const addDays = (iso, n) => new Date(Date.parse(iso + "T12:00:00Z") + n * 86400000).toISOString().slice(0, 10);
const daysBetween = (a, b) => Math.round((Date.parse(b + "T12:00:00Z") - Date.parse(a + "T12:00:00Z")) / 86400000);
const dow = iso => new Date(iso + "T12:00:00Z").getUTCDay();
function windowsOf(item) {
  const ev = item.timing_evidence && Array.isArray(item.timing_evidence.windows) ? item.timing_evidence.windows : null;
  if (ev && ev.length) return ev.map(w => ({ start: w.start, end: w.end_kind === "end_of_service" ? null : w.end }));
  return (item.strike_windows || []).map(w => ({ start: w.start, end: w.end }));
}
const guaranteesOf = item => (item.guarantee_windows || []).filter(g => g && g.start && g.end);
const spanOf = w => [w.start === null ? 300 : mins(w.start), w.end === null ? 1500 : Math.max(mins(w.end), w.start === null ? 0 : mins(w.start) + 1)];

// Today's state, from the planned hours: inside, later, over, or unknown.
function todayState(items, now) {
  const ws = items.flatMap(windowsOf);
  if (!ws.length) return { kind: "pending" };
  const inside = ws.find(w => { const [a, b] = spanOf(w); return now >= a && now < b; });
  if (inside) return { kind: "inside", until: inside.end === null ? T.end : inside.end };
  const later = ws.filter(w => w.start !== null && mins(w.start) > now).sort((a, b) => mins(a.start) - mins(b.start))[0];
  if (later) return { kind: "later", from: later.start };
  return { kind: "past" };
}

// Modes with the same hours (and guarantees) read as one strike.
function groupsOf(items) {
  const map = new Map();
  items.forEach(x => {
    const k = JSON.stringify([windowsOf(x), guaranteesOf(x)]);
    const g = map.get(k) || { modes: [], items: [] };
    if (!g.modes.includes(x.category)) g.modes.push(x.category);
    g.items.push(x); map.set(k, g);
  });
  return [...map.values()].sort((a, b) => ORDER[a.modes[0]] - ORDER[b.modes[0]]);
}
const shortState = st => st.kind === "inside" ? T.until + " " + st.until : st.kind === "later" ? fromText(st.from) : st.kind === "past" ? T.over : T.pending;

// ── Pieces ──
function badge(parent, mode, size) {
  const b = parent.addStack();
  b.size = new Size(size, size); b.cornerRadius = size * 0.26; b.backgroundColor = c(COL.mode[mode] || COL.surface);
  b.centerAlignContent();
  if (mode === "SUBWAY") { const m = b.addText("M"); m.font = Font.boldSystemFont(size * 0.72); m.textColor = c("#FFFFFF"); return; }
  const sym = { BUS: "bus.fill", TRAIN: "train.side.front.car", AIRPORT: "airplane" }[mode] || "exclamationmark";
  const img = b.addImage(SFSymbol.named(sym).image);
  img.imageSize = new Size(size * 0.62, size * 0.62); img.tintColor = c("#FFFFFF");
}
function label(parent, s, size, color, weight) {
  const t = parent.addText(s);
  t.font = weight === "bold" ? Font.boldRoundedSystemFont(size) : weight === "semibold" ? Font.semiboldSystemFont(size) : Font.mediumSystemFont(size);
  t.textColor = c(color); t.lineLimit = 1; t.minimumScaleFactor = 0.7;
  return t;
}
// The day as a track, 05:00 → end of service (slim: one row of several)
function track(items, now, width, slim) {
  const h = slim ? 14 : 30, y = slim ? 7 : 8, dc = new DrawContext();
  dc.size = new Size(width, h); dc.opaque = false; dc.respectScreenScale = true;
  const x = m => Math.max(0, Math.min(1, (m - 300) / 1200)) * width;
  const bar = (a, b, color, th) => { const p = new Path(); p.addRoundedRect(new Rect(x(a), y - th / 2, Math.max(th, x(b) - x(a)), th), th / 2, th / 2); dc.addPath(p); dc.setFillColor(c(color)); dc.fillPath(); };
  const th = slim ? 6 : 8;
  bar(300, 1500, COL.track, slim ? 3 : 4);
  items.forEach(item => {
    windowsOf(item).forEach(w => { const [a, b] = spanOf(w); bar(a, b, COL.main[item.category], th); });
    guaranteesOf(item).forEach(g => bar(mins(g.start), mins(g.end), COL.run, th));
  });
  const nx = x(now < 300 ? now + 1440 : now), rr = slim ? 5 : 7;
  dc.setFillColor(c(COL.bg)); dc.fillEllipse(new Rect(nx - rr, y - rr, rr * 2, rr * 2));
  dc.setFillColor(c("#FFFFFF")); dc.fillEllipse(new Rect(nx - rr * 0.64, y - rr * 0.64, rr * 1.28, rr * 1.28));
  if (slim) return dc.getImage();
  // the edges that matter, under the track
  const edges = [...new Set(items.flatMap(windowsOf).flatMap(w => [w.start, w.end]).filter(Boolean))].sort().slice(0, 4);
  dc.setFont(Font.mediumSystemFont(9.5)); dc.setTextColor(c(COL.text3));
  let last = -99;
  edges.forEach(t => { const px = x(mins(t)); if (px - last < 34) return; last = px; dc.drawText(t, new Point(Math.max(0, Math.min(width - 28, px - 13)), y + 9)); });
  return dc.getImage();
}
// Several strikes on one axis: a thin lane each, one "now" line through all
function lanes(groups, now, width) {
  const lane = 5, gap = 4, top = 2, h = top + groups.length * (lane + gap) + 12, dc = new DrawContext();
  dc.size = new Size(width, h); dc.opaque = false; dc.respectScreenScale = true;
  const x = m => Math.max(0, Math.min(1, (m - 300) / 1200)) * width;
  const bar = (a, b, y, color) => { const p = new Path(); p.addRoundedRect(new Rect(x(a), y, Math.max(lane, x(b) - x(a)), lane), lane / 2, lane / 2); dc.addPath(p); dc.setFillColor(c(color)); dc.fillPath(); };
  groups.forEach((g, i) => {
    const y = top + i * (lane + gap);
    bar(300, 1500, y, COL.track);
    g.items.forEach(item => {
      windowsOf(item).forEach(w => { const [a, b] = spanOf(w); bar(a, b, y, COL.main[g.modes[0]]); });
      guaranteesOf(item).forEach(gg => bar(mins(gg.start), mins(gg.end), y, COL.run));
    });
  });
  const nx = x(now < 300 ? now + 1440 : now), bottom = top + groups.length * (lane + gap) - gap;
  dc.setFillColor(c("#FFFFFF")); dc.fillRect(new Rect(nx - 1, 0, 2, bottom + 2));
  dc.setFont(Font.mediumSystemFont(9)); dc.setTextColor(c(COL.text3));
  [["06", 360], ["12", 720], ["18", 1080], ["24", 1440]].forEach(([t, m]) => dc.drawText(t, new Point(Math.min(width - 12, x(m) - 5), bottom + 2)));
  return dc.getImage();
}

// Seven days, strike days filled with their mode's colour
function week(parent, byDate, from, n, today) {
  const row = parent.addStack(); row.layoutHorizontally();
  for (let i = 0; i < n; i++) {
    const d = addDays(from, i), items = byDate[d] || [];
    if (i) row.addSpacer();
    const col = row.addStack(); col.layoutVertically(); col.centerAlignContent();
    const wd = col.addText(T.weekday[dow(d)]); wd.font = Font.mediumSystemFont(9.5); wd.textColor = c(d === today ? COL.text2 : COL.text3);
    col.addSpacer(3);
    const dot = col.addStack(); dot.size = new Size(22, 22); dot.cornerRadius = 11; dot.centerAlignContent();
    const modes = [...new Set(items.map(x => x.category))].sort((a, b) => ORDER[a] - ORDER[b]);
    dot.backgroundColor = modes.length ? c(COL.mode[modes[0]]) : c(COL.surface);
    if (d === today) { dot.borderWidth = 1.5; dot.borderColor = c("#FFFFFF", 0.85); }
    const num = dot.addText(String(Number(d.slice(8)))); num.font = Font.semiboldSystemFont(10); num.textColor = c(modes.length ? "#FFFFFF" : COL.text2);
  }
}
function background(w, mode) {
  const g = new LinearGradient();
  g.colors = mode ? [c(COL.main[mode], 0.2), c(COL.bg)] : [c("#16181D"), c(COL.bg)];
  g.locations = [0, 0.65];
  w.backgroundGradient = g;
}

// ── Build ──
const widget = new ListWidget();
widget.url = OPEN_URL;
widget.refreshAfterDate = new Date(Date.now() + 20 * 60 * 1000);
widget.setPadding(14, 14, 14, 16);
try {
  const all = JSON.parse(await new Request(API_URL).loadString());
  if (!Array.isArray(all)) throw new Error("bad data");
  const today = romeToday(), now = romeMinutes();
  const live = all.filter(x => x && TYPES.includes(x.category) && x.status !== "CANCELLED");
  const byDate = {};
  live.forEach(x => { (byDate[x.date] = byDate[x.date] || []).push(x); });
  const todays = (byDate[today] || []).sort((a, b) => ORDER[a.category] - ORDER[b.category]);
  const groups = groupsOf(todays);
  const strike = groups.length > 0;
  const upcoming = live.filter(x => x.date > today).sort((a, b) => (a.date < b.date ? -1 : 1));
  const nextDate = upcoming.length ? upcoming[0].date : null;
  background(widget, strike ? groups[0].modes[0] : null);
  const small = family === "small";

  // Top band: the assistant's face and what it is saying. Bottom: the
  // picture of the day, the full width of the widget.
  const top = widget.addStack(); top.layoutHorizontally(); top.centerAlignContent();
  const fimg = top.addImage(face(strike ? ["worryL", "worryR"] : ["happy", "happy"], small ? 2.4 : 3.4));
  fimg.imageSize = small ? new Size(46, 26) : new Size(64, 36);
  top.addSpacer(small ? 0 : 10);
  const words = small ? null : top.addStack();
  if (small) top.addSpacer();
  const say = small ? widget : words;
  if (words) words.layoutVertically();
  if (small) widget.addSpacer(8);

  const names = ms => ms.map(m => T.modes[m]).join(" · ");
  const eyebrow = text => label(say, text, 11.5, COL.text3, "semibold");

  if (!strike) {
    eyebrow(CITY + " · " + T.week[dow(today)]);
    label(say, T.calm, small ? 18 : 20, COL.text, "bold");
    if (!small) widget.addSpacer();
    const r = widget.addStack(); r.layoutHorizontally(); r.centerAlignContent();
    if (nextDate) {
      const t = new Date(nextDate + "T12:00:00Z");
      const ms = [...new Set((byDate[nextDate] || []).map(x => x.category))].sort((a, b) => ORDER[a] - ORDER[b]);
      ms.forEach((m, i) => { if (i) r.addSpacer(2); badge(r, m, 14); });
      r.addSpacer(5);
      label(r, (small ? "" : T.next + " · ") + dateText(t.getUTCMonth() + 1, t.getUTCDate(), T.week[t.getUTCDay()]) + " · " + inDays(daysBetween(today, nextDate)), 11.5, COL.text2);
    } else label(r, T.none, 11.5, COL.text2);
    if (!small) { widget.addSpacer(6); week(widget, byDate, today, 7, today); }
  } else if (groups.length === 1 || small) {
    const g = groups[0], st = todayState(groups.flatMap(x => x.items), now);
    eyebrow(names(groups.flatMap(x => x.modes)) + " · " + CITY);
    const big = st.kind === "inside" ? T.inside + " · " + T.until + " " + st.until : st.kind === "later" ? fromText(st.from) : st.kind === "past" ? T.past : T.pending;
    label(say, big, small ? 17 : 19, st.kind === "inside" ? COL.main[g.modes[0]] : COL.text, "bold");
    if (!small) {
      widget.addSpacer();
      const tr = widget.addImage(track(g.items, now, 296)); tr.imageSize = new Size(296, 30);
      const gs = g.items.flatMap(guaranteesOf).filter((x, i, all) => all.findIndex(o => o.start === x.start && o.end === x.end) === i);
      if (gs.length) label(widget, T.guaranteed + " " + gs.map(x => x.start + "–" + x.end).join(" · "), 11, COL.run, "semibold");
    }
  } else {
    // several strikes: what the assistant says, the list, then one shared day
    eyebrow(CITY);
    label(say, manyText(groups.length), 19, COL.text, "bold");
    widget.addSpacer();
    const shown = family === "large" ? groups : groups.slice(0, 2);
    shown.forEach((g, i) => {
      if (i) widget.addSpacer(3);
      const r = widget.addStack(); r.layoutHorizontally(); r.centerAlignContent();
      g.modes.slice(0, 3).forEach((m, k) => { if (k) r.addSpacer(2); badge(r, m, 15); });
      r.addSpacer(5); label(r, names(g.modes), 12, COL.text2, "semibold");
      r.addSpacer();
      const st = todayState(g.items, now);
      label(r, shortState(st), 12, st.kind === "inside" ? COL.main[g.modes[0]] : st.kind === "past" ? COL.text3 : COL.text, "semibold");
    });
    widget.addSpacer(5);
    const ln = widget.addImage(lanes(shown, now, 296)); ln.imageSize = new Size(296, 2 + shown.length * 9 + 12);
  }
  if (family === "large") {
    widget.addSpacer(16);
    label(widget, T.later, 11, COL.text3, "semibold");
    widget.addSpacer(4);
    week(widget, byDate, addDays(today, 7), 7, today);
  }
} catch (e) {
  background(widget, null);
  const r = widget.addStack(); r.layoutHorizontally(); r.centerAlignContent();
  r.addImage(face(["down", "down"], 4.2)).imageSize = new Size(80, 45);
  r.addSpacer(12);
  const col = r.addStack(); col.layoutVertically();
  label(col, T.error, 16, COL.text, "bold");
  label(col, CITY, 11, COL.text3);
}

Script.setWidget(widget);
if (config.runsInApp) widget.presentMedium();
Script.complete();
`;
}
