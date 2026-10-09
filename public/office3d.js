import * as T from './vendor/three.js';
import {buildOffice,setTheme,setCamera,setWorking,updateOffice,projectAnchors,disposeOffice,VIEW,cameraLimits,setStationModel,panView,zoomView} from './office-model.js';

// The returned render target owns the environment texture; temporary baking resources do not.
export function createStudioEnvironment(renderer,{PMREMGenerator=T.PMREMGenerator,RoomEnvironment=T.RoomEnvironment}={}){
  let pmrem,room;
  try{pmrem=new PMREMGenerator(renderer);room=new RoomEnvironment();return pmrem.fromScene(room,.04);}
  finally{room?.dispose();pmrem?.dispose();}
}

export function initOffice({bridge,fallback,rendererFactory=options=>new T.WebGLRenderer(options),environmentFactory=createStudioEnvironment,requestFrame=requestAnimationFrame,cancelFrame=cancelAnimationFrame}={}){
  const host=document.getElementById('office-scene');
  const viewport=document.getElementById('office-viewport');
  const canvas=document.getElementById('office-canvas');
  const pinsRoot=document.getElementById('office-pins');
  const note=document.getElementById('scene-message');
  const darkQuery=matchMedia('(prefers-color-scheme: dark)');
  const reducedQuery=matchMedia('(prefers-reduced-motion: reduce)');
  let renderer,office,frame=null,viewFrame=null,disposed=false,failed=false,lastTime=0,firstSync=true,width=1,height=1,shadowDirty=true;
  let snapshot=null,transportOk=false,gesture=null,dragged=false;
  const pins=new Map(),pointers=new Map();
  const cleanups=[];
  const on=(target,type,listener,options)=>{target.addEventListener(type,listener,options);cleanups.push(()=>target.removeEventListener(type,listener,options));};
  const motion=()=>document.documentElement.dataset.motion!=='off'&&!reducedQuery.matches&&!document.hidden;
  const theme=()=>document.documentElement.dataset.theme==='dark'||(document.documentElement.dataset.theme!=='light'&&darkQuery.matches);
  function stop(){if(frame!==null){cancelFrame(frame);frame=null;}if(viewFrame!==null){cancelFrame(viewFrame);viewFrame=null;}lastTime=0;}
  function fail(message){if(failed||disposed)return;failed=true;stop();fallback(message);dispose();}
  try {
    renderer=rendererFactory({canvas,alpha:true,antialias:true,powerPreference:'low-power'});
    renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio||1,1.5));
    renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFShadowMap;renderer.shadowMap.autoUpdate=false;
    // Neutral tone mapping keeps the pastel characters close to their true colours.
    renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.NeutralToneMapping;renderer.toneMappingExposure=1;
    office=buildOffice();
  } catch(error){renderer?.dispose();throw error;}
  // Optional soft studio reflections; the room still renders correctly without them.
  let environmentTarget=null;
  try{environmentTarget=environmentFactory(renderer);office.scene.environment=environmentTarget.texture;}
  catch{environmentTarget?.dispose();environmentTarget=null;}
  try{office.textures.wood.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());}catch{/* Default filtering is fine. */}
  const raycaster=new T.Raycaster();
  for(const station of office.stations.values()){
    const button=document.createElement('button');button.type='button';button.className='office-pin';button.dataset.number=String(station.number);button.setAttribute('aria-haspopup','dialog');
    const row=document.createElement('span');row.className='pin-top';const avatar=document.createElement('span');avatar.className='pin-avatar';avatar.setAttribute('aria-hidden','true');const number=document.createElement('span');number.className='pin-number';number.textContent=String(station.number).padStart(2,'0');const state=document.createElement('span');state.className='pin-state';state.textContent='未核实';row.append(avatar,number,state);
    const title=document.createElement('span');title.className='pin-title';title.textContent='正在读取';const seatName=document.createElement('span');seatName.className='pin-seat-name';const age=document.createElement('span');age.className='pin-observed';button.append(row,seatName,title,age);pinsRoot.append(button);
    on(button,'click',()=>bridge.openSeat(station.number,button));
    pins.set(station.number,{button,state,title,age,seatName});
  }
  // Cards keep their own aisle; when an orbit, zoom or pan leaves no room, they shrink to tags.
  function positionPins(){for(const p of projectAnchors(office,width,height)){const pin=pins.get(p.number).button;pin.style.left=`${p.x}px`;pin.style.top=`${p.y}px`;pin.style.width=`${p.width}px`;pin.classList.toggle('is-compact',p.compact);pin.hidden=!p.visible;}}
  function paint(){if(disposed||failed||document.hidden)return;try{office.scene.updateMatrixWorld(true);if(shadowDirty)renderer.shadowMap.needsUpdate=true;renderer.render(office.scene,office.camera);shadowDirty=false;positionPins();}catch{fail('3D 渲染暂时不可用，已切换为二维兼容视图。任务状态仍会更新。');}}
  // Pointer-driven view changes draw at most once per display frame.
  function queuePaint(){if(viewFrame===null&&!disposed&&!failed&&!document.hidden)viewFrame=requestFrame(()=>{viewFrame=null;paint();});}
  function schedule(){if(frame===null&&!disposed&&!failed&&motion())frame=requestFrame(tick);}
  function tick(time){frame=null;if(disposed||failed||!motion()){lastTime=0;return;}if(lastTime&&time-lastTime<1000/30){schedule();return;}const dt=lastTime?Math.min(.1,(time-lastTime)/1000):1/30;lastTime=time;if([...office.stations.values()].some(s=>s.poseMoving))shadowDirty=true;const active=updateOffice(office,time/1000,dt,true);paint();if(active)schedule();else lastTime=0;}
  function sync(data=bridge.getSnapshot(),ok=bridge.getTransportOk()){
    if(disposed||failed||!data)return;snapshot=data;transportOk=ok;const now=Date.now();
    for(const slot of data.slots){const station=office.stations.get(slot.number);if(!station)continue;const observed=globalThis.DashboardState.inspect(slot,now,ok);if(station.working!==observed.animate)shadowDirty=true;setWorking(station,observed.animate,{instant:firstSync||!motion(),idleYaw:VIEW.yaw});const pin=pins.get(slot.number);pin.button.classList.toggle('working',observed.animate);pin.button.classList.toggle('waiting',slot.status==='waiting');pin.button.classList.toggle('historical',(!observed.fresh||!ok)&&slot.status!=='unknown');pin.button.dataset.status=slot.status;pin.title.textContent=slot.title;pin.age.textContent=observed.ageLabel;const shortLabel={running:'进行中',waiting:'等待中',available:'暂无任务',unknown:'未核实'}[slot.status]||'未核实';pin.state.textContent=(!observed.fresh||!ok)&&slot.status!=='unknown'?`上次·${shortLabel}`:shortLabel;pin.button.title=`${pin.seatName.textContent?pin.seatName.textContent+' · ':''}工位 ${slot.number} · ${slot.title} · ${pin.state.textContent} · ${observed.ageLabel} · ${globalThis.DashboardState.execution(slot).map(field=>`${field.label}：${field.value}${field.sourceLabel?'（'+field.sourceLabel+'）':''}`).join(' · ')}`;pin.button.setAttribute('aria-label',`${pin.button.title}，查看任务详情`);}
    firstSync=false;updateOffice(office,lastTime/1000,0,motion());paint();schedule();
  }
  function refreshSeatSettings(){if(disposed||failed)return;for(const station of office.stations.values()){const preference=bridge.getSeatPreference?.(station.number)||globalThis.SeatSettings.get(station.number);if(setStationModel(office,station.number,preference.modelId))shadowDirty=true;const pin=pins.get(station.number);pin.seatName.textContent=preference.name;pin.button.classList.toggle('has-custom-name',Boolean(preference.name));pin.button.dataset.model=preference.modelId;}updateOffice(office,0,0,false);sync();paint();}
  function refreshPreferences(){if(disposed||failed)return;setTheme(office,theme());stop();shadowDirty=true;updateOffice(office,0,0,false);paint();schedule();}
  function resize(){if(disposed||failed)return;const rect=viewport.getBoundingClientRect();width=Math.max(1,rect.width);height=Math.max(1,rect.height);viewport.classList.toggle('phone-office',width<760);renderer.setSize(width,height,false);setCamera(office,width,height);shadowDirty=true;updateOffice(office,0,0,false);positionPins();paint();}
  // Camera changes only move the view; the shadow map is redrawn only when a wall is cut away or restored.
  function refreshView(queued=false){if(disposed||failed)return;if(setCamera(office,width,height))shadowDirty=true;if(queued)queuePaint();else paint();}
  function changeView(yaw=office.yaw,elevation=office.elevation,zoom=office.zoom,queued=false){const limits=cameraLimits(office.layout);office.yaw=Math.atan2(Math.sin(yaw),Math.cos(yaw));office.elevation=T.MathUtils.clamp(elevation,limits.minElevation,limits.maxElevation);office.zoom=T.MathUtils.clamp(zoom,limits.minZoom,limits.maxZoom);refreshView(queued);}
  function resetView(){office.target={x:0,z:0};changeView(office.layout==='phone'?VIEW.phoneYaw:office.layout==='portrait'?VIEW.portraitYaw:VIEW.yaw,VIEW.elevation,1);}
  // Screen-pixel drag → frame-space pan: dragging right moves the room right.
  function panBy(px,py,queued=true){panView(office,-px*office.frame.width/width,py*office.frame.height/height);refreshView(queued);}
  function zoomAround(clientX,clientY,zoom,queued=true){const rect=canvas.getBoundingClientRect();zoomView(office,zoom,(clientX-rect.left)/rect.width*2-1,1-(clientY-rect.top)/rect.height*2);refreshView(queued);}
  function zoomBy(factor){zoomView(office,office.zoom*factor);refreshView();}
  // Left drag orbits; right/middle drag or Shift/Ctrl/⌘ + drag pans. Two fingers pan and pinch.
  function beginGesture(){
    const active=[...pointers.values()];
    if(active.length>=2){const [a,b]=active;gesture={kind:'pinch',x:(a.x+b.x)/2,y:(a.y+b.y)/2,distance:Math.hypot(a.x-b.x,a.y-b.y)||1};}
    else if(active.length===1)gesture={kind:active[0].pan?'pan':'orbit',x:active[0].x,y:active[0].y};
    else gesture=null;
  }
  on(canvas,'pointerdown',e=>{if(e.button>2)return;if(e.button!==0)e.preventDefault?.();pointers.set(e.pointerId,{x:e.clientX,y:e.clientY,pan:e.button!==0||e.shiftKey||e.ctrlKey||e.metaKey});dragged=pointers.size>1;canvas.setPointerCapture(e.pointerId);beginGesture();});
  on(canvas,'pointermove',e=>{
    const point=pointers.get(e.pointerId);if(!point||!gesture)return;point.x=e.clientX;point.y=e.clientY;
    if(gesture.kind==='pinch'){const [a,b]=[...pointers.values()],x=(a.x+b.x)/2,y=(a.y+b.y)/2,distance=Math.hypot(a.x-b.x,a.y-b.y)||1;panBy(x-gesture.x,y-gesture.y);zoomAround(x,y,office.zoom*distance/gesture.distance);Object.assign(gesture,{x,y,distance});dragged=true;return;}
    const dx=e.clientX-gesture.x,dy=e.clientY-gesture.y;if(!dragged&&Math.abs(dx)+Math.abs(dy)<=5)return;dragged=true;gesture.x=e.clientX;gesture.y=e.clientY;
    if(gesture.kind==='pan')panBy(dx,dy);else changeView(office.yaw-dx*.006,office.elevation+dy*.004,office.zoom,true);
  });
  on(canvas,'pointerup',e=>{
    if(!pointers.has(e.pointerId))return;const wasDragged=dragged;pointers.delete(e.pointerId);canvas.releasePointerCapture(e.pointerId);beginGesture();
    if(wasDragged||pointers.size||e.button!==0)return;
    const rect=canvas.getBoundingClientRect();const p=new T.Vector2((e.clientX-rect.left)/rect.width*2-1,-(e.clientY-rect.top)/rect.height*2+1);raycaster.setFromCamera(p,office.camera);const hit=raycaster.intersectObjects([...office.stations.values()].map(s=>s.group),true)[0];if(hit)bridge.openSeat(hit.object.userData.seatNumber,pins.get(hit.object.userData.seatNumber).button);
  });
  on(canvas,'pointercancel',e=>{pointers.delete(e.pointerId);beginGesture();});
  on(canvas,'contextmenu',e=>e.preventDefault());
  // The wheel zooms toward the cursor; at either zoom limit it scrolls the page as usual.
  on(canvas,'wheel',e=>{const limits=cameraLimits(office.layout),delta=e.deltaY*(e.deltaMode===1?16:e.deltaMode===2?400:1),next=T.MathUtils.clamp(office.zoom*Math.exp(-delta*.0015),limits.minZoom,limits.maxZoom);if(Math.abs(next-office.zoom)<1e-4)return;e.preventDefault();zoomAround(e.clientX,e.clientY,next);},{passive:false});
  on(canvas,'keydown',e=>{const pan=e.shiftKey,step=48;const actions={ArrowLeft:()=>pan?panBy(step,0,false):changeView(office.yaw-.12),ArrowRight:()=>pan?panBy(-step,0,false):changeView(office.yaw+.12),ArrowUp:()=>pan?panBy(0,step,false):changeView(office.yaw,office.elevation+.08),ArrowDown:()=>pan?panBy(0,-step,false):changeView(office.yaw,office.elevation-.08),'+':()=>zoomBy(1.15),'=':()=>zoomBy(1.15),'-':()=>zoomBy(1/1.15),Home:resetView};if(actions[e.key]){e.preventDefault();actions[e.key]();}});
  on(document.getElementById('view-reset'),'click',resetView);
  on(document.getElementById('view-zoom-in'),'click',()=>zoomBy(1.2));
  on(document.getElementById('view-zoom-out'),'click',()=>zoomBy(1/1.2));
  on(canvas,'webglcontextlost',e=>{e.preventDefault();fail('3D 图形连接已中断，已切换为二维兼容视图。刷新页面可重试，任务状态仍会更新。');});
  on(document,'visibilitychange',()=>{if(document.hidden)stop();else{sync(snapshot,transportOk);refreshPreferences();}});
  on(darkQuery,'change',refreshPreferences);on(reducedQuery,'change',refreshPreferences);
  const resizeObserver=new ResizeObserver(resize);resizeObserver.observe(viewport);
  function dispose(){if(disposed)return;disposed=true;stop();resizeObserver.disconnect();cleanups.forEach(fn=>fn());office.scene.environment=null;environmentTarget?.dispose();disposeOffice(office);renderer.dispose();pinsRoot.replaceChildren();}
  on(window,'pagehide',event=>{if(!event.persisted)dispose();else stop();});
  on(window,'pageshow',()=>{if(!disposed){resize();sync();}});
  viewport.hidden=false;host.classList.add('is-3d');note.textContent='';note.hidden=true;setTheme(office,theme());resize();refreshSeatSettings();sync();
  if(failed){dispose();throw Error('3D render failed');}
  return{sync,refreshPreferences,refreshSeatSettings,dispose,office};
}
