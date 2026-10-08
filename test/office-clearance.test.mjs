import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as T from '../public/vendor/three.js';
import {buildOffice,VIEW,CHAIR,setCamera,setWorking,stepStation,updateOffice,projectAnchors,cameraLimits,disposeOffice} from '../public/office-model.js';
import {dotImplicit} from '../public/dot-geometry.js';

const sampleCache=new WeakMap();
function surfaceSamples(geometry){
  if(sampleCache.has(geometry))return sampleCache.get(geometry);
  const p=geometry.attributes.position,ids=geometry.index?.array,points=[];
  for(let i=0;i<p.count;i++)points.push(new T.Vector3().fromBufferAttribute(p,i));
  for(let i=0;i<(ids?.length??p.count);i+=3){const a=points[ids?ids[i]:i],b=points[ids?ids[i+1]:i+1],c=points[ids?ids[i+2]:i+2];points.push(a.clone().add(b).add(c).multiplyScalar(1/3),a.clone().add(b).multiplyScalar(.5),b.clone().add(c).multiplyScalar(.5),c.clone().add(a).multiplyScalar(.5));}
  sampleCache.set(geometry,points);return points;
}
function checkClearance(station){
  station.group.updateMatrixWorld(true);const inverse=station.dot.group.matrixWorld.clone().invert();
  const hands=station.dot.hands.map(hand=>hand.matrixWorld.clone().invert());
  const furniture=[];station.group.traverse(m=>{if(m.isMesh&&/^(chair-seat|chair-back|back-support|arm-bracket|arm-support|armrest|desktop)$/.test(m.name))furniture.push(m);});
  for(const part of furniture)for(const point of surfaceSamples(part.geometry)){
    const world=point.clone().applyMatrix4(part.matrixWorld),local=world.clone().applyMatrix4(inverse);
    if(Math.abs(local.x)<1&&Math.abs(local.z)<.65&&local.y>-.73&&local.y<.8)assert.ok(dotImplicit(station.dot.group.userData.shape,local.x,local.y,local.z)>-.006,`seat ${station.number}: body enters ${part.name}`);
    for(const handInverse of hands)assert.ok(world.clone().applyMatrix4(handInverse).lengthSq()>.985,`seat ${station.number}: hand enters ${part.name}`);
  }
  const bodyBox=new T.Box3().setFromObject(station.dot.body),deskBox=new T.Box3().setFromObject(station.desk.getObjectByName('desktop'));
  assert.ok(bodyBox.min.z>deskBox.max.z+.015,`seat ${station.number}: rounded body crosses desk front`);
  assert.ok(bodyBox.min.y>=1.125,`seat ${station.number}: sway enters cushion`);
  const deskParts=[],chairParts=[];station.desk.traverse(m=>{if(m.isMesh)deskParts.push(new T.Box3().setFromObject(m));});station.swivel.traverse(m=>{if(m.isMesh&&!m.userData.surfaceAnchor&&!m.name.startsWith('body-')&&(/^(chair-|seat-underframe|back-support|arm-support|armrest)/.test(m.name)))chairParts.push(m);});
  for(const part of chairParts){const box=new T.Box3().setFromObject(part);for(const desk of deskParts)assert.equal(box.intersectsBox(desk),false,`${part.name} crosses desk furniture during swivel`);}
}
test('all seven legless bodies and hands clear their chairs, desk edge, and both complete swivel transitions',()=>{
  const office=buildOffice();
  for(const station of office.stations.values()){
    checkClearance(station);
    for(const working of [true,false]){
      setWorking(station,working,{idleYaw:VIEW.yaw});stepStation(station,0,0,true,VIEW.yaw);checkClearance(station);
      for(let frame=0;frame<150;frame++){stepStation(station,frame/30,1/30,true,VIEW.yaw);if(frame%6===0)checkClearance(station);}
      assert.ok(Math.abs(station.swivel.position.z-(working?CHAIR.workingZ:CHAIR.parkedZ))<.003);assert.equal(station.base.position.z,station.swivel.position.z);
    }
    setWorking(station,true,{instant:true});stepStation(station,0,0,false);checkClearance(station);
  }
  disposeOffice(office);
});

