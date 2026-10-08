'use strict';
const labels = DashboardState.labels;
const $ = id => document.getElementById(id);
const stations = new Map();
let snapshot = null;
let loading = false;
let revision = null;
let transportOk = false;
let selectedSeat = null;
let lastFocused = null;
let extrasSignature = '';
let snapshotSignature = '';
function element(tag, className, text) { const el = document.createElement(tag); if (className) el.className = className; if (text !== undefined) el.textContent = text; return el; }
function setText(node, text) { if (node.textContent !== String(text)) node.textContent = text; }
function formatTime(value, seconds = false) { const date = new Date(typeof value === 'string' ? value : NaN); return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', ...(seconds ? { second: '2-digit' } : {}), hourCycle: 'h23' }).format(date) : '未核实'; }
function executionPanel(item, className = '') {
  const panel = element('span', `task-execution ${className}`.trim());
  panel.setAttribute('aria-label', '任务模型与推理强度');
  updateExecutionPanel(panel, item);
  return panel;
}
function updateExecutionPanel(panel, item) {
  const fields = DashboardState.execution(item);
  if (!panel.children.length) fields.forEach(() => {
    const field = element('span', 'execution-field');
    field.append(element('span', 'execution-label'), element('span', 'execution-value'), element('span', 'execution-source'));
    panel.append(field);
  });
  fields.forEach((field, index) => {
    const row = panel.children[index];
    setText(row.children[0], field.label);
    setText(row.children[1], field.value);
    setText(row.children[2], field.sourceLabel);
    row.children[2].hidden = !field.sourceLabel;
    row.dataset.source = field.source;
    row.title = field.description;
    row.setAttribute('aria-label', `${field.label}：${field.value}${field.sourceLabel ? '，' + field.sourceLabel : ''}。${field.description}`);
  });
}
function validate(data) {
  if (!data || data.schemaVersion !== 2 || data.maxConcurrency !== 7 || typeof data.capacityKnown !== 'boolean' || !Number.isFinite(Date.parse(data.updatedAt)) || !Array.isArray(data.slots) || data.slots.length !== 7 || !Array.isArray(data.recent) || !Array.isArray(data.waiting)) throw Error('快照格式不正确');
  const ids = new Set();
  for (const s of data.slots) { if (!s || !Number.isInteger(s.number) || s.number < 1 || s.number > 7 || ids.has(s.number) || !Object.hasOwn(labels, s.status) || typeof s.title !== 'string' || typeof s.summary !== 'string' || ['goal','latestResult','blocker','category','observedAt'].some(key => s[key] != null && typeof s[key] !== 'string')) throw Error('工位格式不正确'); if (!DashboardState.validExecution(s)) throw Error('任务配置信息格式不正确'); ids.add(s.number); }
  if (data.waiting.some(item => !item || typeof item.title !== 'string' || typeof item.description !== 'string' || !['external', 'decision', 'paused'].includes(item.kind)) || data.recent.some(item => !item || typeof item.title !== 'string' || typeof item.result !== 'string' || !['completed', 'stopped'].includes(item.status))) throw Error('任务记录格式不正确');
  if ([...data.waiting, ...data.recent].some(item => !DashboardState.validExecution(item))) throw Error('任务配置信息格式不正确');
  if (data.maintenance != null && (typeof data.maintenance !== 'object' || typeof data.maintenance.description !== 'string')) throw Error('同步信息格式不正确');
  return data;
}
function makeStation(number) {
  const article = element('article', 'station'); article.dataset.number = String(number); article.setAttribute('role', 'listitem'); article.style.setProperty('--phase', `${-number * .17}s`);
  const button = element('button', 'station-button'); button.type = 'button'; button.setAttribute('aria-haspopup', 'dialog');
  const art = element('span', 'station-art'); art.setAttribute('aria-hidden', 'true');
  const desk = element('img', 'desk-art'); desk.src = 'assets/desk-overhead.webp'; desk.alt = ''; desk.width = 640; desk.height = 427;
  const chairFront = element('img', 'chair-art chair-front pose-front'); chairFront.src = 'assets/chair-front.webp'; chairFront.alt = ''; chairFront.width = 384; chairFront.height = 370;
  const chairBack = element('img', 'chair-art chair-back pose-back'); chairBack.src = 'assets/chair-back.webp'; chairBack.alt = ''; chairBack.width = 384; chairBack.height = 370;
  const mascotFront = element('img', 'mascot mascot-front pose-front'); mascotFront.src = `assets/dot-${number}.webp`; mascotFront.alt = ''; mascotFront.width = 384; mascotFront.height = 384;
  const mascotBack = element('img', 'mascot mascot-back pose-back'); mascotBack.src = `assets/dot-${number}-back.webp`; mascotBack.alt = ''; mascotBack.width = 384; mascotBack.height = 384;
  const monitor = element('span', 'monitor-display');
  const handLeft = element('span', 'typing-hand hand-left pose-back');
  const handRight = element('span', 'typing-hand hand-right pose-back');
  art.append(desk, monitor, chairFront, chairBack, mascotFront, mascotBack, element('span', 'keyboard-tap'), element('span', 'keyboard-tap second'), handLeft, handRight);
  const info = element('span', 'station-info');
  const top = element('span', 'station-top'); top.append(element('span', 'seat-number', `工位 ${String(number).padStart(2, '0')}`));
  const customName = element('span', 'station-custom-name'); customName.hidden = true;
  const title = element('span', 'station-title');
  const statusRow = element('span', 'station-status');
  const status = element('span', 'status'); status.id = `seat-${number}-status`;
  const note = element('span', 'stale-label', '待重新核对'); statusRow.append(status, note);
  const observed = element('span', 'station-observed'); observed.id = `seat-${number}-observed`;
  button.setAttribute('aria-describedby', `${status.id} ${observed.id}`);
  const execution = executionPanel({});
  info.append(top, customName, title, statusRow, execution, observed); button.append(art, info); article.append(button);
  button.addEventListener('click', () => openTask(number, button));
  const refs = { article, button, title, status, note, observed, execution, customName, mascotFront, mascotBack };
  stations.set(number, refs); return refs;
}
function updateFreshness() {
  if (!snapshot) return;
  const now = Date.now();
  const overview = DashboardState.overview(snapshot, now, transportOk);
  setText($('occupied-count'), overview.running ?? '—');
  setText($('waiting-count'), overview.waiting ?? '—');
  setText($('available-count'), overview.available ?? '—');
  setText($('unverified-count'), overview.pending);
  for (const slot of snapshot.slots) {
    const refs = stations.get(slot.number); if (!refs) continue;
    const state = DashboardState.inspect(slot, now, transportOk);
    refs.article.classList.toggle('is-typing', state.animate);
    refs.article.classList.toggle('is-working', state.animate);
    refs.article.classList.toggle('is-stale', state.stale || (!state.valid && slot.status === 'running'));
    refs.article.classList.toggle('is-unknown', slot.status === 'unknown');
    const historical = (!state.fresh || !transportOk) && slot.status !== 'unknown';
    setText(refs.status, historical ? `上次核对：${state.label}` : state.label);
    refs.status.className = `status ${slot.status}${historical ? ' historical' : ''}`;
    setText(refs.note, state.valid ? '待重新核对' : '时间未核实');
    setText(refs.observed, state.ageLabel);
    refs.observed.title = state.valid ? `${formatTime(slot.observedAt, true)}（UTC+08:00）` : '缺少有效的任务观察时间';
  }
  if ($('task-dialog').open && selectedSeat !== null) updateDialog();
  globalThis.Office3D?.sync(snapshot, transportOk);
}
function render(data) {
  const grid = $('task-slots'); grid.setAttribute('role', 'list');
  if (!stations.size) grid.replaceChildren();
  for (const slot of data.slots.slice().sort((a, b) => a.number - b.number)) {
    const existing = stations.has(slot.number);
    const refs = stations.get(slot.number) || makeStation(slot.number);
    if (!existing) grid.append(refs.article);
    setText(refs.title, slot.title);
    updateExecutionPanel(refs.execution, slot);
    refs.button.setAttribute('aria-label', `工位 ${String(slot.number).padStart(2, '0')}，${slot.title}，查看任务详情`);
  }
  updateSeatPreferences();
  grid.setAttribute('aria-busy', 'false');
  $('updated-at').dateTime = data.updatedAt; setText($('updated-at'), formatTime(data.updatedAt, true));
  setText($('maintenance-message'), data.maintenance ? `同步设置记录 · ${formatTime(data.maintenance.observedAt, true)}：${data.maintenance.description}` : '');
  const signature = JSON.stringify([data.waiting || [], data.recent]);
  if (signature !== extrasSignature) {
    const waiting = data.waiting || [];
    $('waiting-section').hidden = !waiting.length;
    $('waiting-list').replaceChildren(...waiting.map(item => {
      const card = element('article', 'waiting-card');
      card.append(element('span', 'section-kicker', item.kind === 'external' ? '等待外部回复' : item.kind === 'decision' ? '等待你的决定' : '已暂停'), element('h3', '', item.title), element('p', '', item.description), element('p', 'observed-time', `最后观察：${formatTime(item.observedAt)}`));
      card.append(executionPanel(item, 'record-execution'));
      return card;
    }));
    setText($('recent-count'), data.recent.length);
    $('recent-list').replaceChildren(...data.recent.map(item => {
      const row = element('article', 'recent-item');
      row.append(element('span', `recent-check ${item.status === 'stopped' ? 'stopped' : ''}`, item.status === 'stopped' ? '—' : '✓'));
      const content = element('div'); content.append(element('h3', '', item.title), element('p', '', item.result));
      content.append(executionPanel(item, 'record-execution'));
      if (item.observedAt) content.append(element('p', 'observed-time', `最后核对：${formatTime(item.observedAt)}`));
      row.append(content, element('span', 'recent-status', item.status === 'stopped' ? '已停止' : '已完成')); return row;
    }));
    extrasSignature = signature;
  }
}
function updateDialog() {
  const slot = snapshot?.slots.find(item => item.number === selectedSeat); if (!slot) return;
  const state = DashboardState.inspect(slot, Date.now(), transportOk);
  const seatName=SeatSettings.get(slot.number).name;setText($('dialog-seat'), `${seatName ? seatName+' · ' : ''}工位 ${String(slot.number).padStart(2, '0')}`);
  setText($('dialog-title'), slot.title); setText($('dialog-summary'), slot.summary);
  const historical = (!state.fresh || !transportOk) && slot.status !== 'unknown';
  $('dialog-status').className = `status ${historical ? 'unknown' : slot.status}`;
  setText($('dialog-status'), historical ? `上次核对：${state.label}` : state.label);
  const observedLabel = state.valid ? `${formatTime(slot.observedAt, true)} · UTC+08:00${state.stale ? ' · 待重新核对' : ''}` : '观察时间未核实';
  setText($('dialog-observed'), `${observedLabel}${!transportOk ? ' · 暂时无法刷新，显示上次观察' : ''}`);
  updateExecutionPanel($('dialog-execution'), slot);
  const hasRequested = DashboardState.execution(slot).some(field => field.source === 'requested');
  setText($('dialog-execution-note'), hasRequested ? '申请值来自任务启动配置，不代表已核实的实际运行值。' : '运行值仅在运行信息可核实时显示；缺少来源时显示“未核实”。');
  const values = [['目标', slot.goal], ['最新结果', slot.latestResult], ['阻塞', slot.blocker || '暂无']];
  const list = $('dialog-details');
  if (!list.children.length) values.forEach(([label]) => list.append(element('dt', '', label), element('dd')));
  values.forEach(([, value], index) => setText(list.children[index * 2 + 1], value || '暂无补充'));
}
function openTask(number, button) {
  selectedSeat = number; lastFocused = button; updateDialog();fillSeatEditor();
  if (!$('task-dialog').open) $('task-dialog').showModal();
}
function updateSeatPreferences() {
  for (const [number,refs] of stations) {
    const preference=SeatSettings.get(number),model=SeatSettings.model(preference.modelId);
    setText(refs.customName,preference.name);refs.customName.hidden=!preference.name;
    refs.mascotFront.src=`assets/dot-${model.image}.webp`;refs.mascotBack.src=`assets/dot-${model.image}-back.webp`;
    refs.article.style.setProperty('--hand-color',`#${model.color.toString(16).padStart(6,'0')}`);refs.article.style.setProperty('--hand-light',`#${model.color.toString(16).padStart(6,'0')}`);
    refs.button.setAttribute('aria-label',`${preference.name?preference.name+'，':''}工位 ${String(number).padStart(2,'0')}，${refs.title.textContent}，查看任务详情`);
  }
}
function previewSeatModel() { const model=SeatSettings.model($('seat-model').value);if(model){$('seat-model-preview').src=`assets/dot-${model.image}.webp`;$('seat-model-preview').alt=model.label;} }
function fillSeatEditor() {
  if(selectedSeat===null)return;const preference=SeatSettings.get(selectedSeat);
  $('seat-name').value=preference.name;$('seat-name').placeholder=`工位 ${String(selectedSeat).padStart(2,'0')}`;$('seat-model').value=preference.modelId;previewSeatModel();setText($('seat-save-message'),'');
}
function setupSeatEditor() {
  $('seat-model').replaceChildren(...SeatSettings.models.map(model=>{const option=element('option','',model.label);option.value=model.id;return option;}));
  $('seat-model').addEventListener('change',previewSeatModel);
  $('seat-editor').addEventListener('submit',event=>{event.preventDefault();if(selectedSeat===null)return;
    try{const result=SeatSettings.save(selectedSeat,{name:$('seat-name').value,modelId:$('seat-model').value});$('seat-name').value=result.value.name;setText($('seat-save-message'),result.persisted?'已保存在当前浏览器':'已应用到本页；浏览器未允许保存，刷新后会恢复');}catch(error){setText($('seat-save-message'),error.message);}
  });
  $('seat-reset').addEventListener('click',()=>{if(selectedSeat===null)return;const result=SeatSettings.reset(selectedSeat);fillSeatEditor();setText($('seat-save-message'),result.persisted?'已恢复此工位的默认设置':'已在本页恢复默认；浏览器未允许保存');});
  SeatSettings.subscribe(()=>{updateSeatPreferences();if(selectedSeat!==null)updateDialog();globalThis.Office3D?.refreshSeatSettings?.();});
}
function setupPreferences() {
  document.querySelectorAll('input[name="theme"]').forEach(input => {
    input.checked = input.value === document.documentElement.dataset.theme;
    input.addEventListener('change', () => {
      if (!input.checked) return;
      document.documentElement.dataset.theme = input.value;
      try { localStorage.setItem('dot-office-theme', input.value); } catch { /* Optional local preference. */ }
      globalThis.Office3D?.refreshPreferences();
    });
  });
  const motionButton = $('motion-toggle');
  const reducedMotion = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)');
  const syncMotion = () => {
    const reduced = Boolean(reducedMotion?.matches);
    const enabled = document.documentElement.dataset.motion !== 'off' && !reduced;
    motionButton.setAttribute('aria-pressed', String(enabled));
    motionButton.disabled = reduced;
    const label = reduced ? '已按系统偏好减少动态效果' : enabled ? '关闭工作动画' : '开启工作动画';
    motionButton.setAttribute('aria-label', label);
    motionButton.title = label;
    globalThis.Office3D?.refreshPreferences();
  };
  syncMotion();
  reducedMotion?.addEventListener('change', syncMotion);
  motionButton.addEventListener('click', () => {
    const mode = document.documentElement.dataset.motion === 'off' ? 'on' : 'off';
    document.documentElement.dataset.motion = mode;
    try { localStorage.setItem('dot-office-motion', mode); } catch { /* Optional local preference. */ }
    syncMotion();
  });
}
async function load(userTriggered = false) {
  if (loading) return; loading = true;
  const button = $('refresh'); button.disabled = true; button.querySelector('svg').classList.add('spinner');
  if (userTriggered) setText($('load-message'), '正在重新读取任务快照…');
  const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch('/api/snapshot', { cache: 'no-store', redirect: 'error', signal: controller.signal });
    if (!response.ok) throw Error('读取失败');
    const envelope = await response.json(); const data = validate(envelope.snapshot);
    if (!Number.isSafeInteger(envelope.revision) || envelope.revision < 0) throw Error('版本格式不正确');
    if (revision !== null && envelope.revision < revision) throw Error('收到旧版本快照');
    const signature = JSON.stringify(data);
    const unchanged = snapshot && revision === envelope.revision;
    if (unchanged && signature !== snapshotSignature) throw Error('同一版本的快照内容不一致');
    if (!unchanged) render(data);
    transportOk = true; snapshot = data; revision = envelope.revision; snapshotSignature = signature;
    updateFreshness();
    $('load-message').classList.remove('error');
    setText($('load-message'), userTriggered ? (unchanged ? `已读取版本 ${revision}，快照没有变化；观察时间保持原值` : `已读取新的任务快照 · 版本 ${revision}`) : `快照版本 ${revision} · 任务状态以各自的最后观察时间为准`);
  } catch {
    transportOk = false; updateFreshness(); $('load-message').classList.add('error');
    setText($('load-message'), snapshot ? '暂时无法刷新，仍显示上次成功读取的快照；工作动画已暂停' : '暂时无法读取快照，请点击“读取快照”重试');
    if (!snapshot) { $('task-slots').replaceChildren(element('div', 'empty-error', '没有读取到任务状态')); $('task-slots').setAttribute('aria-busy', 'false'); }
  } finally {
    clearTimeout(timeout); loading = false; button.disabled = false; button.querySelector('svg').classList.remove('spinner');
  }
}
globalThis.DashboardBridge = Object.freeze({
  getSnapshot: () => snapshot,
  getTransportOk: () => transportOk,
  getSeatPreference: number => SeatSettings.get(number),
  openSeat(number, sourceButton) { const refs = stations.get(number); if (refs) openTask(number, sourceButton || refs.button); }
});
setupPreferences();
setupSeatEditor();
document.body.classList.toggle('page-hidden', document.hidden);
$('refresh').addEventListener('click', () => load(true));
$('close-dialog').addEventListener('click', () => $('task-dialog').close());
$('task-dialog').addEventListener('close', () => { const fallbackButton = stations.get(selectedSeat)?.button; selectedSeat = null; const target = lastFocused?.isConnected && !lastFocused.hidden ? lastFocused : fallbackButton; target?.focus(); });
$('task-dialog').addEventListener('click', event => { if (event.target !== $('task-dialog')) return; const rect = event.target.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) event.target.close(); });
load();
setInterval(()=>{if(!document.hidden){updateFreshness();load();}},15000);
document.addEventListener('visibilitychange', () => { document.body.classList.toggle('page-hidden', document.hidden); if (!document.hidden) { updateFreshness(); load(); } });
