import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import demoWorker, {createWorker} from '../dist/server/index.js';
const worker = createWorker({authorize: async () => true});
import {assets,initialSnapshot} from '../dist/server/assets.js';
const base='https://dashboard.example.invalid';
function environment(){const db=new DatabaseSync(':memory:');for(const file of fs.readdirSync('drizzle').filter(x=>x.endsWith('.sql')))db.exec(fs.readFileSync('drizzle/'+file,'utf8'));return{DASHBOARD_MODE:'private',DASHBOARD_ORIGIN:base,DB:{prepare(sql){let values=[];return{bind(...args){values=args;return this;},async first(){return db.prepare(sql).get(...values)||null;}}}}};}
function request(body,headers={}){return new Request(base+'/api/snapshot',{method:'PUT',headers:{'content-type':'application/json','x-dashboard-update':'1',...headers},body:JSON.stringify(body)});}
test('private page assets and read-only API error handling',async()=>{const env=environment();assert.equal((await worker.fetch(new Request(base),env)).status,200);const r=await worker.fetch(new Request(base+'/api/snapshot'),env);const body=await r.json();assert.equal(body.revision,0);assert.equal(body.storage,'initial');assert.deepEqual(body.snapshot,initialSnapshot);assert.match(r.headers.get('cache-control'),/no-store/);assert.equal((await worker.fetch(new Request(base+'/api/snapshot'),{DASHBOARD_MODE:'private',DASHBOARD_ORIGIN:base})).status,503);});
test('valid write/readback, idempotence, CAS conflict and stale observation rejection',async()=>{const env=environment();let r=await worker.fetch(request({snapshot:initialSnapshot,expectedRevision:0}),env);assert.equal(r.status,200);assert.equal((await r.json()).revision,1);r=await worker.fetch(new Request(base+'/api/snapshot'),env);const current=await r.json();assert.equal(current.storage,'database');assert.deepEqual(current.snapshot,initialSnapshot);r=await worker.fetch(request({snapshot:initialSnapshot,expectedRevision:1}),env);assert.equal((await r.json()).revision,1);assert.equal((await worker.fetch(request({snapshot:initialSnapshot,expectedRevision:0}),env)).status,409);const older=structuredClone(initialSnapshot);older.updatedAt='1999-12-31T00:00:00Z';assert.equal((await worker.fetch(request({snapshot:older,expectedRevision:1}),env)).status,409);});
test('reject cross-site, invalid and oversized writes without changing saved data',async()=>{const env=environment();assert.equal((await worker.fetch(request({snapshot:initialSnapshot,expectedRevision:0},{origin:'https://example.com'}),env)).status,403);assert.equal((await worker.fetch(request({snapshot:initialSnapshot,expectedRevision:0},{'x-dashboard-update':'0'}),env)).status,403);assert.equal((await worker.fetch(request({snapshot:{},expectedRevision:0}),env)).status,400);assert.equal((await worker.fetch(request({snapshot:initialSnapshot,expectedRevision:0},{'content-type':'text/plain'}),env)).status,415);assert.equal((await worker.fetch(new Request(base+'/api/snapshot',{method:'PUT',headers:{'content-type':'application/json','x-dashboard-update':'1'},body:'x'.repeat(65537)}),env)).status,413);assert.equal((await(await worker.fetch(new Request(base+'/api/snapshot'),env)).json()).revision,0);});
test('malformed nested records return a validation error instead of a storage failure',async()=>{
  const env=environment();assert.equal((await worker.fetch(request(null),env)).status,400);
  for(const key of ['slots','waiting','recent']){const snapshot=structuredClone(initialSnapshot);snapshot[key][0]=null;assert.equal((await worker.fetch(request({snapshot,expectedRevision:0}),env)).status,400);}
  const snapshot=structuredClone(initialSnapshot);snapshot.slots[0].latestResult={private:'invalid'};assert.equal((await worker.fetch(request({snapshot,expectedRevision:0}),env)).status,400);
  assert.equal((await(await worker.fetch(new Request(base+'/api/snapshot'),env)).json()).revision,0);
});
test('private image assets preserve binary data and distinct front/rear characters',async()=>{
  const env=environment();const characters=Array.from({length:7},(_,i)=>`/assets/dot-${i+1}.webp`);
  const backs=Array.from({length:7},(_,i)=>`/assets/dot-${i+1}-back.webp`);
  assert.equal(new Set(characters.map(name=>assets[name]?.body)).size,7);
  assert.equal(new Set(backs.map(name=>assets[name]?.body)).size,7);
  characters.forEach((name,index)=>assert.notEqual(assets[name]?.body,assets[backs[index]]?.body));
  for(const name of [...characters,...backs,'/assets/desk-overhead.webp','/assets/chair-front.webp','/assets/chair-back.webp','/assets/room.webp']){
    assert.equal(assets[name].encoding,'base64');const response=await worker.fetch(new Request(base+name),env);
    assert.equal(response.status,200);assert.equal(response.headers.get('content-type'),'image/webp');
    assert.deepEqual(Buffer.from(await response.arrayBuffer()),Buffer.from(assets[name].body,'base64'));
  }
});
test('3D runtime modules and license are served privately with unchanged API storage',async()=>{
  const env=environment();for(const file of ['office-model.js','office3d.js','dot-geometry.js','scene-loader.js','vendor/three.js']){const response=await worker.fetch(new Request(base+'/'+file),env);assert.equal(response.status,200);assert.match(response.headers.get('content-type'),/javascript/);assert.equal(await response.text(),fs.readFileSync('public/'+file,'utf8'));assert.match(response.headers.get('content-security-policy'),/script-src 'self'/);}
  const license=await worker.fetch(new Request(base+'/vendor/three-LICENSE.txt'),env);assert.equal(license.status,200);assert.match(await license.text(),/MIT License/);
});

