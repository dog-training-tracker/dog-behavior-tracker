import { useMemo, useCallback } from 'react';
import { getActiveDog, getEventsByDog, getSessionsByDog } from '../store/localStorage';
import { Navigate } from 'react-router-dom';
import * as XLSX from 'xlsx';
import SummaryCard from '../components/SummaryCard';
import { generateWeeklyComments } from '../utils/weeklyComments';
import {
  ComposedChart, Line, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';

function formatDateShort(ts: number): string {
  const d = new Date(ts);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function formatDateFull(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
}

interface DailyPoint {
  date: string;
  avgLatency: number | null;
  avgDistance: number | null;
  count: number;
}

export default function StatsPage() {
  const dog = getActiveDog();

  const stats = useMemo(() => {
    if (!dog) return null;
    const events = getEventsByDog(dog.id);
    const sessions = getSessionsByDog(dog.id);
    const count = events.length;
    const latencies = events.filter(e => e.latency !== null && e.latency >= 0).map(e => e.latency!);
    const avgLatency = latencies.length > 0 ? latencies.reduce((a, b) => a + b, 0) / latencies.length : null;
    const distances = events.filter(e => e.distance !== null).map(e => e.distance!);
    const avgDistance = distances.length > 0 ? distances.reduce((a, b) => a + b, 0) / distances.length : null;

    // SD別集計
    const byStimulus: Record<string, { total: number; success: number }> = {};
    for (const e of events) {
      if (!byStimulus[e.stimulus]) byStimulus[e.stimulus] = { total: 0, success: 0 };
      byStimulus[e.stimulus].total++;
      if (e.behavior === 'アイコンタクト') byStimulus[e.stimulus].success++;
    }

    // 行動別・日別推移データ
    const behaviorsSet = new Set(events.map(e => e.behavior).filter((b): b is string => b !== null));
    const byBehavior: Record<string, { daily: DailyPoint[]; total: number }> = {};

    for (const behavior of behaviorsSet) {
      const bEvents = events.filter(e => e.behavior === behavior);
      const dailyMap: Record<string, { latencies: number[]; distances: number[] }> = {};

      for (const ev of bEvents) {
        const dateKey = formatDateShort(ev.timestamp);
        if (!dailyMap[dateKey]) dailyMap[dateKey] = { latencies: [], distances: [] };
        if (ev.latency !== null && ev.latency >= 0) dailyMap[dateKey].latencies.push(ev.latency);
        if (ev.distance !== null) dailyMap[dateKey].distances.push(ev.distance);
      }

      // 日付順にソート
      const sortedDates = Object.keys(dailyMap).sort((a, b) => {
        const [am, ad] = a.split('/').map(Number);
        const [bm, bd] = b.split('/').map(Number);
        return am !== bm ? am - bm : ad - bd;
      });

      const daily: DailyPoint[] = sortedDates.map(date => {
        const d = dailyMap[date];
        return {
          date,
          avgLatency: d.latencies.length > 0 ? +(d.latencies.reduce((a, b) => a + b, 0) / d.latencies.length).toFixed(1) : null,
          avgDistance: d.distances.length > 0 ? +(d.distances.reduce((a, b) => a + b, 0) / d.distances.length).toFixed(0) : null,
          count: d.latencies.length + d.distances.length,
        };
      });

      byBehavior[behavior] = { daily, total: bEvents.length };
    }

    // 合計回数順にソート
    const sortedBehaviors = Object.entries(byBehavior).sort((a, b) => b[1].total - a[1].total);

    const comments = generateWeeklyComments(events, sessions);

    return { count, avgLatency, avgDistance, sessionCount: sessions.length, byStimulus, sortedBehaviors, comments };
  }, [dog?.id]);

  const handleDataDownload = useCallback(() => {
    if (!dog) return;
    const events = getEventsByDog(dog.id);
    const sessionsByDog = getSessionsByDog(dog.id);
    const sessionMap = new Map(sessionsByDog.map(s => [s.id, s]));

    const rows = events.map(e => {
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

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '行動記録');
    XLSX.writeFile(wb, `${dog.name}_行動記録.xlsx`);
  }, [dog]);

  if (!dog) {
    return <Navigate to="/login" replace />;
  }

  if (!stats || stats.count === 0) {
    return (
      <div className="page">
        <h1 className="page-title">統計</h1>
        <div className="card" style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>
          まだデータがありません。散歩を記録しましょう！
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <h1 className="page-title">統計</h1>

      <button
        className="btn btn-primary btn-full"
        style={{ marginBottom: 12 }}
        onClick={handleDataDownload}
      >
        データダウンロード
      </button>

      <div className="section-label">今週のコメント</div>
      <div className="card" style={{ fontSize: 14, lineHeight: 1.7, color: 'var(--text)' }}>
        {stats.comments.map((c, i) => (
          <p key={i} style={{ margin: i === 0 ? 0 : '4px 0 0' }}>{c}</p>
        ))}
      </div>

      <div className="section-label">全体サマリー（{stats.sessionCount}回の散歩）</div>
      <SummaryCard count={stats.count} avgLatency={stats.avgLatency} avgDistance={stats.avgDistance} />

      {stats.sortedBehaviors.map(([behavior, data]) => (
        <div key={behavior}>
          <div className="section-label">{behavior}（{data.total}回）</div>
          <div className="card" style={{ padding: '12px 8px' }}>
            {data.daily.length >= 2 ? (
              <ResponsiveContainer width="100%" height={260}>
                <ComposedChart data={data.daily} margin={{ top: 12, right: 4, left: -8, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e8e8e8" />
                  <XAxis dataKey="date" fontSize={12} tick={{ fill: '#555' }} tickMargin={6} />
                  <YAxis yAxisId="latency" fontSize={12} unit="s" tick={{ fill: '#ff9800' }} tickMargin={4} width={42} />
                  <YAxis yAxisId="distance" orientation="right" fontSize={12} unit="m" tick={{ fill: '#4a90d9' }} tickMargin={4} width={42} />
                  <Tooltip
                    contentStyle={{ borderRadius: 8, fontSize: 13, boxShadow: '0 2px 8px rgba(0,0,0,0.15)' }}
                    formatter={(value, name) => name === '潜時' ? [`${value}s`, name] : [`${value}m`, name]}
                  />
                  <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
                  <Bar yAxisId="distance" dataKey="avgDistance" name="距離" fill="#4a90d9" fillOpacity={0.5} radius={[4, 4, 0, 0]} />
                  <Line yAxisId="latency" type="monotone" dataKey="avgLatency" name="潜時" stroke="#ff9800" strokeWidth={2.5} dot={{ r: 4, fill: '#ff9800' }} connectNulls />
                </ComposedChart>
              </ResponsiveContainer>
            ) : (
              <div style={{ fontSize: 14, color: 'var(--text-secondary)', textAlign: 'center', padding: 12 }}>
                潜時: {data.daily[0]?.avgLatency ?? '-'}s / 距離: {data.daily[0]?.avgDistance ?? '-'}m
              </div>
            )}
          </div>
        </div>
      ))}

      <div className="section-label">行動の出現率</div>
      <div className="card">
        {Object.entries(stats.byStimulus).map(([sd, data]) => {
          const rate = data.total > 0 ? Math.round((data.success / data.total) * 100) : 0;
          return (
            <div key={sd} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
              <span style={{ fontWeight: 600 }}>{sd}</span>
              <div style={{ textAlign: 'right' }}>
                <span style={{ color: 'var(--success)', fontWeight: 600 }}>{rate}%</span>
                <span style={{ color: 'var(--text-secondary)', fontSize: 12, marginLeft: 8 }}>({data.success}/{data.total})</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
