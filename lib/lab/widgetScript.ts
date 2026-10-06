// The lab's Home Screen widget (Scriptable), in the page's own language:
// the near-black ground, mode badges in mode colours, and the same amber
// LED face. Calm, it is open-eyed and points to the next strike; on a strike
// day it is cross, and lists today's strikes with their hours. It never says
// a line "is stopped": planned hours are planned hours.
//
// The production widget (lib/widgetScript.ts, WidgetGuideModal) is left as
// it is; this one ships from the lab sheet only.

export type LabWidgetOptions = { origin: string; region: string; types: string[]; cityName: string; path: string; lang: 'zh' | 'en' };

const LABELS = {
  zh: {
    modes: { SUBWAY: '地铁', BUS: '公交', TRAIN: '火车', AIRPORT: '机场' },
    calm: '今日无罢工', calmSub: '安心出行', next: '下一次', none: '近期没有已公布的罢工',
    start: '运营开始', end: '运营结束', pending: '时段待公布', cancelled: '已取消',
    error: '暂时无法更新', weekday: ['周日', '周一', '周二', '周三', '周四', '周五', '周六'],
  },
  en: {
    modes: { SUBWAY: 'Metro', BUS: 'Bus', TRAIN: 'Train', AIRPORT: 'Airport' },
    calm: 'No strikes today', calmSub: 'All clear', next: 'Next', none: 'No strikes announced',
    start: 'Start of service', end: 'End of service', pending: 'Hours pending', cancelled: 'Cancelled',
    error: 'Can’t update right now', weekday: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
  },
};