function projectedRect(root,camera,width,height){
  const bounds={left:Infinity,right:-Infinity,top:Infinity,bottom:-Infinity};
  root.traverse(m=>{if(!m.isMesh)return;const p=m.geometry.attributes.position;for(let i=0;i<p.count;i++){const v=new T.Vector3().fromBufferAttribute(p,i).applyMatrix4(m.matrixWorld).project(camera),x=(v.x+1)*width/2,y=(1-v.y)*height/2;bounds.left=Math.min(bounds.left,x);bounds.right=Math.max(bounds.right,x);bounds.top=Math.min(bounds.top,y);bounds.bottom=Math.max(bounds.bottom,y);}});return bounds;
}
test('lower default views keep every dot and screen readable with no cross-row or pin occlusion',()=>{
  const office=buildOffice(),ray=new T.Raycaster();
  for(const [width,height] of [[282,1040],[390,1040],[650,1040],[802,800],[1000,800],[1200,860],[1440,860]]){
    setCamera(office,width,height);office.yaw=office.layout==='phone'?VIEW.phoneYaw:office.layout==='portrait'?VIEW.portraitYaw:VIEW.yaw;office.elevation=VIEW.elevation;setCamera(office,width,height);
    for(const working of [false,true]){
      for(const s of office.stations.values())setWorking(s,working,{instant:true,idleYaw:office.yaw});updateOffice(office,0,0,false);
      const pins=projectAnchors(office,width,height);
      for(const s of office.stations.values()){
        const box=projectedRect(s.dot.group,office.camera,width,height);assert.ok(box.right-box.left>=26,'Phone dots must stay discernible');
        assert.ok(box.left>0&&box.right<width&&box.top>0&&box.bottom<height);
        for(const pin of pins){assert.ok(pin.x+pin.width<box.left||pin.x>box.right||pin.y+pin.height<box.top||pin.y>box.bottom,`pin ${pin.number} hides dot ${s.number} at ${width}px`);}
        const body=projectedRect(s.dot.body,office.camera,width,height),others=[office.room,...[...office.stations.values()].filter(other=>other!==s).map(other=>other.group)];
        for(let y=0;y<9;y++)for(let x=0;x<9;x++){
          const px=body.left+(body.right-body.left)*(x+.5)/9,py=body.top+(body.bottom-body.top)*(y+.5)/9;
          ray.setFromCamera(new T.Vector2(px/width*2-1,1-py/height*2),office.camera);const target=ray.intersectObject(s.dot.body,true)[0];if(!target)continue;
          const blocker=ray.intersectObjects(others,true).find(hit=>hit.object.visible&&hit.distance<target.distance-.001);assert.equal(blocker,undefined,`seat ${s.number} blocked by ${blocker?.object.name} at ${width}px`);
        }
        const screen=s.screen.getWorldPosition(new T.Vector3()).project(office.camera);ray.setFromCamera(new T.Vector2(screen.x,screen.y),office.camera);const screenHit=ray.intersectObject(s.screen)[0];assert.ok(screenHit,'Screen must face the camera');const beforeScreen=ray.intersectObjects([office.room,...[...office.stations.values()].map(other=>other.group)],true).find(hit=>hit.object.visible&&hit.object!==s.screen&&hit.distance<screenHit.distance-.025&&hit.object.parent!==s.screenUi);assert.equal(beforeScreen,undefined,`seat ${s.number}: hidden screen`);
      }
    }
  }
  disposeOffice(office);
});

test('responsive room moves existing stations and restores the lower wide camera without rebuilding models',()=>{
  const office=buildOffice(),identities=[...office.stations.values()].map(s=>s.dot.group.uuid);
  assert.equal(office.elevation,.59);setCamera(office,390,1040);assert.equal(office.layout,'phone');assert.equal(new Set([...office.stations.values()].map(s=>s.group.position.z)).size,7);assert.equal(office.yaw,VIEW.phoneYaw);
  setCamera(office,1440,860);assert.equal(office.layout,'wide');assert.deepEqual([...office.stations.values()].map(s=>s.dot.group.uuid),identities);assert.equal(office.yaw,VIEW.yaw);assert.ok(office.room.getObjectByName('left-cutaway').position.y<.2);assert.ok(office.sun.shadow.intensity<.6);disposeOffice(office);
});

test('left task cards keep readable boxes clear of stations and each other throughout supported camera ranges',()=>{
  const office=buildOffice();const overlap=(a,b)=>a.x<b.x+b.width&&a.x+a.width>b.x&&a.y<b.y+b.height&&a.y+a.height>b.y;
  for(const [width,height] of [[282,1040],[342,1040],[650,1040],[760,1040],[802,800],[1000,800],[1180,860],[1440,860]]){
    setCamera(office,width,height);const limits=cameraLimits(office.layout);
    for(const yaw of [limits.minYaw,limits.maxYaw])for(const elevation of [limits.minElevation,limits.maxElevation])for(const zoom of [1,limits.maxZoom])for(const working of [false,true]){
      Object.assign(office,{yaw,elevation,zoom});setCamera(office,width,height);for(const station of office.stations.values())setWorking(station,working,{instant:true,idleYaw:yaw});updateOffice(office,0,0,false);
      const panels=projectAnchors(office,width,height);for(const panel of panels.filter(p=>p.visible)){
        assert.ok(panel.width>=132&&panel.height===100);assert.ok(panel.x+panel.width+11<panel.stationBounds.left);
        for(const other of panels){if(other!==panel&&other.visible)assert.equal(overlap(panel,other),false,`cards overlap at ${width}`);const b=other.stationBounds;assert.equal(overlap(panel,{x:b.left,y:b.top,width:b.right-b.left,height:b.bottom-b.top}),false,`card ${panel.number} covers station ${other.number} at ${width}`);}
      }
    }
  }
  disposeOffice(office);
});
