export type ListenMode = 'original' | 'enhanced';

/**
 * Preview playback (ARCHITECTURE §5): the original and enhanced buffers play in
 * lockstep through two gain nodes, so the strength slider and the A/B switch
 * are instant and never touch the model.
 */
export class PlaybackEngine {
  readonly context: AudioContext;
  private dry: AudioBuffer | null = null;
  private wet: AudioBuffer | null = null;
  private dryGain: GainNode;
  private wetGain: GainNode;
  private sources: AudioBufferSourceNode[] = [];
  private startedAt = 0;
  private offsetAtStart = 0;
  private stopAt = Infinity;
  private strength = 1;
  private listen: ListenMode = 'enhanced';
  private pausedAt = 0;
  playing = false;
  onEnded: () => void = () => {};

  constructor() {
    this.context = new AudioContext({ sampleRate: 48_000, latencyHint: 'playback' });
    this.dryGain = this.context.createGain();
    this.wetGain = this.context.createGain();
    this.dryGain.connect(this.context.destination);
    this.wetGain.connect(this.context.destination);
    this.applyGains(true);
  }

  /** Copy planar audio into an AudioBuffer that becomes the canonical storage. */
  makeBuffer(channels: Float32Array[], sampleRate: number): AudioBuffer {
    const buffer = this.context.createBuffer(channels.length, Math.max(1, channels[0]?.length ?? 1), sampleRate);
    channels.forEach((c, i) => buffer.copyToChannel(c as Float32Array<ArrayBuffer>, i));
    return buffer;
  }

  setBuffers(dry: AudioBuffer, wet: AudioBuffer | null) {
    const position = this.position;
    const wasPlaying = this.playing;
    this.stopSources();
    this.dry = dry;
    this.wet = wet;
    this.applyGains(true);
    this.pausedAt = Math.min(position, this.duration);
    if (wasPlaying) this.play(this.pausedAt, this.stopAt);
  }

  get duration(): number {
    return this.dry?.duration ?? 0;
  }

  get position(): number {
    if (!this.playing) return this.pausedAt;
    return Math.min(this.offsetAtStart + (this.context.currentTime - this.startedAt), this.stopAt);
  }

  /** Play from `from` until `until` (the trim end). */
  play(from: number, until = Infinity) {
    if (!this.dry) return;
    void this.context.resume();
    this.stopSources();
    const start = Math.max(0, Math.min(from, this.duration));
    this.stopAt = Math.min(until, this.duration);
    if (start >= this.stopAt - 1e-3) return;
    const when = this.context.currentTime + 0.02;
    const make = (buffer: AudioBuffer, gain: GainNode) => {
      const node = this.context.createBufferSource();
      node.buffer = buffer;
      node.connect(gain);
      node.start(when, start, this.stopAt - start);
      return node;
    };
    this.sources = [make(this.dry, this.dryGain)];
    if (this.wet) this.sources.push(make(this.wet, this.wetGain));
    this.sources[0]!.onended = () => {
      if (!this.playing || this.sources[0]?.buffer !== this.dry) return;
      if (this.context.currentTime - this.startedAt >= this.stopAt - this.offsetAtStart - 0.05) {
        this.playing = false;
        this.pausedAt = this.stopAt;
        this.onEnded();
      }
    };
    this.startedAt = when;
    this.offsetAtStart = start;
    this.playing = true;
  }

  pause() {
    if (!this.playing) return;
    this.pausedAt = this.position;
    this.stopSources();
    this.playing = false;
  }

  seek(time: number) {
    const t = Math.max(0, Math.min(time, this.duration));
    if (this.playing) this.play(t, this.stopAt);
    else this.pausedAt = t;
  }

  setStopAt(until: number) {
    if (this.playing && Math.abs(until - this.stopAt) > 1e-3) {
      this.play(this.position, until);
    }
    this.stopAt = until;
  }

  setStrength(strength: number) {
    this.strength = strength;
    this.applyGains();
  }

  setListen(mode: ListenMode) {
    this.listen = mode;
    this.applyGains();
  }

  private applyGains(immediate = false) {
    const hasWet = !!this.wet;
    const s = this.listen === 'original' || !hasWet ? 0 : this.strength;
    const t = this.context.currentTime;
    if (immediate) {
      this.wetGain.gain.setValueAtTime(s, t);
      this.dryGain.gain.setValueAtTime(1 - s, t);
    } else {
      this.wetGain.gain.setTargetAtTime(s, t, 0.01);
      this.dryGain.gain.setTargetAtTime(1 - s, t, 0.01);
    }
  }

  private stopSources() {
    for (const node of this.sources) {
      node.onended = null;
      try {
        node.stop();
      } catch {
        // already stopped
      }
      node.disconnect();
    }
    this.sources = [];
  }

  dispose() {
    this.stopSources();
    void this.context.close();
  }
}
