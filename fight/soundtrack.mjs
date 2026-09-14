// A Web Audio loop shares the game's audio context instead of competing with video players.
export class SoundtrackPlayer {
  constructor({ url, getContext, volume = .7, fetchAudio = url => fetch(url), onError = () => {} }) {
    Object.assign(this, { url, getContext, volume, fetchAudio, onError });
    this.context = null; this.buffer = null; this.loading = null; this.gain = null;
    this.node = null; this.offset = 0; this.startedAt = 0; this.wanted = false;
    this.error = null; this.retryAfter = 0;
  }
  setPlaying(playing, { restart = false } = {}) {
    this.wanted = playing;
    if (restart) { this.stop(); this.offset = 0; }
    if (!playing) { this.stop(); return; }
    if (this.node && this.context?.state === 'running') return;
    try {
      this.context ||= this.getContext();
      // Resume during the actual Start/tap gesture, before fetching or decoding audio.
      const unlocked = this.context.state === 'running' ? Promise.resolve() : this.context.resume();
      const loaded = this.load();
      void Promise.all([unlocked, loaded]).then(() => this.start()).catch(error => this.failed(error));
    } catch (error) { this.failed(error); }
  }
  load() {
    if (this.buffer || Date.now() < this.retryAfter) return Promise.resolve();
    if (!this.loading) {
      this.loading = this.fetchAudio(this.url).then(response => {
        if (!response.ok) throw new Error(`Soundtrack HTTP ${response.status}`);
        return response.arrayBuffer();
      }).then(bytes => this.context.decodeAudioData(bytes)).then(buffer => {
        this.buffer = buffer; this.error = null;
      }).catch(error => this.failed(error)).finally(() => { this.loading = null; });
    }
    return this.loading;
  }
  start() {
    if (!this.wanted || !this.buffer || this.node || this.context.state !== 'running') return;
    if (!this.gain) {
      this.gain = this.context.createGain();
      this.gain.gain.value = this.volume;
      this.gain.connect(this.context.destination);
    }
    const node = this.context.createBufferSource();
    node.buffer = this.buffer; node.loop = true; node.connect(this.gain);
    this.offset %= this.buffer.duration; this.startedAt = this.context.currentTime;
    this.node = node;
    node.onended = () => { if (this.node === node) this.node = null; node.disconnect(); };
    node.start(0, this.offset);
    this.error = null;
  }
  stop() {
    if (!this.node) return;
    this.offset = this.position();
    const node = this.node; this.node = null;
    node.stop(); node.disconnect();
  }
  reset() { this.setPlaying(false, { restart: true }); }
  setVolume(value) {
    this.volume = value;
    if (this.gain) {
      if (this.gain.gain.setTargetAtTime) this.gain.gain.setTargetAtTime(value, this.context.currentTime, .08);
      else this.gain.gain.value = value;
    }
  }
  position() {
    if (!this.buffer) return 0;
    return (this.offset + (this.node ? this.context.currentTime - this.startedAt : 0)) % this.buffer.duration;
  }
  failed(error) {
    this.error = String(error); this.retryAfter = Date.now() + 1500;
    this.onError(error);
  }
  snapshot() {
    return { playing: !!this.node && this.context?.state === 'running', wanted: this.wanted,
      loaded: !!this.buffer, loading: !!this.loading, position: this.position(),
      contextState: this.context?.state || 'not-started', error: this.error };
  }
}
