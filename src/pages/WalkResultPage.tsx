import { useState, useMemo, useRef, useCallback } from 'react';
import { useNavigate, useParams, Navigate } from 'react-router-dom';
import { getSessions, saveSession, getEventsBySession, updateEvent, getActiveDog, getDogs } from '../store/localStorage';
import { syncToServer, getSyncConfig } from '../store/syncService';
import type { BehaviorEvent } from '../types';
import SummaryCard from '../components/SummaryCard';
import EventMap, { BEHAVIOR_COLORS } from '../components/EventMap';

function formatTime(ts: number): string {
  const d = new Date(ts);
  return `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
}

function formatDuration(start: number, end: number | null): string {
  if (!end) return '-';
  const sec = Math.floor((end - start) / 1000);
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}分${s}秒`;
}

interface SpeechRecognitionResult {
  readonly [index: number]: { transcript: string };
}
interface SpeechRecognitionResultList {
  readonly length: number;
  [Symbol.iterator](): Iterator<SpeechRecognitionResult>;
}
interface SpeechRecognitionInstance {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((e: { results: SpeechRecognitionResultList }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start(): void;
  stop(): void;
}

function createRecognition(): SpeechRecognitionInstance | null {
  const w = window as unknown as Record<string, unknown>;
  const SR = (w.webkitSpeechRecognition ?? w.SpeechRecognition) as
    | (new () => SpeechRecognitionInstance)
    | undefined;
  if (!SR) return null;
  const r = new SR();
  r.lang = 'ja-JP';
  r.interimResults = false;
  r.continuous = false;
  return r;
}

function EventEditor({ event, dog, onSave }: { event: BehaviorEvent; dog: { targetBehaviors: string[]; latencyOptions: number[]; durationOptions: number[]; distanceOptions: number[] }; onSave: (e: BehaviorEvent) => void }) {
  const [behavior, setBehavior] = useState(event.behavior);
  const [latency, setLatency] = useState(event.latency);
  const [duration, setDuration] = useState(event.duration ?? null);
  const [distance, setDistance] = useState(event.distance);
  const [comment, setComment] = useState(event.comment ?? '');
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<ReturnType<typeof createRecognition> | null>(null);

  const handleSave = () => {
    onSave({ ...event, behavior, latency, duration, distance, comment });
  };

  const toggleSpeech = useCallback(() => {
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
      return;
    }
    const recognition = createRecognition();
    if (!recognition) return;
    recognitionRef.current = recognition;
    recognition.onresult = (e) => {
      const transcript = Array.from(e.results).map(r => r[0].transcript).join('');
      setComment(prev => prev + transcript);
    };
    recognition.onend = () => setIsListening(false);
    recognition.onerror = () => setIsListening(false);
    recognition.start();
    setIsListening(true);
  }, [isListening]);

  return (
    <div className="event-editor">
      <div className="section-label" style={{ marginTop: 4 }}>行動</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {dog.targetBehaviors.map(b => (
          <button
            key={b}
            className={`btn-option ${behavior === b ? 'selected' : ''}`}
            style={{ padding: '6px 12px', fontSize: 13, minHeight: 36 }}
            onClick={() => setBehavior(b)}
          >
            {b}
          </button>
        ))}
      </div>

      <div className="section-label">潜時</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {dog.latencyOptions.map(l => {
          const label = l === -1 ? 'なし' : `${l}秒`;
          const val = l === -1 ? -1 : l;
          return (
            <button
              key={l}
              className={`btn-option ${latency === val ? 'selected' : ''}`}
              style={{ padding: '6px 12px', fontSize: 13, minHeight: 36 }}
              onClick={() => setLatency(val)}
            >
              {label}
            </button>
          );
        })}
      </div>

      <div className="section-label">持続時間</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {dog.durationOptions.map(d => (
          <button
            key={d}
            className={`btn-option ${duration === d ? 'selected' : ''}`}
            style={{ padding: '6px 12px', fontSize: 13, minHeight: 36 }}
            onClick={() => setDuration(d)}
          >
            {d}秒
          </button>
        ))}
      </div>

      <div className="section-label">距離</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {dog.distanceOptions.map(d => (
          <button
            key={d}
            className={`btn-option ${distance === d ? 'selected' : ''}`}
            style={{ padding: '6px 12px', fontSize: 13, minHeight: 36 }}
            onClick={() => setDistance(d)}
          >
            {d}m
          </button>
        ))}
      </div>

      <div className="section-label">コメント</div>
      <div className="comment-input-wrap">
        <textarea
          className="input"
          value={comment}
          onChange={e => setComment(e.target.value)}
          placeholder="メモ..."
          rows={2}
          style={{ minHeight: 40 }}
        />
        <button
          type="button"
          className={`mic-btn ${isListening ? 'listening' : ''}`}
          onClick={toggleSpeech}
          aria-label="音声入力"
        >
          🎤
        </button>
      </div>

      <button
        className="btn btn-primary btn-full"
        style={{ marginTop: 8 }}
        onClick={handleSave}
      >
        更新
      </button>
    </div>
  );
}

export default function WalkResultPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const dog = getActiveDog();

