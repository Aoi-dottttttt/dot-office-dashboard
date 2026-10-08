import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as T from '../public/vendor/three.js';
import {buildOffice,SEATS,ROOM,VIEW,CHAIR,cameraLimits,setCamera,setWorking,stepStation,updateOffice,setTheme,projectAnchors,disposeOffice} from '../public/office-model.js';
import {initOffice} from '../public/office3d.js';
import '../public/state.js';

function walkMeshes(root){const result=[];root.traverse(object=>{if(object.isMesh)result.push(object);});return result;}
test('the room, furniture, and all seven distinct dots are volumetric meshes',()=>{
  const o=buildOffice();assert.equal(o.stations.size,7);assert.equal(new Set(SEATS.map(s=>s.color)).size,7);assert.equal(new Set(SEATS.map(s=>s.shape+':'+s.accessory)).size,7);
  for(const name of ['foundation','floor','back-wall','left-wall']){const mesh=o.room.getObjectByName(name);assert.equal(mesh.isMesh,true);mesh.geometry.computeBoundingBox();const size=mesh.geometry.boundingBox.getSize(new T.Vector3());assert.ok(size.x>0&&size.y>0&&size.z>0);}
  for(const s of o.stations.values()){
    for(const name of ['desktop','desk-leg','monitor-frame','chair-seat','chair-back','caster'])assert.equal(s.group.getObjectByName(name).isMesh,true);
    assert.ok(walkMeshes(s.dot.body).length>0);const bodyBox=new T.Box3().setFromObject(s.dot.body);assert.ok(bodyBox.getSize(new T.Vector3()).z>.5);
    assert.equal(s.dot.group.userData.shape,SEATS[s.number-1].shape);assert.equal(s.dot.face.name,'front-face');
    for(const m of walkMeshes(s.group)){assert.equal(m.material.depthTest,true);assert.equal(m.material.depthWrite,true);assert.equal(m.material.transparent,false);assert.equal(m.renderOrder,0);}
  }
  let sprites=0;o.scene.traverse(x=>{if(x.isSprite)sprites++;});assert.equal(sprites,0);
  const meshes=walkMeshes(o.scene);assert.ok(meshes.length<500);assert.ok(meshes.reduce((n,m)=>n+(m.geometry.index?.count??m.geometry.attributes.position.count)/3,0)<250000);
  disposeOffice(o);
});
test('work rotates the real chair/body, lights the screen, and puts hands on the keyboard side',()=>{
  const o=buildOffice();for(const s of o.stations.values()){
    setWorking(s,true,{instant:true});stepStation(s,0,0,false);o.scene.updateMatrixWorld(true);
    assert.equal(s.swivel.rotation.y,Math.PI);assert.equal(s.screenMaterial.emissiveIntensity,.65);assert.equal(s.screenUi.visible,true);
    const bodyCenter=s.dot.group.getWorldPosition(new T.Vector3());
    for(const hand of s.dot.hands){const p=hand.getWorldPosition(new T.Vector3());assert.ok(p.z<bodyCenter.z,'Hands belong on the monitor side of the back');const ray=new T.Raycaster(new T.Vector3(p.x,p.y,p.z+10),new T.Vector3(0,0,-1));const first=ray.intersectObjects([s.dot.body,hand],true)[0];assert.notEqual(first.object,hand,'Opaque body must hide a hand from directly behind');}
    setWorking(s,false,{instant:true,idleYaw:.4});stepStation(s,0,0,false,.4);assert.equal(s.swivel.rotation.y,.4);assert.equal(s.screenMaterial.emissiveIntensity,0);assert.equal(s.screenUi.visible,false);
  }disposeOffice(o);
});
test('working screen and pose survive reduced motion while mesh loops stop',()=>{
  const o=buildOffice();const s=o.stations.get(1);setWorking(s,true,{instant:true});stepStation(s,1,.033,true);const movingY=s.dot.group.position.y;stepStation(s,2,.033,true);assert.notEqual(s.dot.group.position.y,movingY);
  stepStation(s,2,0,false);assert.equal(s.dot.group.position.y,1.84);assert.equal(s.dot.group.rotation.z,0);assert.equal(s.screenMaterial.emissiveIntensity,.65);assert.equal(s.swivel.rotation.y,Math.PI);assert.equal(stepStation(s,3,.03,false),false);
  setWorking(s,false);assert.equal(stepStation(s,3,.03,true),true);for(let i=0;i<50;i++)stepStation(s,i*.04,.04,true);assert.ok(Math.abs(s.swivel.rotation.y-VIEW.yaw)<.003);disposeOffice(o);
});
test('camera fits the reflowed room and keeps all seven left task panels visible at reset',()=>{
  const o=buildOffice();for(const [w,h] of [[282,1040],[390,1040],[650,1040],[802,800],[1000,800],[1200,860],[1440,860]]){
    setCamera(o,w,h);o.elevation=VIEW.elevation;o.zoom=1;setCamera(o,w,h);updateOffice(o,0,0,false);
    for(const x of [-o.roomSize.width/2,o.roomSize.width/2])for(const y of [-.4,2.85])for(const z of [-o.roomSize.depth/2,o.roomSize.depth/2]){const p=new T.Vector3(x,y,z).project(o.camera);assert.ok(Math.abs(p.x)<1&&Math.abs(p.y)<1,`${w}: room clipped`);}
    const panels=projectAnchors(o,w,h);assert.equal(panels.length,7);for(const panel of panels){assert.equal(panel.visible,true);assert.ok(panel.x+panel.width+11<panel.stationBounds.left);assert.ok(panel.y>=6&&panel.y+panel.height<h-6);}
  }disposeOffice(o);
});
test('theme changes keep geometry and work lights intact',()=>{const o=buildOffice();const s=o.stations.get(4);setWorking(s,true,{instant:true});const uuid=s.dot.group.uuid;setTheme(o,true);assert.equal(o.dark,true);assert.equal(o.palette.floor.color.getHex(),0x495568);assert.equal(s.screenMaterial.emissiveIntensity,.65);setTheme(o,false);assert.equal(s.dot.group.uuid,uuid);assert.equal(o.palette.floor.color.getHex(),0xe5e8ee);disposeOffice(o);});

