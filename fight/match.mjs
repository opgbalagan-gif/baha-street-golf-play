export const ROUND_SECONDS = 1.5;
export const MAX_HEALTH = 3;
export const MAX_ROUNDS = 3;
export const ROUNDS_TO_WIN = 2;

// The duel's rules are independent of rendering and video playback.
export class Match {
  constructor(random = Math.random) { this.random = random; this.reset(); }
  reset(mode = 'solo', difficulty = 'normal', humanSide = 0) {
    this.mode = mode;
    this.difficulty = difficulty;
    this.humanSide = humanSide === 1 ? 1 : 0;
    this.botSide = 1 - this.humanSide;
    this.state = 'menu';
    this.health = [MAX_HEALTH, MAX_HEALTH];
    this.taps = [0, 0];
    this.totalTaps = [0, 0];
    this.round = 0;
    this.exchange = 0;
    this.totalExchanges = 0;
    this.roundWins = [0, 0];
    this.roundWinner = null;
    this.remaining = 0;
    this.winner = null;
    this.champion = null;
    this.impacted = false;
  }
  beginRound() {
    if (!['menu', 'intro', 'round-result'].includes(this.state) || this.champion !== null || this.round >= MAX_ROUNDS) return false;
    this.round++;
    this.exchange = 0;
    this.health = [MAX_HEALTH, MAX_HEALTH];
    this.taps = [0, 0];
    this.winner = null;
    this.roundWinner = null;
    this.impacted = false;
    this.remaining = 0;
    this.state = 'round-intro';
    return true;
  }
  beginExchange(countdownSeconds = 0) {
    if (!['round-intro', 'recovery'].includes(this.state) || this.health.includes(0)) return false;
    this.exchange++;
    this.totalExchanges++;
    this.taps = [0, 0];
    this.winner = null;
    this.impacted = false;
    this.remaining = Math.max(0, countdownSeconds);
    this.botWait = this.botInterval();
    this.state = this.remaining > 0 ? 'countdown' : 'tapping';
    if (this.state === 'tapping') this.remaining = ROUND_SECONDS;
    return true;
  }
  botInterval() {
    const rates = { easy: 3, normal: 4.5, hard: 6.5 };
    return (0.7 + this.random() * 0.6) / (rates[this.difficulty] || rates.normal);
  }
  tap(side, source = 'human') {
    if (this.state !== 'tapping' || ![0, 1].includes(side)) return false;
    if (this.mode === 'solo' && side !== (source === 'bot' ? this.botSide : this.humanSide)) return false;
    this.taps[side]++;
    this.totalTaps[side]++;
    return true;
  }
  advance(seconds) {
    if (!Number.isFinite(seconds) || seconds <= 0) return;
    if (this.state === 'countdown') {
      const step = Math.min(seconds, this.remaining);
      this.remaining -= step;
      seconds -= step;
      if (this.remaining > 0) return;
      this.state = 'tapping';
      this.remaining = ROUND_SECONDS;
    }
    if (this.state !== 'tapping') return;
    const activeTime = Math.min(seconds, this.remaining);
    if (this.mode === 'solo') {
      this.botWait -= activeTime;
      while (this.botWait <= 0) {
        this.tap(this.botSide, 'bot');
        this.botWait += this.botInterval();
      }
    }
    this.remaining = Math.max(0, this.remaining - activeTime);
    if (this.remaining <= 0) {
      this.winner = this.taps[0] === this.taps[1] ? null : Number(this.taps[1] > this.taps[0]);
      this.state = 'strike';
    }
  }
  impact() {
    if (this.state !== 'strike' || this.impacted || this.winner === null) return false;
    this.impacted = true;
    const loser = 1 - this.winner;
    this.health[loser] = Math.max(0, this.health[loser] - 1);
    if (this.health[loser] === 0) {
      this.roundWinner = this.winner;
      this.roundWins[this.winner]++;
      if (this.roundWins[this.winner] >= ROUNDS_TO_WIN) this.champion = this.winner;
    }
    return true;
  }
  finishExchange() {
    if (this.state !== 'strike') return;
    if (this.winner !== null && !this.impacted) return;
    this.state = this.champion !== null ? 'result' : this.roundWinner !== null ? 'round-result' : 'recovery';
  }
}
