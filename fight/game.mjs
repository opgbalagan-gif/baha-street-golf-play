import { Match, MAX_HEALTH, ROUND_SECONDS, MAX_ROUNDS, ROUNDS_TO_WIN } from './match.mjs';
import { brushNumber } from './tap-art.mjs';
import { SoundtrackPlayer } from './soundtrack.mjs?v=audio-2';
import { setupDisplay } from './display.mjs?v=app-1';

const $ = id => document.getElementById(id);
const clips = ['logo-intro', 'opening-1', 'opening-2', 'forygunz-intro', 'mutki-intro', 'idle', 'victory', 'forygunz-hit-1', 'forygunz-hit-2', 'mutki-hit-1', 'mutki-hit-2', 'mutki-hit-3'];
const introSequence = ['logo-intro', 'opening-1', 'opening-2', 'forygunz-intro', 'mutki-intro'];
const match = new Match();
const videoMap = new Map();
const heldKeys = new Set();
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
let mode = 'solo', sound = true, paused = false, run = 0, active = null;
let cancelClip = null, skipIntros = false, resolving = false, ready = false;
let previousTime, playTime = 0, scheduled = [], flash = false, audioContext;
let lastResult = null;
const counters = { strikes: [], flashes: 0, intros: [] };
const hitIndex = [0, 0];
const fighterNames = ['FORYGUNZ', 'МУТКИ'];
const practiceTaps = [0, 0];
let tutorialPhase = null, tutorialRemaining = 0;
let timerLabel = '';
let runAbort = new AbortController();
const mediaVersion = 'audio-2';
const soundtrack = new SoundtrackPlayer({
  url: 'assets/drop-top-parking.mp3?v=audio-2', getContext: getAudioContext,
  onError: error => console.warn('Music unavailable:', error)
});
const display = setupDisplay({ onHelpOpen: () => { if (match.state !== 'menu') setPaused(true); } });

