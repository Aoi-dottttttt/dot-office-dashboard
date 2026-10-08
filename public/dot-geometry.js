import {BufferGeometry,Float32BufferAttribute,Vector3} from './vendor/three.js';

// These are closed spherical deformations: every depth section contracts toward
// a single front/back pole. There are no extruded outlines or planar end caps.
const TAU=Math.PI*2;
const angleDistance=(a,b)=>Math.atan2(Math.sin(a-b),Math.cos(a-b));
// Radial intersection of a convex triangle swept by a circular rounding radius.
// Unlike a three-wave harmonic, the sides cannot become inward-curving lobes.
const triangleVertices=[[0,.59],[-Math.sqrt(3)*.295,-.295],[Math.sqrt(3)*.295,-.295]];
function segmentDistance(x,y,a,b){const ex=b[0]-a[0],ey=b[1]-a[1];const t=Math.max(0,Math.min(1,((x-a[0])*ex+(y-a[1])*ey)/(ex*ex+ey*ey)));return Math.hypot(x-a[0]-t*ex,y-a[1]-t*ey);}
function roundedTriangleRadius(angle,core=.59,round=.18){
  const vertices=triangleVertices.map(([x,y])=>[x*core/.59,y*core/.59]);
  const dx=Math.cos(angle),dy=Math.sin(angle);let radius=Infinity;
  for(let i=0;i<3;i++){
    const a=vertices[i],b=vertices[(i+1)%3],ex=b[0]-a[0],ey=b[1]-a[1],length=Math.hypot(ex,ey),nx=ey/length,ny=-ex/length;
    const denominator=nx*dx+ny*dy;
    if(denominator>1e-9){const t=(nx*a[0]+ny*a[1]+round)/denominator;const u=((t*dx-a[0]-round*nx)*ex+(t*dy-a[1]-round*ny)*ey)/(length*length);if(t>0&&u>=0&&u<=1)radius=Math.min(radius,t);}
    const dot=dx*a[0]+dy*a[1],discriminant=dot*dot-a[0]*a[0]-a[1]*a[1]+round*round;
    if(discriminant>=0)for(const t of [dot-Math.sqrt(discriminant),dot+Math.sqrt(discriminant)]){if(t<=0)continue;const x=t*dx,y=t*dy;const distance=Math.min(...vertices.map((v,j)=>segmentDistance(x,y,v,vertices[(j+1)%3])));if(distance>=round-1e-8)radius=Math.min(radius,t);}
  }
  return radius;
}
const definitions={
  cloud:{sx:1.10,sy:.94,depth:.57,radius:a=>.65*(1+.105*Math.cos(3*(a-Math.PI/2))+.025*Math.cos(5*a+.6))},
  // Alfred: a broader plush silhouette, with a generous round crown and base.
  alfred:{sx:1.17,sy:1.07,depth:.60,radius:a=>roundedTriangleRadius(a,.47,.27)},
  triangle:{sx:1.05,sy:1.08,depth:.57,radius:a=>roundedTriangleRadius(a)},
  star:{sx:1.02,sy:1.02,depth:.55,radius:a=>.65*(1+.18*Math.cos(5*(a-Math.PI/2)))},
  bean:{sx:.57,sy:.69,depth:.54,radius:a=>1+.035*Math.sin(a)+.025*Math.sin(2*a)},
  puff:{sx:1.04,sy:1.02,depth:.58,radius:a=>.64*(1+.065*Math.cos(5*a-.5)+.025*Math.cos(3*a+.8))},
  heart:{sx:1.08,sy:.94,depth:.59,radius:a=>.68*(1+.14*Math.sin(a)-.10*Math.cos(2*a))-.31*Math.exp(-.5*(angleDistance(a,Math.PI/2)/.23)**2)+.085*Math.exp(-.5*(angleDistance(a,-Math.PI/2)/.31)**2)}
};
export const DOT_PROFILES=Object.freeze(Object.fromEntries(Object.entries(definitions).map(([kind,p])=>{
  let minY=Infinity,maxY=-Infinity;for(let i=0;i<1024;i++){const a=i*TAU/1024;const y=p.radius(a)*Math.sin(a)*p.sy;minY=Math.min(minY,y);maxY=Math.max(maxY,y);}
  const centerY=-.71-minY;return[kind,Object.freeze({...p,centerY,minY:-.71,maxY:maxY+centerY})];
})));
export function dotImplicit(kind,x,y,z){const p=DOT_PROFILES[kind];const nx=x/p.sx,ny=(y-p.centerY)/p.sy;const r=p.radius(Math.atan2(ny,nx));return(nx*nx+ny*ny)/(r*r)+(z/p.depth)**2-1;}
export function dotSurfaceNormal(kind,x,y,z){const e=.0001;return new Vector3(dotImplicit(kind,x+e,y,z)-dotImplicit(kind,x-e,y,z),dotImplicit(kind,x,y+e,z)-dotImplicit(kind,x,y-e,z),dotImplicit(kind,x,y,z+e)-dotImplicit(kind,x,y,z-e)).normalize();}
export function dotFrontSurface(kind,x,y){const p=DOT_PROFILES[kind];const nx=x/p.sx,ny=(y-p.centerY)/p.sy;const r=p.radius(Math.atan2(ny,nx));const inside=1-(nx*nx+ny*ny)/(r*r);if(inside<=0)throw Error('Accessory anchor is outside the dot body');const z=p.depth*Math.sqrt(inside);return{z,normal:dotSurfaceNormal(kind,x,y,z)};}
export function createRoundedDotGeometry(kind,segments=72,rings=48){
  const p=DOT_PROFILES[kind];if(!p)throw Error('Unknown dot profile');
  const positions=[0,p.centerY,p.depth],normals=[0,0,1],indices=[];
  for(let j=1;j<rings;j++){
    const phi=j*Math.PI/rings,spread=Math.sin(phi),z=p.depth*Math.cos(phi);
    for(let i=0;i<segments;i++){const a=i*TAU/segments,r=p.radius(a);const x=r*Math.cos(a)*spread*p.sx,y=r*Math.sin(a)*spread*p.sy+p.centerY;const n=dotSurfaceNormal(kind,x,y,z);positions.push(x,y,z);normals.push(n.x,n.y,n.z);}
  }
  const back=positions.length/3;positions.push(0,p.centerY,-p.depth);normals.push(0,0,-1);
  for(let i=0;i<segments;i++)indices.push(0,1+i,1+(i+1)%segments);
  for(let j=0;j<rings-2;j++)for(let i=0;i<segments;i++){const a=1+j*segments+i,b=1+j*segments+(i+1)%segments,c=a+segments,d=b+segments;indices.push(a,c,b,b,c,d);}
  const last=1+(rings-2)*segments;for(let i=0;i<segments;i++)indices.push(back,last+(i+1)%segments,last+i);
  const geometry=new BufferGeometry();geometry.type='RoundedDotGeometry';geometry.setAttribute('position',new Float32BufferAttribute(positions,3));geometry.setAttribute('normal',new Float32BufferAttribute(normals,3));geometry.setIndex(indices);geometry.computeBoundingBox();geometry.computeBoundingSphere();geometry.userData={kind,segments,rings,volume:'spherical-deformation',frontPole:0,backPole:back};return geometry;
}