  const session = useMemo(() => getSessions().find(s => s.id === sessionId), [sessionId]);
  const [events, setEvents] = useState<BehaviorEvent[]>(() => sessionId ? getEventsBySession(sessionId) : []);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [treatAmount, setTreatAmount] = useState(session?.treatAmount ?? 0);
  const [comment, setComment] = useState(session?.comment ?? '');
  const [environmentNote, setEnvironmentNote] = useState(session?.environmentNote ?? '');

  const stats = useMemo(() => {
    const count = events.length;
    const latencies = events.filter(e => e.latency !== null && e.latency >= 0).map(e => e.latency!);
    const avgLatency = latencies.length > 0 ? latencies.reduce((a, b) => a + b, 0) / latencies.length : null;
    const distances = events.filter(e => e.distance !== null).map(e => e.distance!);
    const avgDistance = distances.length > 0 ? distances.reduce((a, b) => a + b, 0) / distances.length : null;
    return { count, avgLatency, avgDistance };
  }, [events]);

  if (!session) {
    return <Navigate to="/" replace />;
  }

  const handleSave = () => {
    const updatedSession = { ...session, treatAmount, comment, environmentNote };
    saveSession(updatedSession);

    // バックグラウンドでサーバー同期
    if (getSyncConfig()) {
      const dogs = getDogs();
      syncToServer(dogs, [updatedSession], events).catch(() => {
        // 失敗時はキューに自動追加される
      });
    }

    navigate('/');
  };

  const handleEventUpdate = (updated: BehaviorEvent) => {
    updateEvent(updated);
    setEvents(prev => prev.map(e => e.id === updated.id ? updated : e));
    setEditingId(null);
  };

  const treatOptions = Array.from({ length: 26 }, (_, i) => i * 10);

  return (
    <div className="page" style={{ paddingBottom: 16 }}>
      <h1 className="page-title">散歩結果</h1>

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
          <span>散歩時間</span>
          <strong>{formatDuration(session.startTime, session.endTime)}</strong>
        </div>
      </div>

      <SummaryCard {...stats} />

      <div className="section-label">マップ</div>
      <EventMap events={events} routePoints={session.routePoints} />

      <div className="section-label">記録一覧（タップで編集）</div>
      <div className="card">
        <div className="event-row" style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>
          <span>時刻</span>
          <span>SD → 行動</span>
          <span>距離</span>
          <span>潜時</span>
        </div>
        {events.length === 0 ? (
          <div style={{ padding: '12px 0', textAlign: 'center', color: 'var(--text-secondary)' }}>記録なし</div>
        ) : (
          events.map(ev => (
            <div key={ev.id}>
              <div
                className="event-row"
                style={{ cursor: 'pointer' }}
                onClick={() => setEditingId(editingId === ev.id ? null : ev.id)}
              >
                <span>{formatTime(ev.timestamp)}</span>
                <span>
                  {ev.stimulus} → {ev.behavior ? (
                    <span style={{ color: BEHAVIOR_COLORS[ev.behavior] || '#757575', fontWeight: 600 }}>{ev.behavior}</span>
                  ) : (
                    <span className="badge-empty">未入力</span>
                  )}
                </span>
                <span>{ev.distance !== null ? `${ev.distance}m` : <span className="badge-empty">未入力</span>}</span>
                <span>{ev.latency !== null ? (ev.latency === -1 ? 'なし' : `${ev.latency}s`) : <span className="badge-empty">未入力</span>}</span>
              </div>
              {ev.comment && editingId !== ev.id && (
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', padding: '0 0 6px 4px' }}>💬 {ev.comment}</div>
              )}
              {editingId === ev.id && dog && (
                <EventEditor event={ev} dog={dog} onSave={handleEventUpdate} />
              )}
            </div>
          ))
        )}
      </div>

      <label className="label">環境（確立操作・環境事象）</label>
      <textarea
        className="input"
        placeholder="散歩前の状態・環境..."
        value={environmentNote}
        onChange={e => setEnvironmentNote(e.target.value)}
        rows={2}
        style={{ minHeight: 48 }}
      />

      <label className="label">おやつ量</label>
      <select className="input" value={treatAmount} onChange={e => setTreatAmount(Number(e.target.value))}>
        {treatOptions.map(g => (
          <option key={g} value={g}>{g}g</option>
        ))}
      </select>

      <label className="label">コメント</label>
      <textarea
        className="input"
        placeholder="気づいたことなど..."
        value={comment}
        onChange={e => setComment(e.target.value)}
      />

      <button
        className="btn btn-success btn-full btn-lg"
        style={{ marginTop: 16 }}
        onClick={handleSave}
      >
        保存する
      </button>
    </div>
  );
}
