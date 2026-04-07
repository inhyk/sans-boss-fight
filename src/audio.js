const LOOKAHEAD = 0.35;
const SILENCE = 0.0001;
const ROOT_SEQUENCE = [38, 33, 36, 31, 34, 29, 32, 30];
const DISSONANCE_SEQUENCE = [7, 10, 6, 1, 8, 11, 13, 5];

function midiToFrequency(midi) {
  return 440 * 2 ** ((midi - 69) / 12);
}

function createNoiseBuffer(context) {
  const buffer = context.createBuffer(1, context.sampleRate * 2, context.sampleRate);
  const channel = buffer.getChannelData(0);

  for (let index = 0; index < channel.length; index += 1) {
    const fade = 1 - index / channel.length;
    channel[index] = (Math.random() * 2 - 1) * (0.35 + fade * 0.65);
  }

  return buffer;
}

export function createDarkSoundtrack() {
  let context = null;
  let mainBus = null;
  let lowpass = null;
  let masterGain = null;
  let delay = null;
  let feedbackGain = null;
  let wetGain = null;
  let noiseBuffer = null;
  let schedulerId = 0;
  let nextStepTime = 0;
  let stepIndex = 0;
  let muted = false;
  let started = false;

  let targetIntensity = 0.18;
  let currentIntensity = 0.18;
  let targetDensity = 0.28;
  let currentDensity = 0.28;
  let targetTempo = 44;
  let currentTempo = 44;

  function updateMix(force = false) {
    if (!context) {
      return;
    }

    if (force) {
      currentIntensity = targetIntensity;
      currentDensity = targetDensity;
      currentTempo = targetTempo;
    } else {
      currentIntensity += (targetIntensity - currentIntensity) * 0.08;
      currentDensity += (targetDensity - currentDensity) * 0.08;
      currentTempo += (targetTempo - currentTempo) * 0.08;
    }

    const now = context.currentTime;
    masterGain.gain.setTargetAtTime(muted ? SILENCE : 0.18 + currentIntensity * 0.16, now, force ? 0.08 : 0.35);
    lowpass.frequency.setTargetAtTime(620 + currentIntensity * 1200, now, 0.45);
    wetGain.gain.setTargetAtTime(0.18 + currentDensity * 0.2, now, 0.45);
    feedbackGain.gain.setTargetAtTime(0.28 + currentDensity * 0.2, now, 0.45);
    delay.delayTime.setTargetAtTime(0.36 + currentIntensity * 0.08, now, 0.45);
  }

  function ensureContext() {
    if (context) {
      return true;
    }

    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) {
      return false;
    }

    context = new AudioContextClass();
    noiseBuffer = createNoiseBuffer(context);

    mainBus = context.createGain();
    mainBus.gain.value = 0.92;

    lowpass = context.createBiquadFilter();
    lowpass.type = "lowpass";
    lowpass.frequency.value = 700;
    lowpass.Q.value = 0.9;

    masterGain = context.createGain();
    masterGain.gain.value = SILENCE;

    delay = context.createDelay(1.6);
    delay.delayTime.value = 0.42;

    feedbackGain = context.createGain();
    feedbackGain.gain.value = 0.3;

    wetGain = context.createGain();
    wetGain.gain.value = 0.2;

    mainBus.connect(lowpass);
    lowpass.connect(masterGain);

    mainBus.connect(delay);
    delay.connect(feedbackGain);
    feedbackGain.connect(delay);
    delay.connect(wetGain);
    wetGain.connect(masterGain);

    masterGain.connect(context.destination);

    return true;
  }

  function startScheduler() {
    if (!context || schedulerId) {
      return;
    }

    nextStepTime = context.currentTime + 0.05;
    schedulerId = window.setInterval(scheduleAhead, 60);
  }

  function playVoice(time, frequency, duration, volume, type, options = {}) {
    if (!context || !mainBus) {
      return;
    }

    const oscillator = context.createOscillator();
    const filter = context.createBiquadFilter();
    const gain = context.createGain();

    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, time);
    oscillator.detune.setValueAtTime(options.detune || 0, time);

    filter.type = options.filterType || "lowpass";
    filter.frequency.setValueAtTime(options.filterFrequency || 500, time);
    filter.Q.value = options.q || 1;

    if (options.sweep) {
      oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, frequency * options.sweep), time + duration);
    }

    gain.gain.setValueAtTime(SILENCE, time);
    gain.gain.linearRampToValueAtTime(volume, time + Math.min(0.35, duration * 0.3));
    gain.gain.exponentialRampToValueAtTime(SILENCE, time + duration);

    oscillator.connect(filter);
    filter.connect(gain);
    gain.connect(mainBus);

    oscillator.start(time);
    oscillator.stop(time + duration + 0.05);
  }

  function playPulse(time, baseFrequency, volume) {
    playVoice(time, baseFrequency, 0.28, volume, "sine", {
      filterFrequency: 180 + currentIntensity * 120,
      sweep: 0.55,
    });
  }

  function playStartCue(time) {
    playVoice(time, 110, 0.42, 0.18, "triangle", {
      filterFrequency: 900,
      sweep: 1.3,
    });
    playVoice(time + 0.08, 164.81, 0.62, 0.07, "sawtooth", {
      detune: -4,
      filterFrequency: 1100,
      q: 1.4,
      sweep: 0.88,
    });
  }

  function playNoiseSwirl(time, duration, volume, centerFrequency) {
    if (!context || !mainBus || !noiseBuffer) {
      return;
    }

    const source = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const gain = context.createGain();

    source.buffer = noiseBuffer;
    filter.type = "bandpass";
    filter.frequency.setValueAtTime(centerFrequency, time);
    filter.Q.value = 1.4;

    gain.gain.setValueAtTime(SILENCE, time);
    gain.gain.linearRampToValueAtTime(volume, time + duration * 0.32);
    gain.gain.exponentialRampToValueAtTime(SILENCE, time + duration);

    source.connect(filter);
    filter.connect(gain);
    gain.connect(mainBus);

    source.start(time);
    source.stop(time + duration);
  }

  function scheduleSlice(time, step) {
    const beat = 60 / currentTempo;
    const root = ROOT_SEQUENCE[step % ROOT_SEQUENCE.length];
    const dissonance = DISSONANCE_SEQUENCE[step % DISSONANCE_SEQUENCE.length];
    const upperVoice = root + 12 + (step % 2 === 0 ? 0 : 1);
    const droneDuration = beat * 2.8;

    playVoice(time, midiToFrequency(root - 12), droneDuration * 0.95, 0.045 + currentIntensity * 0.03, "sine", {
      filterFrequency: 160 + currentIntensity * 80,
    });

    playVoice(time + 0.03, midiToFrequency(root), droneDuration, 0.08 + currentIntensity * 0.045, "triangle", {
      detune: -6,
      filterFrequency: 240 + currentIntensity * 120,
      q: 0.9,
    });

    playVoice(time + beat * 0.2, midiToFrequency(upperVoice), beat * 1.85, 0.018 + currentIntensity * 0.02, step % 3 === 0 ? "square" : "sawtooth", {
      detune: 7,
      filterFrequency: 520 + currentIntensity * 220,
      q: 1.8,
    });

    if (step % 2 === 0 || currentDensity > 0.58) {
      playVoice(time + beat * 0.72, midiToFrequency(root + dissonance), beat * 1.2, 0.016 + currentIntensity * 0.018, "triangle", {
        detune: -12,
        filterFrequency: 740 + currentIntensity * 180,
        q: 2.1,
      });
    }

    playPulse(time + beat * 0.05, 56 - (step % 3) * 4, 0.1 + currentIntensity * 0.04);

    if (currentDensity > 0.42) {
      playPulse(time + beat * 1.02, 43 + (step % 2) * 3, 0.075 + currentIntensity * 0.035);
    }

    if (step % 3 !== 1 || currentIntensity > 0.55) {
      playNoiseSwirl(time + beat * 0.36, beat * 1.7, 0.014 + currentIntensity * 0.024, 380 + ((step * 67) % 280));
    }
  }

  function scheduleAhead() {
    if (!context || context.state !== "running") {
      return;
    }

    updateMix();

    while (nextStepTime < context.currentTime + LOOKAHEAD) {
      scheduleSlice(nextStepTime, stepIndex);
      nextStepTime += (60 / currentTempo) * 2;
      stepIndex += 1;
    }
  }

  async function arm() {
    if (!ensureContext()) {
      return false;
    }

    try {
      if (context.state !== "running") {
        await context.resume();
      }
    } catch {
      return false;
    }

    startScheduler();
    updateMix(true);

    if (!started) {
      started = true;
      playStartCue(context.currentTime + 0.02);
    }

    return true;
  }

  function setStage(state, roundIndex = 0, totalRounds = 1) {
    const progress = totalRounds > 0 ? Math.min(1, roundIndex / totalRounds) : 0;

    switch (state) {
      case "title":
        targetIntensity = 0.16;
        targetDensity = 0.24;
        targetTempo = 42;
        break;
      case "menu":
        targetIntensity = 0.2 + progress * 0.08;
        targetDensity = 0.28 + progress * 0.06;
        targetTempo = 44 + progress * 3;
        break;
      case "text":
        targetIntensity = 0.18 + progress * 0.06;
        targetDensity = 0.26 + progress * 0.05;
        targetTempo = 43 + progress * 3;
        break;
      case "attack":
        targetIntensity = 0.34 + progress * 0.14;
        targetDensity = 0.4 + progress * 0.08;
        targetTempo = 48 + progress * 5;
        break;
      case "enemy":
        targetIntensity = 0.48 + progress * 0.3;
        targetDensity = 0.52 + progress * 0.24;
        targetTempo = 52 + progress * 8;
        break;
      case "lose":
        targetIntensity = 0.36;
        targetDensity = 0.3;
        targetTempo = 39;
        break;
      case "win":
        targetIntensity = 0.08;
        targetDensity = 0.14;
        targetTempo = 36;
        break;
      default:
        targetIntensity = 0.18;
        targetDensity = 0.26;
        targetTempo = 42;
        break;
    }

    if (context) {
      updateMix();
    }
  }

  function toggleMute() {
    muted = !muted;
    if (context) {
      updateMix(true);
    }
    return muted;
  }

  function isMuted() {
    return muted;
  }

  function dispose() {
    if (schedulerId) {
      window.clearInterval(schedulerId);
      schedulerId = 0;
    }

    if (context) {
      context.close().catch(() => {});
    }

    context = null;
    mainBus = null;
    lowpass = null;
    masterGain = null;
    delay = null;
    feedbackGain = null;
    wetGain = null;
    noiseBuffer = null;
  }

  return {
    arm,
    dispose,
    isMuted,
    setStage,
    toggleMute,
  };
}
