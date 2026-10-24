/** Observe a mutation result without changing optimistic UI, counters or errors. */
export async function interactionReceipt<T extends { success: boolean }>(event: string, action: () => Promise<T>, emit: (event: string, properties: Record<string, unknown>) => void, properties: Record<string, unknown>): Promise<T> {
  const safeEmit = (name: string, p: Record<string, unknown>) => { try { emit(name, p); } catch { /* telemetry is optional */ } };
  safeEmit(`${event}_submitted`, properties);
  try {
    const result = await action();
    safeEmit(`${event}_outcome`, { ...properties, outcome: result.success ? 'saved' : 'rejected' });
    return result;
  } catch (error) {
    safeEmit(`${event}_outcome`, { ...properties, outcome: 'network_failed' });
    throw error;
  }
}
