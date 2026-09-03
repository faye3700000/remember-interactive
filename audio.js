const AudioEngine = {
  ctx: null,
  master: null,
  noiseGain: null,
  noiseSrc: null,
  searchOsc: null,
  searchLfo: null,
  ambientNodes: [],
  started: false,
  mode: "idle",

  ensure() {
    if (!this.ctx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      this.ctx = new Ctx();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.0001;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === "suspended") this.ctx.resume();
    return this.ctx;
  },

  startFromGesture() {
    this.ensure();
    if (this.started) return;
    this.started = true;
    this._startNoise();
    this.setMode("idle");
  },

  _noiseBuffer() {
    const len = this.ctx.sampleRate * 2;
    const buffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = Math.random() * 2 - 1;
    return buffer;
  },

  _startNoise() {
    this.noiseGain = this.ctx.createGain();
    this.noiseGain.gain.value = 0.03;
    const filter = this.ctx.createBiquadFilter();
    filter.type = "highpass";
    filter.frequency.value = 800;
    const src = this.ctx.createBufferSource();
    src.buffer = this._noiseBuffer();
    src.loop = true;
    src.connect(filter);
    filter.connect(this.noiseGain);
    this.noiseGain.connect(this.master);
    src.start();
    this.noiseSrc = src;
  },

  setMaster(value, seconds) {
    if (!this.master) return;
    const t = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(t);
    this.master.gain.setValueAtTime(this.master.gain.value, t);
    this.master.gain.linearRampToValueAtTime(value, t + (seconds || 0.4));
  },

  setMode(mode) {
    this.mode = mode;
    if (!this.started) return;
    this._stopSearchTone();
    this._stopAmbient();
    if (mode === "idle") {
      this.setMaster(0.12, 0.6);
      if (this.noiseGain) this.noiseGain.gain.value = 0.035;
    } else if (mode === "map") {
      this.setMaster(0.16, 0.4);
      if (this.noiseGain) this.noiseGain.gain.value = 0.04;
      this._electrical();
    } else if (mode === "quiet") {
      this.setMaster(0.07, 0.8);
      if (this.noiseGain) this.noiseGain.gain.value = 0.018;
    } else if (mode === "expand") {
      this.setMaster(0.2, 0.4);
      if (this.noiseGain) this.noiseGain.gain.value = 0.07;
      this._electrical();
    } else if (mode === "search") {
      this.setMaster(0.18, 0.3);
      this._breathing();
    } else if (mode === "reflect") {
      this.setMaster(0.08, 1.2);
      if (this.noiseGain) this.noiseGain.gain.value = 0.02;
    } else if (mode === "archive-complete") {
      this.setMaster(0.12, 0.5);
      this._tone(220, 0.08);
    } else if (mode === "archive-fragmented") {
      this.setMaster(0.12, 0.5);
      this._interrupted();
    } else if (mode === "archive-similar") {
      this.setMaster(0.12, 0.5);
      this._overlap();
    } else if (mode === "archive-inaccessible") {
      this.setMaster(0.1, 0.5);
      if (this.noiseGain) this.noiseGain.gain.value = 0.09;
    }
  },

  _electrical() {
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = "square";
    osc.frequency.value = 62;
    g.gain.value = 0.012;
    const f = this.ctx.createBiquadFilter();
    f.type = "bandpass";
    f.frequency.value = 1400;
    f.Q.value = 8;
    osc.connect(f);
    f.connect(g);
    g.connect(this.master);
    osc.start();
    this.ambientNodes.push(osc, g, f);
  },

  _breathing() {
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = 110;
    g.gain.value = 0.03;
    const lfo = this.ctx.createOscillator();
    const lfoGain = this.ctx.createGain();
    lfo.frequency.value = 0.28;
    lfoGain.gain.value = 0.02;
    lfo.connect(lfoGain);
    lfoGain.connect(g.gain);
    osc.connect(g);
    g.connect(this.master);
    osc.start();
    lfo.start();
    this.searchOsc = osc;
    this.searchLfo = lfo;
    this.ambientNodes.push(osc, g, lfo, lfoGain);
  },

  _tone(freq, gain) {
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    g.gain.value = gain;
    osc.connect(g);
    g.connect(this.master);
    osc.start();
    this.ambientNodes.push(osc, g);
  },

  _interrupted() {
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = "triangle";
    osc.frequency.value = 180;
    g.gain.value = 0.04;
    osc.connect(g);
    g.connect(this.master);
    osc.start();
    const now = this.ctx.currentTime;
    for (let i = 0; i < 8; i += 1) {
      g.gain.setValueAtTime(0.04, now + i * 0.35);
      g.gain.linearRampToValueAtTime(0.001, now + i * 0.35 + 0.12);
    }
    this.ambientNodes.push(osc, g);
  },

  _overlap() {
    [196, 247, 311].forEach((f, i) => {
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = f;
      g.gain.value = 0.03 - i * 0.006;
      osc.connect(g);
      g.connect(this.master);
      osc.start();
      this.ambientNodes.push(osc, g);
    });
  },

  _stopSearchTone() {
    [this.searchOsc, this.searchLfo].forEach((n) => {
      try {
        if (n) n.stop();
      } catch (e) {
        /* ignore */
      }
    });
    this.searchOsc = null;
    this.searchLfo = null;
  },

  _stopAmbient() {
    this.ambientNodes.forEach((n) => {
      try {
        if (n.stop) n.stop();
        if (n.disconnect) n.disconnect();
      } catch (e) {
        /* ignore */
      }
    });
    this.ambientNodes = [];
  },

  blip() {
    if (!this.started) return;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = 880;
    g.gain.value = 0.04;
    osc.connect(g);
    g.connect(this.master);
    const t = this.ctx.currentTime;
    g.gain.setValueAtTime(0.04, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);
    osc.start(t);
    osc.stop(t + 0.09);
  },

  printSound() {
    if (!this.started) this.startFromGesture();
    const t = this.ctx.currentTime;
    for (let i = 0; i < 18; i += 1) {
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = "square";
      osc.frequency.value = 40 + (i % 3) * 8;
      g.gain.value = 0.03;
      osc.connect(g);
      g.connect(this.master);
      osc.start(t + i * 0.08);
      g.gain.setValueAtTime(0.03, t + i * 0.08);
      g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.08 + 0.05);
      osc.stop(t + i * 0.08 + 0.06);
    }
  },

  fadeOut(seconds) {
    this.setMaster(0.0001, seconds || 1.6);
  },

  stopAll() {
    this._stopSearchTone();
    this._stopAmbient();
    if (this.noiseSrc) {
      try {
        this.noiseSrc.stop();
      } catch (e) {
        /* ignore */
      }
    }
    this.started = false;
    this.noiseSrc = null;
  }
};
