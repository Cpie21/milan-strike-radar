// Scriptable widget source. Shared by the widget guide in the current page
// and the redesigned sheet so both ship the identical script.
export type WidgetScriptOptions = {
  targetOrigin: string;
  normalizedRegion: string;
  typesJson: string;
  regionLabel: string;
  widgetLabelsJson: string;
  regionPagePath: string;
};

export function buildWidgetScript({ targetOrigin, normalizedRegion, typesJson, regionLabel, widgetLabelsJson, regionPagePath }: WidgetScriptOptions) {
  return `const API_URL = "${targetOrigin}/api/strikes?region=${normalizedRegion}";
const SELECTED_TYPES = ${typesJson};
const REGION_LABEL = "${regionLabel}";
const L = ${widgetLabelsJson};
const OPEN_URL = "${targetOrigin}${regionPagePath}";
const widget = new ListWidget();
const LEFT_COL_WIDTH = 90;
const RIGHT_COL_WIDTH = 198;
const MAX_VISIBLE_ROWS = 3;
const C = {
  bg: new Color("#121212"),
  white: new Color("#FFFFFF"),
  white50: new Color("#FFFFFF", 0.5),
  yellow: new Color("#FFEC20"),
  green: new Color("#76E92A"),
  red: new Color("#FF3B30"),
  grayDot: new Color("#8C8C8C"),
  panel: new Color("#FFFFFF", 0.05),
  line: new Color("#DCDCDC", 0.4)
};

function getMinutes(v) {
  const p = String(v || "00:00").split(":");
  const h = Number(p[0] || 0);
  const m = Number(p[1] || 0);
  if (h === 24) return 24 * 60;
  return h * 60 + m;
}

function formatTime(item) {
  if (item && item.timing_evidence && item.timing_evidence.windows.length) {
    return item.timing_evidence.windows.map(function(w) {
      return (w.start === null ? "start of service" : w.start) + " - " + (w.end_kind === "end_of_service" ? "end of service" : w.end);
    }).join(", ");
  }
  if (!item || !item.strike_windows || !item.strike_windows.length) return "Time to be confirmed";
  const w = item.strike_windows[0];
  return String(w.start || "00:00") + " - " + String(w.end || "24:00");
}

function getTimeKey(item) {
  if (item && item.timing_evidence && item.timing_evidence.windows.length) return formatTime(item);
  if (!item) return "00:00-24:00";
  if (Array.isArray(item.strike_windows) && item.strike_windows.length) {
    return item.strike_windows.map(function(w) {
      return String(w.start || "00:00") + "-" + String(w.end || "24:00");
    }).join(",");
  }
  if (item.display_time) return String(item.display_time);
  return formatTime(item);
}

function normalizeKeyPart(v) {
  return String(v || "").replace(/\s+/g, " ").trim().toLowerCase();
}

function dedupeStrikes(items) {
  const map = new Map();
  for (const item of items || []) {
    if (!item) continue;
    const key = [
      normalizeKeyPart(item.category),
      normalizeKeyPart(item.provider),
      normalizeKeyPart(getTimeKey(item))
    ].join("::");
    if (!map.has(key)) map.set(key, item);
  }
  return Array.from(map.values());
}

function getDotColor(item, nowMin) {
  if (item && item.status === "CANCELLED") return C.grayDot;
  if (item && item.timing_evidence && item.timing_evidence.windows.some(w => w.start === null || w.end_kind === "end_of_service")) {
    // A service-relative endpoint cannot establish whether a particular line
    // is currently stopped. Keep the widget cautionary rather than claiming it.
    return C.yellow;
  }
  if (item && item.has_unknown_timing) return C.yellow;
  if (!item || !item.strike_windows || !item.strike_windows.length) return C.grayDot;
  let hasFuture = false;
  let hasActive = false;
  for (const w of item.strike_windows) {
    const s = getMinutes(w.start);
    const e = getMinutes(w.end);
    if (nowMin >= s && nowMin < e) hasActive = true;
    if (nowMin < s) hasFuture = true;
  }
  if (hasActive) return C.red;
  if (hasFuture) return C.yellow;
  return C.grayDot;
}

function getTitle(item) {
  const m = L.titleMap || {};
  const base = m[item.category] || L.fallbackTitle;
  const provider = item.provider ? String(item.provider) : "";
  if (!provider) return base;
  const shortProvider = provider.length > 14 ? provider.slice(0, 14) + "..." : provider;
  return base + "（" + shortProvider + "）";
}

function addWarningBadge(parent) {
  const wrap = parent.addStack();
  wrap.size = new Size(36, 32);
  wrap.centerAlignContent();
  const badge = wrap.addText("⚠");
  badge.font = Font.mediumSystemFont(28);
  badge.textColor = C.yellow;
  return wrap;
}

function addLeftColumn(container, count, isStrike, visibleRows) {
  const left = container.addStack();
  left.layoutVertically();
  left.size = new Size(LEFT_COL_WIDTH, 0);
  left.topAlignContent();
  if (isStrike) {
    addWarningBadge(left);
  } else {
    const icon = left.addImage(SFSymbol.named("checkmark.shield.fill").image);
    icon.imageSize = new Size(36, 32);
    icon.tintColor = C.green;
  }
  left.addSpacer(isStrike ? (visibleRows >= 3 ? 18 : visibleRows === 2 ? 28 : 45) : 53);
  const n = left.addText(String(count));
  n.font = Font.boldSystemFont(24);
  n.textColor = C.white;
  const s = left.addText(isStrike ? L.todayStrike : L.safeTravel);
  s.font = Font.boldSystemFont(17);
  s.textColor = isStrike ? C.yellow : C.green;
  return left;
}

function addSeparator(parent) {
  const sep = parent.addStack();
  sep.size = new Size(RIGHT_COL_WIDTH, 1);
  sep.backgroundColor = C.line;
}

function addOneRow(parent, item, nowMin, dotColorOverride, showTime) {
  const row = parent.addStack();
  row.layoutHorizontally();
  row.centerAlignContent();
  const dot = row.addStack();
  dot.size = new Size(8, 8);
  dot.cornerRadius = 4;
  dot.backgroundColor = dotColorOverride || getDotColor(item, nowMin);
  row.addSpacer(10);
  const notes = row.addStack();
  notes.layoutVertically();
  notes.size = new Size(RIGHT_COL_WIDTH - 18, showTime === false ? 18 : 35);
  const t = notes.addText(getTitle(item));
  t.font = Font.systemFont(15);
  t.textColor = C.white;
  t.lineLimit = 1;
  if (showTime !== false) {
    const time = notes.addText(formatTime(item));
    time.font = Font.mediumSystemFont(12);
    time.textColor = C.white50;
  }
}

widget.backgroundColor = C.bg;
widget.url = OPEN_URL;

try {
  const req = new Request(API_URL);
  const allStrikes = JSON.parse(await req.loadString());
  if (!Array.isArray(allStrikes)) throw new Error("bad-data");
  const now = new Date();
  const today = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const todayStrikes = dedupeStrikes(allStrikes.filter(x => x && x.date === today && SELECTED_TYPES.includes(x.category)));
  const count = todayStrikes.length;

  if (count === 0) {
    widget.setPadding(10, 16, 10, 18);
    const root = widget.addStack();
    root.layoutHorizontally();
    root.topAlignContent();
    addLeftColumn(root, 0, false);
    root.addSpacer();
    const box = root.addStack();
    box.size = new Size(206, 135);
    box.cornerRadius = 12;
    box.backgroundColor = new Color("#FFFFFF", 0.08);
    box.centerAlignContent();
    const txt = box.addText(L.noStrikeToday);
    txt.font = Font.boldSystemFont(15);
    txt.textColor = C.white50;
  } else if (count === 1) {
    widget.setPadding(15, 16, 14, 16);
    const root = widget.addStack();
    root.layoutHorizontally();
    root.topAlignContent();
    addLeftColumn(root, 1, true, 1);
    root.addSpacer(19);
    const right = root.addStack();
    right.layoutVertically();
    right.size = new Size(RIGHT_COL_WIDTH, 0);
    right.addSpacer(14);
    addOneRow(right, todayStrikes[0], nowMin, C.red, true);
  } else {
    widget.setPadding(15, 16, 14, 16);
    const root = widget.addStack();
    root.layoutHorizontally();
    root.topAlignContent();
    const visibleRows = Math.min(count, MAX_VISIBLE_ROWS);
    addLeftColumn(root, count, true, visibleRows);
    root.addSpacer(19);
    const right = root.addStack();
    right.layoutVertically();
    right.size = new Size(RIGHT_COL_WIDTH, 0);

    addOneRow(right, todayStrikes[0], nowMin, getDotColor(todayStrikes[0], nowMin), true);

    if (visibleRows >= 2) {
      right.addSpacer(10);
      addSeparator(right);
      right.addSpacer(10);
      addOneRow(right, todayStrikes[1], nowMin, getDotColor(todayStrikes[1], nowMin), true);
    }

    if (visibleRows >= 3) {
      right.addSpacer(9);
      addSeparator(right);
      right.addSpacer(9);
      addOneRow(right, todayStrikes[2], nowMin, getDotColor(todayStrikes[2], nowMin), false);
    }
  }
} catch (e) {
  widget.setPadding(10, 16, 11, 10);
  const txt = widget.addText(L.dataError);
  txt.textColor = C.white50;
  txt.font = Font.boldSystemFont(14);
}

Script.setWidget(widget);
widget.presentMedium();
Script.complete();
`;
}
