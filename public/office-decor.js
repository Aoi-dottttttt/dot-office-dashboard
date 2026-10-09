import * as T from './vendor/three.js';

// Cosy room decor. Hundreds of small primitives are merged into a few
// vertex-coloured meshes so the details cost very few draw calls, and every
// texture is generated in memory: no image requests, canvas or network.
const UP=new T.Vector3(0,1,0);
const matrix=new T.Matrix4(),quat=new T.Quaternion(),euler=new T.Euler(),scale=new T.Vector3(),pos=new T.Vector3(),tint=new T.Color();
export function seeded(seed){let s=seed>>>0||1;return()=>{s=(s+0x6d2b79f5)>>>0;let t=s;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296;};}

/** Part: {g:geometry,c:hex colour,p:[x,y,z],r:[x,y,z] Euler,q:Quaternion,s:number|[x,y,z]} */
export function mergeParts(parts){
  let count=0;
  const prepared=parts.map(part=>{
    const g=part.g.index?part.g.toNonIndexed():part.g.clone();
    if(part.q)quat.copy(part.q);else quat.setFromEuler(euler.set(...(part.r||[0,0,0])));
    const s=part.s??1;scale.set(...(Array.isArray(s)?s:[s,s,s]));
    g.applyMatrix4(matrix.compose(pos.set(...(part.p||[0,0,0])),quat,scale));count+=g.attributes.position.count;return[g,part.c??0xffffff];
  });
  const position=new Float32Array(count*3),normal=new Float32Array(count*3),color=new Float32Array(count*3);let offset=0;
  for(const [g,hex] of prepared){
    const n=g.attributes.position.count;position.set(g.attributes.position.array,offset*3);normal.set(g.attributes.normal.array,offset*3);
    tint.set(hex);for(let i=offset;i<offset+n;i++){color[i*3]=tint.r;color[i*3+1]=tint.g;color[i*3+2]=tint.b;}offset+=n;g.dispose();
  }
  const geometry=new T.BufferGeometry();geometry.type='MergedDecorGeometry';
  geometry.setAttribute('position',new T.Float32BufferAttribute(position,3));geometry.setAttribute('normal',new T.Float32BufferAttribute(normal,3));geometry.setAttribute('color',new T.Float32BufferAttribute(color,3));
  geometry.computeBoundingBox();geometry.computeBoundingSphere();return geometry;
}
export function primitiveKit(){
  const cache=new Map(),get=(key,make)=>{if(!cache.has(key))cache.set(key,make());return cache.get(key);};
  return{
    box:(w,h,d,r=.02,seg=1)=>get(`b:${w}:${h}:${d}:${r}:${seg}`,()=>new T.RoundedBoxGeometry(w,h,d,seg,r)),
    cyl:(rt,rb,h,n=16)=>get(`c:${rt}:${rb}:${h}:${n}`,()=>new T.CylinderGeometry(rt,rb,h,n)),
    ball:(n=12,m=8)=>get(`s:${n}:${m}`,()=>new T.SphereGeometry(1,n,m)),
    ring:(r,t,n=24)=>get(`t:${r}:${t}:${n}`,()=>new T.TorusGeometry(r,t,6,n)),
    plane:(w,h)=>get(`p:${w}:${h}`,()=>new T.PlaneGeometry(w,h)),
    dispose(){cache.forEach(g=>g.dispose());cache.clear();}
  };
}
export function stick(k,a,b,r,c,n=8){
  const from=new T.Vector3(...a),to=new T.Vector3(...b),dir=to.clone().sub(from),length=dir.length();
  return{g:k.cyl(r,r,1,n),c,p:from.add(to).multiplyScalar(.5).toArray(),q:new T.Quaternion().setFromUnitVectors(UP,dir.normalize()),s:[1,length,1]};
}
// An ellipsoid leaf whose inner tip sits at the stem and points outward.
function leaf(k,angle,dist,y,length,width,tilt,c,thick=.022){
  const ca=Math.cos(angle),sa=Math.sin(angle),reach=dist+length*Math.cos(tilt);
  return{g:k.ball(),c,p:[ca*reach,y+length*Math.sin(tilt),sa*reach],r:[0,-angle,tilt],s:[length,thick,width]};
}
const GREENS=[0x4f9a68,0x63ad75,0x3f8a5d,0x79bb83,0x5aa271];
export function pottedPlant(k,{x=0,y=0,z=0,kind='bush',potR=.3,potH=.5,pot=0xe0937a,rim=0xd0846b,height=1,seed=1,flowers=[]}={}){
  const rand=seeded(seed),parts=[],top=y+potH,green=()=>GREENS[Math.floor(rand()*GREENS.length)];
  parts.push({g:k.cyl(potR,potR*.76,potH,18),c:pot,p:[x,y+potH/2,z]},{g:k.cyl(potR*1.06,potR*1.04,potH*.16,18),c:rim,p:[x,top-potH*.08,z]},{g:k.cyl(potR*.92,potR*.92,.02,14),c:0x6a5040,p:[x,top-.015,z]});
  const at=part=>{part.p=[part.p[0]+x,part.p[1],part.p[2]+z];return part;};
  if(kind==='monstera')for(let i=0;i<9;i++){
    const a=i*2.39996+seed,f=i/8,h=top+height*(.38+.6*f)*(.85+rand()*.2),d=potR*.25+.18*rand(),tilt=-.15+rand()*.5,bx=Math.cos(a)*d,bz=Math.sin(a)*d;
    parts.push(stick(k,[x,top,z],[x+bx,h,z+bz],.018,0x4a8a5c,6),at(leaf(k,a,d,h,.30+.12*rand(),.25+.07*rand(),tilt,green(),.03)));
  }
  if(kind==='bush')for(let i=0;i<11;i++){
    const a=i*2.39996+seed,f=rand(),r=potR*(.25+.75*Math.sqrt(f)),s=potR*(.48+.32*rand())*height;
    parts.push({g:k.ball(),c:green(),p:[x+Math.cos(a)*r,top+s*.55+height*potR*1.5*(1-f)*rand(),z+Math.sin(a)*r],s:[s,s*.86,s]});
  }
  if(kind==='snake')for(let i=0;i<7;i++){
    const a=i*2.39996+seed,d=potR*.45*rand(),h=height*(.6+.4*rand());
    parts.push({g:k.ball(10,8),c:i%2?0x3f7d55:0x5d9a63,p:[x+Math.cos(a)*d,top+h/2,z+Math.sin(a)*d],r:[Math.sin(a)*.18,a,Math.cos(a)*.18],s:[.06,h/2,.022]});
  }
  if(kind==='succulent')for(let i=0;i<8;i++){
    const a=i*2.39996+seed,tilt=.55+.35*(i/7);parts.push(at(leaf(k,a,.01,top,.07+.03*(1-i/8),.035,tilt,i%2?0x7cb98c:0x96c9a0,.03)));
  }
  flowers.forEach((c,i)=>{const a=i*2.39996+seed,d=potR*.5,h=top+height*(.55+.3*rand());parts.push(stick(k,[x,top,z],[x+Math.cos(a)*d,h,z+Math.sin(a)*d],.01,0x5f9a62,5),{g:k.ball(),c,p:[x+Math.cos(a)*d,h,z+Math.sin(a)*d],s:.075});});
  return parts;
}

