import {readSnapshot, writeSnapshot} from './storage.js';
import {validSnapshot} from './validate.js';
import {denyAll} from './authorization.js';
import {assets, initialSnapshot} from './assets.js';
const MAX_BODY = 65536;
const json = (body,status=200,extra={}) => new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'private, no-store','x-content-type-options':'nosniff',...extra}});
async function boundedBody(request) {
  const length = request.headers.get('content-length');
  if (length != null && (!/^\d+$/.test(length) || Number(length) > MAX_BODY)) throw new RangeError('Payload too large');
  if (!request.body) return '';
  const reader = request.body.getReader();
  const chunks = []; let size = 0;
  try {
    for (;;) { const {value,done} = await reader.read(); if (done) break; size += value.byteLength; if (size > MAX_BODY) { await reader.cancel(); throw new RangeError('Payload too large'); } chunks.push(value); }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk,offset); offset += chunk.byteLength; }
  return new TextDecoder('utf-8',{fatal:true}).decode(bytes);
}
function privateOrigin(env) {
  try { const url = new URL(env.DASHBOARD_ORIGIN); return url.protocol === 'https:' && url.origin === env.DASHBOARD_ORIGIN ? url.origin : null; } catch { return null; }
}
// `authorize` is a trusted server function, never request data or an environment string.
// It must resolve exactly true only for a verified principal with the requested scope.
export function createWorker({authorize = denyAll} = {}) {
  if (typeof authorize !== 'function') throw new TypeError('A server-side authorization function is required');
  return {
    async fetch(request,env={}) {
      const url = new URL(request.url);
      const mode = env.DASHBOARD_MODE ?? 'demo';
      if (!['demo','private'].includes(mode)) return json({error:'Invalid deployment mode'},503);
      if (mode === 'private') {
        const origin = privateOrigin(env);
        if (!origin || origin !== url.origin) return json({error:'Private deployment is not configured'},503);
        try { if (await authorize(request,env,'read') !== true) return json({error:'Authentication required'},401); }
        catch { return json({error:'Authentication unavailable'},503); }
      }
      if (url.pathname === '/api/snapshot') {
        if (mode === 'demo') {
          if (!['GET','HEAD'].includes(request.method)) return json({error:'Demo snapshots are read-only'},405,{allow:'GET, HEAD'});
          const response = json({snapshot:initialSnapshot,revision:0,savedAt:null,storage:'demo'});
          return request.method === 'HEAD' ? new Response(null,response) : response;
        }
        try {
          if (['GET','HEAD'].includes(request.method)) {
            const data = await readSnapshot(env) || {snapshot:initialSnapshot,revision:0,savedAt:null,storage:'initial'};
            const response = json(data); return request.method === 'HEAD' ? new Response(null,response) : response;
          }
          if (request.method !== 'PUT') return json({error:'Method not allowed'},405,{allow:'GET, HEAD, PUT'});
          try { if (await authorize(request,env,'write') !== true) return json({error:'Write permission required'},403); }
          catch { return json({error:'Authentication unavailable'},503); }
          const origin = request.headers.get('origin');
          if ((origin && origin !== privateOrigin(env)) || request.headers.get('sec-fetch-site') === 'cross-site') return json({error:'Origin not allowed'},403);
          if (request.headers.get('x-dashboard-update') !== '1') return json({error:'Update header required'},403);
          if (!/^application\/json(?:;|$)/i.test(request.headers.get('content-type') || '')) return json({error:'JSON required'},415);
          let raw;
          try { raw = await boundedBody(request); }
          catch (error) { return json({error:error instanceof RangeError ? 'Snapshot too large' : 'Invalid request body'},error instanceof RangeError ? 413 : 400); }
          let body; try { body = JSON.parse(raw); } catch { return json({error:'Invalid JSON'},400); }
          if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(key => !['expectedRevision','snapshot'].includes(key)) || !Number.isSafeInteger(body.expectedRevision) || body.expectedRevision < 0 || !validSnapshot(body.snapshot)) return json({error:'Invalid snapshot or revision'},400);
          const result = await writeSnapshot(env,body.snapshot,body.expectedRevision);
          if (result.conflict) return json({error:'Snapshot changed; read and reconcile before retrying'},409);
          if (result.stale) return json({error:'An older observation cannot replace a newer snapshot'},409);
          return json(result);
        } catch { return json({error:'Storage unavailable; read the latest snapshot before retrying'},503); }
      }
      if (!['GET','HEAD'].includes(request.method)) return new Response('Method not allowed',{status:405,headers:{allow:'GET, HEAD'}});
      const asset = assets[url.pathname === '/' ? '/index.html' : url.pathname];
      if (!asset) return new Response('Not found',{status:404});
      const body = asset.encoding === 'base64' ? Uint8Array.from(atob(asset.body),char => char.charCodeAt(0)) : asset.body;
      return new Response(request.method === 'HEAD' ? null : body,{headers:{'content-type':asset.type,'cache-control':'private, no-cache','x-content-type-options':'nosniff','referrer-policy':'no-referrer','content-security-policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; object-src 'none'"}});
    }
  };
}
export default createWorker();
