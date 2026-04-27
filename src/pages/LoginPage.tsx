import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Dog, Instructor } from '../types';
import { DEFAULT_STIMULI, DEFAULT_BEHAVIORS, DEFAULT_LATENCIES, DEFAULT_DURATIONS, DEFAULT_DISTANCES } from '../types';
import { getDogs, saveDog, setActiveDogId } from '../store/localStorage';
import {
  getGasUrl, setGasUrl, getSyncConfig, setSyncConfig,
  fetchInstructors, hashEmailOnServer, checkUserExists, registerUser,
} from '../store/syncService';

type Step = 'selectDog' | 'setupSync' | 'newDog';

export default function LoginPage() {
  const navigate = useNavigate();
  const dogs = getDogs();
  const hasSyncConfig = !!getSyncConfig();

  // 初期ステップ: 犬がいなければ新規犬作成、いれば選択
  const [step, setStep] = useState<Step>(dogs.length === 0 ? 'newDog' : 'selectDog');

  // 犬の名前・目標
  const [name, setName] = useState('');
  const [goal, setGoal] = useState('');

  // 同期設定
  const [gasUrlInput, setGasUrlInput] = useState(getGasUrl());
  const [email, setEmail] = useState('');
  const [instructors, setInstructors] = useState<Instructor[]>([]);
  const [selectedInstructorId, setSelectedInstructorId] = useState('');
  const [syncLoading, setSyncLoading] = useState(false);
  const [syncError, setSyncError] = useState('');
  const [syncStep, setSyncStep] = useState<'email' | 'register' | 'done'>('email');
  const [urlLoading, setUrlLoading] = useState(false);

  // 起動時にGAS URL設定済みなら指導者リスト取得
  useEffect(() => {
    if (getGasUrl()) loadInstructors();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadInstructors() {
    try {
      setUrlLoading(true);
      const list = await fetchInstructors();
      setInstructors(list);
      if (list.length > 0) setSelectedInstructorId(list[0].id);
    } catch {
      // 取得失敗時はスキップ
    } finally {
      setUrlLoading(false);
    }
  }

  async function handleSaveGasUrl() {
    const trimmed = gasUrlInput.trim();
    if (!trimmed) return;
    setGasUrl(trimmed);
    await loadInstructors();
  }

  const handleSelectDog = (dog: Dog) => {
    setActiveDogId(dog.id);
    navigate('/');
  };

  const handleStart = async () => {
    if (!name.trim()) return;
    const dog: Dog = {
      id: crypto.randomUUID(),
      name: name.trim(),
      targetBehaviors: [...DEFAULT_BEHAVIORS],
      stimulusOptions: [...DEFAULT_STIMULI],
      latencyOptions: [...DEFAULT_LATENCIES],
      durationOptions: [...DEFAULT_DURATIONS],
      distanceOptions: [...DEFAULT_DISTANCES],
      goal: goal.trim() || '反応を減らす',
      environmentNote: '',
      recordMode: 'press',
    };
    saveDog(dog);
    setActiveDogId(dog.id);

    // GAS URL設定済み & 同期未設定 → 指導者連携へ
    if (getGasUrl() && !hasSyncConfig) {
      setStep('setupSync');
      return;
    }

    navigate('/');
  };

  const handleSyncSetup = async () => {
    if (!email.trim() || !selectedInstructorId) return;

    setSyncLoading(true);
    setSyncError('');

    try {
      // サーバーサイドでメールをハッシュ化（ソルトはサーバー内で管理）
      const emailH = await hashEmailOnServer(email.trim());

      // ユーザー存在確認
      const userCheck = await checkUserExists(emailH);

      if (userCheck.exists) {
        // 既存ユーザー: 設定を復元
        setSyncConfig({
          emailHash: emailH,
          instructorId: userCheck.instructorId!,
        });
        setSyncStep('done');
      } else {
        // 新規登録
        const allDogs = getDogs();
        const activeDog = allDogs[allDogs.length - 1];
        const dogName = activeDog?.name || name.trim();
        await registerUser(emailH, selectedInstructorId, dogName);
        setSyncConfig({
          emailHash: emailH,
          instructorId: selectedInstructorId,
        });
        setSyncStep('done');
      }
    } catch (e) {
      setSyncError(e instanceof Error ? e.message : '接続エラー');
    } finally {
      setSyncLoading(false);
    }
  };

  const handleSkipSync = () => {
    navigate('/');
  };

  // 同期設定完了
  if (syncStep === 'done') {
    return (
      <div className="page" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', minHeight: '100dvh', paddingBottom: 16 }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ fontSize: 48, marginBottom: 8 }}>✅</div>
          <h2 style={{ fontSize: 20, fontWeight: 700 }}>登録完了</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginTop: 8 }}>
            データは指導者に自動同期されます
          </p>
        </div>
        <button
          className="btn btn-primary btn-full btn-lg"
          onClick={() => navigate('/')}
        >
          はじめる
        </button>
      </div>
    );
  }

  // 同期セットアップ画面
  if (step === 'setupSync') {
    return (
      <div className="page" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', minHeight: '100dvh', paddingBottom: 16 }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{ fontSize: 48, marginBottom: 8 }}>📡</div>
          <h2 style={{ fontSize: 20, fontWeight: 700 }}>指導者との連携</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginTop: 4 }}>
            散歩データを指導者に共有できます
          </p>
        </div>

        <div className="card">
          {/* GAS URL未設定の場合は入力欄を表示 */}
          {!getGasUrl() && (
            <>
              <label className="label" style={{ marginTop: 0 }}>接続URL</label>
              <div className="add-row">
                <input
                  className="input"
                  placeholder="指導者から共有されたURL"
                  value={gasUrlInput}
                  onChange={e => setGasUrlInput(e.target.value)}
                  style={{ fontSize: 12 }}
                />
                <button
                  className="btn btn-primary"
                  onClick={handleSaveGasUrl}
                  disabled={urlLoading || !gasUrlInput.trim()}
                >
                  {urlLoading ? '...' : '接続'}
                </button>
              </div>
            </>
          )}

          {/* GAS URL設定済み → メール + 指導者選択 */}
          {getGasUrl() && (
            <>
              <label className="label" style={{ marginTop: getGasUrl() ? 0 : undefined }}>メールアドレス</label>
              <input
                className="input"
                type="email"
                placeholder="example@email.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                autoFocus
              />
              <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>
                ※ メールアドレスは暗号化されて送信されます
              </p>

              {instructors.length > 0 && (
                <>
                  <label className="label">指導者を選択</label>
                  <select
                    className="input"
                    value={selectedInstructorId}
                    onChange={e => setSelectedInstructorId(e.target.value)}
                  >
                    {instructors.map(inst => (
                      <option key={inst.id} value={inst.id}>{inst.name}</option>
                    ))}
                  </select>
                </>
              )}

              {syncError && (
                <div style={{ color: 'var(--danger)', fontSize: 13, marginTop: 8, padding: '8px', background: '#fff5f5', borderRadius: 6 }}>
                  {syncError}
                </div>
              )}

              <button
                className="btn btn-primary btn-full btn-lg"
                style={{ marginTop: 16 }}
                onClick={handleSyncSetup}
                disabled={syncLoading || !email.trim() || !selectedInstructorId}
              >
                {syncLoading ? '接続中...' : '登録する'}
              </button>
            </>
          )}

          <button
            className="btn btn-full"
            style={{ marginTop: 8, color: 'var(--text-secondary)' }}
            onClick={handleSkipSync}
          >
            スキップ（あとで設定できます）
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="page" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', minHeight: '100dvh', paddingBottom: 16 }}>
      <div style={{ textAlign: 'center', marginBottom: 32 }}>
        <div style={{ fontSize: 48, marginBottom: 8 }}>🐕</div>
        <h1 style={{ fontSize: 22, fontWeight: 700 }}>犬の行動記録</h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginTop: 4 }}>散歩中の行動を記録・分析</p>
      </div>

      {step === 'selectDog' && dogs.length > 0 ? (
        <div>
          <div className="section-label">犬を選択</div>
          <div className="card">
            {dogs.map(dog => (
              <div
                key={dog.id}
                className="session-item"
                onClick={() => handleSelectDog(dog)}
              >
                <div>
                  <div className="session-date">{dog.name}</div>
                  <div className="session-meta">{dog.goal}</div>
                </div>
                <span style={{ fontSize: 20 }}>→</span>
              </div>
            ))}
          </div>
          <button
            className="btn btn-primary btn-full"
            style={{ marginTop: 8 }}
            onClick={() => setStep('newDog')}
          >
            新しい犬を追加
          </button>
        </div>
      ) : (
        <div className="card">
          {dogs.length > 0 && (
            <button
              className="btn"
              style={{ marginBottom: 12, fontSize: 14, color: 'var(--primary)', padding: '4px 0' }}
              onClick={() => setStep('selectDog')}
            >
              ← 犬一覧に戻る
            </button>
          )}
          <label className="label" style={{ marginTop: 0 }}>犬の名前</label>
          <input
            className="input"
            placeholder="例: ポチ"
            value={name}
            onChange={e => setName(e.target.value)}
            autoFocus
          />

          <label className="label">目標</label>
          <input
            className="input"
            placeholder="例: 犬への反応を減らす"
            value={goal}
            onChange={e => setGoal(e.target.value)}
          />

          <button
            className="btn btn-primary btn-full btn-lg"
            style={{ marginTop: 20 }}
            onClick={handleStart}
            disabled={!name.trim()}
          >
            はじめる
          </button>
        </div>
      )}
    </div>
  );
}
