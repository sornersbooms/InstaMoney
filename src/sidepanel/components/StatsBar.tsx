import type { DailyStats, Settings } from '@/lib/types';

interface Props {
  stats: DailyStats;
  settings: Settings;
  leadCount: number;
}

export function StatsBar({ stats, settings, leadCount }: Props) {
  const overLimit = stats.contactedCount >= settings.dailyContactSoftLimit;
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 16px', background: '#fff', borderBottom: '1px solid #eee' }}>
      <div style={{ fontSize: 13 }}>
        <strong>{leadCount}</strong> leads totales
      </div>
      <div style={{ fontSize: 13, color: overLimit ? '#ed4956' : '#00a400', fontWeight: 600 }}>
        {overLimit ? '⚠️ ' : ''}
        Contactados hoy: {stats.contactedCount} / {settings.dailyContactSoftLimit}
      </div>
    </div>
  );
}
