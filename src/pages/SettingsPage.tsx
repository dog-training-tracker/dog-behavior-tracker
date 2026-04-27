import { useState, useCallback } from 'react';
import { getActiveDog, getDogs, saveDog, removeDog, setActiveDogId, clearSessionData } from '../store/localStorage';
import { Navigate, useNavigate } from 'react-router-dom';
import type { Dog } from '../types';
import { DEFAULT_STIMULI, DEFAULT_BEHAVIORS, DEFAULT_LATENCIES, DEFAULT_DURATIONS, DEFAULT_DISTANCES } from '../types';
import { generateTestData } from '../store/testData';
import {
  getSyncConfig, clearSyncConfig, getLastSync, getSyncQueueCount,
  syncAll, getGasUrl,
} from '../store/syncService';

function CheckboxStringList({
  title, active, defaults, onToggle, onAdd,
}: {
  title: string;
  active: string[];
  defaults: string[];
  onToggle: (item: string, checked: boolean) => void;
  onAdd: (item: string) => void;
}) {
  const [value, setValue] = useState('');
  // デフォルト + カスタム（activeに含まれるがdefaultsにない）
  const allItems = [...defaults, ...active.filter(i => !defaults.includes(i))];

  const handleAdd = () => {
    const trimmed = value.trim();
    if (!trimmed || allItems.includes(trimmed)) return;
    onAdd(trimmed);
    setValue('');
  };

  return (
    <div className="setting-group">
      <div className="setting-title">{title}</div>
      <div className="card">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
          {allItems.map(item => (
            <label key={item} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 14, minWidth: '45%' }}>
              <input
                type="checkbox"
                checked={active.includes(item)}
                onChange={e => onToggle(item, e.target.checked)}
              />
              {item}
            </label>
          ))}
        </div>
        <div className="add-row" style={{ marginTop: 10 }}>
          <input
            className="input"
            placeholder="追加..."
            value={value}
            onChange={e => setValue(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleAdd()}
          />
          <button className="btn btn-primary" onClick={handleAdd}>追加</button>
        </div>
      </div>
    </div>
  );
}

function CheckboxNumberList({
  title, active, defaults, unit, onToggle, onAdd,
}: {
  title: string;
  active: number[];
  defaults: number[];
  unit: string;
  onToggle: (item: number, checked: boolean) => void;
  onAdd: (item: number) => void;
}) {
  const [value, setValue] = useState('');
  const allItems = [...new Set([...defaults, ...active])].sort((a, b) => a - b);

  const formatLabel = (n: number) => n === -1 ? 'なし' : `${n}${unit}`;

  const handleAdd = () => {
    const num = Number(value);
    if (isNaN(num) || allItems.includes(num)) return;
    onAdd(num);
    setValue('');
  };

  return (
    <div className="setting-group">
      <div className="setting-title">{title}</div>
      <div className="card">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
          {allItems.map(item => (
            <label key={item} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 14, minWidth: '30%' }}>
              <input
                type="checkbox"
                checked={active.includes(item)}
                onChange={e => onToggle(item, e.target.checked)}
              />
              {formatLabel(item)}
            </label>
          ))}
        </div>
        <div className="add-row" style={{ marginTop: 10 }}>
          <input
            className="input"
            type="number"
            placeholder="追加..."
            value={value}
            onChange={e => setValue(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleAdd()}
          />
          <button className="btn btn-primary" onClick={handleAdd}>追加</button>
        </div>
      </div>
    </div>
  );
}