test('optional task configuration survives database write/readback and same-revision retry',async()=>{
  const env=environment(),snapshot=structuredClone(initialSnapshot),config={model:'gpt-6-astra',reasoningEffort:'max',modelSource:'requested',reasoningEffortSource:'requested'};
  Object.assign(snapshot.slots[0],config);
  snapshot.waiting=[{title:'等待确认',description:'配置已准备',kind:'decision',observedAt:snapshot.updatedAt,...config}];
  snapshot.recent=[{title:'已完成任务',result:'完成交付',status:'completed',observedAt:snapshot.updatedAt,...config}];
  let response=await worker.fetch(request({snapshot,expectedRevision:0}),env);assert.equal(response.status,200);assert.equal((await response.json()).revision,1);
  const saved=await(await worker.fetch(new Request(base+'/api/snapshot'),env)).json();assert.deepEqual(saved.snapshot,snapshot);
  response=await worker.fetch(request({snapshot,expectedRevision:1}),env);assert.equal((await response.json()).unchanged,true);
  const newer=structuredClone(snapshot);newer.slots[0].modelSource='runtime';response=await worker.fetch(request({snapshot:newer,expectedRevision:1}),env);assert.equal(response.status,200);
  assert.equal((await worker.fetch(request({snapshot,expectedRevision:1}),env)).status,409);
});
test('legacy payloads and null unknowns stay valid; malformed model metadata cannot replace data',async()=>{
  const env=environment();assert.equal((await worker.fetch(request({snapshot:initialSnapshot,expectedRevision:0}),env)).status,200);
  const unknown=structuredClone(initialSnapshot);Object.assign(unknown.slots[0],{model:null,reasoningEffort:null,modelSource:'unknown',reasoningEffortSource:null});
  assert.equal((await worker.fetch(request({snapshot:unknown,expectedRevision:1}),env)).status,200);
  for(const invalid of [{model:123},{reasoningEffort:[]},{model:' '},{model:'x'.repeat(161)},{reasoningEffort:'x'.repeat(81)},{modelSource:'inherited'},{modelSource:'runtime'},{model:'unsafe\nlabel'}]){
    const snapshot=structuredClone(initialSnapshot);Object.assign(snapshot.slots[0],invalid);assert.equal((await worker.fetch(request({snapshot,expectedRevision:2}),env)).status,400);
  }
  const after=await(await worker.fetch(new Request(base+'/api/snapshot'),env)).json();assert.deepEqual(after.snapshot,unknown);assert.equal(after.revision,2);
});
test('private Worker serves the execution UI without configuration credentials or a changed API path',async()=>{
  const env=environment();for(const file of ['state.js','app.js','styles.css','index.html']){const response=await worker.fetch(new Request(base+'/'+file),env);assert.equal(response.status,200);assert.equal(await response.text(),fs.readFileSync('public/'+file,'utf8'));}
  assert.match(assets['/index.html'].body,/dialog-execution/);assert.match(assets['/app.js'].body,/modelSource|DashboardState.execution/);
  assert.doesNotMatch(assets['/app.js'].body+assets['/state.js'].body,/-----BEGIN.*PRIVATE KEY|authorization\s*:/i);
});
