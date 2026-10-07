import { capture, captureOnce } from '../../utils/analytics';

const ONCE = new Set(['Widgets_tutorial_success', 'CalendarSync_tutorial_success', 'AppToDesktop_tutorial_success', 'wechat_jump_success', 'calendar_sync_clicked']);
// This UI is now production. Keep legacy names and per-device guide semantics.
export function track(event: string, props?: Record<string, unknown>) {
  if (ONCE.has(event)) captureOnce(event, props);
  else capture(event, props);
}
