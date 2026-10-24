import { request as httpsRequest } from 'node:https';
import { request as httpRequest, type IncomingMessage } from 'node:http';
import type { TLSSocket } from 'node:tls';
import { SOURCE_USER_AGENT } from './sourceRequest';

// Fixed public HEAD requests only: distinguish DNS/TCP/TLS/HTTP without
// downloading strike facts, following redirects or accepting caller targets.
const targets = [
  { name: 'MIT_HTTPS', url: 'https://scioperi.mit.gov.it/mit2/public/scioperi' },
  { name: 'MIT_TLS12', url: 'https://scioperi.mit.gov.it/mit2/public/scioperi', tls12: true },
  { name: 'MIT_HTTP_REDIRECT', url: 'http://scioperi.mit.gov.it/mit2/public/scioperi' },
  { name: 'MINISTRY_CONTROL', url: 'https://www.mit.gov.it/' },
  { name: 'UNION_CONTROL', url: 'https://www.cgil.it/strumenti/scioperi-e-vertenze' },
] as const;

export type SourceNetworkResult = {
  source: string; url: string; dnsAddress?: string; family?: number;
  dnsMs?: number; tcpMs?: number; tlsMs?: number; httpMs?: number;
  tlsProtocol?: string | null; tlsAuthorized?: boolean; http?: number;
  failedAt?: 'DNS' | 'TCP' | 'TLS' | 'HTTP'; failure?: string; elapsedMs: number;
};

async function probe(target: typeof targets[number]): Promise<SourceNetworkResult> {
  const began = Date.now(), secure = target.url.startsWith('https:');
  const result: SourceNetworkResult = { source: target.name, url: target.url, elapsedMs: 0 };
  return new Promise(resolve => {
    let done = false;
    const finish = (error?: { code?: string }) => {
      if (done) return;
      done = true; clearTimeout(timer);
      result.elapsedMs = Date.now() - began;
      if (error) {
        result.failedAt = result.dnsMs === undefined ? 'DNS' : result.tcpMs === undefined ? 'TCP' : secure && result.tlsMs === undefined ? 'TLS' : 'HTTP';
        // Never return exception bodies, credentials, cookies or local IPs.
        const code = error.code || '';
        result.failure = /^(?:E[A-Z0-9_]+|UNABLE_TO_[A-Z_]+|CERT_[A-Z_]+|NETWORK_PHASE_TIMEOUT)$/.test(code) ? code : 'REQUEST_FAILED';
      }
      resolve(result);
    };
    const response = (res: IncomingMessage) => {
      result.http = res.statusCode; result.httpMs = Date.now() - began;
      res.resume(); finish();
    };
    const options = {
      method: 'HEAD', family: 4, agent: false as const,
      headers: { 'User-Agent': SOURCE_USER_AGENT, Accept: 'text/html' },
    };
    const req = secure ? httpsRequest(target.url, {
      ...options, rejectUnauthorized: true,
      ...('tls12' in target && target.tls12 ? { minVersion: 'TLSv1.2' as const, maxVersion: 'TLSv1.2' as const } : {}),
    }, response) : httpRequest(target.url, options, response);
    const timer = setTimeout(() => req.destroy(Object.assign(new Error('Source phase timeout'), { code: 'NETWORK_PHASE_TIMEOUT' })), 12000);
    req.on('socket', socket => {
      socket.on('lookup', (error, address, family) => {
        if (!error) { result.dnsAddress = address; result.family = Number(family); result.dnsMs = Date.now() - began; }
      });
      socket.on('connect', () => { result.tcpMs = Date.now() - began; });
      socket.on('secureConnect', () => {
        result.tlsMs = Date.now() - began;
        result.tlsProtocol = (socket as TLSSocket).getProtocol();
        result.tlsAuthorized = (socket as TLSSocket).authorized;
      });
    });
    req.on('error', finish); req.end();
  });
}

export async function probeSourceNetwork() {
  return Promise.all(targets.map(probe));
}
