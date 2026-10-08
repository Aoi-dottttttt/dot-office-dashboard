import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {buildOffice,MODELS,setStationModel,setWorking,updateOffice,disposeOffice} from '../public/office-model.js';
const source=fs.readFileSync('public/seat-settings.js','utf8');
function settings({raw=null,fail=false}={}){let saved=raw,listener;const context=vm.createContext({localStorage:{getItem:()=>saved,setItem:(key,value)=>{if(fail)throw Error('blocked');saved=value;}},addEventListener:(key,fn)=>{listener=fn;}});vm.runInContext(source,context);return{api:context.SeatSettings,stored:()=>saved,event:()=>listener({key:context.SeatSettings.key}),replace:value=>{saved=value;}};}
test('custom names and allowlisted models persist separately for each of seven seats',()=>{
  const r=settings();let changes=0;const unsubscribe=r.api.subscribe(()=>changes++);
  const result=r.api.save(2,{name:'  设计工作台  ',modelId:'rose-heart'});assert.equal(result.persisted,true);assert.equal(r.api.get(2).name,'设计工作台');assert.equal(r.api.get(1).modelId,'cloud-headset');assert.equal(changes,1);
  const reloaded=settings({raw:r.stored()});assert.equal(reloaded.api.get(2).name,'设计工作台');assert.equal(reloaded.api.get(2).modelId,'rose-heart');r.api.reset(2);assert.equal(r.api.get(2).name,'');assert.equal(r.api.get(2).modelId,'yellow-alfred');unsubscribe();
});
test('hostile and malformed local preferences cannot introduce models, HTML, long names or extra fields',()=>{
  const r=settings();for(const modelId of ['https://example.invalid/mesh.glb','__proto__','constructor','missing'])assert.throws(()=>r.api.save(1,{name:'name',modelId}));for(const n of [0,8,1.2,'1'])assert.throws(()=>r.api.get(n));
  r.api.save(1,{name:'<img src=x onerror=alert(1)>'.repeat(10)+'\u202e',modelId:'cloud-headset'});assert.equal(Array.from(r.api.get(1).name).length,24);assert.doesNotMatch(r.api.get(1).name,/\u202e/);const data=JSON.parse(r.stored());assert.deepEqual(Object.keys(data.seats[0]).sort(),['modelId','name','number']);
  for(const raw of ['not JSON',JSON.stringify({version:1,seats:[{number:1,name:'x',modelId:'bad'}]}),JSON.stringify({version:1,seats:[{number:1,name:'x',modelId:'rose-heart'},{number:1,name:'y',modelId:'rose-heart'}]})])assert.equal(settings({raw}).api.get(1).modelId,'cloud-headset');
});
test('storage failure is reported honestly and cross-tab changes refresh local preferences',()=>{
  const blocked=settings({fail:true});assert.equal(blocked.api.save(1,{name:'Temporary',modelId:'lilac-star'}).persisted,false);assert.equal(blocked.api.get(1).name,'Temporary');
  const r=settings();const changed=settings();changed.api.save(3,{name:'Shared tab',modelId:'rose-heart'});r.replace(changed.stored());r.event();assert.equal(r.api.get(3).name,'Shared tab');
});
test('all seven seats can select any built-in model with bounded geometry and stable other workstations',()=>{
  const office=buildOffice(),stationIds=[...office.stations.values()].map(s=>s.group.uuid);const geometryIds=new Set(),materialIds=new Set();for(const template of office.modelTemplates.values())template.group.traverse(o=>{if(o.isMesh){geometryIds.add(o.geometry.uuid);materialIds.add(o.material.uuid);}});
  for(let repeat=0;repeat<3;repeat++)for(const model of MODELS)for(const station of office.stations.values()){setWorking(station,true,{instant:true});setStationModel(office,station.number,model.id);updateOffice(office,0,0,false);assert.equal(station.modelId,model.id);assert.equal(station.dot.hands.length,2);assert.equal(station.working,true);assert.equal(station.swivel.rotation.y,Math.PI);station.dot.group.traverse(o=>{assert.doesNotMatch(o.name,/(?:foot|feet|leg)/i);assert.equal(o.userData.seatNumber,station.number);if(o.isMesh){assert.ok(geometryIds.has(o.geometry.uuid));assert.ok(materialIds.has(o.material.uuid));}});}
  assert.deepEqual([...office.stations.values()].map(s=>s.group.uuid),stationIds);assert.equal(office.modelTemplates.size,7);assert.throws(()=>setStationModel(office,1,'remote-model'));const materials=new Map();for(const template of office.modelTemplates.values())template.group.traverse(o=>{if(o.isMesh)materials.set(o.material,0);});for(const material of materials.keys())material.addEventListener('dispose',()=>materials.set(material,materials.get(material)+1));disposeOffice(office);assert.ok([...materials.values()].every(count=>count===1));
});