export function buildLabWidgetScript({ origin, region, types, cityName, path, lang }: LabWidgetOptions) {
  const text = LABELS[lang];
  // Phrases with numbers in them, as small functions in the script.
  const fns = lang === 'zh'
    ? `const strikesText = n => "今天 " + n + " 项罢工";
const inDays = n => n === 1 ? "明天" : n + " 天后";
const moreText = n => "还有 " + n + " 项";
const dateText = (m, d, w) => m + "月" + d + "日 " + w;`
    : `const strikesText = n => n + " strike" + (n === 1 ? "" : "s") + " today";
const inDays = n => n === 1 ? "Tomorrow" : "In " + n + " days";
const moreText = n => "+" + n + " more";
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const dateText = (m, d, w) => w + " " + d + " " + MONTHS[m - 1];`;
  return `// ${cityName} · strike radar widget. Medium size recommended; small and large work too.
const API_URL = ${JSON.stringify(`${origin}/api/strikes?region=${region}`)};
const OPEN_URL = ${JSON.stringify(`${origin}${path}`)};
const TYPES = ${JSON.stringify(types)};
const CITY = ${JSON.stringify(cityName)};
const T = ${JSON.stringify(text)};
${fns}

const COL = {
  bg: "#0E0F12", surface: "#1A1C21", text: "#F5F6F7", text2: "#A9AEB7", text3: "#6E737C",
  stop: "#FF5A4E", pend: "#F2A33A", ok: "#4AD9A7", amber: "#FFB12E", amberOff: "#2A1E0C",
  mode: { SUBWAY: "#D52B20", BUS: "#BF5700", TRAIN: "#2559C9", AIRPORT: "#7650DB" },
  glow: { SUBWAY: "#FF5147", BUS: "#FF8F1F", TRAIN: "#5B93FF", AIRPORT: "#B08CFF" },
};
const c = (hex, a) => new Color(hex, a === undefined ? 1 : a);
const family = config.widgetFamily || "medium";

// ── The face: the same amber dot matrix as on the site ──
const EYES = {
  open: ["..###..", ".#####.", ".#####.", ".#####.", ".#####.", ".#####.", "..###.."],
  happy: [".......", "..###..", ".#...#.", "#.....#", "#.....#", ".......", "......."],
  down: [".......", ".......", "#.....#", "#.....#", ".#...#.", "..###..", "......."],
  sadL: [".......", "......#", "....###", "..#####", ".######", ".#####.", "..###.."],
  sadR: [".......", "#......", "###....", "#####..", "######.", ".#####.", "..###.."],
};
function face(pair, pitch) {
  const cols = 19, rows = 9, pad = pitch * 0.9;
  const w = cols * pitch + pad * 2, h = rows * pitch + pad * 2;
  const dc = new DrawContext();
  dc.size = new Size(w, h); dc.opaque = false; dc.respectScreenScale = true;
  const frame = new Path(); frame.addRoundedRect(new Rect(0, 0, w, h), pitch * 2.6, pitch * 2.6);
  dc.addPath(frame); dc.setFillColor(c("#060606")); dc.fillPath();
  const lit = (x, y) => {
    const left = x - 1, right = x - 11;
    const k = left >= 0 && left < 7 ? EYES[pair[0]] : right >= 0 && right < 7 ? EYES[pair[1]] : null;
    const ex = left >= 0 && left < 7 ? left : right;
    return !!k && y >= 1 && y <= 7 && k[y - 1][ex] === "#";
  };
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
    const cx = pad + (x + 0.5) * pitch, cy = pad + (y + 0.5) * pitch, r = pitch * 0.36;
    if (lit(x, y)) {
      dc.setFillColor(c("#FF9A1A", 0.22)); dc.fillEllipse(new Rect(cx - r * 2, cy - r * 2, r * 4, r * 4));
      dc.setFillColor(c(COL.amber)); dc.fillEllipse(new Rect(cx - r, cy - r, r * 2, r * 2));
    } else { dc.setFillColor(c(COL.amberOff)); dc.fillEllipse(new Rect(cx - r, cy - r, r * 2, r * 2)); }
  }
  return dc.getImage();
}

// ── Data ──
function romeToday() {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  return p.slice(0, 10);
}
function romeMinutes() {
  const p = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Rome", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date()).split(":");
  return Number(p[0]) * 60 + Number(p[1]);
}
const mins = v => { const p = String(v || "0:0").split(":"); return Number(p[0]) * 60 + Number(p[1] || 0); };
const daysBetween = (a, b) => Math.round((Date.parse(b + "T12:00:00Z") - Date.parse(a + "T12:00:00Z")) / 86400000);
function windowsOf(item) {
  const ev = item.timing_evidence && Array.isArray(item.timing_evidence.windows) ? item.timing_evidence.windows : null;
  if (ev && ev.length) return ev.map(w => ({ start: w.start, end: w.end_kind === "end_of_service" ? null : w.end }));
  return (item.strike_windows || []).map(w => ({ start: w.start, end: w.end }));
}
function hoursText(item) {
  const ws = windowsOf(item);
  if (!ws.length) return T.pending;
  return ws.map(w => (w.start === null ? T.start : w.start) + "–" + (w.end === null ? T.end : w.end)).join(" · ");
}
// Where today stands against the planned hours: inside, still to come, or past.
function phase(item, now) {
  if (item.status === "CANCELLED") return "cancelled";
  const ws = windowsOf(item);
  if (!ws.length) return "pending";
  if (ws.some(w => now >= (w.start === null ? 0 : mins(w.start)) && now < (w.end === null ? 27 * 60 : mins(w.end)))) return "now";
  if (ws.some(w => w.start !== null && now < mins(w.start))) return "later";
  return "past";
}
const PHASE_COL = { now: COL.stop, later: COL.pend, pending: COL.pend, past: COL.text3, cancelled: COL.text3 };
function dedupe(items) {
  const seen = new Set();
  return items.filter(x => { const k = x.category + "|" + x.provider + "|" + hoursText(x); if (seen.has(k)) return false; seen.add(k); return true; });
}
const ORDER = { SUBWAY: 0, BUS: 1, TRAIN: 2, AIRPORT: 3 };

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
  t.font = weight === "bold" ? Font.boldSystemFont(size) : weight === "semibold" ? Font.semiboldSystemFont(size) : Font.mediumSystemFont(size);
  t.textColor = c(color); t.lineLimit = 1; t.minimumScaleFactor = 0.8;
  return t;
}
function row(parent, item, now) {
  const r = parent.addStack();
  r.layoutHorizontally(); r.centerAlignContent();
  badge(r, item.category, 22);
  r.addSpacer(8);
  const col = r.addStack(); col.layoutVertically();
  const top = col.addStack(); top.layoutHorizontally(); top.centerAlignContent();
  const p = phase(item, now);
  label(top, T.modes[item.category] || item.category, 13.5, p === "cancelled" || p === "past" ? COL.text2 : COL.text, "semibold");
  top.addSpacer(5);
  const dot = top.addStack(); dot.size = new Size(6, 6); dot.cornerRadius = 3; dot.backgroundColor = c(PHASE_COL[p]);
  label(col, p === "cancelled" ? T.cancelled : hoursText(item), 11.5, COL.text2).lineLimit = 2;
}
function head(parent, pair, title, sub, accent) {
  const s = parent.addStack(); s.layoutVertically();
  const img = s.addImage(face(pair, 3.4)); img.imageSize = new Size(72, 37);
  s.addSpacer(8);
  label(s, title, 16, COL.text, "bold");
  s.addSpacer(1);
  label(s, sub, 11.5, accent || COL.text3);
}
function nextBlock(parent, next, today) {
  const box = parent.addStack();
  box.layoutVertically(); box.setPadding(10, 12, 10, 12); box.cornerRadius = 14; box.backgroundColor = c(COL.surface);
  if (!next.length) { label(box, T.none, 12.5, COL.text2); return; }
  label(box, T.next, 11, COL.text3);
  box.addSpacer(3);
  const date = next[0].date, dt = new Date(date + "T12:00:00Z");
  label(box, dateText(dt.getUTCMonth() + 1, dt.getUTCDate(), T.weekday[dt.getUTCDay()]), 14.5, COL.text, "semibold");
  box.addSpacer(6);
  const line = box.addStack(); line.layoutHorizontally(); line.centerAlignContent();
  [...new Set(next.map(x => x.category))].sort((a, b) => ORDER[a] - ORDER[b]).forEach(m => { badge(line, m, 18); line.addSpacer(4); });
  line.addSpacer(4);
  label(line, inDays(daysBetween(today, date)), 11.5, COL.text2);
}
function background(w, modes) {
  const g = new LinearGradient();
  const tint = modes.length ? COL.glow[modes[0]] : null;
  g.colors = tint ? [c(tint, 0.22), c(COL.bg)] : [c("#16181D"), c(COL.bg)];
  g.locations = [0, 0.6];
  w.backgroundGradient = g;
}

// ── Build ──
const widget = new ListWidget();
widget.url = OPEN_URL;
widget.refreshAfterDate = new Date(Date.now() + 30 * 60 * 1000);
try {
  const all = JSON.parse(await new Request(API_URL).loadString());
  if (!Array.isArray(all)) throw new Error("bad data");
  const today = romeToday(), now = romeMinutes();
  const mine = all.filter(x => x && TYPES.includes(x.category));
  const todays = dedupe(mine.filter(x => x.date === today)).sort((a, b) => ORDER[a.category] - ORDER[b.category]);
  const live = todays.filter(x => x.status !== "CANCELLED");
  const upcoming = mine.filter(x => x.date > today && x.status !== "CANCELLED").sort((a, b) => a.date < b.date ? -1 : 1);
  const next = upcoming.length ? upcoming.filter(x => x.date === upcoming[0].date) : [];
  background(widget, [...new Set(live.map(x => x.category))]);
  const strike = live.length > 0;
  const pair = strike ? ["sadR", "sadL"] : ["open", "open"];
  const title = strike ? strikesText(live.length) : T.calm;
  const sub = CITY + (strike ? "" : " · " + T.calmSub);

  if (family === "small") {
    widget.setPadding(14, 14, 14, 14);
    head(widget, pair, title, sub);
    widget.addSpacer();
    if (strike) row(widget, live[0], now);
    else if (next.length) { const t = new Date(next[0].date + "T12:00:00Z"); label(widget, T.next + " · " + dateText(t.getUTCMonth() + 1, t.getUTCDate(), T.weekday[t.getUTCDay()]), 11.5, COL.text2, "semibold"); }
  } else {
    widget.setPadding(14, 16, 14, 16);
    const root = widget.addStack(); root.layoutHorizontally(); root.topAlignContent();
    const left = root.addStack(); left.layoutVertically(); left.size = new Size(family === "large" ? 0 : 112, 0);
    head(left, pair, title, sub);
    if (family !== "large") root.addSpacer(12);
    if (family === "large") {
      widget.addSpacer(14);
      const list = widget.addStack(); list.layoutVertically();
      todays.slice(0, 5).forEach((x, i) => { if (i) list.addSpacer(10); row(list, x, now); });
      if (todays.length > 5) { list.addSpacer(8); label(list, moreText(todays.length - 5), 11.5, COL.text3); }
      widget.addSpacer();
      nextBlock(widget, next, today);
    } else {
      const right = root.addStack(); right.layoutVertically();
      if (strike) {
        const shown = todays.slice(0, 3);
        shown.forEach((x, i) => { if (i) right.addSpacer(9); row(right, x, now); });
        if (todays.length > 3) { right.addSpacer(6); label(right, moreText(todays.length - 3), 11, COL.text3); }
      } else nextBlock(right, next, today);
    }
  }
} catch (e) {
  widget.setPadding(14, 16, 14, 16);
  background(widget, []);
  head(widget, ["down", "down"], T.error, CITY);
}

Script.setWidget(widget);
if (config.runsInApp) widget.presentMedium();
Script.complete();
`;
}
