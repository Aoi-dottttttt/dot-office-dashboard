import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as T from '../public/vendor/three.js';
import {buildOffice,disposeOffice} from '../public/office-model.js';
import {DOT_PROFILES,createRoundedDotGeometry,dotImplicit} from '../public/dot-geometry.js';

test('all dot bodies are single rounded volumes seated without legs or feet',()=>{
  const office=buildOffice();office.scene.updateMatrixWorld(true);
  for(const station of office.stations.values()){
    const dot=station.dot;assert.equal(dot.body.children.length,1);assert.equal(dot.body.children[0].geometry.type,'RoundedDotGeometry');
    const names=[];dot.group.traverse(o=>names.push(o.name));assert.equal(names.some(name=>/(?:foot|feet|leg)/i.test(name)),false);assert.equal(dot.hands.length,2);
    const box=new T.Box3().setFromObject(dot.body);assert.ok(box.min.y>=1.125&&box.min.y<1.145,'Body must rest directly on the cushion');
    const size=dot.body.children[0].geometry.boundingBox.getSize(new T.Vector3());assert.ok(size.z/Math.max(size.x,size.y)>.55,'Body must have a plump depth profile');
  }
  disposeOffice(office);
});
test('rounded meshes are closed, consistently wound, smooth, and have no planar front caps',()=>{
  for(const kind of Object.keys(DOT_PROFILES)){
    const g=createRoundedDotGeometry(kind);const p=g.attributes.position,n=g.attributes.normal,index=g.index.array;const edges=new Map();const neighbours=Array.from({length:p.count},()=>new Set());let volume=0;
    const a=new T.Vector3(),b=new T.Vector3(),c=new T.Vector3(),cross=new T.Vector3(),ab=new T.Vector3(),ac=new T.Vector3();
    for(let i=0;i<p.count;i++){assert.ok(Number.isFinite(p.getX(i)+p.getY(i)+p.getZ(i)));assert.ok(Math.abs(Math.hypot(n.getX(i),n.getY(i),n.getZ(i))-1)<1e-6);assert.ok(Math.abs(dotImplicit(kind,p.getX(i),p.getY(i),p.getZ(i)))<1e-5);}
    for(let i=0;i<index.length;i+=3){const ids=[index[i],index[i+1],index[i+2]];a.fromBufferAttribute(p,ids[0]);b.fromBufferAttribute(p,ids[1]);c.fromBufferAttribute(p,ids[2]);ab.subVectors(b,a);ac.subVectors(c,a);cross.crossVectors(ab,ac);assert.ok(cross.length()>1e-8,'No collapsed surface triangles');const normalSum=new T.Vector3();for(const id of ids)normalSum.add(new T.Vector3().fromBufferAttribute(n,id));assert.ok(cross.dot(normalSum)>0,'Every face must be wound toward its outward normals');assert.ok(Math.max(a.z,b.z,c.z)-Math.min(a.z,b.z,c.z)>1e-7,'No flat end-cap triangles');volume+=a.dot(new T.Vector3().crossVectors(b,c))/6;
      for(let j=0;j<3;j++){const u=ids[j],v=ids[(j+1)%3],key=u<v?`${u}:${v}`:`${v}:${u}`;edges.set(key,(edges.get(key)||0)+1);neighbours[u].add(v);neighbours[v].add(u);}
    }
    assert.ok(volume>.5,`${kind}: positive solid volume`);assert.ok([...edges.values()].every(count=>count===2),`${kind}: watertight shared edges`);assert.equal(p.count-edges.size+index.length/3,2);
    const visited=new Set([0]),pending=[0];while(pending.length){for(const v of neighbours[pending.pop()])if(!visited.has(v)){visited.add(v);pending.push(v);}}assert.equal(visited.size,p.count,'One connected body surface');
    const zLevels=new Set(Array.from({length:p.count},(_,i)=>p.getZ(i).toFixed(5)));assert.ok(zLevels.size>=40);assert.deepEqual([n.getX(0),n.getY(0),n.getZ(0)],[0,0,1]);g.dispose();
  }
});
test('body cross-sections taper toward sphere-like poles and the rounded triangle stays convex',()=>{
  for(const kind of Object.keys(DOT_PROFILES)){
    const g=createRoundedDotGeometry(kind),p=g.attributes.position,depth=DOT_PROFILES[kind].depth;let equator=0,front=0;
    for(let i=0;i<p.count;i++){if(Math.abs(p.getZ(i))<.001)equator=Math.max(equator,Math.abs(p.getX(i)));if(p.getZ(i)>.80*depth)front=Math.max(front,Math.abs(p.getX(i)));}
    assert.ok(front<equator*.65,`${kind}: fronts must dome inward instead of extruding at constant width`);g.dispose();
  }
  const profile=DOT_PROFILES.triangle;const points=Array.from({length:720},(_,i)=>{const a=i*Math.PI*2/720,r=profile.radius(a);return{x:r*Math.cos(a),y:r*Math.sin(a)};});
  for(let i=0;i<points.length;i++){const a=points[i],b=points[(i+1)%720],c=points[(i+2)%720];assert.ok((b.x-a.x)*(c.y-b.y)-(b.y-a.y)*(c.x-b.x)>-1e-8,'Triangle sides cannot turn into inward clover lobes');}
});
test('eyes and detailed glasses fit the actual curved body mesh',()=>{
  const office=buildOffice();for(const station of office.stations.values()){
    const body=new T.Mesh(station.dot.body.children[0].geometry,station.dot.bodyMat);body.updateMatrixWorld(true);const ray=new T.Raycaster();
    for(const hand of station.dot.hands){const copy=hand.clone();copy.updateMatrixWorld(true);ray.set(new T.Vector3(hand.position.x,hand.position.y,2),new T.Vector3(0,0,-1));assert.equal(ray.intersectObjects([body,copy])[0].object,copy,'Idle hands must remain visible in front of the rounded belly');}
    station.dot.face.traverse(feature=>{
      if(feature.userData.surfaceAnchor){const pos=feature.position;ray.set(new T.Vector3(pos.x,pos.y,2),new T.Vector3(0,0,-1));const hit=ray.intersectObject(body)[0];assert.ok(hit,`${feature.name}: body under anchor`);assert.ok(pos.z-hit.point.z>=.005&&pos.z-hit.point.z<.14,`${feature.name}: fitted to surface`);}
      if(feature.userData.surfaceDecoration){const p=feature.geometry.attributes.position;for(let i=0;i<p.count;i+=Math.max(1,Math.floor(p.count/16))){const x=p.getX(i),y=p.getY(i),z=p.getZ(i);ray.set(new T.Vector3(x,y,2),new T.Vector3(0,0,-1));const hit=ray.intersectObject(body)[0];if(hit)assert.ok(z-hit.point.z>-.012&&z-hit.point.z<.15,`${feature.name}: rim follows dome`);}}
    });
  }
  assert.ok(office.stations.get(6).dot.face.getObjectByName('glasses-left-rim'));assert.ok(office.stations.get(2).dot.face.getObjectByName('glasses-left-rim'));disposeOffice(office);
});