class Element {
  constructor(){this.children=[];this.events=new Map();this.dataset={};this.style={};this.attributes={};this.hidden=false;this.classSet=new Set();this.classList={add:v=>this.classSet.add(v),remove:v=>this.classSet.delete(v),contains:v=>this.classSet.has(v),toggle:(v,on)=>on?this.classSet.add(v):this.classSet.delete(v)};}
  append(...els){this.children.push(...els);}replaceChildren(...els){this.children=els;}setAttribute(k,v){this.attributes[k]=v;}getAttribute(k){return this.attributes[k];}
  addEventListener(k,fn){if(!this.events.has(k))this.events.set(k,new Set());this.events.get(k).add(fn);}removeEventListener(k,fn){this.events.get(k)?.delete(fn);}emit(k,e={}){for(const fn of this.events.get(k)||[])fn(e);}
  getBoundingClientRect(){return{left:0,top:0,width:this.width||1000,height:this.height||650};}setPointerCapture(){}releasePointerCapture(){}
}
function runtime(t,{reduced=false,dark=false,running=true,rendererFails=false,paintFails=false,probe=null}={}){
  const names=['document','window','matchMedia','ResizeObserver'];const prior=names.map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]);
  t.after(()=>{for(const [key,descriptor] of prior){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];}});
  const nodes=new Map();const document=new Element();document.documentElement={dataset:{theme:'system',motion:'on'}};document.hidden=false;document.createElement=()=>new Element();document.getElementById=id=>{if(!nodes.has(id))nodes.set(id,new Element());return nodes.get(id);};
  const reducedQuery=Object.assign(new Element(),{matches:reduced});const darkQuery=Object.assign(new Element(),{matches:dark});const window=new Element();let observer;
  Object.assign(globalThis,{document,window,matchMedia:q=>q.includes('reduced')?reducedQuery:darkQuery,ResizeObserver:class{constructor(fn){this.fn=fn;observer=this;if(probe)probe.observer=this;}observe(){}disconnect(){this.disconnected=true;}}});
  let snapshot={slots:SEATS.map(s=>({number:s.number,status:running?'running':'available',observedAt:new Date(Date.now()-60000).toISOString(),title:`Task ${s.number}`}))};let transport=true;
  const bridge={getSnapshot:()=>snapshot,getTransportOk:()=>transport,openSeat:(...args)=>{opened=args;}};let opened=null;const raf=new Map();let id=0;let renders=0;let fallbackMessage=null;const renderer={shadowMap:{},setPixelRatio(){},setSize(w,h){this.size=[w,h];},render(){renders++;if(paintFails)throw Error('GPU render error');},dispose(){this.disposed=true;}};
  if(probe)Object.assign(probe,{renderer,observer});
  const api=initOffice({bridge,fallback:message=>{fallbackMessage=message;if(probe)probe.message=message;},rendererFactory:()=>{if(rendererFails)throw Error('No WebGL2');return renderer;},requestFrame:fn=>{raf.set(++id,fn);return id;},cancelFrame:key=>raf.delete(key)});
  t.after(()=>api.dispose());
  return{api,nodes,document,window,reducedQuery,darkQuery,renderer,raf,observer,renderCount:()=>renders,fallback:()=>fallbackMessage,opened:()=>opened,setSnapshot:v=>{snapshot=v;},snapshot:()=>snapshot,setTransport:v=>{transport=v;},frame(time=100){const pending=[...raf.values()];raf.clear();pending.forEach(fn=>fn(time));}};
}
test('3D controller hydrates cached data and preserves mesh identity through failures, stale data, and recovery',t=>{
  const r=runtime(t);const s=r.api.office.stations.get(1);const uuid=s.group.uuid;assert.equal(s.working,true);assert.equal(r.nodes.get('office-scene').classList.contains('is-3d'),true);assert.equal(r.nodes.get('office-pins').children.length,7);
  r.setTransport(false);r.api.sync();assert.equal(s.working,false);assert.equal(s.screenMaterial.emissiveIntensity,0);
  r.setTransport(true);r.api.sync();assert.equal(s.working,true);assert.equal(s.group.uuid,uuid);
  for(const observedAt of [null,'bad',new Date(Date.now()+60000).toISOString(),new Date(Date.now()-13*60000).toISOString()]){const next=structuredClone(r.snapshot());next.slots[0].observedAt=observedAt;r.setSnapshot(next);r.api.sync();assert.equal(s.working,false);assert.equal(s.screenUi.visible,false);}
  const next=structuredClone(r.snapshot());next.slots[0].observedAt=new Date().toISOString();r.setSnapshot(next);r.api.sync();assert.equal(s.working,true);
  r.nodes.get('office-pins').children[0].emit('click');assert.equal(r.opened()[0],1);
});
test('3D controller pauses all frames while hidden or motion-disabled and cleans up context loss',t=>{
  const r=runtime(t);assert.ok(r.raf.size>0);r.document.documentElement.dataset.motion='off';r.api.refreshPreferences();assert.equal(r.raf.size,0);assert.equal(r.api.office.stations.get(1).screenMaterial.emissiveIntensity,.65);
  r.document.documentElement.dataset.motion='on';r.api.refreshPreferences();assert.ok(r.raf.size>0);r.reducedQuery.matches=true;r.reducedQuery.emit('change');assert.equal(r.raf.size,0);
  r.reducedQuery.matches=false;r.reducedQuery.emit('change');r.document.hidden=true;r.document.emit('visibilitychange');assert.equal(r.raf.size,0);const n=r.renderCount();r.api.sync();assert.equal(r.renderCount(),n);
  r.document.hidden=false;r.document.emit('visibilitychange');assert.ok(r.renderCount()>n);r.darkQuery.matches=true;r.darkQuery.emit('change');assert.equal(r.api.office.dark,true);
  r.nodes.get('office-canvas').emit('webglcontextlost',{preventDefault(){}});assert.match(r.fallback(),/二维兼容视图/);assert.equal(r.raf.size,0);assert.equal(r.observer.disconnected,true);assert.equal(r.renderer.disposed,true);
});
test('idle scene settles after one frame and disposal removes event listeners',t=>{const r=runtime(t,{running:false});r.frame();assert.equal(r.raf.size,0);r.api.dispose();assert.equal(r.renderer.disposed,true);assert.equal(r.observer.disconnected,true);assert.equal(r.nodes.get('office-canvas').events.get('pointerdown').size,0);});
test('self-hosted imports and explicit fallback need no external CDN or GPU changes',()=>{
  const controller=fs.readFileSync('public/office3d.js','utf8'),loader=fs.readFileSync('public/scene-loader.js','utf8'),vendor=fs.readFileSync('public/vendor/three.js','utf8');
  assert.match(loader,/import\('\.\/office3d.js'\)/);assert.match(loader,/二维兼容视图/);assert.match(loader,/\.catch\(\(\)=>fallback\(\)\)/);assert.doesNotMatch(controller,/forceContextRestore|forceContextLoss|disable-gpu|renderOrder\s*=/);assert.doesNotMatch(vendor,/from\s*["'](?:https?:|three|\.\/)/);assert.ok(fs.existsSync('public/vendor/three-LICENSE.txt'));
});

test('stage-based phone office keeps full task information instead of number-only pins',t=>{const r=runtime(t,{running:false});const viewport=r.nodes.get('office-viewport');viewport.width=650;viewport.height=1040;r.observer.fn();assert.equal(viewport.classList.contains('phone-office'),true);assert.deepEqual(r.renderer.size,[650,1040]);viewport.width=950;r.observer.fn();assert.equal(viewport.classList.contains('phone-office'),false);});
test('renderer initialization failure is surfaced to the explicit fallback loader',t=>{assert.throws(()=>runtime(t,{rendererFails:true}),/No WebGL2/);});

test('first render failure releases resources and leaves the explicit compatibility path',t=>{const probe={};assert.throws(()=>runtime(t,{paintFails:true,probe}),/3D render failed/);assert.match(probe.message,/二维兼容视图/);assert.equal(probe.renderer.disposed,true);assert.equal(probe.observer.disconnected,true);});
test('bfcache pause resumes safely without rebuilding the scene',t=>{const r=runtime(t);const uuid=r.api.office.stations.get(1).group.uuid;r.window.emit('pagehide',{persisted:true});assert.equal(r.raf.size,0);assert.notEqual(r.renderer.disposed,true);r.window.emit('pageshow');assert.ok(r.raf.size>0);assert.equal(r.api.office.stations.get(1).group.uuid,uuid);});
test('disposal releases the directional shadow target',()=>{const o=buildOffice();let disposed=false;o.sun.shadow.dispose=()=>{disposed=true;};disposeOffice(o);assert.equal(disposed,true);});
