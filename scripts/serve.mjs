import http from 'node:http';
import worker from '../dist/server/index.js';
const port = Number(process.env.PORT || 4173);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid PORT');
const server = http.createServer(async (request,response) => {
  try {
    // Only read-only routes are served. Never consume a submitted request body.
    const url = new URL(request.url,`http://127.0.0.1:${port}`);
    const result = await worker.fetch(new Request(url,{method:request.method,headers:request.headers}),{});
    response.writeHead(result.status,Object.fromEntries(result.headers));
    response.end(Buffer.from(await result.arrayBuffer()));
  } catch { response.writeHead(500,{'content-type':'text/plain'}); response.end('Local preview error'); }
});
server.listen(port,'127.0.0.1',() => console.log(`Fictional read-only demo: http://127.0.0.1:${port}`));
for (const signal of ['SIGINT','SIGTERM']) process.on(signal,() => server.close());
