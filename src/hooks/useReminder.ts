import { useState, useRef, useCallback, useEffect } from 'react';

export interface ReminderConfig {
  mode: 'manual' | 'auto';
  behaviorMaxSec: number;  // 1行動の上限秒
  count: number;           // 行動回数
  intervalSec?: number;    // 自動モードのみ: 行動間のインターバル秒
}

// AudioContext をモジュールスコープでキャッシュ（iOS Safari対策）
let audioCtx: AudioContext | null = null;
function getAudioContext(): AudioContext {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
  }
  return audioCtx;
}

function playBeep(frequency: number, durationMs: number) {
  try {
    const ctx = getAudioContext();
    if (ctx.state === 'suspended') ctx.resume();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = frequency;
    osc.type = 'sine';
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + durationMs / 1000);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + durationMs / 1000);
  } catch {
    // Audio API not available
  }
}

export function notify(type: 'start' | 'limit' | 'stop') {
  if (type === 'start') playBeep(880, 200);
  else if (type === 'limit') playBeep(660, 400);
  else playBeep(440, 300);
  if (navigator.vibrate) {
    navigator.vibrate(type === 'start' ? [100, 50, 100] : [200]);
  }
}

export interface ReminderState {
  mode: 'manual' | 'auto' | null;
  phase: 'behavior' | 'interval' | null;
  currentIndex: number;   // 何回目の行動か（1始まり）
  totalCount: number;     // 行動の合計回数
  countdown: number;      // 現フェーズの残り秒数
  isRunning: boolean;
  isPaused: boolean;
  start: (config: ReminderConfig) => void;
  stop: () => void;
  pause: () => void;
  resume: () => void;
  next: () => void;       // 手動モード: 次の行動へ進む
}

export function useReminder(): ReminderState {
  const [isRunning, setIsRunning] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [mode, setMode] = useState<'manual' | 'auto' | null>(null);
  const [phase, setPhase] = useState<'behavior' | 'interval' | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [countdown, setCountdown] = useState(0);

  const configRef = useRef<ReminderConfig | null>(null);
  const phaseEndRef = useRef(0);
  const timerRef = useRef<number>(0);
  const audioUnlockedRef = useRef(false);
  const limitNotifiedRef = useRef(false);
  const pausedRemainingRef = useRef(0);

  const clearTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = 0;
    }
  };

  const tick = useCallback(() => {
    const now = Date.now();
    const left = Math.max(0, Math.ceil((phaseEndRef.current - now) / 1000));
    setCountdown(left);
    if (left <= 0 && !limitNotifiedRef.current) {
      notify('limit');
      limitNotifiedRef.current = true;
      // 手動モードでは時間切れ後もそのフェーズに留まる（タイマー停止）
      if (configRef.current?.mode === 'manual') {
        clearTimer();
      }
    }
  }, []);

  const startBehavior = useCallback((idx: number) => {
    const config = configRef.current;
    if (!config) return;
    setPhase('behavior');
    setCurrentIndex(idx);
    setCountdown(config.behaviorMaxSec);
    phaseEndRef.current = Date.now() + config.behaviorMaxSec * 1000;
    limitNotifiedRef.current = false;
    notify('start');
    clearTimer();
    timerRef.current = window.setInterval(tick, 200);
  }, [tick]);

  const startInterval = useCallback(() => {
    const config = configRef.current;
    if (!config || !config.intervalSec) return;
    setPhase('interval');
    setCountdown(config.intervalSec);
    phaseEndRef.current = Date.now() + config.intervalSec * 1000;
    limitNotifiedRef.current = false;
    clearTimer();
    timerRef.current = window.setInterval(() => {
      const now = Date.now();
      const left = Math.max(0, Math.ceil((phaseEndRef.current - now) / 1000));
      setCountdown(left);
      if (left <= 0) {
        clearTimer();
        // 自動モードのみインターバル後に次の行動へ進む
        const cur = currentIndexRef.current;
        if (cur < (configRef.current?.count ?? 0)) {
          startBehavior(cur + 1);
          currentIndexRef.current = cur + 1;
        } else {
          finish();
        }
      }
    }, 200);
  }, [startBehavior]);

  const currentIndexRef = useRef(0);
  useEffect(() => { currentIndexRef.current = currentIndex; }, [currentIndex]);

  const finish = useCallback(() => {
    notify('stop');
    clearTimer();
    setIsRunning(false);
    setPhase(null);
    setCountdown(0);
  }, []);

  const start = useCallback((config: ReminderConfig) => {
    if (config.behaviorMaxSec <= 0 || config.count <= 0) return;

    if (!audioUnlockedRef.current) {
      const ctx = getAudioContext();
      if (ctx.state === 'suspended') ctx.resume();
      audioUnlockedRef.current = true;
    }

    configRef.current = config;
    setMode(config.mode);
    setTotalCount(config.count);
    setIsRunning(true);
    setIsPaused(false);
    currentIndexRef.current = 1;
    startBehavior(1);
  }, [startBehavior]);

  const next = useCallback(() => {
    const config = configRef.current;
    if (!config || !isRunning) return;
    const cur = currentIndexRef.current;
    if (config.mode === 'auto' && phase === 'behavior' && config.intervalSec && config.intervalSec > 0) {
      // 自動モード: 行動 → インターバル
      startInterval();
      return;
    }
    if (cur >= config.count) {
      finish();
      return;
    }
    const nextIdx = cur + 1;
    currentIndexRef.current = nextIdx;
    startBehavior(nextIdx);
  }, [isRunning, phase, startBehavior, startInterval, finish]);

  const stop = useCallback(() => {
    clearTimer();
    setIsRunning(false);
    setIsPaused(false);
    setPhase(null);
    setCountdown(0);
    setMode(null);
    configRef.current = null;
  }, []);

  const pause = useCallback(() => {
    if (!isRunning || isPaused) return;
    clearTimer();
    pausedRemainingRef.current = Math.max(0, phaseEndRef.current - Date.now());
    setIsPaused(true);
  }, [isRunning, isPaused]);

  const resume = useCallback(() => {
    if (!isRunning || !isPaused) return;
    phaseEndRef.current = Date.now() + pausedRemainingRef.current;
    setIsPaused(false);
    if (configRef.current?.mode === 'manual' && pausedRemainingRef.current <= 0) {
      // 時間切れ後の一時停止解除はタイマー再開しない
      return;
    }
    timerRef.current = window.setInterval(tick, 200);
  }, [isRunning, isPaused, tick]);

  useEffect(() => {
    return () => clearTimer();
  }, []);

  return {
    mode,
    phase,
    currentIndex,
    totalCount,
    countdown,
    isRunning,
    isPaused,
    start,
    stop,
    pause,
    resume,
    next,
  };
}