function show(id, visible) { $(id).hidden = !visible; }
function getAudioContext() {
  audioContext ||= new (window.AudioContext || window.webkitAudioContext)();
  return audioContext;
}
function syncSoundtrack(restart = false) {
  const speaking = match.state === 'intro' && ['forygunz-intro', 'mutki-intro'].includes(active?.dataset.clip);
  soundtrack.setVolume(speaking ? .3 : .7);
  soundtrack.setPlaying(!paused && sound && match.state !== 'menu', { restart });
}
function tone(kind = 'tap') {
  if (!sound) return;
  try {
    getAudioContext();
    if (audioContext.state === 'suspended') void audioContext.resume().catch(() => {});
    const t = audioContext.currentTime;
    const oscillator = audioContext.createOscillator(), gain = audioContext.createGain();
    const hit = kind === 'hit', go = kind === 'go';
    const duration = hit ? .24 : go ? .16 : .045;
    oscillator.type = hit ? 'triangle' : 'sine';
    oscillator.frequency.setValueAtTime(hit ? 115 : go ? 740 : 330, t);
    oscillator.frequency.exponentialRampToValueAtTime(hit ? 28 : go ? 1100 : 170, t + duration);
    gain.gain.setValueAtTime(hit ? .3 : go ? .1 : .035, t);
    gain.gain.exponentialRampToValueAtTime(.001, t + duration);
    oscillator.connect(gain); gain.connect(audioContext.destination);
    oscillator.start(t); oscillator.stop(t + duration + .01);
  } catch { /* Silent play remains available without Web Audio. */ }
}
function delay(milliseconds, token = run) {
  return new Promise(resolve => scheduled.push({ at: playTime + milliseconds / 1000, token, resolve }));
}
function cancelRun() {
  run++;
  runAbort.abort(); runAbort = new AbortController();
  soundtrack.setPlaying(false);
  cancelClip?.();
  for (const item of scheduled) item.resolve(false);
  scheduled = [];
  heldKeys.clear(); resolving = false; flash = false;
  $('stage').classList.remove('negative');
  clearTapFeedback();
  show('duel-timer', false);
  show('buffering', false);
  show('round-callout', false);
  show('result', false);
  show('fighter-select', false);
  show('tutorial', false);
  $('stage').classList.remove('learning');
  practiceTaps.fill(0);
  tutorialPhase = null; tutorialRemaining = 0;
}
function failure(error) {
  console.error(error);
  setPaused(true);
  show('error', true);
  $('retry').focus();
}
function requestMedia(name) {
  const video = videoMap.get(name);
  if (!video.getAttribute('src')) {
    video.preload = 'auto';
    video.src = `assets/${name}.mp4?v=${mediaVersion}`;
  }
  return video;
}
function waitForMedia(video, signal) {
  const hasTrack = () => video.tagName === 'AUDIO' || video.videoWidth > 0;
  if (signal.aborted) return Promise.resolve(false);
  if (video.error) return Promise.reject(new Error(`Media failed: ${video.src}`));
  if (video.readyState >= 2 && hasTrack()) return Promise.resolve(true);
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timer);
      for (const event of ['loadeddata', 'canplay', 'progress']) video.removeEventListener(event, loaded);
      video.removeEventListener('error', failed); signal.removeEventListener('abort', cancelled);
    };
    const loaded = () => { if (video.readyState >= 2 && hasTrack()) { cleanup(); resolve(true); } };
    const failed = () => { cleanup(); reject(new Error(`Media failed: ${video.src}`)); };
    const cancelled = () => { cleanup(); resolve(false); };
    const timer = setTimeout(failed, 45000);
    for (const event of ['loadeddata', 'canplay', 'progress']) video.addEventListener(event, loaded);
    video.addEventListener('error', failed, { once: true });
    signal.addEventListener('abort', cancelled, { once: true });
  });
}
async function activate(name, token = run, signal = runAbort.signal) {
  if (token !== run || signal.aborted) return null;
  const video = requestMedia(name);
  const loadingIndicator = setTimeout(() => { if (token === run && !signal.aborted) show('buffering', true); }, 400);
  const stop = () => video.pause();
  signal.addEventListener('abort', stop, { once: true });
  try {
    if (!await waitForMedia(video, signal) || token !== run || signal.aborted) return null;
    video.currentTime = 0;
    video.muted = name === 'idle' || !sound;
    if (!paused) await video.play();
    if (token !== run || signal.aborted) { video.pause(); return null; }
    // Keep the previous picture visible until the requested clip can display a frame.
    if (!paused && video.requestVideoFrameCallback) {
      await new Promise(resolve => {
        const timer = setTimeout(resolve, 150);
        video.requestVideoFrameCallback(() => { clearTimeout(timer); resolve(); });
      });
    }
    if (token !== run || signal.aborted) { video.pause(); return null; }
    if (active && active !== video) { active.pause(); active.classList.remove('active'); }
    active = video; video.classList.add('active');
    if (paused) video.pause();
    else syncSoundtrack();
    const nextIntro = introSequence[introSequence.indexOf(name) + 1];
    if (match.state === 'intro' && introSequence.includes(name) && !skipIntros) requestMedia(nextIntro || 'idle');
    if (name === 'idle') warmFight();
    return video;
  } catch (error) {
    if (token !== run || signal.aborted) return null;
    throw error;
  } finally {
    clearTimeout(loadingIndicator); signal.removeEventListener('abort', stop);
    if (token === run) show('buffering', false);
  }
}
async function playOnce(name, token) {
  const controller = new AbortController(), runSignal = runAbort.signal;
  const cancel = () => controller.abort();
  cancelClip = cancel; runSignal.addEventListener('abort', cancel, { once: true });
  try {
    const video = await activate(name, token, controller.signal);
    if (!video || token !== run || controller.signal.aborted) return false;
    if (match.state === 'intro' && skipIntros) { video.pause(); return false; }
    return await new Promise((resolve, reject) => {
      const cleanup = () => {
        video.removeEventListener('ended', ended); video.removeEventListener('error', errored);
        controller.signal.removeEventListener('abort', cancelled);
      };
      const ended = () => { cleanup(); resolve(true); };
      const cancelled = () => { video.pause(); cleanup(); resolve(false); };
      const errored = () => { cleanup(); reject(new Error(`Playback failed: ${name}`)); };
      video.addEventListener('ended', ended, { once: true });
      video.addEventListener('error', errored, { once: true });
      controller.signal.addEventListener('abort', cancelled, { once: true });
      if (video.ended) ended();
    });
  } finally {
    runSignal.removeEventListener('abort', cancel);
    if (cancelClip === cancel) cancelClip = null;
  }
}
function updateHealth() {
  ['left', 'right'].forEach((side, i) => {
    const value = Math.round(match.health[i] / MAX_HEALTH * 100);
    const bar = $(`health-${side}`);
    bar.setAttribute('aria-valuenow', String(value));
    bar.querySelector('.health-fill').style.opacity = value === 0 ? '0' : '1';
    bar.style.setProperty('--cut', `${(1 - match.health[i] / MAX_HEALTH) * 80}%`);
    const wins = $(`round-wins-${side}`);
    wins.setAttribute('aria-label', `${i === 0 ? 'FORYGUNZ' : 'Мутки'}: ${match.roundWins[i]} побед в раундах из ${ROUNDS_TO_WIN}`);
    wins.dataset.wins = String(match.roundWins[i]);
    [...wins.children].forEach((pip, index) => pip.classList.toggle('won', index < match.roundWins[i]));
  });
}
function updateTimer() {
  const teaching = match.state === 'tutorial' && tutorialPhase !== 'complete';
  const tapping = match.state === 'tapping' || teaching;
  show('duel-timer', tapping);
  if (!tapping) return;
  const remaining = Math.max(0, Math.min(ROUND_SECONDS, teaching ? tutorialRemaining : match.remaining));
  // The filled sphere shrinks to zero; its visible area tracks the time left.
  $('timer-progress').setAttribute('r', String(39 * Math.sqrt(remaining / ROUND_SECONDS)));
  const label = (Math.ceil(remaining * 10) / 10).toFixed(1).replace('.', ',');
  if (label !== timerLabel) {
    timerLabel = label;
    $('duel-timer').setAttribute('aria-label', `Осталось ${label} секунды`);
    $('duel-timer').dataset.remaining = label;
  }
}
function clearTapFeedback() { $('tap-feedback').replaceChildren(); }
function tapPosition(side, event) {
  if (!event) return { x: side === 0 ? .25 : .75, y: .72 };
  const bounds = $('stage').getBoundingClientRect();
  // The portrait layout rotates the stage clockwise; invert that transform.
  if (matchMedia('(orientation: portrait)').matches) {
    return { x: (event.clientY - bounds.top) / bounds.height, y: (bounds.right - event.clientX) / bounds.width };
  }
  return { x: (event.clientX - bounds.left) / bounds.width, y: (event.clientY - bounds.top) / bounds.height };
}
function showTapScore(side, event, count = match.taps[side]) {
  const position = tapPosition(side, event);
  const ripple = document.createElement('span');
  ripple.className = 'tap-ripple'; ripple.dataset.side = String(side);
  ripple.style.left = `${position.x * 100}%`;
  ripple.style.top = `${position.y * 100}%`;
  const ripples = $('tap-feedback').querySelectorAll(`.tap-ripple[data-side="${side}"]`);
  if (ripples.length >= 8) ripples[0].remove();
  $('tap-feedback').append(ripple);
  ripple.addEventListener('animationend', () => ripple.remove(), { once: true });
  const element = document.createElement('span');
  element.className = 'tap-score';
  element.dataset.side = String(side); element.dataset.count = String(count);
  const width = Math.min(6 + (String(count).length - 1) * 3.6, 24);
  const margin = width / 200 + .01;
  element.style.left = `${Math.max(margin, Math.min(1 - margin, position.x)) * 100}%`;
  element.style.top = `${Math.max(.24, Math.min(.97, position.y)) * 100}%`;
  element.style.width = `${width}%`;
  element.innerHTML = brushNumber(count);
  const previous = $('tap-feedback').querySelectorAll(`.tap-score[data-side="${side}"]`);
  // Keep the newest total prominent when the player taps the same spot rapidly.
  for (const old of previous) old.classList.add('older');
  if (previous.length >= 8) previous[0].remove();
  $('tap-feedback').append(element);
  element.addEventListener('animationend', () => element.remove(), { once: true });
}
function advanceTo(now) {
  const dt = previousTime === undefined ? 0 : Math.max(0, (now - previousTime) / 1000);
  previousTime = Math.max(now, previousTime ?? now);
  if (paused) return;
  playTime += dt;
  if (match.state === 'tutorial' && tutorialPhase === 'tapping') {
    tutorialRemaining = Math.max(0, tutorialRemaining - dt);
    if (tutorialRemaining === 0) completeTutorial();
  }
  const previousBotTaps = match.taps[match.botSide];
  match.advance(dt);
  if (mode === 'solo' && match.state === 'tapping' && match.taps[match.botSide] > previousBotTaps) {
    showTapScore(match.botSide);
  }
  const due = scheduled.filter(item => item.at <= playTime || item.token !== run);
  scheduled = scheduled.filter(item => !due.includes(item));
  due.forEach(item => item.resolve(item.token === run));
}
function render() {
  updateTimer();
  if (match.state === 'strike' && !resolving) {
    clearTapFeedback();
    resolving = true;
    void exchange(run).catch(failure);
  }
}
function frame(now) { advanceTo(now); render(); requestAnimationFrame(frame); }
function beginTapRound() {
  clearTapFeedback();
  match.beginExchange(0); previousTime = performance.now(); tone('go');
  updateTimer();
}
async function beginFightRound(token) {
  if (token !== run || !match.beginRound()) return;
  hitIndex.fill(0);
  updateHealth();
  if (match.round === 1) { await beginTutorial(token); return; }
  await announceRound(token);
}
async function announceRound(token) {
  if (token !== run) return;
  $('round-number').innerHTML = brushNumber(match.round, true);
  $('round-callout').setAttribute('aria-label', `Раунд ${match.round} из ${MAX_ROUNDS}`);
  show('round-callout', true);
  await delay(1200, token);
  if (token !== run) return;
  show('round-callout', false);
  beginTapRound();
}
async function beginTutorial(token) {
  if (!match.beginTutorial()) return;
  practiceTaps.fill(0);
  tutorialPhase = 'explanation'; tutorialRemaining = ROUND_SECONDS;
  if (active) { active.pause(); active.currentTime = 0; }
  $('stage').classList.add('learning');
  show('hud', true); show('touch-zones', false); show('tutorial', true); show('tutorial-go', false);
  $('tutorial').dataset.phase = tutorialPhase;
  $('tutorial-title').textContent = 'КРУГ УМЕНЬШАЕТСЯ';
  $('tutorial-description').textContent = 'Твоя задача — сделать больше тапов, чем соперник.';
  $('tutorial-player').textContent = mode === 'solo'
    ? `ТЫ — ${fighterNames[match.humanSide]} · ТАПАЙ ${match.humanSide === 0 ? 'СЛЕВА · A / Ф' : 'СПРАВА · L / Д'}`
    : 'FORYGUNZ — СЛЕВА · A / Ф        МУТКИ — СПРАВА · L / Д';
  $('practice-left').disabled = true; $('practice-right').disabled = true;
  await delay(4000, token);
  if (token !== run || match.state !== 'tutorial') return;
  tutorialPhase = 'tapping';
  $('tutorial').dataset.phase = tutorialPhase;
  $('tutorial-title').textContent = 'ТАПАЙ';
  $('tutorial-description').textContent = 'Успей, пока не исчез круг!';
  ['left', 'right'].forEach((side, i) => { $(`practice-${side}`).disabled = mode === 'solo' && i === match.botSide; });
  $(`practice-${mode === 'solo' && match.humanSide === 1 ? 'right' : 'left'}`).focus({ preventScroll: true });
  tone('go');
}
function practice(side, event) {
  if (tutorialPhase !== 'tapping' || (mode === 'solo' && side !== match.humanSide)) return;
  advanceTo(performance.now());
  if (tutorialPhase !== 'tapping') return;
  practiceTaps[side]++;
  showTapScore(side, event, practiceTaps[side]); tone();
}
function completeTutorial() {
  tutorialPhase = 'complete';
  $('tutorial').dataset.phase = tutorialPhase;
  $('tutorial-title').textContent = 'ОТЛИЧНО';
  $('tutorial-description').textContent = 'Теперь обгони соперника в настоящем бою.';
  $('practice-left').disabled = true; $('practice-right').disabled = true;
  show('tutorial-go', true);
  $('tutorial-go').focus({ preventScroll: true });
}
async function finishTutorial() {
  if (tutorialPhase !== 'complete') return;
  if (!match.finishTutorial()) return;
  if (paused) setPaused(false);
  tutorialPhase = null; tutorialRemaining = 0;
  clearTapFeedback(); $('stage').classList.remove('learning');
  show('tutorial', false); show('hud', true); show('touch-zones', true);
  if (active && !paused) void active.play().catch(failure);
  await announceRound(run);
}
function chooseFighter() {
  if (!ready) return;
  display.start();
  show('menu', false); show('fighter-select', true);
  $('choose-forygunz').focus({ preventScroll: true });
}
async function start(selectedMode, selectedSide = 0) {
  if (!ready) return;
  cancelRun();
  const token = run;
  mode = selectedMode; paused = false; document.body.classList.remove('paused');
  match.reset(mode, 'normal', selectedSide); match.state = 'intro';
  syncSoundtrack(true);
  display.start();
  hitIndex.fill(0); counters.strikes = []; counters.flashes = 0; counters.intros = [];
  lastResult = null; skipIntros = false;
  updateHealth();
  show('menu', false); show('hud', false); show('videos', true); show('touch-zones', true);
  tone('go');
  for (const name of introSequence) {
    if (token !== run || skipIntros) break;
    counters.intros.push(name);
    await playOnce(name, token);
  }
  if (token !== run) return;
  await activate('idle', token);
  if (token !== run) return;
  show('hud', true); await beginFightRound(token);
}
async function exchange(token) {
  const winner = match.winner;
  if (winner === null) {
    // A tie keeps the stance, then opens another tap window without damage.
    await delay(700, token);
    if (token !== run) return;
    match.finishExchange();
  } else {
    const finalHit = match.health[1 - winner] === 1;
    const clip = nextStrikeClip(winner);
    if (!finalHit) hitIndex[winner]++;
    counters.strikes.push({ clip, winner, round: match.round, exchange: match.exchange });
    await playOnce(clip, token);
    if (token !== run) return;
    match.impact(); updateHealth(); tone('hit');
    flash = true; counters.flashes++; $('stage').classList.add('negative');
    await delay(reducedMotion ? 80 : 150, token);
    if (token !== run) return;
    // Keep the completed finisher on screen when this hit wins the match.
    if (match.champion === null) await activate('idle', token);
    else active?.pause();
    if (token !== run) return;
    flash = false; $('stage').classList.remove('negative');
    match.finishExchange();
  }
  if (match.state === 'result') {
    lastResult = { champion: match.champion, health: [...match.health], taps: [...match.totalTaps], round: match.round, roundWins: [...match.roundWins] };
    $('winner-name').textContent = match.champion === 0 ? 'FORYGUNZ' : 'МУТКИ';
    show('hud', false); show('touch-zones', false); show('duel-timer', false);
    clearTapFeedback();
    show('result', true);
    $('play-again').focus({ preventScroll: true });
  } else if (match.state === 'round-result') {
    await delay(1600, token);
    if (token !== run) return;
    await beginFightRound(token);
  } else {
    await delay(350, token);
    if (token !== run) return;
    beginTapRound();
  }
  resolving = false;
}
function nextStrikeClip(side) {
  if (match.health[1 - side] === 1) return side === 0 ? 'victory' : 'mutki-hit-3';
  return `${side === 0 ? 'forygunz' : 'mutki'}-hit-${hitIndex[side] % (side === 0 ? 2 : 3) + 1}`;
}
function warmFight() {
  // Only the next two possible attacks share bandwidth with the idle clip.
  requestMedia(nextStrikeClip(0)); requestMedia(nextStrikeClip(1));
}
function menu() {
  cancelRun(); paused = false; document.body.classList.remove('paused');
  for (const video of videoMap.values()) video.pause();
  match.reset(mode, 'normal', match.humanSide);
  soundtrack.reset();
  show('menu', true); show('hud', false); show('videos', false); show('touch-zones', false);
  updateHealth();
  $('start-solo').focus({ preventScroll: true });
}
function setPaused(value) {
  if (paused === value) return;
  paused = value; heldKeys.clear(); document.body.classList.toggle('paused', value);
  syncSoundtrack();
  if (value) for (const video of videoMap.values()) video.pause();
  else {
    previousTime = performance.now();
    if (active && !['menu', 'result', 'tutorial'].includes(match.state)) void active.play().catch(failure);
  }
}
function input(side, event) {
  if (display.helpOpen) return;
  if (!$('error').hidden) return;
  if (match.state === 'result') return;
  if (paused) { setPaused(false); return; }
  syncSoundtrack();
  if (match.state === 'intro') { skipIntros = true; cancelClip?.(); return; }
  if (match.state === 'tutorial') { practice(side, event); return; }
  advanceTo(performance.now());
  if (match.tap(side)) { showTapScore(side, event); tone(); if (navigator.vibrate && !reducedMotion) navigator.vibrate(8); }
  render();
}
['tap-left', 'tap-right', 'practice-left', 'practice-right'].forEach((id, index) => {
  const side = index % 2;
  $(id).addEventListener('pointerdown', event => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    event.preventDefault(); input(side, event);
  });
  $(id).addEventListener('click', event => { if (event.detail === 0) input(side); });
  $(id).addEventListener('contextmenu', event => event.preventDefault());
});
document.addEventListener('keydown', event => {
  if (display.helpOpen) return;
  if (event.repeat || heldKeys.has(event.code)) { if (['KeyA', 'KeyL', 'Space', 'Enter'].includes(event.code)) event.preventDefault(); return; }
  heldKeys.add(event.code);
  if (['Escape', 'Backspace'].includes(event.code) && !$('fighter-select').hidden) { event.preventDefault(); menu(); return; }
  if (event.code === 'Escape' && match.state !== 'menu') { event.preventDefault(); setPaused(!paused); return; }
  if (event.code === 'KeyM') {
    sound = !sound;
    syncSoundtrack();
    for (const [name, video] of videoMap) video.muted = name === 'idle' || !sound;
    if (sound) tone('go');
    return;
  }
  if (event.code === 'KeyF') { void display.toggle(); return; }
  if (event.code === 'Backspace' && match.state !== 'menu') { event.preventDefault(); menu(); return; }
  if (['KeyA', 'KeyL'].includes(event.code) && match.state !== 'menu') {
    event.preventDefault(); input(event.code === 'KeyA' ? 0 : 1); return;
  }
  if (['Space', 'Enter'].includes(event.code) && (document.activeElement?.classList.contains('touch-zone') || document.activeElement?.classList.contains('practice-zone'))) {
    event.preventDefault(); input(document.activeElement.id.endsWith('left') ? 0 : 1);
  }
});
document.addEventListener('keyup', event => heldKeys.delete(event.code));
window.addEventListener('blur', () => { heldKeys.clear(); if (match.state !== 'menu') setPaused(true); });
document.addEventListener('visibilitychange', () => { if (document.hidden && match.state !== 'menu') setPaused(true); });
$('start-solo').onclick = chooseFighter;
$('choose-forygunz').onclick = () => void start('solo', 0).catch(failure);
$('choose-mutki').onclick = () => void start('solo', 1).catch(failure);
$('selection-back').onclick = menu;
$('tutorial-go').onclick = () => void finishTutorial().catch(failure);
$('start-local').onclick = () => void start('local').catch(failure);
$('play-again').onclick = menu;
$('retry').onclick = () => location.reload();
async function load() {
  for (const name of clips) {
    const video = document.createElement('video');
    video.dataset.clip = name; video.preload = 'none'; video.playsInline = true; video.muted = true;
    video.setAttribute('playsinline', ''); video.setAttribute('webkit-playsinline', '');
    video.loop = name === 'idle';
    video.volume = ['forygunz-intro', 'mutki-intro'].includes(name) ? .9 : introSequence.includes(name) ? .4 : .7;
    videoMap.set(name, video); $('videos').append(video);
  }
  // Menu and fighter selection do not depend on any video or audio download.
  ready = true;
  $('start-solo').disabled = false; $('start-local').disabled = false;
  show('loading', false);
}
// Read-only diagnostics for the match and its video sequence.
Object.defineProperty(window, 'fight', { value: Object.freeze({ snapshot: () => ({
  state: match.state, health: [...match.health], taps: [...match.taps], totalTaps: [...match.totalTaps],
  round: match.round, remaining: match.remaining, winner: match.winner, champion: match.champion,
  exchange: match.exchange, totalExchanges: match.totalExchanges, roundWins: [...match.roundWins], roundWinner: match.roundWinner,
  mode, humanSide: match.humanSide, botSide: mode === 'solo' ? match.botSide : null, practiceTaps: [...practiceTaps], tutorialPhase, tutorialRemaining, paused, flash, ready, sound, music: soundtrack.snapshot(), clip: active?.dataset.clip,
  negativeFlashes: counters.flashes, strikes: counters.strikes.map(value => ({ ...value })),
  intros: [...counters.intros], lastResult: lastResult ? { ...lastResult, health: [...lastResult.health], taps: [...lastResult.taps], roundWins: [...lastResult.roundWins] } : null
}) }) });
updateHealth(); requestAnimationFrame(frame); void load().catch(failure);
