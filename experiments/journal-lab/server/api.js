import { parseJournal } from './engine.js';

export function createClient(apiKey, { fetchImpl = fetch, timeout = 45000 } = {}) {
  return async (payload) => {
    let response;
    try {
      response = await fetchImpl('https://api.typesafe.ai/v1/systemone', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(timeout),
      });
    } catch {
      throw new Error(
        'Could not reach TypeSafe (network error or timeout). Your source text is preserved.',
      );
    }
    if (!response.ok) {
      const reason =
        {
          401: 'Invalid TypeSafe key.',
          403: 'TypeSafe denied access.',
          429: 'TypeSafe rate limit reached. Try again shortly.',
          422: 'TypeSafe rejected the question format.',
          529: 'TypeSafe is temporarily overloaded.',
        }[response.status] ?? `TypeSafe request failed (HTTP ${response.status}).`;
      throw new Error(reason);
    }
    try {
      return await response.json();
    } catch {
      throw new Error('TypeSafe returned an unreadable response.');
    }
  };
}

async function readBody(req) {
  req.setEncoding('utf8');
  let body = '';
  for await (const chunk of req) {
    body += chunk;
    if (Buffer.byteLength(body) > 600000) throw new Error('Submission is too large.');
  }
  try {
    return JSON.parse(body);
  } catch {
    throw new Error('Invalid JSON request.');
  }
}

export function journalApi(env = {}) {
  let sessionKey = '';
  const model = env.TYPESAFE_MODEL || 'jev-latest';
  const key = () => sessionKey || env.TYPESAFE_API_KEY || env.TYPESAFE_KEY || '';
  return async (req, res, next) => {
    if (!req.url?.startsWith('/api/')) return next();
    const json = (status, body) => {
      res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify(body));
    };
    // Local-only server: reject cross-origin browser mutations and DNS rebinding.
    if (!/^127\.0\.0\.1:\d+$|^localhost:\d+$/.test(req.headers.host ?? ''))
      return json(403, { error: 'Local access only.' });
    if (req.headers.origin && req.headers.origin !== `http://${req.headers.host}`)
      return json(403, { error: 'Same-origin requests only.' });
    try {
      if (req.url === '/api/status' && req.method === 'GET')
        return json(200, {
          configured: Boolean(key()),
          model,
          key_source: sessionKey ? 'session' : key() ? 'environment' : null,
        });
      if (req.headers['content-type'] !== 'application/json')
        return json(415, { error: 'Send application/json.' });
      if (req.url === '/api/connection' && req.method === 'PUT') {
        const body = await readBody(req);
        if (typeof body.apiKey !== 'string' || !body.apiKey.trim() || body.apiKey.length > 1000)
          throw new Error('Enter a TypeSafe API key.');
        const nextKey = body.apiKey.trim();
        await createClient(nextKey)({
          model,
          state: 'Connection check.',
          questions: { ready: { type: 'noul', instructions: 'Is this a connection check?' } },
        });
        sessionKey = nextKey;
        return json(200, { configured: true, model, key_source: 'session' });
      }
      if (req.url === '/api/connection' && req.method === 'DELETE') {
        sessionKey = '';
        return json(200, {
          configured: Boolean(key()),
          model,
          key_source: key() ? 'environment' : null,
        });
      }
      if (req.url === '/api/parse' && req.method === 'POST') {
        const input = await readBody(req);
        const result = await parseJournal(input, {
          model,
          ask: key() ? createClient(key()) : null,
        });
        return json(200, result);
      }
      return json(404, { error: 'Unknown local endpoint.' });
    } catch (error) {
      return json(400, { error: error.message || 'Unable to process the request.' });
    }
  };
}
