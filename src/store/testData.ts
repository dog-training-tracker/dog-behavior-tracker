import type { Session, BehaviorEvent, GeoPoint } from '../types';
import { getActiveDog, saveSession, saveEvent } from './localStorage';

const STIMULI = ['犬', '人', '自転車', '車', '音', 'その他'];
const BEHAVIORS = ['吠え', '突進', '固まる', '回避', '引張り', 'アイコンタクト'];
const LATENCIES = [0, 1, 2, 3, 4, 5, -1];
const DURATIONS = [1, 2, 3, 5, 10, 15, 30, 60];
const DISTANCES = [1, 2, 3, 5, 7, 10, 15, 20, 30, 50];

// 大阪城公園周辺（散歩コースとしてリアル）
const BASE_LAT = 34.6873;
const BASE_LNG = 135.5262;

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function rand(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randFloat(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

// 散歩ルートをシミュレート（少しずつ移動）
function generateRoute(startTime: number, durationMs: number): GeoPoint[] {
  const points: GeoPoint[] = [];
  const steps = Math.floor(durationMs / 7000); // 7秒間隔
  let lat = BASE_LAT + randFloat(-0.003, 0.003);
  let lng = BASE_LNG + randFloat(-0.003, 0.003);
  const dirLat = randFloat(-0.00005, 0.00005);
  const dirLng = randFloat(-0.00005, 0.00005);

  for (let i = 0; i < steps; i++) {
    lat += dirLat + randFloat(-0.00002, 0.00002);
    lng += dirLng + randFloat(-0.00002, 0.00002);
    points.push({ lat, lng, timestamp: startTime + i * 7000 });
  }
  return points;
}

export function generateTestData(walkCount = 14) {
  const dog = getActiveDog();
  if (!dog) return;

  const now = Date.now();

  for (let w = 0; w < walkCount; w++) {
    const daysAgo = Math.floor((w / walkCount) * 14);
    const startTime = now - daysAgo * 86400000 - rand(0, 43200000);
    const durationMs = rand(600000, 2400000);
    const endTime = startTime + durationMs;

    const routePoints = generateRoute(startTime, durationMs);

    const sessionId = crypto.randomUUID();
    const session: Session = {
      id: sessionId,
      dogId: dog.id,
      startTime,
      endTime,
      routePoints,
      treatAmount: pick([0, 10, 20, 30, 40, 50]),
      comment: pick(['', '今日は落ち着いていた', '犬が多かった', '雨上がりで人少なめ', '']),
      environmentNote: '',
    };
    saveSession(session);

    const eventCount = rand(3, 8);
    for (let e = 0; e < eventCount; e++) {
      const elapsedSeconds = rand(30, Math.floor(durationMs / 1000));
      const behavior = Math.random() < 0.35 ? 'アイコンタクト' : pick(BEHAVIORS.filter(b => b !== 'アイコンタクト'));

      // ルート上のランダムな地点を選ぶ
      const routeIdx = rand(0, routePoints.length - 1);
      const loc = routePoints[routeIdx];

      const event: BehaviorEvent = {
        id: crypto.randomUUID(),
        sessionId,
        dogId: dog.id,
        timestamp: startTime + elapsedSeconds * 1000,
        elapsedSeconds,
        stimulus: pick(STIMULI),
        behavior,
        latency: behavior === 'アイコンタクト' ? pick([-1, 0, 1]) : pick(LATENCIES),
        duration: pick(DURATIONS),
        distance: pick(DISTANCES),
        comment: '',
        location: { lat: loc.lat + randFloat(-0.0001, 0.0001), lng: loc.lng + randFloat(-0.0001, 0.0001), timestamp: loc.timestamp },
      };
      saveEvent(event);
    }
  }
}
