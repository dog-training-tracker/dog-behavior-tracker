export interface Dog {
  id: string;
  name: string;
  targetBehaviors: string[];
  stimulusOptions: string[];
  latencyOptions: number[];    // -1 = 反応なし
  durationOptions: number[];   // 行動の持続時間（秒）
  distanceOptions: number[];
  goal: string;
  environmentNote: string;     // 環境（確立操作・環境事象）の定型メモ
  recordMode: 'tap' | 'press'; // 行動記録の操作方式（タップ式/長押し式）
}

export interface Session {
  id: string;
  dogId: string;
  startTime: number;           // timestamp
  endTime: number | null;
  routePoints: GeoPoint[];
  treatAmount: number;         // おやつ量（g）
  comment: string;
  environmentNote: string;     // この散歩の環境メモ（dog.environmentNoteからプリフィル）
}

export interface BehaviorEvent {
  id: string;
  sessionId: string;
  dogId: string;
  timestamp: number;
  elapsedSeconds: number;
  stimulus: string;            // SD
  behavior: string | null;
  latency: number | null;      // 秒（-1 = 反応なし）
  duration: number | null;     // 行動の持続時間（秒）
  distance: number | null;     // m
  comment: string;
  location: GeoPoint | null;
}

export interface GeoPoint {
  lat: number;
  lng: number;
  timestamp: number;
}

export const DEFAULT_STIMULI = ['犬', '人', '自転車', '車', '音', 'その他'];
export const DEFAULT_BEHAVIORS = ['吠え', '突進', '固まる', '回避', '引張り', 'アイコンタクト'];
export const DEFAULT_LATENCIES = [1, 2, 3, 4, 5];
export const DEFAULT_DURATIONS = [1, 2, 3, 5, 10, 15, 30, 60];
export const DEFAULT_DISTANCES = [1, 2, 3, 5, 7, 10, 15, 20, 30, 50];

// バックエンド同期用
export interface Instructor {
  id: string;
  name: string;
}

export interface AdminInstructor {
  id: string;
  name: string;
  userCount: number;
}

export interface AdminUser {
  emailHash: string;
  dogName: string;
  instructorId: string;
  instructorName: string;
  created: string;
  lastSync: string;
}

export interface SyncConfig {
  emailHash: string;
  instructorId: string;
}

export interface InstructorStudent {
  emailHash: string;
  dogName: string;
  sessionCount: number;
  eventCount: number;
  lastSync: string;
}

export interface SyncQueueItem {
  id: string;
  timestamp: number;
  payload: {
    dogs: Dog[];
    sessions: Session[];
    events: BehaviorEvent[];
  };
}
