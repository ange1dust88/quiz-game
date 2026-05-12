// Tiny synth-driven sound effects. No asset files — every sound is built
// from oscillators with envelope shaping. Modern browsers require a user
// gesture before audio can play, so the AudioContext is created lazily
// and resumed on each call (the resume is a no-op once it's running).

let audioContext: AudioContext | null = null;
let muted = false;
let initialised = false;
const MASTER_VOLUME = 0.25;
const MUTE_KEY = "eq-muted";

function getContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!initialised) {
    initialised = true;
    try {
      muted = window.localStorage.getItem(MUTE_KEY) === "1";
    } catch {
      muted = false;
    }
  }
  if (muted) return null;
  if (!audioContext) {
    const W = window as unknown as {
      AudioContext?: typeof AudioContext;
      webkitAudioContext?: typeof AudioContext;
    };
    const Ctx = W.AudioContext ?? W.webkitAudioContext;
    if (!Ctx) return null;
    audioContext = new Ctx();
  }
  if (audioContext.state === "suspended") {
    audioContext.resume().catch(() => {});
  }
  return audioContext;
}

type ToneOptions = {
  freq: number;
  duration?: number;
  type?: OscillatorType;
  attack?: number;
  gain?: number;
  delay?: number;
  freqEnd?: number;
};

function tone(opts: ToneOptions) {
  const ctx = getContext();
  if (!ctx) return;
  const {
    freq,
    duration = 0.18,
    type = "sine",
    attack = 0.01,
    gain = 0.5,
    delay = 0,
    freqEnd,
  } = opts;
  const t0 = ctx.currentTime + delay;
  const t1 = t0 + duration;
  const osc = ctx.createOscillator();
  const env = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (freqEnd !== undefined) {
    osc.frequency.exponentialRampToValueAtTime(
      Math.max(20, freqEnd),
      t1,
    );
  }
  env.gain.setValueAtTime(0, t0);
  env.gain.linearRampToValueAtTime(gain * MASTER_VOLUME, t0 + attack);
  env.gain.exponentialRampToValueAtTime(0.0001, t1);
  osc.connect(env).connect(ctx.destination);
  osc.start(t0);
  osc.stop(t1 + 0.02);
}

export const sounds = {
  // "Your turn now" — quick high blip.
  yourTurn: () =>
    tone({ freq: 880, duration: 0.08, type: "sine", gain: 0.5 }),
  // A new question appeared — two-tone notification.
  questionUp: () => {
    tone({ freq: 440, duration: 0.08, type: "triangle", gain: 0.4 });
    tone({ freq: 660, duration: 0.1, type: "triangle", gain: 0.4, delay: 0.07 });
  },
  // Someone took a country FROM me — short descending sad blip.
  countryLost: () =>
    tone({
      freq: 360,
      freqEnd: 160,
      duration: 0.28,
      type: "sawtooth",
      gain: 0.35,
    }),
  // Last 3 seconds of a timer — short, sharp.
  tick: () =>
    tone({
      freq: 880,
      duration: 0.07,
      type: "square",
      gain: 0.18,
    }),
  // Generic "click confirmed" / answer submitted.
  submit: () =>
    tone({ freq: 523, duration: 0.12, type: "sine", gain: 0.4 }),
  // Pick / capture — major-third chord arpeggio.
  capture: () => {
    tone({ freq: 523, duration: 0.12, type: "sine", gain: 0.35 });
    tone({ freq: 659, duration: 0.14, type: "sine", gain: 0.35, delay: 0.06 });
    tone({ freq: 784, duration: 0.18, type: "sine", gain: 0.4, delay: 0.13 });
  },
  // War attack initiated.
  attackStart: () =>
    tone({
      freq: 220,
      freqEnd: 110,
      duration: 0.35,
      type: "sawtooth",
      gain: 0.3,
    }),
  // A capital fell (cascade).
  capitalFall: () => {
    tone({
      freq: 440,
      freqEnd: 80,
      duration: 0.7,
      type: "sawtooth",
      gain: 0.45,
    });
    tone({
      freq: 220,
      freqEnd: 60,
      duration: 0.8,
      type: "square",
      gain: 0.35,
      delay: 0.05,
    });
  },
  // Game over — winner.
  victory: () => {
    [523, 659, 784, 1046].forEach((f, i) => {
      tone({
        freq: f,
        duration: 0.25,
        type: "triangle",
        gain: 0.4,
        delay: i * 0.13,
      });
    });
  },
  // Game over — loser.
  defeat: () => {
    [392, 349, 277].forEach((f, i) => {
      tone({
        freq: f,
        duration: 0.28,
        type: "sawtooth",
        gain: 0.35,
        delay: i * 0.16,
      });
    });
  },
};

export function isMuted(): boolean {
  if (typeof window === "undefined") return false;
  if (!initialised) {
    initialised = true;
    try {
      muted = window.localStorage.getItem(MUTE_KEY) === "1";
    } catch {
      muted = false;
    }
  }
  return muted;
}

export function setMuted(value: boolean) {
  muted = value;
  initialised = true;
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(MUTE_KEY, value ? "1" : "0");
    } catch {
      // ignore (e.g. private mode)
    }
  }
}
