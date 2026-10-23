import { handleMitSource } from '../../supabase/functions/mit-official-source/index';

type Environment = { MIT_RELAY_TOKEN?: string };

// No database credentials or business logic. The protected transport preserves
// the original HTML/form/hash contract already covered by source tests.
const worker = {
  async fetch(request: Request, env: Environment) {
    const url = new URL(request.url);
    if (url.pathname === '/probe' && request.method === 'GET') {
      const now = new Date();
      const date = new Intl.DateTimeFormat('en-CA', {timeZone:'Europe/Rome',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
      const results = await Promise.all(['upcoming', 'history'].map(async kind => {
        const began = Date.now();
        const response = await handleMitSource(new Request('https://diagnostic.invalid/', {
          method: 'POST', headers: {authorization:'Bearer public-fixed-source-probe'},
          body: JSON.stringify({kind, date}),
        }), {serviceKey:'public-fixed-source-probe',fetcher:fetch,now:()=>now});
        const result = await response.json();
        const html = typeof result.html === 'string' ? result.html : '';
        return {
          kind, status:response.status, bytes:new TextEncoder().encode(html).length,
          validTable:response.ok && /<table[\s>]/i.test(html) && /Provincia/i.test(html) && /Categoria/i.test(html),
          ...(response.ok ? {sha256:result.sha256} : {failure:result.failure || 'SOURCE_UNAVAILABLE'}),
          elapsedMs:Date.now()-began,
        };
      }));
      return Response.json({checkedAt:now.toISOString(),placement:request.headers.get('cf-placement'),results}, {headers:{'Cache-Control':'no-store'}});
    }
    if (url.pathname !== '/source') return new Response('Not found', {status:404});
    if (!env.MIT_RELAY_TOKEN || env.MIT_RELAY_TOKEN.length < 32) {
      return Response.json({error:'Source transport is not configured'}, {status:503});
    }
    return handleMitSource(request, {serviceKey:env.MIT_RELAY_TOKEN,fetcher:fetch,now:()=>new Date()});
  },
};

export default worker;