test('characters wear their official accessories over smooth matte bodies',()=>{
  const office=buildOffice(),dot=number=>office.stations.get(number).dot,box=mesh=>{mesh.geometry.computeBoundingBox();return mesh.geometry.boundingBox;};
  // Yellow: round wire glasses with open eyes inside each lens, and no bow tie.
  const yellow=dot(2);assert.equal(yellow.group.userData.shape,'alfred');assert.notEqual(yellow.body.children[0].geometry,dot(7).body.children[0].geometry);
  for(const name of ['eye-left','eye-right','glasses-left-rim','glasses-right-rim','glasses-bridge'])assert.ok(yellow.face.getObjectByName(name),name);
  assert.equal(yellow.face.getObjectByName('bowtie-knot'),undefined);
  for(const name of ['glasses-left-rim','glasses-right-rim']){const size=box(yellow.face.getObjectByName(name)).getSize(new T.Vector3());assert.ok(Math.abs(size.y/size.x-1)<.15,`${name}: round lens`);}
  const lens=box(yellow.face.getObjectByName('glasses-left-rim')),eye=yellow.face.getObjectByName('eye-left').position;
  assert.ok(eye.x>lens.min.x&&eye.x<lens.max.x&&eye.y>lens.min.y&&eye.y<lens.max.y,'Eye sits inside the lens');
  // Pink: thin, wide reading glasses below the eyes.
  const heart=dot(6),reading=box(heart.face.getObjectByName('glasses-left-rim')),readingSize=reading.getSize(new T.Vector3());
  assert.ok(readingSize.x>readingSize.y*1.4,'Reading glasses are wide ovals');assert.ok(reading.max.y<heart.face.getObjectByName('eye-left').position.y,'Reading glasses sit below the eyes');
  // Ivory bandana, silver moon, black bow tie, beret and headset.
  for(const name of ['bandana-front','bandana-band','bandana-knot'])assert.ok(dot(5).group.getObjectByName(name),name);
  assert.ok(dot(3).face.getObjectByName('moon-pin').material.metalness>.8,'Silver crescent');
  assert.equal(dot(7).face.getObjectByName('bowtie-knot').material.color.getHex(),0x292b34);
  assert.ok(dot(4).group.getObjectByName('beret-crown'));assert.ok(dot(1).group.getObjectByName('headset-band'));
  for(const station of office.stations.values()){const mat=station.dot.bodyMat;assert.equal(mat.normalMap,null,'No surface texture');assert.ok(mat.roughness>=.85&&!mat.clearcoat&&!mat.isMeshPhysicalMaterial,'Smooth matte finish without reflections');}
  assert.equal(office.stations.get(2).group.getObjectByName('chair-back').geometry.type,'CurvedChairBackGeometry');disposeOffice(office);
});