// ---------- Procedural textures ----------
function dataTexture(w,h,paint,repeat=false){
  const data=new Uint8Array(w*h*4);
  const set=(x,y,r,g,b)=>{if(x<0||y<0||x>=w||y>=h)return;const i=(y*w+x)*4;data[i]=r;data[i+1]=g;data[i+2]=b;data[i+3]=255;};
  paint(set,w,h);const texture=new T.DataTexture(data,w,h);texture.colorSpace=T.SRGBColorSpace;texture.magFilter=T.LinearFilter;texture.minFilter=T.LinearMipmapLinearFilter;texture.generateMipmaps=true;
  if(repeat){texture.wrapS=T.RepeatWrapping;texture.wrapT=T.RepeatWrapping;}texture.needsUpdate=true;return texture;
}
export function woodTexture(){
  // Eight light-oak boards per tile with staggered joints, soft grain and seams.
  return dataTexture(256,256,(set,w,h)=>{
    const rand=seeded(11),rows=8,rowH=h/rows,tones=[[219,190,153],[209,178,140],[226,199,164],[202,171,133],[214,184,147],[222,196,163]];
    for(let row=0;row<rows;row++){
      const shift=(row*101+37)%w,boards=[0,1].map(()=>tones[Math.floor(rand()*tones.length)]),phase=rand()*10;
      for(let yy=0;yy<rowH;yy++)for(let x=0;x<w;x++){
        const local=(x-shift+w)%w,board=local<w/2?0:1,base=boards[board],v=yy/rowH;
        let k=1+.028*Math.sin(v*21+Math.sin(x*.045+phase+board*3)*1.7)+.018*Math.sin(x*.21+v*40+phase)+(rand()-.5)*.03;
        if(yy===0)k*=.68;else if(yy===1)k*=.88;if(local===0||local===w/2)k*=.72;
        set(x,row*rowH+yy,...base.map(c=>Math.max(0,Math.min(255,c*k))));
      }
    }
  },true);
}
const SYNTAX=[[122,162,255],[255,143,177],[155,226,155],[255,210,126],[199,184,255],[230,233,245],[118,214,230]];
export function screenTexture(seed){
  // A dark editor with syntax-coloured lines; it tiles vertically so code can scroll.
  return dataTexture(128,128,(set,w,h)=>{
    const rand=seeded(seed*97+3);
    for(let y=0;y<h;y++)for(let x=0;x<w;x++)set(x,y,...(x<12?[27,32,58]:[31,36,66]));
    let indent=0;
    for(let line=0;line<h/8;line++){
      const y0=line*8+3;if(rand()<.14){indent=Math.max(0,indent-1);continue;}
      for(let x=4;x<9;x++)for(let y=y0;y<y0+2;y++)set(x,y,74,82,120);
      indent=Math.max(0,Math.min(3,indent+(rand()<.3?1:rand()<.3?-1:0)));let x=16+indent*8;const tokens=1+Math.floor(rand()*3);
      for(let t=0;t<tokens&&x<w-6;t++){const len=6+Math.floor(rand()*26),c=SYNTAX[Math.floor(rand()*SYNTAX.length)];for(let i=0;i<len&&x+i<w-4;i++)for(let y=y0;y<y0+3;y++)set(x+i,y,...c);x+=len+4;}
    }
  },true);
}

