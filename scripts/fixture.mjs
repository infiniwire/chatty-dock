import http from 'node:http';

export async function startFixture() {
  let requestCount = 0;
  const server = http.createServer(async (request, response) => {
    requestCount += 1;
    const url = new URL(request.url, 'http://localhost');
    if (url.pathname.startsWith('/surface-fixture')) {
      const cookie = request.headers.cookie ?? '';
      const current =
        cookie.match(
          /(?:^|;\s*)codex_app_mode=(STEPS_PROSE|STEPS_COMMANDS|STEPS_EXECUTION)(?:;|$)/,
        )?.[1] ?? 'STEPS_PROSE';
      response.writeHead(200, { 'content-type': 'text/html' });
      response.end(`<!doctype html><html><head><title>Surface fixture</title></head><body>
        <h1>Per-window surface fixture</h1><output id="server-mode">${current}</output><output id="server-auth">${cookie.includes('dock-private-auth=fixture-secret')}</output>
        <button id="choose-chat">Chat</button><button id="choose-codex">Codex</button>
        <script>
          const channel = new BroadcastChannel('codex:preference-cookies');
          function currentMode(){return document.cookie.match(/(?:^|;\\s*)codex_app_mode=(STEPS_PROSE|STEPS_COMMANDS|STEPS_EXECUTION)(?:;|$)/)?.[1] || 'STEPS_PROSE';}
          function refresh(){const path=currentMode()==='STEPS_PROSE'?'/surface-fixture-chat':'/surface-fixture-codex';if(location.pathname!==path)location.replace(path);}
          channel.onmessage=event=>{if(event.data==='codex_app_mode')refresh();};
          window.addEventListener('focus',refresh);
          function select(mode){document.cookie='codex_app_mode='+mode+'; Path=/; SameSite=Lax';channel.postMessage('codex_app_mode');refresh();}
          document.querySelector('#choose-chat').onclick=()=>select('STEPS_PROSE');
          document.querySelector('#choose-codex').onclick=()=>select('STEPS_EXECUTION');
          window.surfaceFixture={select,currentMode};
        </script></body></html>`);
      return;
    }
    if (url.pathname === '/external-redirect') {
      response.writeHead(302, { Location: 'https://x.com/dock-redirect' });
      response.end();
      return;
    }
    if (url.pathname === '/download' || url.pathname === '/slow' || url.pathname === '/broken') {
      if (!request.headers.cookie?.includes('dock-auth=valid')) {
        response.writeHead(403);
        response.end('Session required');
        return;
      }
      const size = url.pathname === '/download' ? 4096 : 4 * 1024 * 1024;
      response.writeHead(200, {
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': 'attachment; filename="fixture.txt"',
        'Content-Length': size,
        'Accept-Ranges': 'bytes',
      });
      if (url.pathname === '/download') {
        response.end(Buffer.alloc(size, 65));
        return;
      }
      let sent = 0;
      const interval = setInterval(() => {
        if (url.pathname === '/broken' && sent > 32768) {
          response.destroy();
          clearInterval(interval);
          return;
        }
        const chunk = Buffer.alloc(Math.min(16384, size - sent), 65);
        sent += chunk.length;
        response.write(chunk);
        if (sent >= size) {
          clearInterval(interval);
          response.end();
        }
      }, 30);
      response.once('close', () => clearInterval(interval));
      return;
    }
    if (url.pathname === '/upload' && request.method === 'POST') {
      let bytes = 0;
      for await (const chunk of request) bytes += chunk.length;
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ bytes }));
      return;
    }
    const long = url.pathname === '/long';
    response.writeHead(200, { 'Content-Type': 'text/html' });
    response.end(`<!doctype html><html><head><title>Dock test fixture</title><style>body{font:16px system-ui;max-width:850px;margin:40px auto;background:#f5f6f3;color:#234}article{padding:20px;background:white;margin:12px 0;border-radius:12px}pre{white-space:pre-wrap;background:#142d25;color:#b4e7cf;padding:16px}textarea{width:95%;height:80px}#composer{position:fixed;bottom:0;background:#eff3ef;padding:10px;width:800px}#space{height:160px}img{width:240px;height:80px}</style></head><body><h1>Conversation fixture</h1><p>Deterministic local content, not ChatGPT.</p><input id="files" type="file" multiple><div id="drop" contenteditable="true" style="padding:20px;border:1px dashed">Drop or paste files here</div><output id="upload-result"></output><a href="/download" download>Download fixture</a><a href="/slow" download>Slow download</a><a href="/broken" download>Broken download</a><a href="/second">Navigate</a><div id="messages">${Array.from({ length: long ? 500 : 3 }, (_, i) => `<article><h2>Message ${i + 1}</h2><p>${'A controlled conversation message with selectable text and realistic wrapping. '.repeat(8)}</p><pre>${'const result = await conversation.next();\n'.repeat(12)}</pre><table><tr><th>Metric</th><th>Value</th></tr><tr><td>Message index</td><td>${i}</td></tr></table><img alt="Controlled image" src="data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="240" height="80"><rect width="240" height="80" fill="#d1eade"/></svg>')}"></article>`).join('')}</div><div id="space"></div><div id="composer"><textarea id="input" aria-label="Message"></textarea><div id="stream">Streaming fixture</div></div><script>
    async function upload(files){let total=0;for(const file of files){const result=await fetch('/upload',{method:'POST',body:file});total+=(await result.json()).bytes;}document.querySelector('#upload-result').textContent=String(total);}
    document.querySelector('#files').onchange=e=>upload(e.target.files);
    document.querySelector('#drop').ondragover=e=>e.preventDefault();
    document.querySelector('#drop').ondrop=e=>{e.preventDefault();upload(e.dataTransfer.files);};
    document.querySelector('#drop').onpaste=e=>{if(e.clipboardData.files.length){e.preventDefault();upload(e.clipboardData.files);}};
    ${long ? 'setInterval(()=>{document.querySelector("#stream").textContent="Streaming fixture "+Date.now();},80);' : ''}
    </script></body></html>`);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return {
    get requestCount() {
      return requestCount;
    },
    origin: `http://127.0.0.1:${server.address().port}`,
    close: () =>
      new Promise((resolve) => {
        server.closeAllConnections();
        server.close(resolve);
      }),
  };
}
