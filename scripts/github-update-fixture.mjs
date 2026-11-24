import http from 'node:http';
import { createHash } from 'node:crypto';

export async function startGitHubUpdateFixture(version, filename, payload) {
  const sha512 = createHash('sha512').update(payload).digest('base64');
  const metadata = JSON.stringify({
    version,
    files: [{ url: filename, sha512, size: payload.length }],
    path: filename,
    sha512,
    releaseDate: new Date().toISOString(),
  });
  const requests = { feed: 0, latest: 0, metadata: 0, payload: 0, authenticated: 0 };
  const server = http.createServer((request, response) => {
    const name = new URL(request.url, 'http://localhost').pathname;
    if (request.headers.authorization) requests.authenticated++;
    const base = '/infiniwire/chatty-dock/releases';
    const release = `${base}/download/v${version}`;
    if (name === `${base}.atom`) {
      requests.feed++;
      response.writeHead(200, { 'Content-Type': 'application/atom+xml' });
      response.end(
        `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"><entry><title>Test ${version}</title><link href="https://github.com/infiniwire/chatty-dock/releases/tag/v${version}"/><content>Test release</content></entry></feed>`,
      );
    } else if (name === '/api/v3/repos/infiniwire/chatty-dock/releases/latest') {
      requests.latest++;
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ tag_name: `v${version}` }));
    } else if (name === `${release}/latest.yml`) {
      requests.metadata++;
      response.writeHead(200, { 'Content-Type': 'application/yaml' });
      response.end(metadata);
    } else if (name === `${release}/${filename}`) {
      requests.payload++;
      response.writeHead(200, {
        'Content-Type': 'application/octet-stream',
        'Content-Length': payload.length,
      });
      response.end(payload);
    } else {
      response.writeHead(404);
      response.end();
    }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return {
    origin: `http://127.0.0.1:${server.address().port}`,
    requests,
    close: () =>
      new Promise((resolve) => {
        server.closeAllConnections();
        server.close(resolve);
      }),
  };
}