// ---------- Decor clusters ----------
// Furniture is modelled in metres and each cluster is scaled uniformly by M,
// the scene's own ratio (a 0.75 m desk is 1.7 units tall), so sofas, counters
// and lamps share the desks' proportions. Wall clusters have their back on
// z=0 and extend toward +z (into the room).
export const M=1.7/.75;
const WOOD=0xd6ae84,WOOD_DARK=0xb98d64,WHITE=0xfaf7f2,GRAPHITE=0x3d4354,CORK=0xd4ab7c,DOT_COLORS=[0x2f9bef,0xffd52f,0xbf92ee,0xff8c78,0xf6f0df,0xe9408f,0xff9636];
// Plants are authored in scene units; convert them into a metre-space cluster.
function toMetres(parts,[x,y,z]=[0,0,0]){
  return parts.map(part=>{const s=part.s??1,p=part.p||[0,0,0];return{...part,p:[p[0]/M+x,p[1]/M+y,p[2]/M+z],s:Array.isArray(s)?s.map(v=>v/M):s/M};});
}
// The window is an open frame: the back wall has a matching opening behind the glass.
const WINDOW=Object.freeze({y:1.4,height:.9});
function windowParts(k,width){
  const parts=[],h=WINDOW.height,y=WINDOW.y,half=width/2;
  for(const [w,hh,px,py] of [[width+.1,.05,0,y+h/2+.02],[width+.1,.05,0,y-h/2-.02],[.05,h+.06,-half-.02,y],[.05,h+.06,half+.02,y],[.03,h,0,y],[width,.025,0,y+.16]])parts.push({g:k.box(w,hh,.05,.01),c:WHITE,p:[px,py,.025]});
  parts.push({g:k.box(width+.22,.03,.11,.01),c:WHITE,p:[0,y-h/2-.04,.055]});
  parts.push(stick(k,[-half-.42,1.93,.08],[half+.42,1.93,.08],.012,WOOD_DARK),{g:k.ball(),c:WOOD_DARK,p:[-half-.43,1.93,.08],s:.025},{g:k.ball(),c:WOOD_DARK,p:[half+.43,1.93,.08],s:.025});
  // Floor-length curtains gathered into soft folds either side.
  for(const side of [-1,1])for(let i=0;i<5;i++)parts.push({g:k.cyl(.034,.042,1.6,10),c:i%2?0xeadccb:0xf3e9dc,p:[side*(half+.06+i*.062),1.12,.08],s:[1,1,.6]});
  parts.push(...toMetres(pottedPlant(k,{kind:'succulent',potR:.11,potH:.15,pot:0xf2ede6,rim:0xe6dfd5,seed:4}),[half-.3,y-h/2-.025,.06]));
  return parts;
}
function sideboardParts(k){
  const parts=[{g:k.box(1.56,.06,.36,.01),c:GRAPHITE,p:[0,.03,.22]},{g:k.box(1.6,.62,.42,.02,2),c:WHITE,p:[0,.37,.21]},{g:k.box(1.64,.03,.45,.01),c:WOOD,p:[0,.695,.22]}];
  for(const x of [-.27,.27])parts.push({g:k.box(.008,.54,.01,.003),c:0xd9d4cc,p:[x,.37,.423]});
  for(const x of [-.53,0,.53])parts.push({g:k.box(.11,.014,.016,.005),c:WOOD_DARK,p:[x,.6,.43]});
  parts.push(...toMetres(pottedPlant(k,{kind:'bush',potR:.14,potH:.42,pot:0xa9c7d8,rim:0x98b8ca,height:.75,seed:8,flowers:[0xff8fb1,0xffd52f,0xffffff,0xbf92ee]}),[-.55,.71,.22]));
  [[0x7fa6e0,.24],[0xf2c066,.21],[0xe88f7d,.23]].forEach(([c,w],i)=>parts.push({g:k.box(w,.035,.16,.006),c,p:[.05,.728+i*.036,.22],r:[0,(i-1)*.12,0]}));
  parts.push({g:k.box(.22,.13,.1,.025),c:0xe9e2d6,p:[.55,.776,.24]},{g:k.cyl(.036,.036,.01,16),c:GRAPHITE,p:[.5,.78,.292],r:[Math.PI/2,0,0]},{g:k.box(.03,.03,.01,.005),c:0xf2a65a,p:[.62,.8,.292]});
  return parts;
}
function shelfParts(k){
  const parts=[];
  // Framed prints of overlapping dots.
  parts.push({g:k.box(.42,.52,.025,.008),c:WOOD,p:[-.52,1.32,.013]},{g:k.box(.36,.46,.01,.004),c:0xf7f1e6,p:[-.52,1.32,.028]});
  [[0x2f9bef,-.06,.06,.085],[0xe9408f,.05,.01,.075],[0xffd52f,-.01,-.1,.065]].forEach(([c,dx,dy,r])=>parts.push({g:k.cyl(r,r,.006,24),c,p:[-.52+dx,1.32+dy,.035],r:[Math.PI/2,0,0]}));
  parts.push({g:k.box(.3,.3,.025,.008),c:GRAPHITE,p:[-.06,1.45,.013]},{g:k.box(.25,.25,.01,.004),c:0xfbe8d3,p:[-.06,1.45,.028]},{g:k.cyl(.06,.06,.006,24),c:0xff8c78,p:[-.06,1.48,.035],r:[Math.PI/2,0,0]},{g:k.box(.18,.022,.006,.003),c:0x8fb8a0,p:[-.06,1.39,.035]});
  // Floating shelf with books and a trailing plant.
  parts.push({g:k.box(.66,.025,.16,.006),c:WOOD,p:[.46,1.16,.08]});
  [[0x7fa6e0,.2],[0xe88f7d,.22],[0xf2c066,.18],[0x9fc6a5,.21],[0xc7b0e8,.19]].forEach(([c,hh],i)=>parts.push({g:k.box(.035,hh,.12,.004),c,p:[.2+i*.04,1.1725+hh/2,.08],r:[0,0,i===4?-.22:0]}));
  parts.push(...toMetres(pottedPlant(k,{kind:'bush',potR:.16,potH:.24,pot:0xf2ede6,rim:0xe6dfd5,height:.55,seed:3}),[.66,1.1725,.08]));
  for(let i=0;i<4;i++)parts.push({g:k.ball(),c:GREENS[i%5],p:[.73+i*.008,1.13-i*.045,.13],s:[.028,.024,.024]});
  // Wall clock.
  const cx=.46,cy=1.6;
  parts.push({g:k.cyl(.14,.14,.025,32),c:GRAPHITE,p:[cx,cy,.013],r:[Math.PI/2,0,0]},{g:k.cyl(.122,.122,.01,32),c:WHITE,p:[cx,cy,.028],r:[Math.PI/2,0,0]});
  for(let i=0;i<12;i++){const a=i*Math.PI/6;parts.push({g:k.box(.008,i%3?.014:.024,.005,.002),c:GRAPHITE,p:[cx+Math.sin(a)*.1,cy+Math.cos(a)*.1,.035],r:[0,0,-a]});}
  parts.push({g:k.box(.011,.07,.005,.002),c:GRAPHITE,p:[cx+.022,cy+.026,.038],r:[0,0,-.7]},{g:k.box(.008,.095,.005,.002),c:0xe46d5e,p:[cx-.03,cy+.031,.04],r:[0,0,.75]});
  return parts;
}
function pinboardParts(k){
  const y=1.42,parts=[{g:k.box(1.12,.77,.03,.012),c:WOOD,p:[0,y,.015]},{g:k.box(1.06,.71,.01,.004),c:CORK,p:[0,y,.032]}];
  parts.push({g:k.box(.2,.27,.003,.001),c:0xfdfcf9,p:[-.36,y+.05,.039],r:[0,0,.05]},{g:k.box(.2,.14,.003,.001),c:0xeef4fb,p:[.34,y-.13,.039],r:[0,0,-.04]});
  for(let i=0;i<4;i++)parts.push({g:k.box(.14,.008,.002,.001),c:0xb9c2d0,p:[-.36,y+.13-i*.036,.042],r:[0,0,.05]});
  // One sticky note in each seat colour.
  [[-.12,.21],[.02,.2],[.16,.22],[.3,.19],[-.12,.0],[.02,.02],[.15,-.01]].forEach(([x,dy],i)=>parts.push({g:k.box(.1,.1,.004,.002),c:DOT_COLORS[i],p:[x,y+dy,.04],r:[0,0,(i%3-1)*.07]},{g:k.ball(8,6),c:0xe0525e,p:[x,y+dy+.035,.046],s:.008}));
  parts.push({g:k.ball(8,6),c:0x2f7fe0,p:[-.36,y+.17,.046],s:.009},{g:k.ball(8,6),c:0x2f7fe0,p:[.34,y-.07,.046],s:.009});
  return parts;
}
function loungeParts(k){
  const SOFA=0xa7c2a5,SOFA_DARK=0x93b091,sz=-.5,parts=[{g:k.box(2.6,.012,1.8,.06),c:0xf4ead9,p:[0,.012,0]},{g:k.box(2.36,.014,1.56,.05),c:0xe6d6bd,p:[0,.016,0]},{g:k.box(2.14,.016,1.34,.045),c:0xf4ead9,p:[0,.02,0]}];
  for(const x of [-.86,.86])for(const z of [-.32,.32])parts.push({g:k.cyl(.022,.016,.08,8),c:WOOD_DARK,p:[x,.04,sz+z]});
  parts.push({g:k.box(1.9,.24,.82,.05,2),c:SOFA_DARK,p:[0,.2,sz]});
  for(const x of [-.44,.44])parts.push({g:k.box(.86,.12,.66,.05,2),c:SOFA,p:[x,.38,sz+.06]});
  parts.push({g:k.box(1.9,.5,.18,.07,2),c:SOFA,p:[0,.57,sz-.32]});
  for(const x of [-.88,.88])parts.push({g:k.box(.15,.4,.82,.06,2),c:SOFA_DARK,p:[x,.38,sz]});
  parts.push({g:k.box(.3,.26,.09,.04,2),c:0xff9e8a,p:[-.58,.56,sz-.18],r:[-.2,.15,.12]},{g:k.box(.28,.25,.09,.04,2),c:0xffd56a,p:[.6,.555,sz-.18],r:[-.2,-.18,-.1]});
  // Round coffee table with a mug and two books.
  parts.push({g:k.cyl(.35,.35,.03,32),c:WOOD,p:[.05,.405,.42]},{g:k.cyl(.03,.03,.36,10),c:WOOD_DARK,p:[.05,.2,.42]},{g:k.cyl(.17,.18,.02,24),c:WOOD_DARK,p:[.05,.01,.42]});
  parts.push({g:k.cyl(.035,.03,.07,14),c:0xe9408f,p:[.17,.455,.38]},{g:k.box(.18,.022,.13,.004),c:0x7fa6e0,p:[-.07,.431,.48],r:[0,.3,0]},{g:k.box(.17,.02,.12,.004),c:0xf2c066,p:[-.06,.452,.47],r:[0,.15,0]});
  parts.push({g:k.cyl(.2,.21,.36,24),c:0xf0c36a,p:[.95,.2,.5]},{g:k.cyl(.17,.17,.01,24),c:0xe3b45c,p:[.95,.385,.5]});
  parts.push({g:k.cyl(.14,.15,.025,20),c:GRAPHITE,p:[-1.15,.015,-.6]},stick(k,[-1.15,.02,-.6],[-1.15,1.33,-.6],.012,GRAPHITE));
  parts.push(...toMetres(pottedPlant(k,{kind:'monstera',potR:.32,potH:.56,pot:0xf2ede6,rim:0xe6dfd5,height:1.3,seed:6}),[1.18,0,-.55]));
  return parts;
}
function coffeeParts(k){
  const parts=[{g:k.box(1.46,.06,.5,.01),c:GRAPHITE,p:[0,.03,-.02]},{g:k.box(1.5,.81,.56,.02,2),c:WHITE,p:[0,.465,0]},{g:k.box(1.56,.03,.6,.01),c:WOOD,p:[0,.885,0]}];
  for(const x of [-.375,0,.375])parts.push({g:k.box(.008,.7,.01,.003),c:0xd9d4cc,p:[x,.46,.282]});
  for(const x of [-.56,-.19,.19,.56])parts.push({g:k.box(.11,.014,.016,.005),c:WOOD_DARK,p:[x,.8,.29]});
  // Coffee machine with a waiting cup.
  parts.push({g:k.box(.24,.32,.26,.03,2),c:GRAPHITE,p:[-.45,1.06,-.06]},{g:k.box(.2,.03,.14,.01),c:0x2b303c,p:[-.45,.915,.05]},{g:k.box(.14,.06,.02,.008),c:0x6b7385,p:[-.45,1.16,.075]},{g:k.cyl(.016,.016,.05,8),c:0x9aa3b5,p:[-.45,1.0,.05]});
  parts.push({g:k.cyl(.03,.026,.05,14),c:0xffffff,p:[-.45,.955,.05]},{g:k.ball(8,6),c:0x7cd67c,p:[-.37,1.19,.08],s:.008});
  DOT_COLORS.slice(0,3).forEach((c,i)=>parts.push({g:k.cyl(.035,.03,.065,14),c,p:[-.18+i*.09,.932,.1-i*.03]}));
  parts.push({g:k.ball(18,8),c:0xf0ece4,p:[.2,.915,0],s:[.12,.045,.12]},{g:k.ball(),c:0xff9a3c,p:[.17,.96,.02],s:.035},{g:k.ball(),c:0xe9483f,p:[.23,.96,-.02],s:.033},{g:k.ball(),c:0xffd84a,p:[.2,.975,.04],s:[.055,.022,.022],r:[0,.6,.3]});
  parts.push(...toMetres(pottedPlant(k,{kind:'snake',potR:.16,potH:.26,pot:0xf2ede6,rim:0xe6dfd5,height:.75,seed:2}),[.56,.9,-.06]));
  // Water cooler at the end of the counter.
  parts.push({g:k.box(.3,.95,.3,.03,2),c:0xeef1f5,p:[.98,.475,-.02]},{g:k.cyl(.12,.12,.3,18),c:0xa9d6f2,p:[.98,1.12,-.02]},{g:k.cyl(.05,.12,.04,18),c:0xa9d6f2,p:[.98,.97,-.02]},{g:k.box(.03,.025,.025,.005),c:0x4a8fe0,p:[.94,.72,.14]},{g:k.box(.03,.025,.025,.005),c:0xe46d5e,p:[1.02,.72,.14]});
  return parts;
}
// Per-desk details, in desk-local scene units (desktop top at y=1.70).
export function deskDecorParts(k){
  const parts=[...pottedPlant(k,{x:1.42,y:1.70,z:-1.36,kind:'succulent',potR:.11,potH:.17,pot:0xbfd6c3,rim:0xaecab3,seed:12})];
  parts.push({g:k.box(.42,.035,.3,.012),c:0x8fb3e8,p:[-1.06,1.718,-.3],r:[0,.12,0]},{g:k.box(.4,.03,.28,.012),c:0xf4c46b,p:[-1.04,1.75,-.31],r:[0,-.05,0]},stick(k,[-1.2,1.775,-.24],[-.9,1.775,-.36],.012,0x3d4354,6));
  const base=[-1.55,1.70,-1.6],elbow=[-1.63,2.36,-1.5],head=[-1.3,2.52,-1.22];
  parts.push({g:k.cyl(.14,.16,.045,18),c:GRAPHITE,p:[base[0],1.722,base[2]]},stick(k,[base[0],1.72,base[2]],elbow,.02,GRAPHITE),stick(k,elbow,head,.018,GRAPHITE),{g:k.ball(8,6),c:GRAPHITE,p:elbow,s:.034});
  return parts;
}
export function deskLampShadeParts(k){
  return[{g:k.cyl(.075,.19,.2,18),c:0xf6efe2,p:[-1.27,2.45,-1.19],r:[.25,0,-.2]},{g:k.ball(10,8),c:0xfff6dc,p:[-1.255,2.37,-1.175],s:.065}];
}

