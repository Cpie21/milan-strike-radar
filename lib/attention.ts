/** Accumulate foreground exposure, with bounded, once-only milestones. */
export function attentionClock(emit: (seconds: number) => void, now = () => performance.now()) {
  let started: number | null = null;
  let elapsed = 0;
  const sent = new Set<number>();
  const sample = () => {
    const ms = elapsed + (started === null ? 0 : Math.max(0, now() - started));
    for (const seconds of [1, 5, 15]) {
      if (ms >= seconds * 1000 && !sent.has(seconds)) { sent.add(seconds); emit(seconds); }
    }
  };
  return {
    setVisible(visible: boolean) {
      if (visible && started === null) started = now();
      if (!visible && started !== null) { elapsed += Math.max(0, now() - started); started = null; }
      sample();
    },
    sample,
  };
}
