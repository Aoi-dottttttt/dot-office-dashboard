'use strict';
(() => {
  const host=document.getElementById('office-scene');
  const viewport=document.getElementById('office-viewport');
  const note=document.getElementById('scene-message');
  function fallback(message='当前浏览器未能启用 3D，已切换为二维兼容视图。任务状态仍会更新。') {
    host.classList.remove('is-3d');viewport.hidden=true;note.textContent=message;note.hidden=false;
  }
  import('./office3d.js').then(module => {
    globalThis.Office3D=module.initOffice({bridge:globalThis.DashboardBridge,fallback});
  }).catch(()=>fallback());
})();
