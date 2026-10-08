'use strict';
try {
  const selected = localStorage.getItem('dot-office-theme');
  document.documentElement.dataset.theme = ['light', 'dark', 'system'].includes(selected) ? selected : 'system';
  if (localStorage.getItem('dot-office-motion') === 'off') document.documentElement.dataset.motion = 'off';
} catch { /* Device preferences are optional. */ }
