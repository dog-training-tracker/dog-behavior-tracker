import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { getActiveDog, saveSession, saveEvent, updateEvent } from '../store/localStorage';
import type { Session, BehaviorEvent, GeoPoint } from '../types';
import { useGeolocation } from '../hooks/useGeolocation';
import { useWakeLock } from '../hooks/useWakeLock';
import ButtonGrid from '../components/ButtonGrid';

function formatTimer(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// GPS距離計算（Haversine）
function calcGpsDistance(p1: GeoPoint, p2: GeoPoint): number {
  const R = 6371e3;
  const toRad = (deg: number) => deg * Math.PI / 180;
  const dLat = toRad(p2.lat - p1.lat);
  const dLng = toRad(p2.lng - p1.lng);
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(p1.lat)) * Math.cos(toRad(p2.lat)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export default function WalkPage() {
  const navigate = useNavigate();
  const dog = getActiveDog();

  const [sessionId] = useState(() => crypto.randomUUID());
  const startTimeRef = useRef(Date.now());
  const [elapsed, setElapsed] = useState(0);

  // 記録中状態
  const [isRecording, setIsRecording] = useState(false);
  const recordStartRef = useRef(0);
  const recordStartPosRef = useRef<GeoPoint | null>(null);
  const [recordDuration, setRecordDuration] = useState(0);

  const [eventCount, setEventCount] = useState(0);

  // 編集中のイベント（前回の記録）
  const [pendingEvent, setPendingEvent] = useState<BehaviorEvent | null>(null);
  const [editStimulus, setEditStimulus] = useState<string | null>(null);
  const [editBehavior, setEditBehavior] = useState<string | null>(null);
  const [editLatency, setEditLatency] = useState<number | null>(null);
  const [editComment, setEditComment] = useState('');

  const { currentPosition, getPoints } = useGeolocation(true);
  useWakeLock(true);

  // 散歩タイマー
  useEffect(() => {
    const timer = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTimeRef.current) / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // 記録中タイマー
  useEffect(() => {
    if (!isRecording) return;
    const timer = setInterval(() => {
      setRecordDuration(Math.floor((Date.now() - recordStartRef.current) / 1000));
    }, 200);
    return () => clearInterval(timer);
  }, [isRecording]);

  // 編集中のイベントを保存（内部ヘルパー）
  const savePendingEdit = useCallback(() => {
    if (!pendingEvent) return;
    updateEvent({
      ...pendingEvent,
      stimulus: editStimulus ?? '',
      behavior: editBehavior,
      latency: editLatency,
      comment: editComment,
    });
  }, [pendingEvent, editStimulus, editBehavior, editLatency]);

  // 行動発生タップ
  const handleStartRecord = useCallback(() => {
    // 編集中のイベントがあれば保存してからスタート
    if (pendingEvent) {
      savePendingEdit();
      setPendingEvent(null);
    }
    setIsRecording(true);
    recordStartRef.current = Date.now();
    recordStartPosRef.current = currentPosition;
    setRecordDuration(0);
  }, [pendingEvent, savePendingEdit, currentPosition]);

  // 終了タップ
  const handleEndRecord = useCallback(() => {
    if (!dog) return;
    const elapsedMs = Date.now() - recordStartRef.current;
    // 長押し式で0.5秒未満は誤タップとして破棄
    if (dog.recordMode === 'press' && elapsedMs < 500) {
      setIsRecording(false);
      setRecordDuration(0);
      return;
    }
    const duration = Math.max(1, Math.floor(elapsedMs / 1000));
    const startPos = recordStartPosRef.current;
    const endPos = currentPosition;
    const distance = startPos && endPos ? Math.round(calcGpsDistance(startPos, endPos)) : null;

    const event: BehaviorEvent = {
      id: crypto.randomUUID(),
      sessionId,
      dogId: dog.id,
      timestamp: recordStartRef.current,
      elapsedSeconds: Math.floor((recordStartRef.current - startTimeRef.current) / 1000),
      stimulus: '',
      behavior: null,
      latency: null,
      duration,
      distance,
      comment: '',
      location: startPos,
    };

    saveEvent(event);
    setEventCount(prev => prev + 1);
    setIsRecording(false);

    // 編集用にセット
    setPendingEvent(event);
    setEditStimulus(null);
    setEditBehavior(null);
    setEditLatency(null);
    setEditComment('');
  }, [dog, sessionId, currentPosition]);

  // 誤タップ取消
  const handleCancelRecord = useCallback(() => {
    setIsRecording(false);
    setRecordDuration(0);
  }, []);

  // 編集を保存して閉じる
  const handleSaveEdit = useCallback(() => {
    savePendingEdit();
    setPendingEvent(null);
  }, [savePendingEdit]);

  // スキップ（編集せず閉じる）
  const handleSkipEdit = useCallback(() => {
    setPendingEvent(null);
  }, []);

  // 散歩終了
  const handleEndWalk = useCallback(() => {
    if (!dog) return;
    if (pendingEvent) savePendingEdit();
    const session: Session = {
      id: sessionId,
      dogId: dog.id,
      startTime: startTimeRef.current,
      endTime: Date.now(),
      routePoints: getPoints(),
      treatAmount: 0,
      comment: '',
      environmentNote: dog.environmentNote ?? '',
    };
    saveSession(session);
    navigate(`/walk-result/${sessionId}`);
  }, [dog, sessionId, getPoints, navigate, pendingEvent, savePendingEdit]);

  if (!dog) {
    return <Navigate to="/login" replace />;
  }

  const pendingEditor = pendingEvent && (
    <div className="card" style={{ marginTop: 16 }}>
      <div style={{
        display: 'flex', justifyContent: 'space-between',
        alignItems: 'center', marginBottom: 8,
      }}>
        <strong style={{ fontSize: 14 }}>直前の記録を編集</strong>
        <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
          {pendingEvent.duration != null ? `${pendingEvent.duration}秒` : ''}
          {pendingEvent.distance != null ? ` / ${pendingEvent.distance}m` : ''}
        </span>
      </div>

      <div className="section-label" style={{ marginTop: 4 }}>SD（刺激）</div>
      <ButtonGrid
        options={dog.stimulusOptions}
        selected={editStimulus}
        onSelect={setEditStimulus}
        columns={3}
      />

      <div className="section-label">行動</div>
      <ButtonGrid
        options={dog.targetBehaviors}
        selected={editBehavior}
        onSelect={setEditBehavior}
        columns={3}
      />

      <div className="section-label">行動が出るまでの時間</div>
      <ButtonGrid
        options={dog.latencyOptions.filter(l => l > 0).map(l => `${l}秒`)}
        selected={editLatency === null ? null : `${editLatency}秒`}
        onSelect={v => setEditLatency(Number(v.replace('秒', '')))}
        columns={4}
      />

      <div className="section-label">コメント</div>
      <textarea
        className="input"
        placeholder="メモ..."
        value={editComment}
        onChange={e => setEditComment(e.target.value)}
        rows={2}
        style={{ minHeight: 48 }}
      />

      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <button
          className="btn btn-success"
          style={{ flex: 1 }}
          onClick={handleSaveEdit}
        >
          保存
        </button>
        <button
          className="btn"
          style={{ flex: 1, background: 'var(--bg)', border: '2px solid var(--border)', color: 'var(--text-secondary)' }}
          onClick={handleSkipEdit}
        >
          スキップ
        </button>
      </div>
    </div>
  );

  return (
    <div className="page" style={{ paddingBottom: 16 }}>
      {/* ヘッダー: 散歩タイマー + 記録件数 */}
      <div className="walk-timer">{formatTimer(elapsed)}</div>
      <div className="walk-counter">
        <span>記録: <strong>{eventCount}</strong>件</span>
      </div>

      {/* === 行動記録 === */}
      {dog.recordMode === 'press' ? (
        /* 長押し式: 押している間=行動時間 */
        <>
          <button
            className={isRecording ? 'btn btn-danger btn-full' : 'btn btn-primary btn-full'}
            style={{
              marginTop: 16,
              minHeight: 140,
              fontSize: 22,
              borderRadius: 16,
              letterSpacing: 1,
              touchAction: 'manipulation',
              userSelect: 'none',
              WebkitUserSelect: 'none',
              WebkitTouchCallout: 'none',
            }}
            onPointerDown={e => {
              e.preventDefault();
              (e.currentTarget as HTMLButtonElement).setPointerCapture?.(e.pointerId);
              handleStartRecord();
            }}
            onPointerUp={() => { if (isRecording) handleEndRecord(); }}
            onPointerCancel={() => { if (isRecording) handleEndRecord(); }}
            onPointerLeave={() => { if (isRecording) handleEndRecord(); }}
            onContextMenu={e => e.preventDefault()}
          >
            {isRecording ? (
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 12, opacity: 0.85, marginBottom: 4 }}>
                  指を離すと終了
                </div>
                <div style={{
                  fontSize: 48, fontWeight: 700,
                  fontVariantNumeric: 'tabular-nums',
                }}>
                  {formatTimer(recordDuration)}
                </div>
              </div>
            ) : (
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 22, fontWeight: 700 }}>行動発生</div>
                <div style={{ fontSize: 13, opacity: 0.85, marginTop: 4 }}>
                  押している間が行動時間
                </div>
              </div>
            )}
          </button>
          {!isRecording && pendingEditor}
        </>
      ) : isRecording ? (
        /* タップ式: 計測中 */
        <div style={{ textAlign: 'center', marginTop: 20 }}>
          <div style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 8 }}>
            行動計測中...
          </div>
          <div style={{
            fontSize: 56, fontWeight: 700,
            fontVariantNumeric: 'tabular-nums',
            color: 'var(--danger)',
            padding: '16px 0',
          }}>
            {formatTimer(recordDuration)}
          </div>

          <button
            className="btn btn-danger btn-full"
            style={{ marginTop: 20, minHeight: 80, fontSize: 24, borderRadius: 16 }}
            onClick={handleEndRecord}
          >
            終了
          </button>

          <button
            className="btn btn-full"
            style={{
              marginTop: 12,
              background: 'var(--bg)',
              border: '2px solid var(--border)',
              color: 'var(--text-secondary)',
            }}
            onClick={handleCancelRecord}
          >
            誤タップ取消
          </button>
        </div>
      ) : (
        <>
          <button
            className="btn btn-primary btn-full"
            style={{
              marginTop: 16,
              minHeight: 88,
              fontSize: 24,
              borderRadius: 16,
              letterSpacing: 2,
            }}
            onClick={handleStartRecord}
          >
            行動発生したらタップ
          </button>
          {pendingEditor}
        </>
      )}

      <button
        className="btn btn-full"
        style={{
          marginTop: 24,
          background: 'var(--bg)',
          border: '2px solid var(--danger)',
          color: 'var(--danger)',
        }}
        onClick={handleEndWalk}
      >
        記録終了
      </button>
    </div>
  );
}
