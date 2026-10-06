import { SOURCE_USER_AGENT } from '../../../../lib/sourceRequest';
import { NextResponse } from 'next/server';
import { fetchCgsse } from '../../../../lib/cgsseTls';
import { fetchToscanaNotice } from '../../../../lib/toscanaAirportNotices';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 40;

// Fixed public sources only. This read-only diagnostic never touches the DB or AI.
const sources = [
  ['CGSSE', 'https://cgsse.it/calendario-scioperi/dettaglio-sciopero/381401'],
  ['TOSCANA_AEROPORTI', 'https://www.toscana-aeroporti.com/it/news/'],
  ['CTM', 'https://www.ctmcagliari.it/comunicati/'],
  ['BRESCIA', 'https://www.bresciamobilita.it/news'],
  ['TRENORD', 'https://www.trenord.it/news/trenord-informa/avvisi/'],
  ['VENEZIA', 'https://www.veneziaairport.it/it_it/news'],
  ['EASYJET', 'https://www.easyjet.com/en/help-centre/before-you-fly/latest-travel-information'],
] as const;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: 'Diagnostic authorization is not configured' }, { status: 503 });
  if (request.headers.get('authorization') !== `Bearer ${secret}`) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const checkedAt = new Date().toISOString();
  const results = await Promise.all(sources.map(async ([source, url]) => {
    const start = Date.now();
    try {
      if (source === 'TOSCANA_AEROPORTI') {
        const html = await fetchToscanaNotice(url, start + 25000);
        return { source, url, status: 'READABLE', bytes: Buffer.byteLength(html), elapsedMs: Date.now() - start };
      }
      const signal = AbortSignal.timeout(12000);
      let response = source === 'CGSSE' ? await fetchCgsse(url, signal) : await fetch(url, { signal, redirect: 'manual', cache: 'no-store', headers: { 'User-Agent': SOURCE_USER_AGENT, Accept: 'text/html,application/pdf' } });
      let identity:'PRODUCT'|'NODE_RUNTIME'='PRODUCT';
      if(response.status===403 && ['BRESCIA','VENEZIA'].includes(source)) {
        await response.body?.cancel();identity='NODE_RUNTIME';
        response=await fetch(url,{signal,redirect:'manual',cache:'no-store',headers:{Accept:'text/html,application/pdf'}});
      }
      const reader = response.ok ? response.body?.getReader() : undefined;
      let bytes = 0;
      if (response.ok && reader) {
        for (;;) {
          const part = await reader.read();
          if (part.done) break;
          bytes += part.value.length;
          if (bytes > 2_000_000) { await reader.cancel(); throw new Error('Response size limit'); }
        }
      } else await response.body?.cancel();
      return { source, url, status: response.ok && bytes > 0 ? 'READABLE' : 'HTTP_ERROR', http: response.status, identity, bytes, elapsedMs: Date.now() - start };
    } catch (error) {
      const name = error instanceof Error ? error.name : '';
      const code = (error as { cause?: { code?: string } })?.cause?.code;
      const knownCodes = ['UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'UNABLE_TO_GET_ISSUER_CERT_LOCALLY', 'CERT_HAS_EXPIRED', 'ERR_TLS_CERT_ALTNAME_INVALID', 'ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND', 'EAI_AGAIN', 'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_SOCKET'];
      return { source, url, status: name === 'TimeoutError' || name === 'AbortError' ? 'TIMEOUT' : 'FETCH_ERROR', ...(code && knownCodes.includes(code) ? { code } : {}), elapsedMs: Date.now() - start };
    }
  }));
  return NextResponse.json({ checkedAt, region: process.env.VERCEL_REGION || 'local', results }, { headers: { 'Cache-Control': 'private, no-store' } });
}
