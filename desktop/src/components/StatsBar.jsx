export function StatsBar({ leadCount, stats, limit }) {
  const overLimit = stats.contactedCount >= limit;
  return (
    <div className="statsbar">
      <div className="stat">
        <div className="stat-label">Leads totales</div>
        <div className="stat-value">{leadCount}</div>
      </div>
      <div className="stat">
        <div className="stat-label">Contactados hoy</div>
        <div className={`stat-value ${overLimit ? 'warn' : ''}`}>
          {stats.contactedCount}
          <span style={{ fontSize: 13, opacity: 0.5 }}> / {limit}</span>
        </div>
      </div>
    </div>
  );
}
