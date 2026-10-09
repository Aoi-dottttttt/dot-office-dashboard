import * as T from './vendor/three.js';
import './seat-settings.js';
import {createRoundedDotGeometry,DOT_PROFILES,dotFrontSurface,dotHalfWidthAt,dotImplicit,dotSurfaceNormal} from './dot-geometry.js';
import {buildDecor,layoutDecor,setDecorTheme,setMountedDecorVisible,windowOpening,woodTexture,screenTexture,deskDecorParts,deskLampShadeParts,mergeParts,primitiveKit} from './office-decor.js';

export const MODELS = globalThis.SeatSettings.models;
export const SEATS = Object.freeze([
  {number:1,x:-7.8,z:-8.5},{number:2,x:1.4,z:-8.5},{number:3,x:10.6,z:-8.5},
  {number:4,x:-7.8,z:0},{number:5,x:1.4,z:0},{number:6,x:10.6,z:0},{number:7,x:1.4,z:8.5}
].map((seat,index)=>Object.freeze({...seat,...MODELS[index],modelId:MODELS[index].id})));
// Walls stand about 2 m tall at the desks' scale (a 0.75 m desk is 1.7 units).
const WALL_HEIGHT=4.55,CUT_WALL_HEIGHT=.6;
const BASE_ROOM = Object.freeze({width:22,depth:14,wallHeight:WALL_HEIGHT});
export const ROOM = Object.freeze({width:30.8,depth:28,wallHeight:WALL_HEIGHT});
export const PORTRAIT_ROOM = Object.freeze({width:22,depth:31,wallHeight:WALL_HEIGHT});
export const PHONE_ROOM = Object.freeze({width:10.8,depth:57.5,wallHeight:WALL_HEIGHT});
export const VIEW = Object.freeze({yaw:.14,portraitYaw:.04,phoneYaw:0,elevation:.59});
export const CHAIR = Object.freeze({workingZ:.90,parkedZ:1.65});
export const PANEL = Object.freeze({height:100,gap:12});
// Free orbit: any heading, from a low three-quarter view to nearly top-down.
export const CAMERA_LIMITS=Object.freeze({minYaw:-Infinity,maxYaw:Infinity,minElevation:.2,maxElevation:1.45,minZoom:.6,maxZoom:4});
export function cameraLimits(){return CAMERA_LIMITS;}
export const PIN=Object.freeze({compactWidth:48,compactHeight:26});
const geometries = new Map();
function cached(key,make){if(!geometries.has(key))geometries.set(key,make());return geometries.get(key);}
// Thin parts need fewer corner segments; the saved triangles pay for the room decor.
function rounded(w,h,d,r=.08){const thin=Math.min(w,h,d);return cached(`b:${w}:${h}:${d}:${r}`,()=>new T.RoundedBoxGeometry(w,h,d,thin<.03?1:thin<.2?2:3,Math.min(r,w/3,h/3,d/3)));}
function merged(key,build){return cached(key,()=>{const kit=primitiveKit(),geometry=mergeParts(build(kit));kit.dispose();return geometry;});}
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
function makeBowtie(parent,mat,kind,centerY){
  for(const side of [-1,1]){const wing=surfaceBall(parent,mat,side<0?'bowtie-left':'bowtie-right',kind,side*.14,centerY,.15,.095,.06,.045);wing.rotation.z=side*-.12;}
  surfaceBall(parent,mat,'bowtie-knot',kind,0,centerY,.055,.065,.07,.06);
}
// Nudge a face point toward the centre until it sits safely inside the outline.
function pullInside(kind,x,y,margin=.035){const p=DOT_PROFILES[kind];for(let i=0;i<60;i++){const nx=x/p.sx,ny=(y-p.centerY)/p.sy;if(Math.hypot(nx,ny)<p.radius(Math.atan2(ny,nx))-margin)break;x*=.97;y=p.centerY+(y-p.centerY)*.97;}return[x,y];}
function ringPoints(cx,cy,rx,ry,count=48){return Array.from({length:count},(_,i)=>{const a=i*Math.PI*2/count;return[cx+rx*Math.cos(a),cy+ry*Math.sin(a)];});}
// Wire spectacles: two rims, a bridge, and temples that run back along the head.
function spectacles(face,mat,kind,{y,cx,rx,ry,wire}){
  for(const side of [-1,1])tangentEyewear(face,mat,side<0?'glasses-left-rim':'glasses-right-rim',kind,side*cx,y,ringPoints(side*cx,y,rx,ry),wire);
  surfaceTube(face,mat,'glasses-bridge',kind,[[-(cx-rx)-.01,y+ry*.25],[0,y+ry*.55],[cx-rx+.01,y+ry*.25]],wire*.95);
  const edge=dotHalfWidthAt(kind,y)*.9;
  if(edge>cx+rx+.03)for(const side of [-1,1])surfaceTube(face,mat,'glasses-temple',kind,[[side*(cx+rx),y+.005],[side*(cx+rx+edge)/2,y+.012],[side*edge,y+.01]],wire*.9);
}
// Eye height (fraction of body height from the base) and spacing (fraction of
// half-width), measured from the official character art.
const FACE=Object.freeze({cloud:[.58,.16],alfred:[.53,.2],star:[.53,.2],bean:[.57,.2],puff:[.58,.21],heart:[.60,.21],triangle:[.57,.19]});
// Smooth matte bodies, like soft-touch clay: no clear coat and no sharp highlights.
function bodyMaterial(color){return new T.MeshStandardMaterial({color,roughness:.9,metalness:0});}
function makeDot(pivot,seat,palette){
  const group=new T.Group();group.name=`dot-${seat.number}`;group.position.y=1.84;pivot.add(group);
  const kind=seat.shape,profile=DOT_PROFILES[kind];const bodyMat=bodyMaterial(seat.color);const body=new T.Group();body.name='body-volume';group.add(body);
  const bodyGeometry=cached(`rounded-dot:${kind}`,()=>createRoundedDotGeometry(kind));
  mesh(body,bodyGeometry,bodyMat,`body-${kind}`);
  const face=new T.Group();face.name='front-face';group.add(face);
  const [eyeHeight,eyeSpread]=FACE[kind],eyeY=profile.minY+(profile.maxY-profile.minY)*eyeHeight,eyeX=profile.halfWidth*eyeSpread;
  for(const side of [-1,1])surfaceBall(face,palette.eyes,side<0?'eye-left':'eye-right',kind,side*eyeX,eyeY,.034,.062,.026,.022);
  if(seat.accessory==='headset'){
    // A thick band over the crown and round cushioned cups on both sides.
    const cupY=profile.centerY+.05,reach=dotHalfWidthAt(kind,cupY)+.03;
    const band=detailRing(group,palette.accessory,'headset-band',reach,.05,0,cupY,-.05,Math.PI);band.scale.y=(profile.maxY+.08-cupY)/reach;
    for(const side of [-1,1]){ball(group,palette.accessory,'ear-cup',.12,.21,.22,side*(reach+.02),cupY,-.03);ball(group,palette.accessory,'ear-cup-pad',.06,.17,.18,side*(reach-.05),cupY,-.03);}
  }
  if(seat.accessory==='roundGlasses')spectacles(face,palette.accessory,kind,{y:eyeY,cx:eyeX+.055,rx:.145,ry:.145,wire:.016});
  if(seat.accessory==='readingGlasses')spectacles(face,palette.wire,kind,{y:eyeY-.13,cx:eyeX+.02,rx:.125,ry:.072,wire:.012});
  if(seat.accessory==='moon'){
    // A polished silver crescent pinned to the upper-right shoulder.
    const mx=profile.halfWidth*.36,my=profile.centerY+.31,parts=[];
    for(let i=0;i<=16;i++){const t=i/16,a=Math.PI*(.6+1.25*t),r=.014+.03*Math.sin(Math.PI*t),x=mx+.105*Math.cos(a),y=my+.105*Math.sin(a),surface=dotFrontSurface(kind,x,y);parts.push({g:cached('moon-bead',()=>new T.SphereGeometry(1,10,8)),p:new T.Vector3(x,y,surface.z).addScaledVector(surface.normal,.024).toArray(),q:new T.Quaternion().setFromUnitVectors(new T.Vector3(0,0,1),surface.normal),s:[r,r,r*.6]});}
    const moon=mesh(face,cached(`moon-pin:${kind}`,()=>mergeParts(parts)),palette.silver,'moon-pin');moon.userData.surfaceDecoration=true;
  }
  if(seat.accessory==='beret'){
    // A large felt beret tipped toward the left, with its little stalk.
    const beret=new T.Group();beret.name='beret';beret.position.set(-.08,profile.maxY-.04,0);beret.rotation.z=.24;group.add(beret);
    ball(beret,palette.accessory,'beret-crown',.8,.22,.64,0,.03,0);
    const rim=detailRing(beret,palette.accessory,'beret-soft-rim',.6,.06,0,-.07,0);rim.rotation.x=Math.PI/2;rim.scale.y=.84;
    ball(beret,palette.accessory,'beret-tip',.055,.07,.05,-.06,.27,0);
  }
  if(seat.accessory==='bandana'){
    // A neckerchief: a front triangle, a band round the back, and a side knot.
    const top=profile.minY+(profile.maxY-profile.minY)*.4,tip=profile.minY+.07,half=dotHalfWidthAt(kind,top)*.9;
    const g=cached(`bandana:${kind}`,()=>{const rows=10,cols=14,pos=[],idx=[];
      for(let r=0;r<=rows;r++){const t=r/rows,y=top+(tip-top)*t,left=-half+(half-.03)*t*.98,right=half-(half+.03)*t*.98;for(let c=0;c<=cols;c++){const [x,yy]=pullInside(kind,left+(right-left)*c/cols,y);pos.push(x,yy,dotFrontSurface(kind,x,yy).z+.03);}}
      for(let r=0;r<rows;r++)for(let c=0;c<cols;c++){const a=r*(cols+1)+c,b=a+1,d=a+cols+1,e=d+1;idx.push(a,d,b,b,d,e);}
      const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32BufferAttribute(pos,3));geometry.setIndex(idx);geometry.computeVertexNormals();return geometry;});
    const cloth=mesh(face,g,palette.bandana,'bandana-front');cloth.userData.surfaceDecoration=true;
    const path=[];for(let i=0;i<64;i++){const a=i*Math.PI*2/64;let lo=0,hi=1.6;for(let j=0;j<30;j++){const r=(lo+hi)/2;if(dotImplicit(kind,r*Math.cos(a),top,r*Math.sin(a))>0)hi=r;else lo=r;}const r=(lo+hi)/2,x=r*Math.cos(a),z=r*Math.sin(a);path.push(new T.Vector3(x,top,z).addScaledVector(dotSurfaceNormal(kind,x,top,z),.03));}
    mesh(group,cached(`bandana-band:${kind}`,()=>new T.TubeGeometry(new T.CatmullRomCurve3(path,true,'centripetal'),96,.045,10,true)),palette.bandana,'bandana-band');
    const knotX=half*.95,[kx,ky]=pullInside(kind,knotX*.92,top),knot=dotFrontSurface(kind,kx,ky);surfaceBall(face,palette.bandana,'bandana-knot',kind,kx,ky,.065,.06,.05,.04);
    for(const [tilt,len] of [[.55,.13],[-.35,.11]]){const tail=ball(group,palette.bandana,'bandana-tail',len,.045,.035,knotX+len*.75,top+Math.sin(tilt)*len*.8,knot.z-.04);tail.rotation.z=tilt;}
  }
  if(seat.accessory==='bowtie')makeBowtie(face,palette.accessory,kind,profile.minY+.19);
  // The dot rests directly on the cushion. Only two hands remain; no feet or legs.
  // Idle paws rest low at the sides, as in the official art; typing raises them to the keys.
  const restY=profile.minY+.3,restX=dotHalfWidthAt(kind,restY)*.72;
  const hands=[-1,1].map((side,i)=>{const hand=ball(group,bodyMat,`hand-${i}`,.11,.09,.13,side*.28,-.18,.58);Object.assign(hand.userData,{raisedX:side*.28,idleX:side*restX,idleY:restY,idleZ:dotFrontSurface(kind,side*restX,restY).z+.04});return hand;});
  group.userData={shape:kind,accessory:seat.accessory};
  return {group,body,face,hands,bodyMat};
}
function cloneDot(parent,template,number){
  const group=template.group.clone(true);group.name=`dot-${number}`;group.traverse(object=>{object.userData.seatNumber=number;});parent.add(group);
  return{group,body:group.getObjectByName('body-volume'),face:group.getObjectByName('front-face'),hands:[group.getObjectByName('hand-0'),group.getObjectByName('hand-1')],bodyMat:template.bodyMat};
}
export function setStationModel(office,number,modelId){
  const station=office.stations.get(number),template=office.modelTemplates.get(modelId);if(!station||!template)throw Error('Unknown workstation model');if(station.modelId===modelId)return false;
  station.swivel.remove(station.dot.group);station.dot=cloneDot(station.swivel,template,number);station.modelId=modelId;paintStationAccent(office,station);return true;
}
// The mug carries the character's colour; the rug is a softened tint of it.
function paintStationAccent(office,station){
  const color=new T.Color(MODELS.find(model=>model.id===station.modelId).color);
  station.mugMat.color.copy(color);station.rugMat.color.copy(color).lerp(new T.Color(office.dark?0x2c3048:0xffffff),office.dark?.66:.5);
}
function makeStation(scene,seat,p,templates,textures){
  const group=new T.Group();group.name=`seat-${seat.number}`;group.position.set(seat.x,0,seat.z);scene.add(group);
  // An oval rug in a soft tint of the seat's colour marks each workstation.
  const rugGeometry=cached('rug',()=>new T.CylinderGeometry(1,1,.03,48));
  const rugBorder=mesh(group,rugGeometry,p.rugBorder,'rug-border',0,.045,1.2);rugBorder.scale.set(1.5,1,1.1);rugBorder.castShadow=false;
  const rugMat=material(0xffffff,{roughness:1});const rug=mesh(group,rugGeometry,rugMat,'rug',0,.052,1.2);rug.scale.set(1.36,1,.97);rug.castShadow=false;
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
  // Each screen shows a slice of a tiling code texture; working seats scroll it.
  const screenMap=textures.screens[seat.number%textures.screens.length].clone();screenMap.repeat.set(1,.5);screenMap.offset.y=(seat.number*5%16)/16;
  const screenFace=new T.Mesh(cached('screen-face',()=>new T.PlaneGeometry(1.30,.74)),new T.MeshBasicMaterial({map:screenMap}));screenFace.name='screen-code';screenFace.position.set(0,2.35,-1.364);screenUi.add(screenFace);
  screenUi.visible=false;
  box(desk,p.keys,'keyboard',1.16,.055,.41,0,1.738,-.21,.025);
  for(let i=0;i<3;i++)box(desk,p.keyCaps,'key-row',1.00,.012,.045,0,1.774,-.34+i*.105,.007);
  const keyCaps=[-.32,.32].map((x,i)=>box(desk,p.keyCaps,`active-key-${i}`,.14,.020,.075,x,1.781,-.22,.009));
  ball(desk,p.keys,'mouse',.14,.046,.20,.93,1.75,-.21);
  const mugMat=material(0xffffff,{roughness:.42});
  cylinder(desk,mugMat,'mug',.12,.10,.23,-1.26,1.82,-1.05);
  const mugHandle=torus(desk,mugMat,'mug-handle',.073,.026,-1.10,1.83,-1.05);mugHandle.rotation.y=Math.PI/2;
  mesh(desk,merged('desk-decor',deskDecorParts),p.decor,'desk-decor');
  mesh(desk,merged('desk-lamp-shade',deskLampShadeParts),p.glow,'desk-lamp-shade');
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
  const station={number:seat.number,group,desk,base,swivel,dot,chairBack,screen,screenUi,screenMaterial,screenMap,keyCaps,anchor,mugMat,rugMat,working:false,targetYaw:VIEW.yaw,poseMoving:false,modelId:seat.modelId};
  group.traverse(object=>{object.userData.seatNumber=seat.number;});
  return station;
}
// The back wall in room-local units. With an opening it is four boxes framing the
// window, so the view passes straight through; a cut-away stub stays solid.
function backWallGeometry(opening=null,scaleX=1){
  const W=BASE_ROOM.width,H=WALL_HEIGHT,D=.24,parts=[];
  const add=(x0,x1,y0,y1)=>{if(x1-x0>1e-3&&y1-y0>1e-3)parts.push({g:new T.BoxGeometry(x1-x0,y1-y0,D),p:[(x0+x1)/2,(y0+y1)/2,0]});};
  if(!opening)add(-W/2,W/2,0,H);
  else{const x0=(opening.x-opening.halfWidth)/scaleX,x1=(opening.x+opening.halfWidth)/scaleX;add(-W/2,W/2,0,opening.bottom);add(-W/2,W/2,opening.top,H);add(-W/2,x0,opening.bottom,opening.top);add(x1,W/2,opening.bottom,opening.top);}
  const geometry=mergeParts(parts);parts.forEach(part=>part.g.dispose());geometry.type=opening?'OpenBackWallGeometry':'BackWallGeometry';return geometry;
}
export function buildOffice(){
  const textures={wood:woodTexture(),screens:[1,2,3].map(screenTexture)};
  const scene=new T.Scene();const p={desk:material(0xfdfcfa,{roughness:.5}),floor:material(0xffffff,{roughness:.6,map:textures.wood}),wall:material(0xf6f0e8,{roughness:.92}),wallPanel:material(0xe9dfd2,{roughness:.9}),trim:material(0xffffff,{roughness:.7}),slab:material(0xcaa47c,{roughness:.8}),edge:material(0xe6dccd),legs:material(0xb4bccb,{metalness:.6,roughness:.34}),monitor:material(0x2c3240,{roughness:.42}),keys:material(0xeef0f5),keyCaps:material(0xb3bfd1),chair:material(0xc5cedc,{roughness:.88}),wheels:material(0x3a4253),eyes:material(0x11161d,{roughness:.16}),accessory:material(0x292b34,{roughness:.85}),wire:material(0x34363e,{roughness:.32,metalness:.45}),silver:material(0xdfe3ea,{roughness:.2,metalness:.95}),bandana:material(0x1f5fd8,{roughness:.82}),rugBorder:material(0xf6efe3,{roughness:1}),
    decor:new T.MeshStandardMaterial({vertexColors:true,roughness:.78,metalness:0}),glow:new T.MeshStandardMaterial({vertexColors:true,roughness:.55,metalness:0,emissive:0xffc27a,emissiveIntensity:0})};
  const room=new T.Group();room.name='volumetric-room';scene.add(room);
  const wallFace=-BASE_ROOM.depth/2+.20,leftFace=-BASE_ROOM.width/2+.20;
  box(room,p.slab,'foundation',BASE_ROOM.width,.34,BASE_ROOM.depth,0,-.23,0,.24);
  box(room,p.floor,'floor',BASE_ROOM.width-.12,.09,BASE_ROOM.depth-.12,0,-.01,0,.20);
  const backWall=new T.Group();backWall.name='back-wall-assembly';room.add(backWall);const leftWall=new T.Group();leftWall.name='left-wall-assembly';room.add(leftWall);
  const solidBack=backWallGeometry(),backMesh=mesh(backWall,solidBack,p.wall,'back-wall',0,0,-BASE_ROOM.depth/2+.08);
  // The side wall is cut away before the desks; the near edge stays open.
  box(leftWall,p.wall,'left-wall',.24,BASE_ROOM.wallHeight,3.05,-BASE_ROOM.width/2+.08,BASE_ROOM.wallHeight/2,-5.43,.10);
  box(room,p.edge,'left-cutaway',.21,.28,10.8,-BASE_ROOM.width/2+.08,.10,1.05,.07);
  // Two-tone walls: a wainscot panel, a chair rail, and capped tops.
  box(backWall,p.wallPanel,'back-wainscot',BASE_ROOM.width-.4,1.9,.015,0,1.03,wallFace+.0075,.006);
  box(backWall,p.trim,'back-chair-rail',BASE_ROOM.width-.4,.05,.04,0,2.0,wallFace+.02,.012);
  box(leftWall,p.wallPanel,'left-wainscot',.015,1.9,2.85,leftFace+.0075,1.03,-5.53,.006);
  box(leftWall,p.trim,'left-chair-rail',.04,.05,2.85,leftFace+.02,2.0,-5.53,.012);
  box(backWall,p.trim,'back-wall-cap',BASE_ROOM.width,.06,.28,0,BASE_ROOM.wallHeight+.03,-BASE_ROOM.depth/2+.08,.02);
  box(leftWall,p.trim,'left-wall-cap',.28,.06,3.05,-BASE_ROOM.width/2+.08,BASE_ROOM.wallHeight+.03,-5.43,.02);
  box(room,p.trim,'back-skirt',BASE_ROOM.width-.35,.09,.055,0,.075,-BASE_ROOM.depth/2+.23,.018);
  const decor=buildDecor(p);scene.add(decor.group);
  const modelTemplates=new Map(MODELS.map(model=>[model.id,makeDot(new T.Group(),{...model,number:0},p)]));
  const stations=new Map(SEATS.map(seat=>[seat.number,makeStation(scene,seat,p,modelTemplates,textures)]));
  // Warm key light, cool fill and a soft rim keep the plush bodies rounded.
  const hemi=new T.HemisphereLight(0xfff8ee,0xd9c6b0,1.7);scene.add(hemi);
  const sun=new T.DirectionalLight(0xfff0de,2.3);sun.position.set(-6,16,9);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);sun.shadow.camera.left=-17;sun.shadow.camera.right=17;sun.shadow.camera.top=20;sun.shadow.camera.bottom=-20;sun.shadow.camera.near=1;sun.shadow.camera.far=55;sun.shadow.normalBias=.025;sun.shadow.bias=-.0002;sun.shadow.radius=3;sun.shadow.intensity=.58;scene.add(sun);
  const fill=new T.DirectionalLight(0xdce8ff,.7);fill.position.set(8,7,6);scene.add(fill);
  const rim=new T.DirectionalLight(0xffe6cc,.55);rim.position.set(2,9,-14);scene.add(rim);
  const camera=new T.OrthographicCamera(-15,15,10,-10,.1,100);
  const office={scene,room,decor,stations,modelTemplates,palette:p,textures,hemi,sun,fill,rim,camera,walls:{back:backWall,left:leftWall,backMesh,solidBack,openBack:null,backCut:false,leftCut:false},yaw:VIEW.yaw,elevation:VIEW.elevation,zoom:1,target:{x:0,z:0},frame:{width:1,height:1},dark:false,layout:null,roomSize:ROOM};
  setTheme(office,false);setCamera(office,1000,600);for(const station of stations.values())stepStation(station,0,0,false,VIEW.yaw);return office;
}
// Light theme is a sunny studio; dark theme is the same room at night, lit by
// desk lamps and moonlight. Only colours and light levels change.
export function setTheme(office,dark){
  office.dark=dark;const p=office.palette;
  for(const [key,day,night] of [['floor',0xffffff,0x7a7790],['wall',0xf6f0e8,0x454a68],['wallPanel',0xe9dfd2,0x3a3f5c],['trim',0xffffff,0x5c6386],['slab',0xcaa47c,0x2c2e44],['edge',0xe6dccd,0x34384f],['desk',0xfdfcfa,0xb4b9cc],['chair',0xc5cedc,0x7d8aa6],['decor',0xffffff,0x9ea3c0],['rugBorder',0xf6efe3,0x77768f]])p[key].color.set(dark?night:day);
  p.glow.emissiveIntensity=dark?1.7:0;
  office.hemi.color.set(dark?0x9aa4d8:0xfff8ee);office.hemi.groundColor.set(dark?0x2d2b40:0xd9c6b0);office.hemi.intensity=dark?1.0:1.15;
  office.sun.color.set(dark?0xb9c6ff:0xfff0de);office.sun.intensity=dark?.9:2.6;office.fill.intensity=dark?.4:.55;office.rim.intensity=dark?.4:.6;
  office.scene.environmentIntensity=dark?.18:.32;
  setDecorTheme(office.decor,dark);for(const station of office.stations.values())paintStationAccent(office,station);
}
export function setLayout(office,layout){
  if(office.layout===layout)return false;
  office.layout=layout;office.roomSize=layout==='phone'?PHONE_ROOM:layout==='portrait'?PORTRAIT_ROOM:ROOM;const size=office.roomSize;
  office.room.scale.set(size.width/BASE_ROOM.width,1,size.depth/BASE_ROOM.depth);
  // Keep floorboards the same real size whatever the room's proportions.
  office.textures.wood.repeat.set(size.width/4,size.depth/4);layoutDecor(office.decor,layout,size);
  const walls=office.walls;walls.openBack?.dispose();walls.openBack=backWallGeometry(windowOpening(layout),size.width/BASE_ROOM.width);walls.backMesh.geometry=walls.backCut?walls.solidBack:walls.openBack;
  office.sun.shadow.camera.left=-size.width/2-8;office.sun.shadow.camera.right=size.width/2+8;office.sun.shadow.camera.top=size.depth/2+5;office.sun.shadow.camera.bottom=-size.depth/2-5;office.sun.shadow.camera.updateProjectionMatrix();
  for(const seat of SEATS){const station=office.stations.get(seat.number),i=seat.number-1;
    const x=layout==='phone'?2.5:layout==='portrait'?(i%2?6.0:-3.6):seat.x;
    const z=layout==='phone'?(-25.5+i*8.5):layout==='portrait'?(-10.95+Math.floor(i/2)*7.3):seat.z;
    station.group.position.set(x,0,z);
  }
  office.yaw=layout==='phone'?VIEW.phoneYaw:layout==='portrait'?VIEW.portraitYaw:VIEW.yaw;office.zoom=1;office.target={x:0,z:0};office.scene.updateMatrixWorld(true);return true;
}
function orbit(camera,yaw,elevation){
  const radius=36;camera.position.set(Math.sin(yaw)*Math.cos(elevation)*radius,Math.sin(elevation)*radius,Math.cos(yaw)*Math.cos(elevation)*radius);
  camera.lookAt(0,.55,0);camera.updateMatrixWorld(true);
}
function roomViewBounds(office){
  const size=office.roomSize,bounds=new T.Box3();
  for(const x of [-size.width/2,size.width/2])for(const y of [-.45,size.wallHeight+.1])for(const z of [-size.depth/2,size.depth/2])bounds.expandByPoint(new T.Vector3(x,y,z).applyMatrix4(office.camera.matrixWorldInverse));
  return bounds;
}
// A wall between the camera and the room drops to a low stub, taking its
// mounted decor with it, so every heading keeps a clear view of the desks.
function cutAwayWalls(office){
  const walls=office.walls,back=Math.cos(office.yaw)<-.02,left=Math.sin(office.yaw)<-.02;
  if(back===walls.backCut&&left===walls.leftCut)return false;
  walls.backCut=back;walls.leftCut=left;walls.backMesh.geometry=back?walls.solidBack:walls.openBack;walls.back.scale.y=back?CUT_WALL_HEIGHT/WALL_HEIGHT:1;walls.left.scale.y=left?CUT_WALL_HEIGHT/WALL_HEIGHT:1;
  setMountedDecorVisible(office.decor,!back);office.scene.updateMatrixWorld(true);return true;
}
/** Fit the room, then apply orbit, zoom and pan. Returns true when a wall was cut away or restored. */
export function setCamera(office,width,height){
  setLayout(office,width<760?'phone':width<1180?'portrait':'wide');
  const aspect=Math.max(.25,width/Math.max(1,height));const {yaw,elevation,target}=office;
  // Scale comes from the layout's home heading so the room does not breathe while orbiting.
  orbit(office.camera,office.layout==='phone'?VIEW.phoneYaw:office.layout==='portrait'?VIEW.portraitYaw:VIEW.yaw,elevation);
  const home=roomViewBounds(office);
  const h=Math.max(home.max.y-home.min.y+1.25,(home.max.x-home.min.x+1.15)/aspect)/office.zoom;
  orbit(office.camera,yaw,elevation);const bounds=roomViewBounds(office);
  // Panning slides the frame across the floor while the orbit keeps its pivot.
  const panX=target.x*Math.cos(yaw)-target.z*Math.sin(yaw),panY=-Math.sin(elevation)*(target.x*Math.sin(yaw)+target.z*Math.cos(yaw));
  const cx=(bounds.max.x+bounds.min.x)/2+panX,cy=(bounds.max.y+bounds.min.y)/2+panY;
  office.camera.left=cx-h*aspect/2;office.camera.right=cx+h*aspect/2;office.camera.top=cy+h/2;office.camera.bottom=cy-h/2;office.camera.updateProjectionMatrix();
  office.frame={width:h*aspect,height:h};
  return cutAwayWalls(office);
}
/** Move the view by a frame-space offset (scene units); the pivot stays on the floor inside the room. */
export function panView(office,dx,dy){
  const {yaw}=office,lift=Math.max(.2,Math.sin(office.elevation)),size=office.roomSize;
  const x=office.target.x+Math.cos(yaw)*dx-Math.sin(yaw)*dy/lift,z=office.target.z-Math.sin(yaw)*dx-Math.cos(yaw)*dy/lift;
  office.target={x:T.MathUtils.clamp(x,-size.width/2,size.width/2),z:T.MathUtils.clamp(z,-size.depth/2,size.depth/2)};
}
/** Zoom while keeping the point under (ndcX, ndcY) fixed on screen. */
export function zoomView(office,zoom,ndcX=0,ndcY=0){
  const next=T.MathUtils.clamp(zoom,CAMERA_LIMITS.minZoom,CAMERA_LIMITS.maxZoom),keep=1-office.zoom/next;
  office.zoom=next;panView(office,ndcX*office.frame.width/2*keep,ndcY*office.frame.height/2*keep);
}
export function setWorking(station,working,{instant=false,idleYaw=VIEW.yaw}={}){
  station.working=Boolean(working);station.targetYaw=working?Math.PI:idleYaw;
  station.screenMaterial.color.set(working?0x2a3157:0x101725);station.screenMaterial.emissive.set(working?0x6d86ea:0x000000);station.screenMaterial.emissiveIntensity=working?.65:0;station.screenUi.visible=Boolean(working);
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
  station.dot.hands.forEach((hand,i)=>{const rest=hand.userData;hand.position.x=raisedHands?rest.raisedX:rest.idleX;hand.position.y=raisedHands?.040+(active?Math.sin(phase+i*Math.PI)*.022:0):rest.idleY;hand.position.z=raisedHands?.78:rest.idleZ;hand.rotation.x=raisedHands?-.35:0;});
  station.keyCaps.forEach((key,i)=>{key.position.y=1.781-(active?Math.max(0,Math.sin(phase+i*Math.PI))*.018:0);});
  // New lines of code appear while typing; a paused screen keeps its last frame.
  if(active)station.screenMap.offset.y=(16-Math.floor(time*1.7+station.number*5)%16)/16;
  return motion&&(station.working||station.poseMoving);
}
export function updateOffice(office,time,dt,motion){let active=false;for(const station of office.stations.values())active=stepStation(station,time,dt,motion,VIEW.yaw)||active;office.scene.updateMatrixWorld(true);return active;}
function projectedBounds(root,camera,width,height){
  const box=new T.Box3().setFromObject(root),bounds={left:Infinity,right:-Infinity,top:Infinity,bottom:-Infinity};
  for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z]){const p=new T.Vector3(x,y,z).project(camera),px=(p.x*.5+.5)*width,py=(-p.y*.5+.5)*height;bounds.left=Math.min(bounds.left,px);bounds.right=Math.max(bounds.right,px);bounds.top=Math.min(bounds.top,py);bounds.bottom=Math.max(bounds.bottom,py);}
  return bounds;
}
export function projectAnchors(office,width,height){
  const panelWidth=width<760?132:width<1180?132:140;
  const gap=office.layout==='portrait'?24:PANEL.gap;
  const seats=[...office.stations.values()].map(station=>({station,stationBounds:projectedBounds(station.group,office.camera,width,height),bodyBounds:projectedBounds(station.dot.body,office.camera,width,height)}));
  const inside=r=>r.x>=6&&r.y>=6&&r.x+r.width<width-6&&r.y+r.height<height-6;
  const overlaps=(a,b)=>a.x<b.x+b.width&&a.x+a.width>b.x&&a.y<b.y+b.height&&a.y+a.height>b.y;
  const area=b=>({x:b.left,y:b.top,width:b.right-b.left,height:b.bottom-b.top});
  const cards=[];
  // A full card needs its own aisle left of its station, clear of every other
  // station and card. Otherwise a small tag floats above the character, so an
  // orbited, zoomed or panned view never buries a workstation under cards.
  return seats.map(({station,stationBounds,bodyBounds})=>{
    const base={number:station.number,stationBounds,bodyBounds};
    const card={x:stationBounds.left-panelWidth-gap,y:(bodyBounds.top+bodyBounds.bottom-PANEL.height)/2,width:panelWidth,height:PANEL.height};
    if(inside(card)&&!seats.some(other=>other.station!==station&&overlaps(card,area(other.stationBounds)))&&!cards.some(other=>overlaps(card,other))){cards.push(card);return{...base,...card,visible:true,compact:false};}
    const tag={x:(bodyBounds.left+bodyBounds.right-PIN.compactWidth)/2,y:bodyBounds.top-PIN.compactHeight-8,width:PIN.compactWidth,height:PIN.compactHeight};
    return{...base,...tag,visible:inside(tag),compact:true};
  });
}
export function disposeOffice(office){
  const mats=new Set(),textures=new Set([office.textures.wood,...office.textures.screens]);
  office.scene.traverse(o=>{if(o.isMesh){for(const mat of Array.isArray(o.material)?o.material:[o.material])mats.add(mat);}});
  for(const template of office.modelTemplates.values())template.group.traverse(object=>{if(object.isMesh)for(const mat of Array.isArray(object.material)?object.material:[object.material])mats.add(mat);});
  mats.forEach(mat=>{if(mat.map)textures.add(mat.map);mat.dispose();});textures.forEach(texture=>texture.dispose());
  for(const cluster of office.decor.clusters.values())cluster.traverse(o=>{if(o.isMesh)o.geometry.dispose();});office.walls.solidBack.dispose();office.walls.openBack?.dispose();
  office.modelTemplates.clear();office.sun.shadow.dispose();/* Geometries are shared only within this scene module. */geometries.forEach(g=>g.dispose());geometries.clear();
}
