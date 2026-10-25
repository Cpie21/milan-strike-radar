// Shared offline/freshness behavior emitted into both standalone Scriptable
// scripts. The timestamp is the source sync time, never the cache write time.
export function widgetDataRuntime(region: string, lang: 'zh' | 'en') {
  return `
const WIDGET_REGION = ${JSON.stringify(region)};
const WIDGET_TEXT = ${JSON.stringify(lang === 'zh'
    ? { delayed: '更新延迟', saved: '已保存公告', verify: '请核对运营商公告', updated: '上次同步' }
    : { delayed: 'Update delayed', saved: 'Saved notices', verify: 'Check official notices', updated: 'Last sync' })};
const widgetDataStatus = { delayed: false, updatedAt: null };
function validWidgetSnapshot(value) {
  if (!value || value.version !== 1 || value.region !== WIDGET_REGION || typeof value.fresh !== "boolean" || typeof value.lastSuccessfulSync !== "string" || !Array.isArray(value.data) || value.data.length > 2000) return false;
  const age = Date.now() - Date.parse(value.lastSuccessfulSync);
  if (!Number.isFinite(age) || age < -300000 || age > 7 * 86400000) return false;
  return value.data.every(item => item && /^\\d{4}-\\d{2}-\\d{2}$/.test(item.date) && ["TRAIN", "SUBWAY", "BUS", "AIRPORT"].includes(item.category) && ["CONFIRMED", "UNCERTAIN", "REQUIRES_DETAIL", "CANCELLED"].includes(item.status) && Array.isArray(item.strike_windows));
}
function widgetDataNotice() {
  const time = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Rome", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(widgetDataStatus.updatedAt));
  return WIDGET_TEXT.delayed + " · " + time;
}
async function loadWidgetData(url) {
  let fm, path;
  try {
    fm = FileManager.local();
    path = fm.joinPath(fm.documentsDirectory(), "italy-strike-widget-v1-" + WIDGET_REGION.replace(/[^A-Z_]/g, "") + ".json");
  } catch (_) { /* A storage failure must not prevent an online read. */ }
  let value, offline = false;
  try {
    const request = new Request(url);
    request.timeoutInterval = 15;
    value = JSON.parse(await request.loadString());
    if (!request.response || request.response.statusCode !== 200 || !validWidgetSnapshot(value)) throw new Error("Widget snapshot unavailable");
    try { if (fm && path) fm.writeString(path, JSON.stringify(value)); } catch (_) {}
  } catch (_) {
    offline = true;
    try { value = fm && path && fm.fileExists(path) ? JSON.parse(fm.readString(path)) : null; } catch (_) { value = null; }
    if (!validWidgetSnapshot(value)) throw new Error("No usable saved widget snapshot");
  }
  widgetDataStatus.updatedAt = value.lastSuccessfulSync;
  widgetDataStatus.delayed = offline || !value.fresh || Date.now() - Date.parse(value.lastSuccessfulSync) > 26 * 3600000;
  return value.data;
}
`;
}
