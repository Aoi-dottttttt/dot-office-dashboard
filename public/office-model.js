import * as T from './vendor/three.js';
import './seat-settings.js';
import {createRoundedDotGeometry,DOT_PROFILES,dotFrontSurface,dotImplicit,dotSurfaceNormal} from './dot-geometry.js';

export const MODELS = globalThis.SeatSettings.models;
export const SEATS = Object.freeze([
  {number:1,x:-7.8,z:-8.5},{number:2,x:1.4,z:-8.5},{number:3,x:10.6,z:-8.5},
  {number:4,x:-7.8,z:0},{number:5,x:1.4,z:0},{number:6,x:10.6,z:0},{number:7,x:1.4,z:8.5}
].map((seat,index)=>Object.freeze({...seat,...MODELS[index],modelId:MODELS[index].id})));
const BASE_ROOM = Object.freeze({width:22,depth:14,wallHeight:2.65});
export const ROOM = Object.freeze({width:30.8,depth:28,wallHeight:2.65});
export const PORTRAIT_ROOM = Object.freeze({width:22,depth:31,wallHeight:2.65});
export const PHONE_ROOM = Object.freeze({width:10.8,depth:57.5,wallHeight:2.65});
export const VIEW = Object.freeze({yaw:.14,portraitYaw:.04,phoneYaw:0,elevation:.59,minElevation:.50,maxElevation:.88,minYaw:-.08,maxYaw:.40});
export const CHAIR = Object.freeze({workingZ:.90,parkedZ:1.65});
export const PANEL = Object.freeze({height:100,gap:12});
export function cameraLimits(layout){return layout==='phone'?{minYaw:-.015,maxYaw:.015,minElevation:.59,maxElevation:.76,minZoom:1,maxZoom:1.3}:layout==='portrait'?{minYaw:-.025,maxYaw:.055,minElevation:.59,maxElevation:.76,minZoom:1,maxZoom:1.4}:{minYaw:-.04,maxYaw:.18,minElevation:.59,maxElevation:.76,minZoom:1,maxZoom:1.45};}
const geometries = new Map();
function cached(key,make){if(!geometries.has(key))geometries.set(key,make());return geometries.get(key);}
function rounded(w,h,d,r=.08){return cached(`b:${w}:${h}:${d}:${r}`,()=>new T.RoundedBoxGeometry(w,h,d,3,Math.min(r,w/3,h/3,d/3)));}
const sphere=()=>cached('sphere',()=>new T.SphereGeometry(1,24,16));
function material(color,extra={}){return new T.MeshStandardMaterial({color,roughness:.75,metalness:.03,...extra});}
function mesh(parent,geometry,mat,name,x=0,y=0,z=0){const m=new T.Mesh(geometry,mat);m.name=name;m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;}
function box(parent,mat,name,w,h,d,x=0,y=0,z=0,r=.07){return mesh(parent,rounded(w,h,d,r),mat,name,x,y,z);}
function ball(parent,mat,name,sx,sy,sz,x=0,y=0,z=0){const m=mesh(parent,sphere(),mat,name,x,y,z);m.scale.set(sx,sy,sz);return m;}
function cylinder(parent,mat,name,rt,rb,h,x=0,y=0,z=0){const g=cached(`c:${rt}:${rb}:${h}`,()=>new T.CylinderGeometry(rt,rb,h,16));return mesh(parent,g,mat,name,x,y,z);}
function torus(parent,mat,name,r,t,x=0,y=0,z=0,arc=Math.PI*2){const g=cached(`t:${r}:${t}:${arc}`,()=>new T.TorusGeometry(r,t,8,32,arc));return mesh(parent,g,mat,name,x,y,z);}
function detailRing(parent,mat,name,r,t,x=0,y=0,z=0,arc=Math.PI*2){const g=cached(`dot-t:${r}:${t}:${arc}`,()=>new T.TorusGeometry(r,t,12,64,arc));return mesh(parent,g,mat,name,x,y,z);}
function surfaceTube(parent,mat,name,kind,points,radius=.022,closed=false){
  const path=points.map(([x,y])=>new T.Vector3(x,y,dotFrontSurface(kind,x,y).z+.062));
  const g=new T.TubeGeometry(new T.CatmullRomCurve3(path,closed,'centripetal'),Math.max(32,points.length*2),radius,10,closed);
  geometries.set(`${name}:${kind}:${geometries.size}`,g);const m=mesh(parent,g,mat,name);m.userData.surfaceDecoration=true;return m;
}
function tangentEyewear(parent,mat,name,kind,cx,cy,points,radius){
  const surface=dotFrontSurface(kind,cx,cy),n=surface.normal;
  const path=points.map(([x,y])=>new T.Vector3(x,y,surface.z+.075-(n.x*(x-cx)+n.y*(y-cy))/n.z));
  const g=new T.TubeGeometry(new T.CatmullRomCurve3(path,true,'centripetal'),96,radius,10,true);geometries.set(name,g);return mesh(parent,g,mat,name);
}
function surfaceBall(parent,mat,name,kind,x,y,sx,sy,sz,offset=.025){
  const surface=dotFrontSurface(kind,x,y);const m=ball(parent,mat,name,sx,sy,sz,x,y,surface.z);m.position.addScaledVector(surface.normal,offset);m.quaternion.setFromUnitVectors(new T.Vector3(0,0,1),surface.normal);m.userData.surfaceAnchor={x,y,offset};return m;
}
function makeBowtie(parent,mat,kind,centerY){for(const x of [-.115,.115])surfaceBall(parent,mat,x<0?'bowtie-left':'bowtie-right',kind,x,centerY,.135,.085,.055,.04);surfaceBall(parent,mat,'bowtie-knot',kind,0,centerY,.053,.058,.065,.055);}
function makeDot(pivot,seat,palette){
  const group=new T.Group();group.name=`dot-${seat.number}`;group.position.y=1.84;pivot.add(group);
  const profile=DOT_PROFILES[seat.shape];const bodyMat=material(seat.color,{roughness:.94,metalness:0});const body=new T.Group();body.name='body-volume';group.add(body);
  const bodyGeometry=cached(`rounded-dot:${seat.shape}`,()=>createRoundedDotGeometry(seat.shape));
  mesh(body,bodyGeometry,bodyMat,`body-${seat.shape}`);
  const face=new T.Group();face.name='front-face';group.add(face);
  const faceFraction={cloud:.58,alfred:.69,triangle:.60,star:.58,bean:.61,puff:.60,heart:.56}[seat.shape];
  const faceY=profile.minY+(profile.maxY-profile.minY)*faceFraction;
  if(seat.accessory!=='sunglasses'&&seat.accessory!=='alfred'){
    surfaceBall(face,palette.eyes,'eye-left',seat.shape,-.17,faceY,.043,.071,.026,.023);
    surfaceBall(face,palette.eyes,'eye-right',seat.shape,.17,faceY,.043,.071,.026,.023);
  }
  if(seat.accessory==='alfred'){
    // Official Alfred has large, tall oval glasses and relaxed curved eyelids.
    for(const cx of [-.235,.235]){
      const points=Array.from({length:48},(_,i)=>{const a=i*Math.PI*2/48;return[cx+.174*Math.cos(a),faceY+.244*Math.sin(a)];});
      tangentEyewear(face,palette.accessory,cx<0?'glasses-left-rim':'glasses-right-rim',seat.shape,cx,faceY,points,.028);
      const lid=Array.from({length:12},(_,i)=>{const t=i/11;return[cx+(t-.5)*.19,faceY-.035-.038*Math.sin(Math.PI*t)];});
      surfaceTube(face,palette.eyes,cx<0?'eyelid-left':'eyelid-right',seat.shape,lid,.021);
    }
    surfaceTube(face,palette.accessory,'glasses-bridge',seat.shape,[[-.065,faceY+.025],[0,faceY+.075],[.065,faceY+.025]],.025);
    for(const side of [-1,1])surfaceTube(face,palette.accessory,'glasses-temple',seat.shape,[[side*.395,faceY-.060],[side*.43,faceY-.085],[side*.46,faceY-.13]],.024);
    const bowY=profile.minY+.175;
    for(const side of [-1,1]){const wing=surfaceBall(face,palette.accessory,side<0?'bowtie-left':'bowtie-right',seat.shape,side*.165,bowY,.20,.115,.072,.045);wing.rotation.z=side*.18;}
    surfaceBall(face,palette.accessory,'bowtie-knot',seat.shape,0,bowY,.065,.077,.085,.070);
  }
  if(seat.accessory==='sunglasses'){
    for(const x of [-.21,.21])surfaceBall(face,palette.eyes,x<0?'sunglasses-left-lens':'sunglasses-right-lens',seat.shape,x,faceY,.174,.179,.060,.062);
    surfaceTube(face,palette.accessory,'sunglasses-bridge',seat.shape,[[-.04,faceY+.015],[0,faceY+.05],[.04,faceY+.015]],.026);
  }
  if(seat.accessory==='headset'){
    const band=detailRing(group,palette.accessory,'headset-band',.69,.047,0,profile.centerY+.025,0,Math.PI);band.scale.y=(profile.maxY-profile.centerY+.045)/.69;
    for(const x of [-.71,.71])ball(group,palette.accessory,'ear-cup',.12,.225,.24,x,profile.centerY+.015,.005);
  }
  if(seat.accessory==='moon'){
    const points=Array.from({length:32},(_,i)=>{const a=.42+i*Math.PI*1.55/31;return[.29+.09*Math.cos(a),profile.centerY+.31+.09*Math.sin(a)];});
    surfaceTube(face,palette.gold,'moon-pin',seat.shape,points,.026);
  }
  if(seat.accessory==='beret'){
    const hat=ball(group,palette.accessory,'beret-crown',.595,.215,.47,.055,profile.maxY+.035,0);hat.rotation.z=-.16;
    const rim=detailRing(group,palette.accessory,'beret-soft-rim',.44,.047,.015,profile.maxY-.035,0);rim.rotation.x=Math.PI/2;rim.scale.x=1.17;
    ball(group,palette.accessory,'beret-tip',.045,.059,.04,.075,profile.maxY+.236,0);
  }
  if(seat.accessory==='scarf'){
    const y=profile.centerY-.25;const path=[];
    for(let i=0;i<64;i++){const a=i*Math.PI*2/64;let lo=0,hi=1.5;for(let j=0;j<30;j++){const r=(lo+hi)/2;if(dotImplicit(seat.shape,r*Math.cos(a),y,r*Math.sin(a))>0)hi=r;else lo=r;}const r=(lo+hi)/2,x=r*Math.cos(a),z=r*Math.sin(a);const n=dotSurfaceNormal(seat.shape,x,y,z);path.push(new T.Vector3(x,y,z).addScaledVector(n,.035));}
    const g=new T.TubeGeometry(new T.CatmullRomCurve3(path,true,'centripetal'),96,.060,12,true);geometries.set('fitted-scarf',g);mesh(group,g,palette.blue,'scarf-wrap');
    const tailY=profile.centerY-.40;const tail=box(face,palette.blue,'scarf-tail',.15,.30,.07,-.23,tailY,dotFrontSurface(seat.shape,-.23,tailY+.08).z+.062,.035);tail.rotation.z=-.20;
  }
  if(seat.accessory==='bowtie')makeBowtie(face,palette.blue,seat.shape,profile.centerY-.27);
  // The dot rests directly on the cushion. Only two hands remain; no feet or legs.
  const hands=[-.28,.28].map((x,i)=>{const hand=ball(group,bodyMat,`hand-${i}`,.13,.11,.155,x,-.18,.58);hand.userData.idleZ=dotFrontSurface(seat.shape,x,-.30).z+.06;return hand;});
  group.userData={shape:seat.shape,accessory:seat.accessory};
  return {group,body,face,hands,bodyMat};
}
function cloneDot(parent,template,number){
  const group=template.group.clone(true);group.name=`dot-${number}`;group.traverse(object=>{object.userData.seatNumber=number;});parent.add(group);
  return{group,body:group.getObjectByName('body-volume'),face:group.getObjectByName('front-face'),hands:[group.getObjectByName('hand-0'),group.getObjectByName('hand-1')],bodyMat:template.bodyMat};
}
export function setStationModel(office,number,modelId){
  const station=office.stations.get(number),template=office.modelTemplates.get(modelId);if(!station||!template)throw Error('Unknown workstation model');if(station.modelId===modelId)return false;
  station.swivel.remove(station.dot.group);station.dot=cloneDot(station.swivel,template,number);station.modelId=modelId;return true;
}
function makeStation(scene,seat,p,templates){
  const group=new T.Group();group.name=`seat-${seat.number}`;group.position.set(seat.x,0,seat.z);scene.add(group);
  const desk=new T.Group();desk.name='desk';desk.position.z=.20;group.add(desk);
  box(desk,p.desk,'desktop',3.65,.16,1.90,0,1.62,-.88,.14);
  for(const x of [-1.53,1.53]){box(desk,p.desk,'desk-leg',.16,1.51,1.42,x,.78,-.88,.065);box(desk,p.legs,'desk-foot',.25,.055,1.51,x,.05,-.88,.025);}
  box(desk,p.legs,'desk-rear-brace',3.0,.10,.12,0,1.32,-1.55,.025);
  box(desk,p.monitor,'monitor-frame',1.48,.92,.12,0,2.35,-1.45,.07);
  box(desk,p.legs,'monitor-stem',.11,.33,.10,0,1.83,-1.46,.025);
  box(desk,p.legs,'monitor-foot',.69,.055,.40,0,1.73,-1.35,.03);
  const screenMaterial=material(0x111a29,{roughness:.40,emissive:0x000000,emissiveIntensity:0});
  const screen=box(desk,screenMaterial,'monitor-screen',1.34,.78,.022,0,2.35,-1.378,.035);screen.castShadow=false;
  const screenUi=new T.Group();screenUi.name='screen-content';desk.add(screenUi);
  for(let i=0;i<3;i++)box(screenUi,p.screenText,'screen-line',.73-i*.12,.045,.012,-.14-i*.06,2.51-i*.17,-1.360,.008);
  screenUi.visible=false;
  box(desk,p.keys,'keyboard',1.16,.055,.41,0,1.738,-.21,.025);
  for(let i=0;i<3;i++)box(desk,p.keyCaps,'key-row',1.00,.012,.045,0,1.774,-.34+i*.105,.007);
  const keyCaps=[-.32,.32].map((x,i)=>box(desk,p.keyCaps,`active-key-${i}`,.14,.020,.075,x,1.781,-.22,.009));
  ball(desk,p.keys,'mouse',.14,.046,.20,.93,1.75,-.21);
  cylinder(desk,p.ceramic,'mug',.12,.10,.23,-1.26,1.82,-1.05);
  const mugHandle=torus(desk,p.ceramic,'mug-handle',.073,.026,-1.10,1.83,-1.05);mugHandle.rotation.y=Math.PI/2;
  const base=new T.Group();base.name='chair-base';base.position.z=CHAIR.parkedZ;group.add(base);
  cylinder(base,p.legs,'chair-stem',.07,.095,.77,0,.565,0);
  for(let i=0;i<5;i++){
    const a=i*Math.PI*2/5,dx=Math.sin(a),dz=Math.cos(a);
    const spoke=cylinder(base,p.legs,'chair-spoke',.032,.055,.66,dx*.32,.17,dz*.32);spoke.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),new T.Vector3(dx,-.055,dz).normalize());
    const wheel=cylinder(base,p.wheels,'caster',.090,.090,.105,dx*.63,.102,dz*.63);wheel.rotation.z=Math.PI/2;wheel.rotation.y=-a;
  }
  const swivel=new T.Group();swivel.name='chair-and-dot-swivel';swivel.position.z=CHAIR.parkedZ;group.add(swivel);
  ball(swivel,p.legs,'seat-underframe',.825,.052,.646,0,.965,0);
  ball(swivel,p.chair,'chair-seat',.84,.10,.65,0,1.025,0);
  const backGeometry=cached('curved-chair-back',()=>{const g=new T.SphereGeometry(1,40,24);const p=g.attributes.position;for(let i=0;i<p.count;i++){const x=p.getX(i)*.81,y=p.getY(i)*.29,z=p.getZ(i)*.095+.19*(x/.81)**2;p.setXYZ(i,x,y,z);}g.computeVertexNormals();g.computeBoundingBox();g.computeBoundingSphere();g.type='CurvedChairBackGeometry';return g;});
  const chairBack=mesh(swivel,backGeometry,p.chair,'chair-back',0,1.39,-.85);
  const chairTube=(name,points,radius)=>{const key=name+JSON.stringify(points);const geometry=cached(key,()=>new T.TubeGeometry(new T.CatmullRomCurve3(points.map(p=>new T.Vector3(...p))),24,radius,8,false));return mesh(swivel,geometry,p.legs,name);};
  chairTube('back-support',[[0,.96,-.38],[0,1.035,-.68],[0,1.21,-.85],[0,1.39,-.85]],.042);
  for(const side of [-1,1]){
    chairTube('arm-support',[[side*.65,.99,-.24],[side*.83,1.045,-.22],[side*.94,1.24,-.12],[side*.94,1.345,-.02]],.027);
    ball(swivel,p.chair,'armrest',.069,.045,.30,side*.94,1.37,-.02);
  }
  const dot=cloneDot(swivel,templates.get(seat.modelId),seat.number);
  const anchor=new T.Vector3(seat.x-1.50,.06,seat.z+1.48);
  const station={number:seat.number,group,desk,base,swivel,dot,chairBack,screen,screenUi,screenMaterial,keyCaps,anchor,working:false,targetYaw:VIEW.yaw,poseMoving:false,modelId:seat.modelId};
  group.traverse(object=>{object.userData.seatNumber=seat.number;});
  return station;
}
export function buildOffice(){
  const scene=new T.Scene();const p={desk:material(0xf8f9fc,{roughness:.56}),floor:material(0xe5e8ee,{roughness:.88}),wall:material(0xf3f5f8,{roughness:.9}),edge:material(0xcbd2de),legs:material(0xaeb9c9,{metalness:.55,roughness:.39}),monitor:material(0x303743,{roughness:.5}),keys:material(0xe8ecf3),keyCaps:material(0xa7b5c8),chair:material(0xbcc7d6,{roughness:.9}),wheels:material(0x354052),eyes:material(0x11161d),accessory:material(0x292b34),blue:material(0x326cce),gold:material(0xffd27e),ceramic:material(0xf5f6fa),wood:material(0xb5a899),screenText:new T.MeshBasicMaterial({color:0xecf8ff})};
  const room=new T.Group();room.name='volumetric-room';scene.add(room);
  box(room,p.edge,'foundation',BASE_ROOM.width,.34,BASE_ROOM.depth,0,-.23,0,.24);
  box(room,p.floor,'floor',BASE_ROOM.width-.12,.09,BASE_ROOM.depth-.12,0,-.01,0,.20);
  box(room,p.wall,'back-wall',BASE_ROOM.width,BASE_ROOM.wallHeight,.24,0,BASE_ROOM.wallHeight/2,-BASE_ROOM.depth/2+.08,.10);
  // The side wall is cut away before the desks; the near edge stays open.
  box(room,p.wall,'left-wall',.24,BASE_ROOM.wallHeight,3.05,-BASE_ROOM.width/2+.08,BASE_ROOM.wallHeight/2,-5.43,.10);
  box(room,p.edge,'left-cutaway',.21,.28,10.8,-BASE_ROOM.width/2+.08,.10,1.05,.07);
  box(room,p.edge,'back-skirt',BASE_ROOM.width-.35,.09,.055,0,.075,-BASE_ROOM.depth/2+.23,.018);
  const windowFrame=box(room,p.desk,'window-frame',8.40,1.26,.11,-3.9,1.75,-6.77,.08);
  const windowMat=material(0xe4effc,{emissive:0xb8d6fa,emissiveIntensity:.18,roughness:.7});
  box(windowFrame,windowMat,'window-glass',8.15,1.05,.035,0,0,.070,.05);
  for(const x of [-1.36,1.36])box(windowFrame,p.desk,'window-mullion',.045,1.07,.05,x,0,.092,.014);
  const cabinet=new T.Group();cabinet.name='quiet-storage';room.add(cabinet);
  box(cabinet,p.desk,'side-cabinet',4.15,.80,.74,6.6,.44,-6.24,.09);
  box(cabinet,p.legs,'cabinet-plinth',3.88,.06,.59,6.6,.06,-6.24,.02);
  for(const x of [5.55,6.6,7.65])box(cabinet,p.edge,'cabinet-seam',.018,.59,.018,x,.47,-5.86,.006);
  for(let i=0;i<2;i++)box(cabinet,i?p.blue:p.wood,'book',.55,.08,.36,5.2,.89+i*.08,-6.18,.018);
  const modelTemplates=new Map(MODELS.map(model=>[model.id,makeDot(new T.Group(),{...model,number:0},p)]));
  const stations=new Map(SEATS.map(seat=>[seat.number,makeStation(scene,seat,p,modelTemplates)]));
  // Strong diffuse fill and restrained, soft shadows reveal the curved bodies.
  const hemi=new T.HemisphereLight(0xf4f7ff,0xb4becd,2.7);scene.add(hemi);
  const sun=new T.DirectionalLight(0xfff9f2,2.0);sun.position.set(-6,16,9);sun.castShadow=true;sun.shadow.mapSize.set(1024,1024);sun.shadow.camera.left=-17;sun.shadow.camera.right=17;sun.shadow.camera.top=20;sun.shadow.camera.bottom=-20;sun.shadow.camera.near=1;sun.shadow.camera.far=55;sun.shadow.normalBias=.025;sun.shadow.bias=-.0002;sun.shadow.radius=2.5;sun.shadow.intensity=.52;scene.add(sun);
  const fill=new T.DirectionalLight(0xdceaff,.95);fill.position.set(8,7,6);scene.add(fill);
  const camera=new T.OrthographicCamera(-15,15,10,-10,.1,100);
  const office={scene,room,stations,modelTemplates,palette:p,hemi,sun,fill,windowMat,camera,yaw:VIEW.yaw,elevation:VIEW.elevation,zoom:1,dark:false,layout:null,roomSize:ROOM};
  setTheme(office,false);setCamera(office,1000,600);for(const station of stations.values())stepStation(station,0,0,false,VIEW.yaw);return office;
}
export function setTheme(office,dark){office.dark=dark;const p=office.palette;p.floor.color.set(dark?0x495568:0xe5e8ee);p.wall.color.set(dark?0x7a879a:0xf3f5f8);p.edge.color.set(dark?0x313c50:0xcbd2de);p.desk.color.set(dark?0xcbd3df:0xf8f9fc);p.chair.color.set(dark?0x8394ad:0xbcc7d6);office.hemi.intensity=dark?2.2:2.7;office.sun.intensity=dark?1.5:2.0;office.fill.intensity=dark?1.2:.95;office.windowMat.emissiveIntensity=dark?.30:.18;}
export function setLayout(office,layout){
  if(office.layout===layout)return false;
  office.layout=layout;office.roomSize=layout==='phone'?PHONE_ROOM:layout==='portrait'?PORTRAIT_ROOM:ROOM;const size=office.roomSize;
  office.room.scale.set(size.width/BASE_ROOM.width,1,size.depth/BASE_ROOM.depth);
  office.room.getObjectByName('quiet-storage').visible=layout!=='phone';
  office.sun.shadow.camera.left=-size.width/2-8;office.sun.shadow.camera.right=size.width/2+8;office.sun.shadow.camera.top=size.depth/2+5;office.sun.shadow.camera.bottom=-size.depth/2-5;office.sun.shadow.camera.updateProjectionMatrix();
  for(const seat of SEATS){const station=office.stations.get(seat.number),i=seat.number-1;
    const x=layout==='phone'?2.5:layout==='portrait'?(i%2?6.0:-3.6):seat.x;
    const z=layout==='phone'?(-25.5+i*8.5):layout==='portrait'?(-10.95+Math.floor(i/2)*7.3):seat.z;
    station.group.position.set(x,0,z);
  }
  office.yaw=layout==='phone'?VIEW.phoneYaw:layout==='portrait'?VIEW.portraitYaw:VIEW.yaw;office.zoom=1;office.scene.updateMatrixWorld(true);return true;
}
export function setCamera(office,width,height){
  setLayout(office,width<760?'phone':width<1180?'portrait':'wide');
  const aspect=Math.max(.25,width/Math.max(1,height));const radius=36;const {yaw,elevation}=office;const size=office.roomSize;
  office.camera.position.set(Math.sin(yaw)*Math.cos(elevation)*radius,Math.sin(elevation)*radius,Math.cos(yaw)*Math.cos(elevation)*radius);
  office.camera.lookAt(0,.55,0);office.camera.updateMatrixWorld(true);
  const bounds=new T.Box3();
  for(const x of [-size.width/2,size.width/2])for(const y of [-.45,2.95])for(const z of [-size.depth/2,size.depth/2])bounds.expandByPoint(new T.Vector3(x,y,z).applyMatrix4(office.camera.matrixWorldInverse));
  const h=Math.max(bounds.max.y-bounds.min.y+1.25,(bounds.max.x-bounds.min.x+1.15)/aspect)/office.zoom;
  const cx=(bounds.max.x+bounds.min.x)/2,cy=(bounds.max.y+bounds.min.y)/2;
  office.camera.left=cx-h*aspect/2;office.camera.right=cx+h*aspect/2;office.camera.top=cy+h/2;office.camera.bottom=cy-h/2;office.camera.updateProjectionMatrix();
}
export function setWorking(station,working,{instant=false,idleYaw=VIEW.yaw}={}){
  station.working=Boolean(working);station.targetYaw=working?Math.PI:idleYaw;
  station.screenMaterial.color.set(working?0x7abefa:0x101725);station.screenMaterial.emissive.set(working?0x7abefa:0x000000);station.screenMaterial.emissiveIntensity=working?.65:0;station.screenUi.visible=Boolean(working);
  if(instant){station.swivel.rotation.y=station.targetYaw;station.swivel.position.z=working?CHAIR.workingZ:CHAIR.parkedZ;station.base.position.z=station.swivel.position.z;station.poseMoving=false;}
}
export function stepStation(station,time,dt,motion,idleYaw=VIEW.yaw){
  if(!station.working)station.targetYaw=idleYaw;
  const diff=Math.atan2(Math.sin(station.targetYaw-station.swivel.rotation.y),Math.cos(station.targetYaw-station.swivel.rotation.y));
  // Pull out before swiveling; slide back to the keyboard only after facing it.
  const turning=Math.abs(diff)>.002;
  const targetZ=turning||!station.working?CHAIR.parkedZ:CHAIR.workingZ;
  if(!motion){station.swivel.rotation.y=station.targetYaw;station.swivel.position.z=station.working?CHAIR.workingZ:CHAIR.parkedZ;}
  else{
    station.swivel.position.z+=(targetZ-station.swivel.position.z)*Math.min(1,dt*9);
    if(Math.abs(targetZ-station.swivel.position.z)<.002)station.swivel.position.z=targetZ;
    if(station.swivel.position.z>=CHAIR.parkedZ-.005)station.swivel.rotation.y+=diff*Math.min(1,dt*10);
    if(Math.abs(diff)<.002)station.swivel.rotation.y=station.targetYaw;
  }
  station.base.position.z=station.swivel.position.z;
  station.poseMoving=Math.abs(station.targetYaw-station.swivel.rotation.y)>.002||Math.abs(station.swivel.position.z-(station.working?CHAIR.workingZ:CHAIR.parkedZ))>.002;
  const active=station.working&&motion&&!station.poseMoving;const phase=time*10.5+station.number*.7;
  station.dot.group.position.y=1.84+(active?.006+(Math.sin(phase*.47)+1)*.007:0);station.dot.group.rotation.z=active?Math.sin(phase*.48)*.010:0;
  const raisedHands=station.working||station.swivel.position.z<1.18;
  station.dot.hands.forEach((hand,i)=>{hand.position.y=raisedHands?.040+(active?Math.sin(phase+i*Math.PI)*.022:0):-.30;hand.position.z=raisedHands?.78:hand.userData.idleZ;hand.rotation.x=raisedHands?-.35:0;});
  station.keyCaps.forEach((key,i)=>{key.position.y=1.781-(active?Math.max(0,Math.sin(phase+i*Math.PI))*.018:0);});
  return motion&&(station.working||station.poseMoving);
}
export function updateOffice(office,time,dt,motion){let active=false;for(const station of office.stations.values())active=stepStation(station,time,dt,motion,office.yaw)||active;office.scene.updateMatrixWorld(true);return active;}
function projectedBounds(root,camera,width,height){
  const box=new T.Box3().setFromObject(root),bounds={left:Infinity,right:-Infinity,top:Infinity,bottom:-Infinity};
  for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z]){const p=new T.Vector3(x,y,z).project(camera),px=(p.x*.5+.5)*width,py=(-p.y*.5+.5)*height;bounds.left=Math.min(bounds.left,px);bounds.right=Math.max(bounds.right,px);bounds.top=Math.min(bounds.top,py);bounds.bottom=Math.max(bounds.bottom,py);}
  return bounds;
}
export function projectAnchors(office,width,height){
  const panelWidth=width<760?132:width<1180?132:140;
  const gap=office.layout==='portrait'?24:PANEL.gap;
  const panels=[...office.stations.values()].map(station=>{const stationBounds=projectedBounds(station.group,office.camera,width,height),bodyBounds=projectedBounds(station.dot.body,office.camera,width,height);return{number:station.number,x:stationBounds.left-panelWidth-gap,y:(bodyBounds.top+bodyBounds.bottom-PANEL.height)/2,width:panelWidth,height:PANEL.height,stationBounds,bodyBounds,visible:true};});
  // Keep cards in their own left-hand aisle. If the user zooms a station out of
  // frame, its card stays with it instead of covering a different workstation.
  for(const p of panels)p.visible=p.x>=6&&p.y>=6&&p.x+p.width<width-6&&p.y+p.height<height-6;
  return panels;
}
export function disposeOffice(office){const mats=new Set();office.scene.traverse(o=>{if(o.isMesh){for(const mat of Array.isArray(o.material)?o.material:[o.material])mats.add(mat);}});for(const template of office.modelTemplates.values())template.group.traverse(object=>{if(object.isMesh)for(const mat of Array.isArray(object.material)?object.material:[object.material])mats.add(mat);});mats.forEach(mat=>mat.dispose());office.modelTemplates.clear();office.sun.shadow.dispose();/* Geometries are shared only within this scene module. */geometries.forEach(g=>g.dispose());geometries.clear();}
