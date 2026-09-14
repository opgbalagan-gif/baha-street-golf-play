export function setupDisplay({ onHelpOpen = () => {} } = {}) {
  const button = document.getElementById('fullscreen-button');
  const help = document.getElementById('fullscreen-help');
  const standalone = () => navigator.standalone === true || matchMedia('(display-mode: standalone), (display-mode: fullscreen)').matches;
  const fullscreenElement = () => document.fullscreenElement || document.webkitFullscreenElement;
  const supportsFullscreen = () => !!((document.fullscreenEnabled && document.documentElement.requestFullscreen) || (document.webkitFullscreenEnabled && document.documentElement.webkitRequestFullscreen));
  const refresh = () => { button.hidden = standalone() || !!fullscreenElement(); };
  const showHelp = () => {
    const apple = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const steps = apple ? [
      'Открой эту страницу в Safari. Во встроенном браузере нажми значок компаса или «Открыть в Safari».',
      'Нажми «Поделиться» → «На экран „Домой“». Если есть «Открывать как веб-приложение», включи этот пункт.',
      'Нажми «Добавить» и запускай DOGMA по новой иконке.'
    ] : [
      'Открой ссылку в Chrome или Safari вне встроенного браузера.',
      'В меню браузера выбери «Установить приложение» или «Добавить на главный экран».',
      'Запускай DOGMA по новой иконке.'
    ];
    document.getElementById('fullscreen-help-steps').replaceChildren(...steps.map(text => {
      const item = document.createElement('li'); item.textContent = text; return item;
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
