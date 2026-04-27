import { useState, useEffect, useCallback } from 'react';
import type { InstructorStudent, AdminInstructor, BehaviorEvent, Session } from '../types';
import {
  fetchAdminInstructors,
  fetchInstructorStudents,
  fetchStudentData,
  saveInstructorComment,
  fetchInstructorComment,
} from '../store/syncService';
import { generateWeeklyComments } from '../utils/weeklyComments';
import SummaryCard from '../components/SummaryCard';
import * as XLSX from 'xlsx';

type View = 'login' | 'students' | 'detail';

const SESSION_KEY_PW = 'dbt_inst_pw';
const SESSION_KEY_ID = 'dbt_inst_id';
const SESSION_KEY_NAME = 'dbt_inst_name';
const ADMIN_PW_KEY = 'dbt_admin_password';
const SAVED_PW_KEY = 'dbt_saved_password';
const REMEMBER_KEY = 'dbt_remember_pw';

export default function InstructorPage() {
  const [view, setView] = useState<View>('login');
  const [password, setPassword] = useState('');
  const [rememberPw, setRememberPw] = useState(() => localStorage.getItem(REMEMBER_KEY) === 'true');
  const [instructors, setInstructors] = useState<AdminInstructor[]>([]);
  const [instructorId, setInstructorId] = useState('');
  const [instructorName, setInstructorName] = useState('');
  const [students, setStudents] = useState<InstructorStudent[]>([]);
  const [selectedStudent, setSelectedStudent] = useState<InstructorStudent | null>(null);
  const [studentEvents, setStudentEvents] = useState<BehaviorEvent[]>([]);
  const [studentSessions, setStudentSessions] = useState<Session[]>([]);
  const [comments, setComments] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [exporting, setExporting] = useState(false);
  const [exportingAll, setExportingAll] = useState(false);
  const [loginStep, setLoginStep] = useState<'password' | 'instructor'>('password');
  // 講師コメント
  const [instructorComment, setInstructorComment] = useState('');
  const [savingComment, setSavingComment] = useState(false);
  const [commentSaved, setCommentSaved] = useState(false);

  const loadStudents = useCallback(async (instId: string, pw: string) => {
    setLoading(true);
    setError('');
    try {
      const data = await fetchInstructorStudents(instId, pw);
      setStudents(data);
      setView('students');
    } catch (e) {
      setError(e instanceof Error ? e.message : '取得に失敗しました');
    } finally {
      setLoading(false);
    }
  }, []);

  // 自動ログイン（講師セッション → localStorage保存PW → 管理画面PW）
  useEffect(() => {
    // 1. 講師ダッシュボード自身のセッション
    const savedPw = sessionStorage.getItem(SESSION_KEY_PW);
    const savedId = sessionStorage.getItem(SESSION_KEY_ID);
    const savedName = sessionStorage.getItem(SESSION_KEY_NAME);
    if (savedPw && savedId && savedName) {
      setPassword(savedPw);
      setInstructorId(savedId);
      setInstructorName(savedName);
      loadStudents(savedId, savedPw);
      return;
    }

    // 2. localStorage保存済みPW or 管理画面からのPW引き継ぎ → 講師選択画面へ
    const rememberedPw = localStorage.getItem(SAVED_PW_KEY);
    const adminPw = sessionStorage.getItem(ADMIN_PW_KEY);
    const pw = rememberedPw || adminPw;
    if (pw) {
      setPassword(pw);
      (async () => {
        setLoading(true);
        try {
          const list = await fetchAdminInstructors(pw);
          setInstructors(list);
          setLoginStep('instructor');
        } catch {
          // PWが無効 → 通常ログイン
        } finally {
          setLoading(false);
        }
      })();
    }
  }, [loadStudents]);

  const handlePasswordSubmit = async () => {
    if (!password.trim()) return;
    setLoading(true);
    setError('');
    try {
      const list = await fetchAdminInstructors(password);
      setInstructors(list);
      setLoginStep('instructor');
      if (rememberPw) {
        localStorage.setItem(SAVED_PW_KEY, password);
        localStorage.setItem(REMEMBER_KEY, 'true');
      }
    } catch {
      setError('パスワードが正しくありません');
    } finally {
      setLoading(false);
    }
  };

  const handleInstructorSelect = async (inst: AdminInstructor) => {
    setInstructorId(inst.id);
    setInstructorName(inst.name);
    sessionStorage.setItem(SESSION_KEY_PW, password);
    sessionStorage.setItem(SESSION_KEY_ID, inst.id);
    sessionStorage.setItem(SESSION_KEY_NAME, inst.name);
    await loadStudents(inst.id, password);
  };

  const handleStudentSelect = async (student: InstructorStudent) => {
    setSelectedStudent(student);
    setLoading(true);
    setError('');
    setCommentSaved(false);
    try {
      const [data, comment] = await Promise.all([
        fetchStudentData(student.emailHash, password),
        fetchInstructorComment(instructorId, student.emailHash, password),
      ]);
      setStudentEvents(data.events);
      setStudentSessions(data.sessions);
      setComments(generateWeeklyComments(data.events, data.sessions));
      setInstructorComment(comment);
      setView('detail');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'データ取得に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  const formatDateFull = (ts: number) => {
    const d = new Date(ts);
    return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
  };

  const eventsToRows = (events: BehaviorEvent[], sessions: typeof studentSessions) => {
    const sessionMap = new Map(sessions.map(s => [s.id, s]));
    return events.map(e => {
      const s = sessionMap.get(e.sessionId);
      return {
        '日時': formatDateFull(e.timestamp),
        '刺激': e.stimulus,
        '行動': e.behavior ?? '',
        '潜時(秒)': e.latency !== null ? (e.latency === -1 ? 'なし' : e.latency) : '',
        '距離(m)': e.distance !== null ? e.distance : '',
        'コメント': e.comment ?? '',
        '環境': s?.environmentNote ?? '',
      };
    });
  };

  const handleExport = () => {
    if (!selectedStudent || studentEvents.length === 0) return;
    setExporting(true);
    try {
      const ws = XLSX.utils.json_to_sheet(eventsToRows(studentEvents, studentSessions));
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, '行動記録');
      XLSX.writeFile(wb, `${selectedStudent.dogName}_行動記録.xlsx`);
    } finally {
      setExporting(false);
    }
  };

  const handleExportAll = async () => {
    if (students.length === 0) return;
    setExportingAll(true);
    try {
      const wb = XLSX.utils.book_new();

      // サマリーシート
      const summaryRows: Record<string, string | number>[] = [];

      for (const s of students) {
        const data = await fetchStudentData(s.emailHash, password);
        const events = data.events;
        const sessions = data.sessions;

        // サマリー集計
        const latencies = events.filter(e => e.latency !== null && e.latency >= 0).map(e => e.latency!);
        const avgLat = latencies.length > 0 ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length * 10) / 10 : '';
        const distances = events.filter(e => e.distance !== null).map(e => e.distance!);
        const avgDist = distances.length > 0 ? Math.round(distances.reduce((a, b) => a + b, 0) / distances.length) : '';

        summaryRows.push({
          '犬名': s.dogName,
          '散歩回数': sessions.length,
          '記録数': events.length,
          '平均潜時(秒)': avgLat,
          '平均距離(m)': avgDist,
        });

        // 生徒別シート
        if (events.length > 0) {
          const ws = XLSX.utils.json_to_sheet(eventsToRows(events, sessions));
          XLSX.utils.book_append_sheet(wb, ws, s.dogName.slice(0, 31));
        }
      }

      // サマリーを先頭に挿入
      const summaryWs = XLSX.utils.json_to_sheet(summaryRows);
      XLSX.utils.book_append_sheet(wb, summaryWs, 'サマリー');
      // サマリーを先頭に移動
      const names = wb.SheetNames;
      names.unshift(names.pop()!);

      const today = new Date();
      const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
      XLSX.writeFile(wb, `全生徒_行動記録_${dateStr}.xlsx`);
    } catch (e) {
      alert('エクスポート失敗: ' + (e instanceof Error ? e.message : '不明なエラー'));
    } finally {
      setExportingAll(false);
    }
  };

  const handleSaveComment = async () => {
    if (!selectedStudent) return;
    setSavingComment(true);
    setCommentSaved(false);
    try {
      await saveInstructorComment(instructorId, selectedStudent.emailHash, instructorComment, password);
      setCommentSaved(true);
      setTimeout(() => setCommentSaved(false), 3000);
    } catch (e) {
      alert('保存失敗: ' + (e instanceof Error ? e.message : '不明なエラー'));
    } finally {
      setSavingComment(false);
    }
  };

  const handleLogout = () => {
    sessionStorage.removeItem(SESSION_KEY_PW);
    sessionStorage.removeItem(SESSION_KEY_ID);
    sessionStorage.removeItem(SESSION_KEY_NAME);
    localStorage.removeItem(SAVED_PW_KEY);
    localStorage.removeItem(REMEMBER_KEY);
    setRememberPw(false);
    setView('login');
    setLoginStep('password');
    setPassword('');
    setInstructorId('');
    setInstructorName('');
    setStudents([]);
  };

  // 統計計算
  const studentStats = (() => {
    if (studentEvents.length === 0) return null;
    const count = studentEvents.length;
    const latencies = studentEvents.filter(e => e.latency !== null && e.latency >= 0).map(e => e.latency!);
    const avgLatency = latencies.length > 0 ? latencies.reduce((a, b) => a + b, 0) / latencies.length : null;
    const distances = studentEvents.filter(e => e.distance !== null).map(e => e.distance!);
    const avgDistance = distances.length > 0 ? distances.reduce((a, b) => a + b, 0) / distances.length : null;
    return { count, avgLatency, avgDistance };
  })();

  // ログイン画面
  if (view === 'login') {
    return (
      <div className="page" style={{ maxWidth: 400, margin: '0 auto', paddingTop: 40 }}>
        <h1 className="page-title" style={{ textAlign: 'center', fontSize: 22 }}>講師ダッシュボード</h1>

        {loginStep === 'password' ? (
          <>
            <div className="card" style={{ padding: 20 }}>
              <label style={{ display: 'block', marginBottom: 8, fontWeight: 600 }}>パスワード</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handlePasswordSubmit()}
                placeholder="パスワードを入力"
                style={{
                  width: '100%', padding: 14, fontSize: 18, borderRadius: 8,
                  border: '2px solid var(--border)', boxSizing: 'border-box',
                }}
              />
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, fontSize: 14, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={rememberPw}
                  onChange={e => {
                    setRememberPw(e.target.checked);
                    if (!e.target.checked) {
                      localStorage.removeItem(SAVED_PW_KEY);
                      localStorage.removeItem(REMEMBER_KEY);
                    }
                  }}
                  style={{ width: 18, height: 18 }}
                />
                パスワードを保存
              </label>
            </div>
            <button
              className="btn btn-primary btn-full"
              style={{ marginTop: 12, padding: 16, fontSize: 18 }}
              onClick={handlePasswordSubmit}
              disabled={loading || !password.trim()}
            >
              {loading ? '確認中...' : '次へ'}
            </button>
          </>
        ) : (
          <>
            <div className="section-label" style={{ fontSize: 16 }}>あなたのお名前を選んでください</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {instructors.map(inst => (
                <button
                  key={inst.id}
                  className="btn btn-primary btn-full"
                  style={{ padding: 18, fontSize: 20 }}
                  onClick={() => handleInstructorSelect(inst)}
                  disabled={loading}
                >
                  {inst.name}
                </button>
              ))}
            </div>
            <button
              className="btn btn-full"
              style={{ marginTop: 16, padding: 14, fontSize: 16, background: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}
              onClick={() => setLoginStep('password')}
            >
              戻る
            </button>
          </>
        )}

        {error && (
          <div style={{ color: 'var(--error)', textAlign: 'center', marginTop: 12, fontSize: 14 }}>{error}</div>
        )}
      </div>
    );
  }

  // 生徒一覧画面
  if (view === 'students') {
    return (
      <div className="page">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h1 className="page-title" style={{ margin: 0 }}>{instructorName}先生の生徒</h1>
          <button
            onClick={handleLogout}
            style={{ padding: '6px 12px', fontSize: 13, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text-secondary)', cursor: 'pointer' }}
          >
            ログアウト
          </button>
        </div>

        {loading && <div style={{ textAlign: 'center', padding: 20, color: 'var(--text-secondary)' }}>読み込み中...</div>}
        {error && <div style={{ color: 'var(--error)', textAlign: 'center', marginBottom: 12 }}>{error}</div>}

        {!loading && students.length === 0 && (
          <div className="card" style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: 20 }}>
            まだ生徒がいません
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {students.map(s => (
            <button
              key={s.emailHash}
              className="card"
              onClick={() => handleStudentSelect(s)}
              style={{
                display: 'block', width: '100%', textAlign: 'left', cursor: 'pointer',
                border: '2px solid var(--border)', padding: 16, background: 'var(--bg)',
              }}
            >
              <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 4 }}>{s.dogName}</div>
              <div style={{ display: 'flex', gap: 16, fontSize: 13, color: 'var(--text-secondary)' }}>
                <span>散歩 {s.sessionCount}回</span>
                <span>記録 {s.eventCount}件</span>
                {s.lastSync && (
                  <span>最終同期: {new Date(s.lastSync).toLocaleDateString('ja-JP')}</span>
                )}
              </div>
            </button>
          ))}
        </div>

        {students.length > 0 && (
          <>
            <button
              className="btn btn-primary btn-full"
              style={{ marginTop: 16, padding: 14, fontSize: 16 }}
              onClick={handleExportAll}
              disabled={exportingAll}
            >
              {exportingAll ? 'エクスポート中...' : '全生徒データをExcel出力'}
            </button>
          </>
        )}

        <button
          className="btn btn-full"
          style={{ marginTop: 8, padding: 14, fontSize: 16, background: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}
          onClick={() => loadStudents(instructorId, password)}
          disabled={loading}
        >
          {loading ? '更新中...' : '一覧を更新'}
        </button>
      </div>
    );
  }

  // 生徒詳細画面
  return (
    <div className="page">
      <button
        onClick={() => setView('students')}
        style={{
          display: 'flex', alignItems: 'center', gap: 4, padding: '8px 0',
          background: 'none', border: 'none', color: 'var(--primary)', fontSize: 15, cursor: 'pointer', marginBottom: 8,
        }}
      >
        ← 生徒一覧に戻る
      </button>

      <h1 className="page-title">{selectedStudent?.dogName}</h1>

      {loading && <div style={{ textAlign: 'center', padding: 20, color: 'var(--text-secondary)' }}>読み込み中...</div>}
      {error && <div style={{ color: 'var(--error)', textAlign: 'center', marginBottom: 12 }}>{error}</div>}

      {!loading && (
        <>
          <div className="section-label">今週のコメント</div>
          <div className="card" style={{ fontSize: 14, lineHeight: 1.7, color: 'var(--text)' }}>
            {comments.length > 0 ? (
              comments.map((c, i) => (
                <p key={i} style={{ margin: i === 0 ? 0 : '4px 0 0' }}>{c}</p>
              ))
            ) : (
              <p style={{ margin: 0, color: 'var(--text-secondary)' }}>データがありません</p>
            )}
          </div>

          {studentStats && (
            <>
              <div className="section-label">全体サマリー（{studentSessions.length}回の散歩）</div>
              <SummaryCard
                count={studentStats.count}
                avgLatency={studentStats.avgLatency}
                avgDistance={studentStats.avgDistance}
              />
            </>
          )}

          {/* 講師コメント欄 */}
          <div className="section-label">講師コメント</div>
          <div className="card" style={{ padding: 12 }}>
            <textarea
              value={instructorComment}
              onChange={e => { setInstructorComment(e.target.value); setCommentSaved(false); }}
              placeholder="この生徒へのコメントを入力..."
              rows={4}
              style={{
                width: '100%', padding: 10, fontSize: 14, borderRadius: 8,
                border: '1px solid var(--border)', boxSizing: 'border-box',
                resize: 'vertical', fontFamily: 'inherit',
              }}
            />
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
              <button
                className="btn btn-primary"
                style={{ padding: '8px 20px', fontSize: 14 }}
                onClick={handleSaveComment}
                disabled={savingComment}
              >
                {savingComment ? '保存中...' : '保存'}
              </button>
              {commentSaved && (
                <span style={{ fontSize: 13, color: 'var(--success)' }}>保存しました</span>
              )}
            </div>
          </div>

          {/* スプレッドシート出力（最下部） */}
          <button
            className="btn btn-primary btn-full"
            style={{ marginTop: 16, padding: 16, fontSize: 18 }}
            onClick={handleExport}
            disabled={exporting}
          >
            {exporting ? 'エクスポート中...' : 'Excelに出力'}
          </button>
        </>
      )}
    </div>
  );
}
