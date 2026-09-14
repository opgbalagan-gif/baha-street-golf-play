export function setupDisplay({ onHelpOpen = () => {} } = {}) {
  const button = document.getElementById('fullscreen-button');
  const help = document.getElementById('fullscreen-help');
  const standalone = () => navigator.standalone === true || matchMedia('(display-mode: standalone), (display-mode: fullscreen)').matches;
  const fullscreenElement = () => document.fullscreenElement || document.webkitFullscreenElement;
  const supportsFullscreen = () => !!((document.fullscreenEnabled && document.documentElement.requestFullscreen) || (document.webkitFullscreenEnabled && document.documentElement.webkitRequestFullscreen));
  const refresh = () => { button.hidden = standalone() || !!fullscreenElement(); };
  const showHelp = () => {
    const apple = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const icons = {
      safari: '<circle cx="40" cy="40" r="33" fill="#1687ed" stroke="#d5ebff" stroke-width="2"/><path d="M40 10v7m0 46v7M10 40h7m46 0h7M19 19l5 5m32 32l5 5M19 61l5-5m32-32l5-5" stroke="#ffffffb0" stroke-width="2"/><path d="M56 22L44 44 24 58 36 36Z" fill="#fff"/><path d="M56 22L44 44 36 36Z" fill="#ff4d55"/>',
      share: '<path d="M25 30H16v39h48V30h-9M40 52V10M26 24l14-14 14 14" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>',
      home: '<rect x="12" y="12" width="56" height="56" rx="12" fill="none" stroke="currentColor" stroke-width="5"/><path d="M40 25v30M25 40h30" stroke="currentColor" stroke-width="5" stroke-linecap="round"/>',
      browser: '<rect x="9" y="14" width="62" height="52" rx="10" fill="none" stroke="currentColor" stroke-width="4"/><path d="M9 29h62" stroke="currentColor" stroke-width="3"/><circle cx="19" cy="22" r="2" fill="currentColor"/><circle cx="27" cy="22" r="2" fill="currentColor"/><path d="M29 48h22m-8-8 8 8-8 8" fill="none" stroke="currentColor" stroke-width="4"/>',
      menu: '<circle cx="40" cy="19" r="5" fill="currentColor"/><circle cx="40" cy="40" r="5" fill="currentColor"/><circle cx="40" cy="61" r="5" fill="currentColor"/>'
    };
    const steps = apple ? [
      ['safari', 'Открой в Safari', 'Нажми компас внизу браузера или «Открыть в Safari».'],
      ['share', 'Нажми «Поделиться»', 'Это квадрат со стрелкой вверх в панели Safari.'],
      ['home', 'На экран «Домой»', 'Выбери этот пункт в меню и нажми «Добавить».']
    ] : [
      ['browser', 'Открой в Chrome', 'Открой ссылку в обычном браузере, вне мессенджера.'],
      ['menu', 'Открой меню', 'Нажми три точки в правом верхнем углу браузера.'],
      ['home', 'Установи DOGMA', 'Выбери «Установить приложение» или «На главный экран».']
    ];
    document.getElementById('fullscreen-help-title').textContent = 'ИГРА БЕЗ ПАНЕЛЕЙ БРАУЗЕРА';
    document.getElementById('fullscreen-help-copy').textContent = 'Один раз добавь DOGMA на домашний экран.';
    document.getElementById('fullscreen-help-note').textContent = apple ? 'Если есть «Открывать как веб-приложение» — включи этот пункт.' : '';
    document.getElementById('fullscreen-help-steps').replaceChildren(...steps.map(([icon, title, text], index) => {
      const item = document.createElement('li');
      item.innerHTML = `<svg class="install-icon" viewBox="0 0 80 80" aria-hidden="true">${icons[icon]}</svg><strong><b>${index + 1}</b>${title}</strong><p>${text}</p>`;
      return item;
    }));
    onHelpOpen(); help.showModal();
  };
  async function enter({ explain = false } = {}) {
    if (standalone() || fullscreenElement()) return true;
    if (!supportsFullscreen()) { if (explain) showHelp(); return false; }
    try {
      const root = document.documentElement;
      // Called from Start or a button gesture; never fullscreen a video by itself.
      if (root.requestFullscreen) await root.requestFullscreen({ navigationUI: 'hide' });
      else await root.webkitRequestFullscreen();
      refresh(); return true;
    } catch {
      if (explain) showHelp();
      return false;
    }
  }
  async function toggle() {
    if (fullscreenElement()) {
      try {
        if (document.exitFullscreen) await document.exitFullscreen();
        else await document.webkitExitFullscreen();
      } catch { /* The browser can end fullscreen itself. */ }
      refresh();
    } else await enter({ explain: true });
  }
  button.addEventListener('click', () => void enter({ explain: true }));
  document.getElementById('fullscreen-help-close').addEventListener('click', () => help.close());
  document.addEventListener('fullscreenchange', refresh);
  document.addEventListener('webkitfullscreenchange', refresh);
  matchMedia('(display-mode: standalone)').addEventListener('change', refresh);
  refresh();

  // Keep rapid taps as separate game inputs while suppressing viewport zoom.
  // Do not cancel touchstart: Pointer Events must still report every finger.
  let lastTouch = null;
  document.addEventListener('touchend', event => {
    if (event.touches.length || event.changedTouches.length !== 1) { lastTouch = null; return; }
    const touch = event.changedTouches[0], now = performance.now();
    if (lastTouch && event.target === lastTouch.target && now - lastTouch.time < 350 &&
        Math.hypot(touch.clientX - lastTouch.x, touch.clientY - lastTouch.y) < 30) event.preventDefault();
    lastTouch = { time: now, target: event.target, x: touch.clientX, y: touch.clientY };
  }, { passive: false });
  for (const type of ['dblclick', 'gesturestart', 'gesturechange']) {
    document.addEventListener(type, event => event.preventDefault(), { passive: false });
  }
  return { enter, toggle, get helpOpen() { return help.open; },
    start() { if (navigator.maxTouchPoints > 0) void enter(); } };
}
