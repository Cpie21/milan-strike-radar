// Connectivity probe only. No credentials, database writes, AI or schedule.
function probeMitConnectivity() {
  const today = Utilities.formatDate(new Date(), 'Europe/Rome', 'yyyy-MM-dd');
  const day = new Date(today + 'T12:00:00Z');
  const start = new Date(day); start.setUTCDate(start.getUTCDate() - 7);
  const end = new Date(day); end.setUTCDate(end.getUTCDate() + 90);
  const base = 'https://scioperi.mit.gov.it/mit2/public/scioperi';
  const form = {
    dataInizio: Utilities.formatDate(start, 'UTC', 'dd/MM/yyyy'),
    dataFine: Utilities.formatDate(end, 'UTC', 'dd/MM/yyyy'),
    settore: '0', rilevanza: '0', stato: '0', categoria: '', sindacato: '', submit: 'Ricerca'
  };
  const requests = [
    {url: base, method: 'get'},
    {url: base + '/ricerca', method: 'post', payload: form}
  ];
  requests.forEach(function(request) {
    const began = Date.now();
    try {
      const options = {
        method: request.method, followRedirects: false,
        validateHttpsCertificates: true, muteHttpExceptions: true,
        timeoutSeconds: 15, headers: {Accept: 'text/html'}
      };
      if (request.payload) options.payload = request.payload;
      const response = UrlFetchApp.fetch(request.url, options);
      const html = response.getContentText();
      const code = response.getResponseCode();
      const valid = code === 200 && /<table[\s>]/i.test(html) && /Provincia/i.test(html) && /Categoria/i.test(html);
      console.log(JSON.stringify({
        kind: request.method === 'post' ? 'history' : 'upcoming',
        code: code, validTable: valid, bytes: html.length,
        rows: (html.match(/<tr[\s>]/gi) || []).length, elapsedMs: Date.now() - began
      }));
    } catch (error) {
      console.log(JSON.stringify({
        kind: request.method === 'post' ? 'history' : 'upcoming', result: 'FAILED',
        error: String(error.message).slice(0, 250), elapsedMs: Date.now() - began
      }));
    }
  });
}
