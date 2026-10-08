import {test} from 'node:test';
import assert from 'node:assert/strict';
import demoWorker, {createWorker} from '../dist/server/index.js';
import {initialSnapshot} from '../dist/server/assets.js';
import {validSnapshot} from '../worker/validate.js';
const origin = 'https://dashboard.example.invalid';
const env = {DASHBOARD_MODE:'private',DASHBOARD_ORIGIN:origin};
const url = origin+'/api/snapshot';
const put = (body,headers={}) => new Request(url,{method:'PUT',headers:{'content-type':'application/json','x-dashboard-update':'1',...headers},body:typeof body === 'string' ? body : JSON.stringify(body)});
const good = () => ({expectedRevision:0,snapshot:structuredClone(initialSnapshot)});
const explodingDB = {prepare(){throw Error('Database must not be touched');}};
test('default demo ignores any database and rejects every mutation',async () => {
  const response = await demoWorker.fetch(new Request(url),{DB:explodingDB});
  assert.equal(response.status,200);assert.deepEqual((await response.json()).snapshot,initialSnapshot);
  for (const method of ['PUT','POST','PATCH','DELETE']) assert.equal((await demoWorker.fetch(new Request(url,{method}),{DB:explodingDB})).status,405);
  assert.equal((await demoWorker.fetch(new Request(url,{method:'HEAD'}),{})).status,200);
});
test('private mode defaults to deny and never trusts update headers as identity',async () => {
  for (const path of ['/','/app.js','/api/snapshot']) assert.equal((await demoWorker.fetch(new Request(origin+path),{...env,DB:explodingDB})).status,401);
  assert.equal((await demoWorker.fetch(put(good()),{...env,DB:explodingDB})).status,401);
  const truthy = createWorker({authorize:async()=>({authorized:true})});assert.equal((await truthy.fetch(new Request(url),env)).status,401);
  const broken = createWorker({authorize:async()=>{throw Error('unavailable');}});assert.equal((await broken.fetch(new Request(url),env)).status,503);
  for (const config of [{DASHBOARD_MODE:'other'},{DASHBOARD_MODE:'private'},{...env,DASHBOARD_ORIGIN:'https://other.example.invalid'}]) assert.equal((await demoWorker.fetch(new Request(url),config)).status,503);
});
test('read authorization never grants write authorization',async () => {
  const scopes=[];const worker=createWorker({authorize:async(_request,_env,scope)=>{scopes.push(scope);return scope==='read';}});
  assert.equal((await worker.fetch(put(good()),{...env,DB:explodingDB})).status,403);assert.deepEqual(scopes,['read','write']);
});
test('authorized writes are bounded before parsing even without content-length',async () => {
  const worker=createWorker({authorize:async()=>true});
  assert.equal((await worker.fetch(put('x'.repeat(65537)),{...env,DB:explodingDB})).status,413);
  assert.equal((await worker.fetch(put(good(),{'content-length':'999999'}),{...env,DB:explodingDB})).status,413);
  assert.equal((await worker.fetch(put(good(),{origin:'https://attacker.example.invalid'}),{...env,DB:explodingDB})).status,403);
  assert.equal((await worker.fetch(put(good(),{'sec-fetch-site':'cross-site'}),{...env,DB:explodingDB})).status,403);
  assert.equal((await worker.fetch(put({...good(),unexpected:'not permitted'}),{...env,DB:explodingDB})).status,400);
});
test('strict schema rejects unknown fields, invalid nested types, invalid dates and overlong text',() => {
  assert.equal(validSnapshot(initialSnapshot),true);
  for (const mutate of [d=>d.extra='unexpected',d=>d.slots[0].extra='unexpected',d=>d.waiting[0].extra='unexpected',d=>d.recent[0].extra='unexpected',d=>d.maintenance.extra='unexpected',d=>d.slots[0].featured={},d=>d.slots[3].observedAt='not a date',d=>d.slots[0].goal='x'.repeat(3001),d=>d.slots[0].category='x'.repeat(121),d=>d.updatedAt='yesterday',d=>d.maintenance.intervalMinutes=10081]) {
    const data=structuredClone(initialSnapshot);mutate(data);assert.equal(validSnapshot(data),false);
  }
});
