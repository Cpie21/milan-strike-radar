/** Share/copy receipts reflect browser API completion, never delivery to a friend. */
export async function shareOutcome(payload: ShareData, copyText: string, native: boolean,
  emit: (properties: { method: 'native' | 'clipboard'; outcome: 'completed' | 'cancelled' | 'failed' }) => void) {
  const method = native ? 'native' : 'clipboard';
  try {
    if (native) await navigator.share(payload);
    else {
      if (!navigator.clipboard) throw new Error('Unavailable');
      await navigator.clipboard.writeText(copyText);
    }
    emit({ method, outcome: 'completed' });
    return method === 'clipboard';
  } catch (error) {
    emit({ method, outcome: native && error instanceof Error && error.name === 'AbortError' ? 'cancelled' : 'failed' });
    return false;
  }
}
