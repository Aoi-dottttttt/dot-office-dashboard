import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const initial=JSON.parse(fs.readFileSync('initial-snapshot.json','utf8'));
const stateSource=fs.readFileSync('public/state.js','utf8');
const appSource=fs.readFileSync('public/app.js','utf8');
const settingsSource=fs.readFileSync('public/seat-settings.js','utf8');
const now=Date.parse('2000-01-02T04:00:00Z');
function data(){const snapshot=structuredClone(initial);snapshot.updatedAt=new Date(now).toISOString();for(const slot of snapshot.slots)slot.observedAt=new Date(now-60000).toISOString();return snapshot;}
class Element{
  constructor(tag='div'){this.tagName=tag.toUpperCase();this.children=[];this.dataset={};this.attributes={};this.events={};this._text='';this._classes=new Set();this.style={setProperty(){}};this.isConnected=true;this.classList={add:(...v)=>v.forEach(x=>this._classes.add(x)),remove:(...v)=>v.forEach(x=>this._classes.delete(x)),toggle:(v,on)=>{if(on===undefined)on=!this._classes.has(v);on?this._classes.add(v):this._classes.delete(v);return on;},contains:v=>this._classes.has(v)};}
  set className(v){this._classes=new Set(v.split(/\s+/).filter(Boolean));} get className(){return [...this._classes].join(' ');}
  set textContent(v){this._text=String(v);this.children=[];} get textContent(){return this._text+this.children.map(x=>x.textContent).join('');}
  append(...nodes){this.children.push(...nodes);} replaceChildren(...nodes){this._text='';this.children=nodes;} setAttribute(k,v){this.attributes[k]=String(v);} getAttribute(k){return this.attributes[k];}
  addEventListener(k,fn){this.events[k]=fn;} querySelector(){return this.svg ||= new Element('svg');} querySelectorAll(){return [];} focus(){this.focused=true;} showModal(){this.open=true;} close(){this.open=false;this.events.close?.();}getBoundingClientRect(){return{left:0,top:0,right:100,bottom:100};}
}
function runtime(snapshot=data(),options={}){
  const nodes=new Map();const inputs=['light','dark','system'].map(value=>Object.assign(new Element('input'),{value}));
  const document={hidden:false,documentElement:Object.assign(new Element('html'),{dataset:{theme:'system'}}),body:new Element('body'),getElementById(id){if(!nodes.has(id))nodes.set(id,new Element());return nodes.get(id);},createElement:t=>new Element(t),querySelectorAll:()=>inputs,addEventListener(k,fn){this[k]=fn;}};
  const storageWrites=new Map();let current={snapshot,revision:1};let failure=false;let interval=0;let fetches=0;let currentNow=now;
  class Clock extends Date{static now(){return currentNow;}}
  const reduced={matches:Boolean(options.reducedMotion),addEventListener(key,fn){this[key]=fn;}};
  const ctx=vm.createContext({document,Intl,Date:Clock,Error,Object,Set,Map,AbortController,setTimeout,clearTimeout,matchMedia:()=>reduced,localStorage:{setItem(key,value){storageWrites.set(key,value);}},fetch:async()=>{fetches++;if(failure)throw Error('offline');return{ok:true,json:async()=>current};},setInterval(fn,ms){interval=ms;}});
  vm.runInContext(stateSource,ctx);vm.runInContext(settingsSource,ctx);vm.runInContext(appSource,ctx);
  return{ctx,nodes,document,inputs,reduced,storageWrites,setData:(snapshot,revision)=>{current={snapshot,revision};},fail:v=>{failure=v;},setNow:v=>{currentNow=v;},interval:()=>interval,fetches:()=>fetches};
}
async function tick(){await new Promise(resolve=>setImmediate(resolve));}
test('freshness gates typing on observed time and successful transport',()=>{
  const ctx=vm.createContext({Date});vm.runInContext(stateSource,ctx);const inspect=(slot,ok=true)=>ctx.DashboardState.inspect(slot,now,ok);
  for(const status of ['waiting','available','unknown'])assert.equal(inspect({status,observedAt:new Date(now).toISOString()}).animate,false);
  assert.equal(inspect({status:'running',observedAt:new Date(now-720000).toISOString()}).animate,true);
  assert.equal(inspect({status:'running',observedAt:new Date(now-720001).toISOString()}).animate,false);
  for(const observedAt of [undefined,'bad',new Date(now+1).toISOString(),{toString:null},123])assert.equal(inspect({status:'running',observedAt}).animate,false);
  assert.equal(inspect({status:'running',observedAt:new Date(now).toISOString()},false).animate,false);
});
test('seven stable seats survive unchanged and newer revisions without losing focus',async()=>{
  const r=runtime();await tick();const seats=[...r.nodes.get('task-slots').children];assert.equal(seats.length,7);assert.equal(r.interval(),15000);assert.equal(r.nodes.get('occupied-count').textContent,'3');assert.equal(r.nodes.get('available-count').textContent,'4');
  const button=seats[0].children[0];button.focus();await r.ctx.load(true);assert.equal(r.nodes.get('task-slots').children[0],seats[0]);assert.equal(button.focused,true);
  const next=data();next.slots[0].title='新的任务标题';r.setData(next,2);await r.ctx.load();assert.equal(r.nodes.get('task-slots').children[0],seats[0]);assert.match(button.textContent,/新的任务标题/);assert.equal(button.focused,true);
});
test('staleness, fetch failure and recovery change motion without replacing seats',async()=>{
  const r=runtime();await tick();const first=r.nodes.get('task-slots').children[0];assert.equal(first.classList.contains('is-typing'),true);
  r.fail(true);await r.ctx.load();assert.equal(first.classList.contains('is-typing'),false);assert.match(r.nodes.get('load-message').textContent,/暂时无法刷新/);assert.equal(r.nodes.get('task-slots').children[0],first);
  r.fail(false);await r.ctx.load();assert.equal(first.classList.contains('is-typing'),true);
  r.setNow(now+720000);r.ctx.updateFreshness();assert.equal(first.classList.contains('is-typing'),false);assert.equal(first.classList.contains('is-stale'),true);assert.match(first.textContent,/待重新核对/);
});
test('summary counts expire with observations and never imply runtime capacity',async()=>{
  const r=runtime();await tick();
  assert.equal(r.nodes.get('occupied-count').textContent,'3');assert.equal(r.nodes.get('available-count').textContent,'4');assert.equal(r.nodes.get('unverified-count').textContent,'0');
  r.setNow(now+720000);r.ctx.updateFreshness();
  assert.equal(r.nodes.get('occupied-count').textContent,'0');assert.equal(r.nodes.get('available-count').textContent,'0');assert.equal(r.nodes.get('unverified-count').textContent,'7');
  r.setNow(now);r.fail(true);await r.ctx.load();
  assert.equal(r.nodes.get('occupied-count').textContent,'—');assert.equal(r.nodes.get('available-count').textContent,'—');assert.equal(r.nodes.get('unverified-count').textContent,'7');
  r.fail(false);await r.ctx.load();assert.equal(r.nodes.get('occupied-count').textContent,'3');assert.equal(r.nodes.get('unverified-count').textContent,'0');
  const html=fs.readFileSync('public/index.html','utf8');assert.doesNotMatch(html,/七个并发工作位|7 个并发名额|表示最大并发名额/);assert.match(html,/实际并发容量未核实/);
});
test('old or internally inconsistent revisions preserve the last verified content',async()=>{
  const r=runtime();await tick();const original=data();original.slots[0].title='Verified current task';r.setData(original,5);await r.ctx.load();
  const station=r.nodes.get('task-slots').children[0],bad=data();bad.slots[0].title='Must never be shown';
  for(const revision of [4,5]){r.setData(bad,revision);await r.ctx.load();assert.match(station.textContent,/Verified current task/);assert.doesNotMatch(station.textContent,/Must never be shown/);assert.equal(r.ctx.DashboardBridge.getSnapshot().slots[0].title,'Verified current task');assert.equal(r.ctx.DashboardBridge.getTransportOk(),false);}
  r.setData(original,5);await r.ctx.load(true);assert.equal(r.ctx.DashboardBridge.getTransportOk(),true);assert.match(r.nodes.get('load-message').textContent,/版本 5.*观察时间保持原值/);
});
test('an open dialog labels cached observations during failure and recovers',async()=>{
  const r=runtime();await tick();r.nodes.get('task-slots').children[0].children[0].events.click();
  assert.equal(r.nodes.get('dialog-status').textContent,'进行中');
  r.fail(true);await r.ctx.load();assert.match(r.nodes.get('dialog-status').textContent,/上次核对/);assert.match(r.nodes.get('dialog-observed').textContent,/暂时无法刷新/);
  r.fail(false);await r.ctx.load();assert.equal(r.nodes.get('dialog-status').textContent,'进行中');assert.doesNotMatch(r.nodes.get('dialog-observed').textContent,/暂时无法刷新/);
});
test('unknown capacity is not confused with empty display positions and dialog updates safely',async()=>{
  const d=data();d.capacityKnown=false;d.slots[0].status='unknown';delete d.slots[0].observedAt;d.slots[0].title='<img src=x onerror=alert(1)>';
  const r=runtime(d);await tick();assert.equal(r.nodes.get('available-count').textContent,'4');assert.equal(r.nodes.get('unverified-count').textContent,'1');const first=r.nodes.get('task-slots').children[0];assert.equal(first.classList.contains('is-typing'),false);assert.match(first.textContent,/未核实/);
  const button=first.children[0];button.events.click();assert.equal(r.nodes.get('task-dialog').open,true);assert.equal(r.nodes.get('dialog-title').textContent,d.slots[0].title);assert.equal(r.nodes.get('dialog-title').children.length,0);
  r.nodes.get('close-dialog').events.click();assert.equal(r.nodes.get('task-dialog').open,false);assert.equal(button.focused,true);
});
test('theme and animation controls preserve local choices',async()=>{
  const r=runtime();await tick();const dark=r.inputs.find(x=>x.value==='dark');dark.checked=true;dark.events.change();assert.equal(r.document.documentElement.dataset.theme,'dark');r.nodes.get('motion-toggle').events.click();assert.equal(r.document.documentElement.dataset.motion,'off');assert.equal(r.nodes.get('motion-toggle').getAttribute('aria-pressed'),'false');
});
test('malformed snapshots cannot partly replace the last successful snapshot',async()=>{
  const r=runtime();await tick();const first=r.nodes.get('task-slots').children[0];const original=first.children[0].getAttribute('aria-label');
  const invalid=data();invalid.slots[0].title='Must not be shown';invalid.waiting={length:1};r.setData(invalid,2);await r.ctx.load();
  assert.equal(first.children[0].getAttribute('aria-label'),original);assert.match(r.nodes.get('load-message').textContent,/上次成功读取/);
  const repaired=data();repaired.slots[0].title='Valid replacement';r.setData(repaired,2);await r.ctx.load();assert.match(first.textContent,/Valid replacement/);
});
test('reduced-motion system preference disables working motion controls',async()=>{
  const r=runtime(data(),{reducedMotion:true});await tick();const button=r.nodes.get('motion-toggle');assert.equal(button.disabled,true);assert.equal(button.getAttribute('aria-pressed'),'false');assert.match(button.getAttribute('aria-label'),/系统偏好/);
  assert.equal(r.nodes.get('task-slots').children[0].classList.contains('is-working'),true);
  r.reduced.matches=false;r.reduced.change();assert.equal(button.disabled,false);assert.equal(button.getAttribute('aria-pressed'),'true');
  assert.match(fs.readFileSync('public/styles.css','utf8'),/@media\(prefers-reduced-motion:reduce\)/);
});
test('working desks use genuine rear assets and idle desks face the viewer',async()=>{
  const d=data();d.slots[0].status='running';d.slots[1].status='waiting';d.slots[2].status='unknown';d.slots[3].status='available';
  const r=runtime(d);await tick();const seats=r.nodes.get('task-slots').children;
  assert.equal(seats[0].classList.contains('is-working'),true);for(const seat of seats.slice(1,4))assert.equal(seat.classList.contains('is-working'),false);
  seats.forEach((seat,index)=>{const images=seat.children[0].children[0].children;assert.equal(images.find(x=>x.classList.contains('mascot-front')).src,`assets/dot-${index+1}.webp`);assert.equal(images.find(x=>x.classList.contains('mascot-back')).src,`assets/dot-${index+1}-back.webp`);assert.equal(images.find(x=>x.classList.contains('chair-back')).src,'assets/chair-back.webp');});
  r.fail(true);await r.ctx.load();assert.equal(seats[0].classList.contains('is-working'),false);assert.match(seats[0].textContent,/上次核对/);
  r.fail(false);await r.ctx.load();assert.equal(seats[0].classList.contains('is-working'),true);
  assert.doesNotMatch(fs.readFileSync('public/styles.css','utf8'),/scaleX\(-1\)|rotateY\(180deg\)/);
});
test('malformed observation values cannot strand the polling loop',async()=>{
  const r=runtime();await tick();const first=r.nodes.get('task-slots').children[0];const original=first.children[0].getAttribute('aria-label');
  const malformed=data();malformed.slots[0].title='Must not replace cached task';malformed.slots[0].status='available';malformed.slots[0].observedAt={toString:null};r.setData(malformed,2);await r.ctx.load();
  assert.equal(first.children[0].getAttribute('aria-label'),original);assert.doesNotThrow(()=>r.ctx.updateFreshness());
  const repaired=data();repaired.slots[0].title='Polling recovered';r.setData(repaired,2);await r.ctx.load();assert.match(first.textContent,/Polling recovered/);
});
test('visible timezone labels use UTC+08 and East Eight',async()=>{
  const r=runtime();await tick();assert.match(r.ctx.formatTime('2000-01-02T00:00:00Z'),/08:00/);
  const source=fs.readFileSync('public/index.html','utf8')+appSource;assert.doesNotMatch(source,/北京时间/);assert.match(source,/UTC\+08:00/);assert.match(source,/东八区/);
});
test('maintenance copy is explicitly a dated record rather than a live scheduler claim',async()=>{
  const d=data();d.maintenance={status:'paused',intervalMinutes:10,description:'已暂停自动更新',observedAt:'2000-01-01T00:00:00Z'};
  const r=runtime(d);await tick();assert.match(r.nodes.get('maintenance-message').textContent,/同步设置记录.*2000\/01\/01 08:00:00.*已暂停自动更新/);
});
test('each stable station has one screen and two independently animated hands',async()=>{
  const r=runtime();await tick();const seats=[...r.nodes.get('task-slots').children];
  const art=seats.map(seat=>seat.children[0].children[0]);
  art.forEach(layer=>{
    assert.equal(layer.getAttribute('aria-hidden'),'true');
    assert.equal(layer.children.filter(el=>el.classList.contains('monitor-display')).length,1);
    assert.equal(layer.children.filter(el=>el.classList.contains('typing-hand')).length,2);
    assert.equal(layer.children.filter(el=>el.classList.contains('keyboard-tap')).length,2);
  });
  const screens=art.map(layer=>layer.children.find(el=>el.classList.contains('monitor-display')));
  await r.ctx.load();
  art.forEach((layer,index)=>assert.equal(layer.children.find(el=>el.classList.contains('monitor-display')),screens[index]));
  const css=fs.readFileSync('public/styles.css','utf8');
  assert.match(css,/\.station\.is-typing \.hand-left\{animation:typing-left/);
  assert.match(css,/\.station\.is-typing \.hand-right\{animation:typing-right/);
  assert.match(css,/\.station\.is-typing \.mascot-back\{animation:working-settle/);
  assert.match(css,/:root\[data-motion=off\] \.typing-hand,body\.page-hidden \.typing-hand\{animation:none!important\}/);
  assert.match(css,/@media\(prefers-reduced-motion:reduce\)\{\.typing-hand\{animation:none!important\}/);
});
test('screen source styling is bright only for valid work and independent of motion preferences',async()=>{
  const r=runtime();await tick();const first=r.nodes.get('task-slots').children[0];
  assert.equal(first.classList.contains('is-working'),true);
  r.nodes.get('motion-toggle').events.click();assert.equal(first.classList.contains('is-working'),true);
  r.reduced.matches=true;r.reduced.change();assert.equal(first.classList.contains('is-working'),true);
  r.fail(true);await r.ctx.load();assert.equal(first.classList.contains('is-working'),false);
  r.fail(false);await r.ctx.load();assert.equal(first.classList.contains('is-working'),true);
  const cases=[
    ['waiting',new Date(now).toISOString(),false],
    ['available',new Date(now).toISOString(),false],
    ['unknown',new Date(now).toISOString(),false],
    ['running',new Date(now-720001).toISOString(),false],
    ['running',new Date(now+1).toISOString(),false],
    ['running','invalid timestamp',false],
    ['running',null,false],
    ['running',new Date(now-720000).toISOString(),true]
  ];
  let revision=2;
  for(const [status,observedAt,bright] of cases){
    const next=data();Object.assign(next.slots[0],{status,observedAt});r.setData(next,revision++);await r.ctx.load();
    assert.equal(first.classList.contains('is-working'),bright,`${status}: ${observedAt}`);
    assert.equal(r.nodes.get('task-slots').children[0],first);
  }
  const css=fs.readFileSync('public/styles.css','utf8');
  assert.match(css,/\.monitor-display\{[^}]*background:linear-gradient\(145deg,var\(--screen-off-top\),var\(--screen-off-bottom\)\)/);
  assert.match(css,/\.station\.is-working \.monitor-display\{background:linear-gradient/);
  assert.doesNotMatch(css,/\.is-typing \.monitor-display/);
  assert.doesNotMatch(css,/\.monitor-display(?:::[\w-]+)?\{[^}]*animation:/);
  assert.doesNotMatch(css,/\[data-motion=off\][^{}]*\.monitor-display\{[^}]*(?:opacity|background|filter):/);
});
test('rear-view body and chair occlude hands and key highlights',()=>{
  const css=fs.readFileSync('public/styles.css','utf8').replace(/\/\*[\s\S]*?\*\//g,'');
  function zIndex(selector){
    let value;
    for(const [,selectors,body] of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)){
      if(selectors.trim()!==selector)continue;
      const declaration=body.match(/(?:^|;)z-index:(\d+)(?:;|$)/);
      if(declaration)value=Number(declaration[1]);
    }
    assert.notEqual(value,undefined,`Missing z-index for ${selector}`);return value;
  }
  const desk=zIndex('.desk-art'),hands=zIndex('.typing-hand'),keys=zIndex('.keyboard-tap'),body=zIndex('.mascot'),chair=zIndex('.chair-back');
  assert.ok(desk<hands,'Hands must remain above the desktop');
  assert.ok(hands<body,'The back must occlude both hands');
  assert.ok(keys<body,'Key highlights must not paint over the back');
  assert.ok(body<chair,'The rear chair must remain in front of the body');
});
test('3D bridge receives observed states without replacing the accessible task UI',async()=>{
  const r=runtime();await tick();const seats=[...r.nodes.get('task-slots').children];const calls=[];let preferenceChanges=0;r.ctx.Office3D={sync:(snapshot,ok)=>calls.push({snapshot,ok}),refreshPreferences:()=>preferenceChanges++};
  r.ctx.updateFreshness();assert.equal(calls.at(-1).ok,true);assert.equal(calls.at(-1).snapshot.slots.length,7);r.fail(true);await r.ctx.load();assert.equal(calls.at(-1).ok,false);
  r.ctx.DashboardBridge.openSeat(1);assert.equal(r.nodes.get('task-dialog').open,true);assert.equal(r.nodes.get('task-slots').children[0],seats[0]);
  r.nodes.get('motion-toggle').events.click();assert.ok(preferenceChanges>0);assert.equal(r.ctx.DashboardBridge.getTransportOk(),false);
});
test('details return keyboard focus to the task list if a 3D pin disappears',async()=>{const r=runtime();await tick();const pin=new Element('button');r.ctx.DashboardBridge.openSeat(1,pin);pin.isConnected=false;r.nodes.get('close-dialog').events.click();assert.equal(r.nodes.get('task-slots').children[0].children[0].focused,true);});

test('seat editor saves a custom name/model without changing live task titles or station identity',async()=>{
  const r=runtime();await tick();const station=r.nodes.get('task-slots').children[0],button=station.children[0];button.events.click();const taskTitle=r.nodes.get('dialog-title').textContent;
  r.nodes.get('seat-name').value='<design desk>';r.nodes.get('seat-model').value='rose-heart';r.nodes.get('seat-editor').events.submit({preventDefault(){}});
  assert.equal(r.ctx.SeatSettings.get(1).name,'<design desk>');assert.equal(r.nodes.get('dialog-title').textContent,taskTitle);assert.match(r.nodes.get('dialog-seat').textContent,/<design desk>/);assert.equal(r.nodes.get('task-slots').children[0],station);
  const art=button.children[0];assert.equal(art.children.find(x=>x.classList.contains('mascot-front')).src,'assets/dot-6.webp');assert.match(r.nodes.get('seat-save-message').textContent,/已保存在当前浏览器/);
  r.nodes.get('seat-reset').events.click();assert.equal(r.ctx.SeatSettings.get(1).name,'');assert.equal(r.ctx.SeatSettings.get(1).modelId,'cloud-headset');assert.equal(r.nodes.get('dialog-title').textContent,taskTitle);
});

test('legacy and explicitly unknown configurations never guess a model or effort',async()=>{
  const d=data();d.slots[0].model='unverified-model';d.slots[0].reasoningEffort='max';
  const r=runtime(d);await tick();r.ctx.DashboardBridge.openSeat(1);
  const panel=r.nodes.get('dialog-execution');
  assert.equal(panel.children[0].children[1].textContent,'未核实');
  assert.equal(panel.children[1].children[1].textContent,'未核实');
  assert.doesNotMatch(panel.textContent,/unverified-model|max|gpt-/);
  r.ctx.DashboardBridge.openSeat(4);assert.match(panel.textContent,/暂无任务/);
});
test('a vacant display seat cannot inherit a previous task model or effort',async()=>{
  const d=data();Object.assign(d.slots[3],{model:'previous-task-model',reasoningEffort:'max',modelSource:'runtime',reasoningEffortSource:'requested'});
  const r=runtime(d);await tick();r.ctx.DashboardBridge.openSeat(4);
  assert.doesNotMatch(r.nodes.get('dialog-execution').textContent,/previous-task-model|max|运行值|申请值/);assert.match(r.nodes.get('dialog-execution').textContent,/暂无任务/);
});
test('requested and runtime-verified values remain independent and explicit',async()=>{
  const d=data();Object.assign(d.slots[0],{model:'gpt-6-astra',reasoningEffort:'max',modelSource:'requested',reasoningEffortSource:'runtime'});
  const r=runtime(d);await tick();const station=r.nodes.get('task-slots').children[0];
  assert.match(station.textContent,/gpt-6-astra申请值/);assert.match(station.textContent,/max运行值/);
  r.ctx.DashboardBridge.openSeat(1);const panel=r.nodes.get('dialog-execution');
  assert.equal(panel.children[0].dataset.source,'requested');assert.equal(panel.children[1].dataset.source,'runtime');
  assert.match(panel.children[0].getAttribute('aria-label'),/实际运行值尚未核实/);
  assert.match(r.nodes.get('dialog-execution-note').textContent,/不代表已核实的实际运行值/);
  assert.equal(r.ctx.SeatSettings.get(1).modelId,'cloud-headset');
});
test('live metadata changes update an open dialog and stable cards without changing seat preferences',async()=>{
  const r=runtime();await tick();const station=r.nodes.get('task-slots').children[0];r.ctx.DashboardBridge.openSeat(1);
  r.nodes.get('seat-name').value='专属工位';r.nodes.get('seat-model').value='rose-heart';r.nodes.get('seat-editor').events.submit({preventDefault(){}});
  const next=data();Object.assign(next.slots[0],{model:'gpt-6-astra',reasoningEffort:'ultra',modelSource:'requested',reasoningEffortSource:'requested'});r.setData(next,2);await r.ctx.load();
  assert.equal(r.nodes.get('task-slots').children[0],station);assert.match(station.textContent,/gpt-6-astra/);assert.match(r.nodes.get('dialog-execution').textContent,/ultra/);
  assert.equal(r.ctx.SeatSettings.get(1).name,'专属工位');assert.equal(r.ctx.SeatSettings.get(1).modelId,'rose-heart');
  const cleared=data();r.setData(cleared,3);await r.ctx.load();assert.doesNotMatch(station.textContent,/gpt-6-astra/);assert.match(r.nodes.get('dialog-execution').textContent,/未核实/);
});
test('waiting and recent records expose configuration provenance without affecting task counts',async()=>{
  const d=data(),config={model:'gpt-6-astra',reasoningEffort:'max',modelSource:'requested',reasoningEffortSource:'requested'};
  d.waiting=[{title:'等待审阅',description:'等待确认',kind:'decision',observedAt:new Date(now).toISOString(),...config}];
  d.recent=[{title:'已完成的任务',result:'已交付',status:'completed',observedAt:new Date(now).toISOString(),...config}];
  const r=runtime(d);await tick();assert.match(r.nodes.get('waiting-list').textContent,/gpt-6-astra申请值/);assert.match(r.nodes.get('recent-list').textContent,/max申请值/);
  assert.equal(r.nodes.get('occupied-count').textContent,'3');assert.equal(r.nodes.get('available-count').textContent,'4');
});
test('long labels render as plain text and metadata CSS wraps in narrow information panels',async()=>{
  const d=data(),model='<img src=x onerror=alert(1)>'+ 'model-label-'.repeat(10),effort='long-effort-'.repeat(6);
  Object.assign(d.slots[0],{model,reasoningEffort:effort,modelSource:'requested',reasoningEffortSource:'requested'});
  const r=runtime(d);await tick();r.ctx.DashboardBridge.openSeat(1);const row=r.nodes.get('dialog-execution').children[0];
  assert.equal(row.children[1].textContent,model);assert.equal(row.children[1].children.length,0);
  const css=fs.readFileSync('public/styles.css','utf8');
  assert.match(css,/\.execution-field\{[^}]*flex-wrap:wrap[^}]*min-width:0[^}]*overflow-wrap:anywhere/);
  assert.match(css,/\.execution-value\{[^}]*max-width:100%[^}]*overflow-wrap:anywhere/);
  assert.match(css,/@media\(max-width:699px\)\{[^\n]*\.dialog-execution-section \.execution-field\{display:grid;grid-template-columns:minmax\(0,1fr\) auto/);
});
test('invalid configuration payloads preserve the last successful snapshot',async()=>{
  const r=runtime();await tick();const station=r.nodes.get('task-slots').children[0];
  for(const invalid of [{model:[]},{model:'x'.repeat(161)},{reasoningEffort:'x'.repeat(81)},{model:'\nsecret'},{model:'   '},{modelSource:'inherited'},{reasoningEffortSource:'runtime'},{reasoningEffortSource:{toString:null}}]){
    const d=data();Object.assign(d.slots[0],invalid);d.slots[0].title='Rejected replacement';r.setData(d,2);await r.ctx.load();
    assert.doesNotMatch(station.textContent,/Rejected replacement/);assert.match(r.nodes.get('load-message').textContent,/上次成功读取/);
  }
});

test('running, waiting, empty and unverified display positions are counted independently',async()=>{
  const d=data();d.capacityKnown=false;
  d.slots.forEach((slot,index)=>{slot.status=index<5?'running':index===5?'waiting':'unknown';});
  const r=runtime(d);await tick();
  assert.equal(r.nodes.get('occupied-count').textContent,'5');assert.equal(r.nodes.get('waiting-count').textContent,'1');assert.equal(r.nodes.get('available-count').textContent,'0');assert.equal(r.nodes.get('unverified-count').textContent,'1');
  const html=fs.readFileSync('public/index.html','utf8');assert.match(html,/已观察等待/);assert.match(html,/空展示位/);assert.doesNotMatch(html,/未知.{0,30}未运行/);
});

test('public demo keeps its labels and existing browser preference keys',async()=>{
  const html=fs.readFileSync('public/index.html','utf8'),theme=fs.readFileSync('public/theme.js','utf8');
  assert.match(html,/虚构演示数据/);assert.match(html,/这是虚构任务演示/);assert.match(html,/<title>dot 办公室<\/title>/);assert.doesNotMatch(html,/仅自己可见/);
  const r=runtime();await tick();const dark=r.inputs.find(input=>input.value==='dark');dark.checked=true;dark.events.change();r.nodes.get('motion-toggle').events.click();
  assert.equal(r.storageWrites.get('dot-office-theme'),'dark');assert.equal(r.storageWrites.get('dot-office-motion'),'off');
  for(const key of ['dot-office-theme','dot-office-motion'])assert.ok(theme.includes(key));
});
test('dialog avatar and card accent track the selected character without changing task text',async()=>{
  const r=runtime();await tick();const station=r.nodes.get('task-slots').children[0],title=data().slots[0].title;
  station.children[0].events.click();assert.equal(r.nodes.get('dialog-avatar').src,'assets/dot-1.webp');
  r.ctx.SeatSettings.save(1,{name:'Demo seat',modelId:'rose-heart'});
  assert.equal(station.dataset.model,'rose-heart');assert.equal(r.nodes.get('task-dialog').dataset.model,'rose-heart');assert.equal(r.nodes.get('dialog-avatar').src,'assets/dot-6.webp');assert.equal(r.nodes.get('dialog-title').textContent,title);
});
