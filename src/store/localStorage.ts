import type { Dog, Session, BehaviorEvent } from '../types';
import { DEFAULT_DURATIONS } from '../types';

const KEYS = {
  dogs: 'dbt_dogs',
  sessions: 'dbt_sessions',
  events: 'dbt_events',
  activeDogId: 'dbt_active_dog_id',
};

function getItem<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function setItem<T>(key: string, value: T): void {
  localStorage.setItem(key, JSON.stringify(value));
}

// Dog
export function getDogs(): Dog[] {
  return getItem<Dog[]>(KEYS.dogs, []);
}

export function saveDog(dog: Dog): void {
  const dogs = getDogs();
  const idx = dogs.findIndex(d => d.id === dog.id);
  if (idx >= 0) {
    dogs[idx] = dog;
  } else {
    dogs.push(dog);
  }
  setItem(KEYS.dogs, dogs);
}

export function removeDog(id: string): void {
  const dogs = getDogs().filter(d => d.id !== id);
  setItem(KEYS.dogs, dogs);
  // アクティブ犬が削除された場合、別の犬に切替
  if (getActiveDogId() === id) {
    if (dogs.length > 0) {
      localStorage.setItem(KEYS.activeDogId, dogs[0].id);
    } else {
      localStorage.removeItem(KEYS.activeDogId);
    }
  }
}

export function getActiveDogId(): string | null {
  return localStorage.getItem(KEYS.activeDogId);
}

export function setActiveDogId(id: string): void {
  localStorage.setItem(KEYS.activeDogId, id);
}

export function getActiveDog(): Dog | null {
  const id = getActiveDogId();
  if (!id) return null;
  return getDogs().find(d => d.id === id) ?? null;
}

// Session
export function getSessions(): Session[] {
  return getItem<Session[]>(KEYS.sessions, []);
}

export function getSessionsByDog(dogId: string): Session[] {
  return getSessions().filter(s => s.dogId === dogId);
}

export function saveSession(session: Session): void {
  const sessions = getSessions();
  const idx = sessions.findIndex(s => s.id === session.id);
  if (idx >= 0) {
    sessions[idx] = session;
  } else {
    sessions.push(session);
  }
  setItem(KEYS.sessions, sessions);
}

// BehaviorEvent
export function getEvents(): BehaviorEvent[] {
  return getItem<BehaviorEvent[]>(KEYS.events, []);
}

export function getEventsBySession(sessionId: string): BehaviorEvent[] {
  return getEvents().filter(e => e.sessionId === sessionId);
}

export function saveEvent(event: BehaviorEvent): void {
  const events = getEvents();
  events.push(event);
  setItem(KEYS.events, events);
}

export function getEventsByDog(dogId: string): BehaviorEvent[] {
  return getEvents().filter(e => e.dogId === dogId);
}

export function updateEvent(updated: BehaviorEvent): void {
  const events = getEvents();
  const idx = events.findIndex(e => e.id === updated.id);
  if (idx >= 0) {
    events[idx] = updated;
    setItem(KEYS.events, events);
  }
}

// セッション単体を削除（関連イベントも削除）
export function removeSession(sessionId: string): void {
  const sessions = getSessions().filter(s => s.id !== sessionId);
  setItem(KEYS.sessions, sessions);
  const events = getEvents().filter(e => e.sessionId !== sessionId);
  setItem(KEYS.events, events);
}

// セッション・イベントのみクリア（犬データは保持）
export function clearSessionData(): void {
  localStorage.removeItem(KEYS.sessions);
  localStorage.removeItem(KEYS.events);
}

// マイグレーション
export function migrateData(): void {
  const dogs = getDogs();
  let changed = false;
  for (const dog of dogs) {
    // 「成功」→「アイコンタクト」
    const idx = dog.targetBehaviors.indexOf('成功');
    if (idx >= 0) {
      dog.targetBehaviors[idx] = 'アイコンタクト';
      changed = true;
    }
    // durationOptions が未設定 → デフォルト値を設定
    if (!dog.durationOptions) {
      dog.durationOptions = [...DEFAULT_DURATIONS];
      changed = true;
    }
    // latencyOptionsから-1（なし）と0を除去
    if (dog.latencyOptions && (dog.latencyOptions.includes(-1) || dog.latencyOptions.includes(0))) {
      dog.latencyOptions = dog.latencyOptions.filter(l => l > 0);
      changed = true;
    }
    // behaviorsByStimulus を削除（不要になった）
    if ('behaviorsByStimulus' in dog) {
      delete (dog as Record<string, unknown>).behaviorsByStimulus;
      changed = true;
    }
    // environmentNote 未設定 → 空文字
    if (dog.environmentNote === undefined) {
      dog.environmentNote = '';
      changed = true;
    }
    // recordMode 未設定 → デフォルト 'press'（長押し式）
    if (!dog.recordMode) {
      dog.recordMode = 'press';
      changed = true;
    }
  }
  if (changed) setItem(KEYS.dogs, dogs);

  const sessions = getSessions();
  let sessionChanged = false;
  for (const s of sessions) {
    if (s.environmentNote === undefined) {
      s.environmentNote = '';
      sessionChanged = true;
    }
  }
  if (sessionChanged) setItem(KEYS.sessions, sessions);
}
