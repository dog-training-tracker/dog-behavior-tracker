import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useReminder } from '../hooks/useReminder';
import { useWakeLock } from '../hooks/useWakeLock';
import type { ReminderConfig } from '../hooks/useReminder';

export default function ReminderPage() {
  const navigate = useNavigate();
  const reminder = useReminder();
  useWakeLock(reminder.isRunning);

  const [behaviorMax, setBehaviorMax] = useState('10');
  const [count, setCount] = useState('5');
  const [autoMode, setAutoMode] = useState(false);
  const [intervalSec, setIntervalSec] = useState('10');

  const handleStart = useCallback(() => {
    const config: ReminderConfig = {
      mode: autoMode ? 'auto' : 'manual',
      behaviorMaxSec: Number(behaviorMax) || 0,
      count: Number(count) || 0,
      intervalSec: autoMode ? (Number(intervalSec) || 0) : undefined,
    };
    if (config.behaviorMaxSec > 0 && config.count > 0) {
      reminder.start(config);
    }
  }, [autoMode, behaviorMax, count, intervalSec, reminder]);

  const inlineNumberInput = (
    value: string,
    onChange: (v: string) => void,
    width = 56,
  ) => (
    <input
      className="input"
      type="number"
      inputMode="numeric"
      value={value}
      onChange={e => onChange(e.target.value)}
      style={{
        display: 'inline-block',
        width,
        minHeight: 40,
        padding: '4px 8px',
        fontSize: 18,
        fontWeight: 700,
        textAlign: 'center',
        margin: '0 4px',
        verticalAlign: 'middle',
      }}
    />
  );

  const isFinished = !reminder.isRunning;
  const lastBehavior = reminder.currentIndex >= reminder.totalCount;

  return (
    <div className="page" style={{ paddingBottom: 16 }}>
      <h1 className="page-title">タイマー</h1>

      {reminder.isRunning ? (
        /* === 実行中 === */
        <>
          <div className="card">
            <div style={{
              textAlign: 'center',
              padding: '20px 0',
              borderRadius: 10,
              background: reminder.phase === 'behavior' ? '#e8f5e9' : '#f5f5f5',
              transition: 'background 0.3s',
            }}>
              <div style={{
                fontSize: 22,
                fontWeight: 700,
                color: reminder.phase === 'behavior' ? 'var(--success)' : 'var(--text-secondary)',
              }}>
                {reminder.phase === 'behavior'
                  ? `行動 ${reminder.currentIndex}/${reminder.totalCount}`
                  : 'インターバル'}
              </div>
              <div style={{
                fontSize: 64,
                fontWeight: 700,
                fontVariantNumeric: 'tabular-nums',
                marginTop: 12,
                color: reminder.countdown <= 0
                  ? 'var(--danger)'
                  : reminder.phase === 'behavior' ? 'var(--success)' : 'var(--text-secondary)',
              }}>
                {reminder.countdown}
                <span style={{ fontSize: 20, fontWeight: 400 }}>秒</span>
              </div>
              <div style={{
                fontSize: 14,
                color: reminder.isPaused ? '#ff9800' : 'var(--text-secondary)',
                marginTop: 12,
                fontWeight: reminder.isPaused ? 600 : 400,
              }}>
                {reminder.isPaused
                  ? '⏸ 一時停止中'
                  : reminder.countdown <= 0 && reminder.mode === 'manual'
                    ? '⏰ 上限到達 — 「次へ」を押して進めてください'
                    : reminder.mode === 'manual' ? '自分のペースで「次へ」' : ''}
              </div>
            </div>
          </div>

          {/* 手動モード: 「次へ」ボタンが主役 */}
          {reminder.mode === 'manual' && (
            <button
              className="btn btn-success btn-full"
              style={{ marginTop: 16, minHeight: 72, fontSize: 22, borderRadius: 16 }}
              onClick={reminder.next}
            >
              {lastBehavior ? '完了' : `次へ（${reminder.currentIndex + 1}/${reminder.totalCount}）`}
            </button>
          )}

          {/* 自動モード: インターバルへ進めるボタン */}
          {reminder.mode === 'auto' && reminder.phase === 'behavior' && (
            <button
              className="btn btn-success btn-full"
              style={{ marginTop: 16, minHeight: 64, fontSize: 18, borderRadius: 16 }}
              onClick={reminder.next}
            >
              次へ進む
            </button>
          )}

          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button
              className="btn btn-full"
              style={{
                flex: 1,
                minHeight: 56,
                background: reminder.isPaused ? 'var(--success)' : '#fff3e0',
                border: reminder.isPaused ? 'none' : '2px solid #ff9800',
                color: reminder.isPaused ? 'white' : '#ff9800',
                fontSize: 18,
              }}
              onClick={reminder.isPaused ? reminder.resume : reminder.pause}
            >
              {reminder.isPaused ? '再開' : '一時停止'}
            </button>
            <button
              className="btn btn-full"
              style={{
                flex: 1,
                minHeight: 56,
                background: 'var(--bg)',
                border: '2px solid var(--danger)',
                color: 'var(--danger)',
                fontSize: 18,
              }}
              onClick={reminder.stop}
            >
              停止
            </button>
          </div>
        </>
      ) : (
        /* === 設定 === */
        <>
          <div className="card">
            <div style={{
              fontSize: 17,
              lineHeight: 2.2,
              color: 'var(--text)',
            }}>
              （ {inlineNumberInput(behaviorMax, setBehaviorMax)} ）秒間 行動を維持するのを上限として、
              <br />
              （ {inlineNumberInput(count, setCount)} ）回 行動を実践するタイマー
              {autoMode && (
                <>
                  <br />
                  ／インターバル （ {inlineNumberInput(intervalSec, setIntervalSec)} ）秒
                </>
              )}
            </div>

            <label style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              marginTop: 16,
              padding: '10px 12px',
              background: 'var(--bg)',
              borderRadius: 8,
              cursor: 'pointer',
              fontSize: 14,
            }}>
              <input
                type="checkbox"
                checked={autoMode}
                onChange={e => setAutoMode(e.target.checked)}
                style={{ width: 18, height: 18 }}
              />
              インターバルも自動で測る（上級者向け）
            </label>

            <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 8, marginBottom: 0 }}>
              {autoMode
                ? '行動→インターバル→次の行動 と自動進行します'
                : 'タイマーは行動の上限のみ。「次へ」ボタンで自分のペースで進められます'}
            </p>

            <button
              className="btn btn-success btn-full btn-lg"
              style={{ marginTop: 16 }}
              onClick={handleStart}
              disabled={!Number(behaviorMax) || !Number(count) || (autoMode && !Number(intervalSec))}
            >
              スタート
            </button>
          </div>

          <button
            className="btn btn-full"
            style={{
              marginTop: 16,
              background: 'var(--bg)',
              border: '2px solid var(--border)',
              color: 'var(--text-secondary)',
            }}
            onClick={() => navigate('/')}
          >
            戻る
          </button>
        </>
      )}

      {/* finishedはisRunning=falseで自然にフォームに戻るので追加分岐不要 */}
      {void isFinished}
    </div>
  );
}