export default function SettingsPage() {
  const navigate = useNavigate();
  const [dog, setDog] = useState<Dog | null>(getActiveDog);
  const [allDogs, setAllDogs] = useState<Dog[]>(getDogs);
  const [name, setName] = useState(dog?.name ?? '');
  const [goal, setGoal] = useState(dog?.goal ?? '');
  const [newDogName, setNewDogName] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState('');
  const [syncConnected, setSyncConnected] = useState(!!getSyncConfig());

  const updateDog = useCallback((updater: (d: Dog) => Dog) => {
    setDog(prev => {
      if (!prev) return prev;
      const updated = updater(prev);
      saveDog(updated);
      return updated;
    });
  }, []);

  if (!dog) {
    return <Navigate to="/login" replace />;
  }

  const handleSaveProfile = () => {
    updateDog(d => ({ ...d, name: name.trim() || d.name, goal: goal.trim() || d.goal }));
  };

  const handleAddDog = () => {
    const trimmed = newDogName.trim();
    if (!trimmed) return;
    const newDog: Dog = {
      id: crypto.randomUUID(),
      name: trimmed,
      targetBehaviors: [...DEFAULT_BEHAVIORS],
      stimulusOptions: [...DEFAULT_STIMULI],
      latencyOptions: [...DEFAULT_LATENCIES],
      durationOptions: [...DEFAULT_DURATIONS],
      distanceOptions: [...DEFAULT_DISTANCES],
      goal: '反応を減らす',
      environmentNote: '',
      recordMode: 'press',
    };
    saveDog(newDog);
    setAllDogs(getDogs());
    setNewDogName('');
  };

  const handleSwitchDog = (id: string) => {
    setActiveDogId(id);
    const switched = getDogs().find(d => d.id === id) ?? null;
    setDog(switched);
    setAllDogs(getDogs());
    if (switched) {
      setName(switched.name);
      setGoal(switched.goal);
    }
  };

  const toggleString = (field: 'stimulusOptions' | 'targetBehaviors') =>
    (item: string, checked: boolean) => {
      updateDog(d => ({
        ...d,
        [field]: checked ? [...d[field], item] : d[field].filter(i => i !== item),
      }));
    };

  const toggleNumber = (field: 'latencyOptions' | 'durationOptions' | 'distanceOptions') =>
    (item: number, checked: boolean) => {
      updateDog(d => ({
        ...d,
        [field]: checked
          ? [...d[field], item].sort((a, b) => a - b)
          : d[field].filter(i => i !== item),
      }));
    };

  return (
    <div className="page">
      <h1 className="page-title">設定</h1>

      <div className="setting-group">
        <div className="setting-title">犬の管理</div>
        <div className="card">
          {allDogs.map(d => (
            <div
              key={d.id}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '8px 0',
                borderBottom: '1px solid var(--border)',
              }}
            >
              <span style={{ fontWeight: d.id === dog?.id ? 700 : 400 }}>
                {d.id === dog?.id ? '✓ ' : ''}{d.name}
              </span>
              <div style={{ display: 'flex', gap: 6 }}>
                {d.id !== dog?.id && (
                  <button
                    className="btn btn-primary"
                    style={{ minHeight: 36, padding: '6px 14px', fontSize: 13 }}
                    onClick={() => handleSwitchDog(d.id)}
                  >
                    切替
                  </button>
                )}
                {allDogs.length > 1 && (
                  <button
                    className="btn btn-danger"
                    style={{ minHeight: 36, padding: '6px 10px', fontSize: 13 }}
                    onClick={() => {
                      if (!confirm(`「${d.name}」を削除しますか？`)) return;
                      removeDog(d.id);
                      const updated = getDogs();
                      setAllDogs(updated);
                      if (d.id === dog?.id && updated.length > 0) {
                        const next = updated[0];
                        setDog(next);
                        setName(next.name);
                        setGoal(next.goal);
                      }
                    }}
                  >
                    削除
                  </button>
                )}
              </div>
            </div>
          ))}
          <div className="add-row" style={{ marginTop: 10 }}>
            <input
              className="input"
              placeholder="新しい犬の名前"
              value={newDogName}
              onChange={e => setNewDogName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAddDog()}
            />
            <button className="btn btn-primary" onClick={handleAddDog}>追加</button>
          </div>
        </div>
      </div>

      <div className="setting-group">
        <div className="setting-title">プロフィール</div>
        <div className="card">
          <label className="label" style={{ marginTop: 0 }}>犬の名前</label>
          <input className="input" value={name} onChange={e => setName(e.target.value)} onBlur={handleSaveProfile} />
          <label className="label">目標</label>
          <input className="input" value={goal} onChange={e => setGoal(e.target.value)} onBlur={handleSaveProfile} />
        </div>
      </div>

      <div className="setting-group">
        <div className="setting-title">環境（確立操作・環境事象）</div>
        <div className="card">
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 0, marginBottom: 8 }}>
            散歩前の状態・環境を自由に記録（散歩開始時にプリフィルされます）
          </p>
          <textarea
            className="input"
            placeholder="例) 朝食前 / 雨上がり / 来客あり / 通院後 など"
            value={dog.environmentNote ?? ''}
            onChange={e => updateDog(d => ({ ...d, environmentNote: e.target.value }))}
            rows={3}
            style={{ minHeight: 72 }}
          />
        </div>
      </div>

      <div className="setting-group">
        <div className="setting-title">行動の記録方式</div>
        <div className="card">
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 0, marginBottom: 8 }}>
            散歩中、行動が起きた時のボタンの押し方
          </p>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              className={`btn btn-full ${dog.recordMode === 'press' ? 'btn-primary' : ''}`}
              style={{
                flex: 1,
                background: dog.recordMode === 'press' ? undefined : 'var(--bg)',
                border: dog.recordMode === 'press' ? undefined : '2px solid var(--border)',
                color: dog.recordMode === 'press' ? undefined : 'var(--text-secondary)',
              }}
              onClick={() => updateDog(d => ({ ...d, recordMode: 'press' }))}
            >
              長押し式
            </button>
            <button
              className={`btn btn-full ${dog.recordMode === 'tap' ? 'btn-primary' : ''}`}
              style={{
                flex: 1,
                background: dog.recordMode === 'tap' ? undefined : 'var(--bg)',
                border: dog.recordMode === 'tap' ? undefined : '2px solid var(--border)',
                color: dog.recordMode === 'tap' ? undefined : 'var(--text-secondary)',
              }}
              onClick={() => updateDog(d => ({ ...d, recordMode: 'tap' }))}
            >
              タップ式
            </button>
          </div>
          <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 8, marginBottom: 0 }}>
            {dog.recordMode === 'press'
              ? '指で押した瞬間に開始、離した瞬間に終了'
              : 'タップで開始、もう一度タップで終了'}
          </p>
        </div>
      </div>

      <CheckboxStringList
        title="SD（刺激）候補（必要なものにチェックをいれる）"
        active={dog.stimulusOptions}
        defaults={DEFAULT_STIMULI}
        onToggle={toggleString('stimulusOptions')}
        onAdd={item => updateDog(d => ({ ...d, stimulusOptions: [...d.stimulusOptions, item] }))}
      />

      <CheckboxStringList
        title="行動候補（必要なものにチェックをいれる）"
        active={dog.targetBehaviors}
        defaults={DEFAULT_BEHAVIORS}
        onToggle={toggleString('targetBehaviors')}
        onAdd={item => updateDog(d => ({ ...d, targetBehaviors: [...d.targetBehaviors, item] }))}
      />

      <CheckboxNumberList
        title="行動が出るまでの時間（必要なものにチェックをいれる）"
        active={dog.latencyOptions}
        defaults={DEFAULT_LATENCIES}
        unit="秒"
        onToggle={toggleNumber('latencyOptions')}
        onAdd={item => updateDog(d => ({ ...d, latencyOptions: [...d.latencyOptions, item].sort((a, b) => a - b) }))}
      />

      <CheckboxNumberList
        title="行動の持続時間（必要なものにチェックをいれる）"
        active={dog.durationOptions}
        defaults={DEFAULT_DURATIONS}
        unit="秒"
        onToggle={toggleNumber('durationOptions')}
        onAdd={item => updateDog(d => ({ ...d, durationOptions: [...d.durationOptions, item].sort((a, b) => a - b) }))}
      />

      <CheckboxNumberList
        title="距離候補（必要なものにチェックをいれる）"
        active={dog.distanceOptions}
        defaults={DEFAULT_DISTANCES}
        unit="m"
        onToggle={toggleNumber('distanceOptions')}
        onAdd={item => updateDog(d => ({ ...d, distanceOptions: [...d.distanceOptions, item].sort((a, b) => a - b) }))}
      />

      <div className="setting-group" style={{ marginTop: 24, borderTop: '1px solid var(--border)', paddingTop: 16 }}>
        <div className="setting-title">データ同期</div>
        <div className="card">
          {syncConnected ? (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <span style={{ fontSize: 14 }}>ステータス</span>
                <span style={{ fontSize: 14, color: 'var(--success)', fontWeight: 600 }}>接続済み</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <span style={{ fontSize: 14 }}>最終同期</span>
                <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                  {getLastSync() ? new Date(getLastSync()!).toLocaleString('ja-JP') : '未同期'}
                </span>
              </div>
              {getSyncQueueCount() > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <span style={{ fontSize: 14 }}>未送信キュー</span>
                  <span style={{ fontSize: 14, color: 'var(--warning)', fontWeight: 600 }}>{getSyncQueueCount()}件</span>
                </div>
              )}
              {syncMessage && (
                <div style={{ fontSize: 13, color: syncMessage.includes('成功') ? 'var(--success)' : 'var(--danger)', marginBottom: 8 }}>
                  {syncMessage}
                </div>
              )}
              <button
                className="btn btn-primary btn-full"
                style={{ marginTop: 4 }}
                onClick={async () => {
                  setSyncing(true);
                  setSyncMessage('');
                  try {
                    const ok = await syncAll();
                    setSyncMessage(ok ? '同期成功' : '同期失敗（キューに保存済み）');
                  } catch {
                    setSyncMessage('同期エラー');
                  } finally {
                    setSyncing(false);
                  }
                }}
                disabled={syncing}
              >
                {syncing ? '同期中...' : '手動同期'}
              </button>
              <button
                className="btn btn-full"
                style={{ marginTop: 8, fontSize: 13, color: 'var(--text-secondary)' }}
                onClick={() => {
                  if (confirm('同期設定を解除しますか？')) {
                    clearSyncConfig();
                    setSyncMessage('');
                    setSyncConnected(false);
                  }
                }}
              >
                連携を解除
              </button>
            </>
          ) : (
            <>
              <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 12 }}>
                指導者との連携が未設定です
              </p>
              {getGasUrl() ? (
                <button
                  className="btn btn-primary btn-full"
                  onClick={() => navigate('/login')}
                >
                  指導者と連携する
                </button>
              ) : (
                <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                  サーバーURLを下の「接続設定」で設定してください
                </p>
              )}
            </>
          )}
        </div>
      </div>

      <div className="setting-group" style={{ marginTop: 32, borderTop: '1px solid var(--border)', paddingTop: 16 }}>
        <div className="setting-title" style={{ color: 'var(--danger)' }}>開発用</div>
        <button
          className="btn btn-danger btn-full"
          onClick={() => { clearSessionData(); generateTestData(14); alert('古いデータをクリアし、GPS付き14散歩を生成しました。'); }}
        >
          データリセット＋テスト生成
        </button>
      </div>
    </div>
  );
}
