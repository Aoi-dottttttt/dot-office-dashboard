import * as T from './vendor/three.js';
import {buildOffice,setTheme,setCamera,setWorking,updateOffice,projectAnchors,disposeOffice,VIEW,cameraLimits,setStationModel} from './office-model.js';

export function initOffice({bridge,fallback,rendererFactory=options=>new T.WebGLRenderer(options),requestFrame=requestAnimationFrame,cancelFrame=cancelAnimationFrame}={}){
  const host=document.getElementById('office-scene');
  const viewport=document.getElementById('office-viewport');
  const canvas=document.getElementById('office-canvas');
  const pinsRoot=document.getElementById('office-pins');
  const note=document.getElementById('scene-message');
  const darkQuery=matchMedia('(prefers-color-scheme: dark)');
  const reducedQuery=matchMedia('(prefers-reduced-motion: reduce)');
  let renderer,office,frame=null,disposed=false,failed=false,lastTime=0,firstSync=true,width=1,height=1,shadowDirty=true;
  let snapshot=null,transportOk=false,pointer=null,dragged=false;
  const pins=new Map();
  const cleanups=[];
  const on=(target,type,listener,options)=>{target.addEventListener(type,listener,options);cleanups.push(()=>target.removeEventListener(type,listener,options));};
  const motion=()=>document.documentElement.dataset.motion!=='off'&&!reducedQuery.matches&&!document.hidden;
  const theme=()=>document.documentElement.dataset.theme==='dark'||(document.documentElement.dataset.theme!=='light'&&darkQuery.matches);
  function stop(){if(frame!==null){cancelFrame(frame);frame=null;}lastTime=0;}
  function fail(message){if(failed||disposed)return;failed=true;stop();fallback(message);dispose();}
  try {
    renderer=rendererFactory({canvas,alpha:true,antialias:true,powerPreference:'low-power'});
    renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio||1,1.5));
    renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFShadowMap;renderer.shadowMap.autoUpdate=false;
    renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.04;
    office=buildOffice();
  } catch(error){renderer?.dispose();throw error;}
  const raycaster=new T.Raycaster();
  for(const station of office.stations.values()){
    const button=document.createElement('button');button.type='button';button.className='office-pin';button.dataset.number=String(station.number);button.setAttribute('aria-haspopup','dialog');
    const row=document.createElement('span');row.className='pin-top';const number=document.createElement('span');number.className='pin-number';number.textContent=String(station.number).padStart(2,'0');const state=document.createElement('span');state.className='pin-state';state.textContent='未核实';row.append(number,state);
    const title=document.createElement('span');title.className='pin-title';title.textContent='正在读取';const seatName=document.createElement('span');seatName.className='pin-seat-name';const age=document.createElement('span');age.className='pin-observed';button.append(row,seatName,title,age);pinsRoot.append(button);
    on(button,'click',()=>bridge.openSeat(station.number,button));
    pins.set(station.number,{button,state,title,age,seatName});
  }
  function positionPins(){for(const p of projectAnchors(office,width,height)){const pin=pins.get(p.number).button;pin.style.left=`${p.x}px`;pin.style.top=`${p.y}px`;pin.style.width=`${p.width}px`;pin.hidden=!p.visible;}}
  function paint(){if(disposed||failed||document.hidden)return;try{office.scene.updateMatrixWorld(true);if(shadowDirty)renderer.shadowMap.needsUpdate=true;renderer.render(office.scene,office.camera);shadowDirty=false;positionPins();}catch{fail('3D 渲染暂时不可用，已切换为二维兼容视图。任务状态仍会更新。');}}
  function schedule(){if(frame===null&&!disposed&&!failed&&motion())frame=requestFrame(tick);}
  function tick(time){frame=null;if(disposed||failed||!motion()){lastTime=0;return;}if(lastTime&&time-lastTime<1000/30){schedule();return;}const dt=lastTime?Math.min(.1,(time-lastTime)/1000):1/30;lastTime=time;if([...office.stations.values()].some(s=>s.poseMoving))shadowDirty=true;const active=updateOffice(office,time/1000,dt,true);paint();if(active)schedule();else lastTime=0;}
  function sync(data=bridge.getSnapshot(),ok=bridge.getTransportOk()){
    if(disposed||failed||!data)return;snapshot=data;transportOk=ok;const now=Date.now();
    for(const slot of data.slots){const station=office.stations.get(slot.number);if(!station)continue;const observed=globalThis.DashboardState.inspect(slot,now,ok);if(station.working!==observed.animate)shadowDirty=true;setWorking(station,observed.animate,{instant:firstSync||!motion(),idleYaw:office.yaw});const pin=pins.get(slot.number);pin.button.classList.toggle('working',observed.animate);pin.button.classList.toggle('waiting',slot.status==='waiting');pin.title.textContent=slot.title;pin.age.textContent=observed.ageLabel;const shortLabel={running:'进行中',waiting:'等待中',available:'暂无任务',unknown:'未核实'}[slot.status]||'未核实';pin.state.textContent=(!observed.fresh||!ok)&&slot.status!=='unknown'?`上次·${shortLabel}`:shortLabel;pin.button.title=`${pin.seatName.textContent?pin.seatName.textContent+' · ':''}工位 ${slot.number} · ${slot.title} · ${pin.state.textContent} · ${observed.ageLabel} · ${globalThis.DashboardState.execution(slot).map(field=>`${field.label}：${field.value}${field.sourceLabel?'（'+field.sourceLabel+'）':''}`).join(' · ')}`;pin.button.setAttribute('aria-label',`${pin.button.title}，查看任务详情`);}
    firstSync=false;updateOffice(office,lastTime/1000,0,motion());paint();schedule();
  }
  function refreshSeatSettings(){if(disposed||failed)return;for(const station of office.stations.values()){const preference=bridge.getSeatPreference?.(station.number)||globalThis.SeatSettings.get(station.number);if(setStationModel(office,station.number,preference.modelId))shadowDirty=true;const pin=pins.get(station.number);pin.seatName.textContent=preference.name;pin.button.classList.toggle('has-custom-name',Boolean(preference.name));}updateOffice(office,0,0,false);sync();paint();}
  function refreshPreferences(){if(disposed||failed)return;setTheme(office,theme());stop();shadowDirty=true;updateOffice(office,0,0,false);paint();schedule();}
  function resize(){if(disposed||failed)return;const rect=viewport.getBoundingClientRect();width=Math.max(1,rect.width);height=Math.max(1,rect.height);viewport.classList.toggle('phone-office',width<760);renderer.setSize(width,height,false);setCamera(office,width,height);shadowDirty=true;updateOffice(office,0,0,false);positionPins();paint();}
  function changeView(yaw=office.yaw,elevation=office.elevation,zoom=office.zoom){const limits=cameraLimits(office.layout);office.yaw=T.MathUtils.clamp(yaw,limits.minYaw,limits.maxYaw);office.elevation=T.MathUtils.clamp(elevation,limits.minElevation,limits.maxElevation);office.zoom=T.MathUtils.clamp(zoom,limits.minZoom,limits.maxZoom);shadowDirty=true;setCamera(office,width,height);updateOffice(office,0,0,false);paint();schedule();}
  function resetView(){changeView(office.layout==='phone'?VIEW.phoneYaw:office.layout==='portrait'?VIEW.portraitYaw:VIEW.yaw,VIEW.elevation,1);}
  on(canvas,'pointerdown',e=>{if(e.button!==0)return;pointer={id:e.pointerId,x:e.clientX,y:e.clientY,yaw:office.yaw,elevation:office.elevation};dragged=false;canvas.setPointerCapture(e.pointerId);});
  on(canvas,'pointermove',e=>{if(!pointer||pointer.id!==e.pointerId)return;const dx=e.clientX-pointer.x,dy=e.clientY-pointer.y;if(Math.abs(dx)+Math.abs(dy)>5)dragged=true;if(dragged)changeView(pointer.yaw-dx*.004,pointer.elevation+dy*.002);});
  on(canvas,'pointerup',e=>{if(!pointer||pointer.id!==e.pointerId)return;const wasDragged=dragged;pointer=null;canvas.releasePointerCapture(e.pointerId);if(wasDragged)return;const rect=canvas.getBoundingClientRect();const p=new T.Vector2((e.clientX-rect.left)/rect.width*2-1,-(e.clientY-rect.top)/rect.height*2+1);raycaster.setFromCamera(p,office.camera);const hit=raycaster.intersectObjects([...office.stations.values()].map(s=>s.group),true)[0];if(hit)bridge.openSeat(hit.object.userData.seatNumber,pins.get(hit.object.userData.seatNumber).button);});
  on(canvas,'pointercancel',()=>{pointer=null;});
  on(canvas,'keydown',e=>{const actions={ArrowLeft:()=>changeView(office.yaw-.10),ArrowRight:()=>changeView(office.yaw+.10),ArrowUp:()=>changeView(office.yaw,office.elevation+.06),ArrowDown:()=>changeView(office.yaw,office.elevation-.06),'+':()=>changeView(office.yaw,office.elevation,office.zoom+.12),'=':()=>changeView(office.yaw,office.elevation,office.zoom+.12),'-':()=>changeView(office.yaw,office.elevation,office.zoom-.12),Home:resetView};if(actions[e.key]){e.preventDefault();actions[e.key]();}});
  on(document.getElementById('view-reset'),'click',resetView);
  on(document.getElementById('view-zoom-in'),'click',()=>changeView(office.yaw,office.elevation,office.zoom+.15));
  on(document.getElementById('view-zoom-out'),'click',()=>changeView(office.yaw,office.elevation,office.zoom-.15));
  on(canvas,'webglcontextlost',e=>{e.preventDefault();fail('3D 图形连接已中断，已切换为二维兼容视图。刷新页面可重试，任务状态仍会更新。');});
  on(document,'visibilitychange',()=>{if(document.hidden)stop();else{sync(snapshot,transportOk);refreshPreferences();}});
  on(darkQuery,'change',refreshPreferences);on(reducedQuery,'change',refreshPreferences);
  const resizeObserver=new ResizeObserver(resize);resizeObserver.observe(viewport);
  function dispose(){if(disposed)return;disposed=true;stop();resizeObserver.disconnect();cleanups.forEach(fn=>fn());disposeOffice(office);renderer.dispose();pinsRoot.replaceChildren();}
  on(window,'pagehide',event=>{if(!event.persisted)dispose();else stop();});
  on(window,'pageshow',()=>{if(!disposed){resize();sync();}});
  viewport.hidden=false;host.classList.add('is-3d');note.textContent='';note.hidden=true;setTheme(office,theme());resize();refreshSeatSettings();sync();
  if(failed){dispose();throw Error('3D render failed');}
  return{sync,refreshPreferences,refreshSeatSettings,dispose,office};
}
