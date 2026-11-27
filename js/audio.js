// All sound is synthesized, so the game ships no audio files.
(function () {
  const PC = globalThis.PC;
  const SCALE = [261.6, 293.7, 329.6, 392, 440, 523.3, 587.3, 659.3, 784, 880];

  PC.createAudio = function () {
    let ac = null, master = null, noiseBuffer = null;
    let muted = false, lastHit = 0;

    function unlock() {
      if (!ac) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        ac = new AC();
        master = ac.createGain();
        master.gain.value = 0.45;
        master.connect(ac.destination);
        noiseBuffer = ac.createBuffer(1, ac.sampleRate * 0.4, ac.sampleRate);
        const data = noiseBuffer.getChannelData(0);
        for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      }
      if (ac.state === 'suspended') ac.resume();
    }

    function tone(freq, dur, opts = {}) {
      if (!ac || muted) return;
      const at = ac.currentTime + (opts.at || 0);
      const osc = ac.createOscillator(), gain = ac.createGain();
      osc.type = opts.wave || 'sine';
      osc.frequency.setValueAtTime(freq, at);
      if (opts.to) osc.frequency.exponentialRampToValueAtTime(opts.to, at + dur);
      gain.gain.setValueAtTime(opts.gain || 0.2, at);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + dur);
      osc.connect(gain).connect(master);
      osc.start(at);
      osc.stop(at + dur + 0.02);
    }

    function splat(dur, freq, level) {
      if (!ac || muted) return;
      const at = ac.currentTime;
      const src = ac.createBufferSource(), filter = ac.createBiquadFilter(), gain = ac.createGain();
      src.buffer = noiseBuffer;
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(freq, at);
      filter.frequency.exponentialRampToValueAtTime(freq * 0.25, at + dur);
      gain.gain.setValueAtTime(level, at);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + dur);
      src.connect(filter).connect(gain).connect(master);
      src.start(at);
      src.stop(at + dur + 0.02);
    }

    const sounds = {
      place: () => tone(420, 0.09, { to: 240, gain: 0.16 }),
      deny: () => tone(150, 0.12, { wave: 'triangle', gain: 0.14 }),
      sell: () => splat(0.25, 2400, 0.14),
      fire() {
        const now = performance.now();
        if (now - lastHit < 90) return;
        lastHit = now;
        tone(640 + Math.random() * 180, 0.05, { to: 320, gain: 0.035 });
      },
      kill: () => splat(0.12, 1500, 0.11),
      merge(level, mixed) {
        const root = Math.min(level, 5);
        const notes = mixed ? [0, 2, 4] : [0, 3];
        notes.forEach((n, i) => {
          tone(SCALE[root + n] || 880, 0.3, { at: i * 0.06, wave: 'triangle', gain: 0.15 });
        });
        splat(0.22, 1800, 0.16);
      },
      leak: () => tone(110, 0.3, { to: 55, wave: 'triangle', gain: 0.3 }),
      wave() { for (let i = 0; i < 7; i++) tone(1320, 0.06, { at: i * 0.065, wave: 'square', gain: 0.03 }); },
      boss: () => tone(70, 0.9, { to: 45, wave: 'sawtooth', gain: 0.1 }),
      clear: () => [2, 4, 5].forEach((n, i) => tone(SCALE[n], 0.26, { at: i * 0.08, wave: 'triangle', gain: 0.1 })),
      win: () => [0, 2, 4, 5, 7, 9].forEach((n, i) => tone(SCALE[n], 0.5, { at: i * 0.11, wave: 'triangle', gain: 0.12 })),
      // One note per crayon in Crayon Echo
      note: (i) => tone(SCALE[i * 2], 0.28, { wave: 'triangle', gain: 0.16 }),
      over: () => [5, 3, 1, 0].forEach((n, i) => tone(SCALE[n], 0.5, { at: i * 0.16, wave: 'triangle', gain: 0.12 })),
    };

    return {
      unlock,
      play: (name, ...args) => sounds[name](...args),
      setMuted: (value) => { muted = value; },
    };
  };
})();