/** Build the decor layer; layoutDecor() places clusters for each room shape. */
export function buildDecor(palette){
  const k=primitiveKit(),group=new T.Group();group.name='room-decor';
  // A faint clear pane: it catches a soft reflection but the room behind shows through.
  const pane=new T.MeshStandardMaterial({color:0xffffff,roughness:.05,metalness:0,transparent:true,opacity:.1,depthWrite:false});
  const clusters=new Map();
  const add=(name,parts,{glow=[],mounted=false}={})=>{
    const cluster=new T.Group();cluster.name=`decor-${name}`;cluster.scale.setScalar(M);cluster.userData.mounted=mounted;group.add(cluster);
    const solid=new T.Mesh(mergeParts(parts),palette.decor);solid.name=`${name}-decor`;solid.castShadow=true;solid.receiveShadow=true;cluster.add(solid);
    if(glow.length){const lit=new T.Mesh(mergeParts(glow),palette.glow);lit.name=`${name}-glow`;lit.castShadow=true;cluster.add(lit);}
    clusters.set(name,cluster);return cluster;
  };
  const windowCluster=add('window',windowParts(k,2.5),{mounted:true});
  const glass=new T.Mesh(new T.PlaneGeometry(1,WINDOW.height),pane);glass.name='window-glass';glass.position.set(0,WINDOW.y,.012);glass.scale.x=2.5;windowCluster.add(glass);
  add('sideboard',sideboardParts(k));add('shelves',shelfParts(k),{mounted:true});add('pinboard',pinboardParts(k),{mounted:true});
  const lounge=add('lounge',loungeParts(k),{glow:[{g:k.cyl(.11,.19,.26,24),c:0xf6efe2,p:[-1.15,1.42,-.6]},{g:k.ball(10,8),c:0xfff6dc,p:[-1.15,1.33,-.6],s:.05}]});
  const lampLight=new T.PointLight(0xffc98a,0,11,1.6);lampLight.name='lounge-lamp-light';lampLight.position.set(-1.15,1.3,-.6);lounge.add(lampLight);
  add('coffee',coffeeParts(k));
  add('cornerPlant',toMetres(pottedPlant(k,{kind:'monstera',potR:.5,potH:.86,pot:0xd98b6c,rim:0xc97b5d,height:2.3,seed:9})));
  add('plantA',toMetres(pottedPlant(k,{kind:'snake',potR:.32,potH:.62,pot:0xf2ede6,rim:0xe6dfd5,height:1.55,seed:5})));
  add('plantB',toMetres(pottedPlant(k,{kind:'bush',potR:.36,potH:.6,pot:0x9fbfd3,rim:0x8eb0c6,height:1.35,seed:14})));
  k.dispose();
  return{group,clusters,glass,windowCluster,lampLight,windowWidth:2.5};
}
// Cluster origins in scene units; wall clusters sit on the back wall's face.
// Window widths are in metres.
const PLACEMENT={
  wide:{window:{x:-5.4,wall:true,width:3.8},sideboard:{x:9.9,wall:true},shelves:{x:9.9,wall:true},pinboard:{x:3.3,wall:true},cornerPlant:{x:-13.6,z:-12.2},lounge:{x:-10.4,z:9.8},coffee:{x:9.4,z:11.6},plantA:{x:14.4,z:-12.5},plantB:{x:14.1,z:12.6}},
  portrait:{window:{x:-3.4,wall:true,width:2.7},sideboard:{x:6.9,wall:true},shelves:{x:6.9,wall:true},pinboard:{x:1.75,wall:true},cornerPlant:{x:-9.6,z:-13.7},lounge:{x:6.5,z:12.3},plantA:{x:10.1,z:-14.0},plantB:{x:10.0,z:6.6}},
  phone:{window:{x:2.5,wall:true,width:1.6},shelves:{x:-2.7,wall:true},plantA:{x:-4.4,z:-26.9}}
};
export function layoutDecor(decor,layout,size){
  const placement=PLACEMENT[layout],wallZ=-size.depth/2+.215*size.depth/14;
  // Clusters with no room in this layout leave the scene graph, so they are
  // neither drawn, shadowed nor hit by picking rays.
  for(const [name,cluster] of decor.clusters){
    const spot=placement[name];if(!spot){decor.group.remove(cluster);continue;}
    decor.group.add(cluster);cluster.position.set(spot.x,0,spot.wall?wallZ:spot.z);
  }
  const width=placement.window.width;
  if(width!==decor.windowWidth){
    const k=primitiveKit(),solid=decor.windowCluster.getObjectByName('window-decor');solid.geometry.dispose();solid.geometry=mergeParts(windowParts(k,width));k.dispose();
    decor.glass.scale.x=width;decor.windowWidth=width;
  }
}
/** Wall-mounted pieces follow their wall when it is cut away for the camera. */
export function setMountedDecorVisible(decor,visible){for(const cluster of decor.clusters.values())if(cluster.userData.mounted)cluster.visible=visible;}
export function setDecorTheme(decor,dark){decor.lampLight.intensity=dark?7:0;}
/** The window's glass area in scene units, so the back wall can open behind it. */
export function windowOpening(layout){const spot=PLACEMENT[layout].window;return{x:spot.x,halfWidth:spot.width/2*M,bottom:(WINDOW.y-WINDOW.height/2)*M,top:(WINDOW.y+WINDOW.height/2)*M};}
