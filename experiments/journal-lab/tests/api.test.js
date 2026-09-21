import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer, request as httpRequest } from 'node:http';
import { journalApi } from '../server/api.js';

test('local server exposes credential status without the credential', async (t) => {
  const api = journalApi({ TYPESAFE_KEY: 'server-secret-fixture' });
  const server = createServer((req, res) =>
    api(req, res, () => {
      res.writeHead(404);
      res.end();
    }),
  );
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/status`);
  assert.deepEqual(await response.json(), {
    configured: true,
    model: 'jev-latest',
    key_source: 'environment',
  });
});

test('local API integrates raw capture, correction reuse, and useful validation errors', async (t) => {
  const api = journalApi();
  const server = createServer((req, res) =>
    api(req, res, () => {
      res.writeHead(404);
      res.end();
    }),
  );
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const url = `http://127.0.0.1:${server.address().port}/api/parse`;
  const input = { text: '07:00 Coffee', date: '2026-09-20', offsetMinutes: 420, examples: [] };
  const post = (body) =>
    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  const raw = await (await post(input)).json();
  assert.equal(raw.records[0].content, 'Coffee');
  assert.deepEqual(raw.records[0].data, {});
  const reused = await (
    await post({
      ...input,
      examples: [{ id: 'coffee', content: 'Coffee', data: { beverage: 'coffee' } }],
    })
  ).json();
  assert.deepEqual(reused.records[0].data, { beverage: 'coffee' });
  const bad = await post({ ...input, text: '25:00 Coffee' });
  assert.equal(bad.status, 400);
  assert.match((await bad.json()).error, /Invalid time/);
});

test('API rejects cross-origin and unexpected-host requests before reading mutations', async (t) => {
  const api = journalApi();
  const server = createServer((req, res) =>
    api(req, res, () => {
      res.writeHead(404);
      res.end();
    }),
  );
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const url = `http://127.0.0.1:${server.address().port}/api/connection`;
  for (const headers of [{ Origin: 'https://example.com' }, { Host: 'evil.example:5191' }]) {
    // Fetch normalizes the Host header; use HTTP directly to exercise rebinding.
    const status = await new Promise((resolve, reject) => {
      const req = httpRequest(
        url,
        {
          method: 'PUT',
          headers: { ...headers, 'Content-Type': 'application/json' },
        },
        (response) => {
          response.resume();
          response.on('end', () => resolve(response.statusCode));
        },
      );
      req.on('error', reject);
      req.end('{"apiKey":"fixture"}');
    });
    assert.equal(status, 403);
  }
});
