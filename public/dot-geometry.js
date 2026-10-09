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
const PI=Math.PI;
// Lobed outlines are soft unions of circles ([x, y, visible radius]): each circle
// adds a compactly supported field, the outline is its level set, and the
// outermost crossing along each ray is tabulated so the radius stays a smooth,
// single-valued function of angle. Creases between lobes round off naturally.
function metaballRadius(circles,level=.11,samples=1440){
  // A low level keeps each circle's reach close to its visible radius, so creases stay crisp.
  const reach=1/Math.sqrt(1-Math.sqrt(level)),balls=circles.map(([x,y,r])=>[x,y,(r*reach)**2]);
  const field=(x,y)=>balls.reduce((sum,[cx,cy,r2])=>{const q=1-((x-cx)**2+(y-cy)**2)/r2;return q>0?sum+q*q:sum;},0);
  const table=new Float64Array(samples+1);
  for(let i=0;i<=samples;i++){
    const a=i/samples*TAU,dx=Math.cos(a),dy=Math.sin(a);let t=2;while(t>0&&field(dx*t,dy*t)<level)t-=.02;
    let lo=t,hi=t+.02;for(let j=0;j<30;j++){const mid=(lo+hi)/2;if(field(dx*mid,dy*mid)>=level)lo=mid;else hi=mid;}table[i]=(lo+hi)/2;
  }
  return a=>{const u=((a%TAU)+TAU)%TAU/TAU*samples,i=Math.floor(u),f=u-i;return table[i]+(table[i+1]-table[i])*f;};
}
// Outlines follow the official character art: proportions, lobes and depth.
const definitions={
  // Blue: a wide cloud, tallest bump in the middle, a shoulder each side and a two-lobed base.
  cloud:{sx:1,sy:1,depth:.58,radius:metaballRadius([[0,.13,.47],[-.43,-.03,.36],[.44,-.05,.35],[-.32,-.21,.3],[.32,-.21,.3],[0,-.17,.33]])},
  // Yellow: a wide rounded triangle with a soft apex.
  alfred:{sx:1.10,sy:.98,depth:.60,radius:a=>roundedTriangleRadius(a,.50,.30)},
  // Orange: a gumdrop, a much rounder triangle with a domed top and wide base.
  triangle:{sx:1.18,sy:1.0,depth:.59,radius:a=>roundedTriangleRadius(a,.40,.36)},
  // Lilac: five plump arms with rounded tips.
  star:{sx:1.05,sy:1.0,depth:.56,radius:a=>.60*(1+.25*Math.cos(5*(a-PI/2)))},
  // Coral: a round puff ringed by soft, even lumps.
  bean:{sx:1,sy:1,depth:.58,radius:metaballRadius([[0,0,.5],...[30,90,150,210,270,330].map((d,i)=>[Math.cos(d*PI/180)*.33,Math.sin(d*PI/180)*.27,i%2?.29:.31])])},
  // Ivory: a four-lobed flower cloud, dimpled at the top, sides and base.
  puff:{sx:1,sy:1,depth:.58,radius:metaballRadius([[0,0,.42],[-.3,.21,.38],[.3,.21,.38],[-.3,-.2,.36],[.3,-.2,.36]])},
  // Rose: a full, wide heart with a rounded point.
  heart:{sx:1.16,sy:.9,depth:.59,radius:a=>.68*(1+.14*Math.sin(a)-.10*Math.cos(2*a))-.31*Math.exp(-.5*(angleDistance(a,PI/2)/.23)**2)+.085*Math.exp(-.5*(angleDistance(a,-PI/2)/.31)**2)}
};
// A low-pass copy of an outline: the mean radius over a ±0.5 rad window.
function smoothedRadius(radius,samples=720){
  const table=new Float64Array(samples+1);for(let i=0;i<=samples;i++){const a=i/samples*TAU;let sum=0;for(let k=-10;k<=10;k++)sum+=radius(a+k*.05);table[i]=sum/21;}
  return a=>{const u=((a%TAU)+TAU)%TAU/TAU*samples,i=Math.floor(u),f=u-i;return table[i]+(table[i+1]-table[i])*f;};
}
// Cross-sections keep the full lobed outline at the silhouette (spread 1) and ease
// toward the smoothed outline at the front and back poles (spread 0), so lobes
// swell at the edges while the face stays one smooth dome, like a vinyl toy.
const sectionRadius=(p,a,spread)=>p.core(a)+(p.radius(a)-p.core(a))*spread*spread;
function outline(p){const points=[];for(let i=0;i<2048;i++){const a=i*TAU/2048,r=p.radius(a);points.push([r*Math.cos(a)*p.sx,r*Math.sin(a)*p.sy]);}return points;}
export const DOT_PROFILES=Object.freeze(Object.fromEntries(Object.entries(definitions).map(([kind,p])=>{
  const points=outline(p),minY=Math.min(...points.map(q=>q[1])),maxY=Math.max(...points.map(q=>q[1])),halfWidth=Math.max(...points.map(q=>Math.abs(q[0])));
  const centerY=-.71-minY;return[kind,Object.freeze({...p,core:smoothedRadius(p.radius),centerY,minY:-.71,maxY:maxY+centerY,halfWidth})];
})));
/** Half-width of the silhouette at a height in dot-local coordinates. */
export function dotHalfWidthAt(kind,y){
  const p=DOT_PROFILES[kind],points=outline(p);let best=0;
  for(let i=0;i<points.length;i++){const [x0,y0]=points[i],[x1,y1]=points[(i+1)%points.length],target=y-p.centerY;if((y0-target)*(y1-target)<=0&&y0!==y1)best=Math.max(best,Math.abs(x0+(x1-x0)*(target-y0)/(y1-y0)));}
  return best;
}
export function dotImplicit(kind,x,y,z){const p=DOT_PROFILES[kind];const nx=x/p.sx,ny=(y-p.centerY)/p.sy,depth=(z/p.depth)**2;const r=sectionRadius(p,Math.atan2(ny,nx),Math.sqrt(Math.max(0,1-depth)));return(nx*nx+ny*ny)/(r*r)+depth-1;}
export function dotSurfaceNormal(kind,x,y,z){const e=.0001;return new Vector3(dotImplicit(kind,x+e,y,z)-dotImplicit(kind,x-e,y,z),dotImplicit(kind,x,y+e,z)-dotImplicit(kind,x,y-e,z),dotImplicit(kind,x,y,z+e)-dotImplicit(kind,x,y,z-e)).normalize();}
export function dotFrontSurface(kind,x,y){
  const p=DOT_PROFILES[kind];if(dotImplicit(kind,x,y,0)>=0)throw Error('Accessory anchor is outside the dot body');
  let lo=0,hi=p.depth;for(let i=0;i<40;i++){const mid=(lo+hi)/2;if(dotImplicit(kind,x,y,mid)<0)lo=mid;else hi=mid;}
  const z=(lo+hi)/2;return{z,normal:dotSurfaceNormal(kind,x,y,z)};
}
export function createRoundedDotGeometry(kind,segments=96,rings=44){
  const p=DOT_PROFILES[kind];if(!p)throw Error('Unknown dot profile');
  const positions=[0,p.centerY,p.depth],normals=[0,0,1],indices=[];
  for(let j=1;j<rings;j++){
    const phi=j*Math.PI/rings,spread=Math.sin(phi),z=p.depth*Math.cos(phi);
    for(let i=0;i<segments;i++){const a=i*TAU/segments,r=sectionRadius(p,a,spread);const x=r*Math.cos(a)*spread*p.sx,y=r*Math.sin(a)*spread*p.sy+p.centerY;const n=dotSurfaceNormal(kind,x,y,z);positions.push(x,y,z);normals.push(n.x,n.y,n.z);}
  }
  const back=positions.length/3;positions.push(0,p.centerY,-p.depth);normals.push(0,0,-1);
  for(let i=0;i<segments;i++)indices.push(0,1+i,1+(i+1)%segments);
  for(let j=0;j<rings-2;j++)for(let i=0;i<segments;i++){const a=1+j*segments+i,b=1+j*segments+(i+1)%segments,c=a+segments,d=b+segments;indices.push(a,c,b,b,c,d);}
  const last=1+(rings-2)*segments;for(let i=0;i<segments;i++)indices.push(back,last+(i+1)%segments,last+i);
  const geometry=new BufferGeometry();geometry.type='RoundedDotGeometry';geometry.setAttribute('position',new Float32BufferAttribute(positions,3));geometry.setAttribute('normal',new Float32BufferAttribute(normals,3));geometry.setIndex(indices);geometry.computeBoundingBox();geometry.computeBoundingSphere();geometry.userData={kind,segments,rings,volume:'spherical-deformation',frontPole:0,backPole:back};return geometry;
}
