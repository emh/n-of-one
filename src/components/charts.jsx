import { Empty } from './ui.jsx';
export function LineChart({
  points,
  metric = 'weight',
  secondary,
  unit = 'lb',
  label = 'Weight trend',
  color = 'mint',
}) {
  const known = points.filter((p) => p[metric] != null);
  if (!known.length) return <Empty compact icon="week" title="No measurements" />;
  const W = 320,
    H = 200,
    L = 40,
    R = 24,
    T = 18,
    B = 32;
  const values = known.map((p) => p[metric]);
  if (secondary)
    points.forEach((p) => {
      if (p[secondary] != null) values.push(p[secondary]);
    });
  const min = Math.min(...values),
    max = Math.max(...values),
    pad = Math.max((max - min) * 0.2, metric === 'bodyFat' ? 0.5 : 1);
  const low = min - pad,
    high = max + pad;
  const dates = points.map((p) => Date.parse(`${p.date}T12:00:00`));
  const start = Math.min(...dates),
    end = Math.max(...dates);
  const x = (date) =>
    L +
    (end === start ? 0.5 : (Date.parse(`${date}T12:00:00`) - start) / (end - start)) * (W - L - R);
  const y = (n) => T + ((high - n) / (high - low)) * (H - T - B);
  const path = (key) =>
    points
      .filter((p) => p[key] != null)
      .map((p, i) => `${i ? 'L' : 'M'} ${x(p.date)} ${y(p[key])}`)
      .join(' ');
  const ticks = [0, 1, 2, 3].map((i) => high - ((high - low) * i) / 3);
  const labelIndices = [...new Set([0, Math.floor((points.length - 1) / 2), points.length - 1])];
  return (
    <div class={`line-chart ${color}`}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`${label}: ${known.map((p) => `${p.date}: ${p[metric].toFixed(1)} ${unit}`).join('; ')}`}
      >
        {ticks.map((n) => (
          <g key={n}>
            <line x1={L} x2={W - R} y1={y(n)} y2={y(n)} class="grid-line" />
            <text x={L - 10} y={y(n) + 4} text-anchor="end">
              {n.toFixed(1)}
            </text>
          </g>
        ))}
        {labelIndices.map((i) => (
          <text key={i} x={x(points[i].date)} y={H - 4} text-anchor="middle">
            {new Date(`${points[i].date}T12:00:00`).toLocaleDateString(undefined, {
              month: 'short',
              day: 'numeric',
            })}
          </text>
        ))}
        {secondary && <path d={path(secondary)} class="trend-average" />}
        <path d={path(metric)} class={secondary ? 'trend-measurement' : 'trend-line'} />
        {known.map((p) => (
          <circle key={p.date} cx={x(p.date)} cy={y(p[metric])} r="3" class="trend-dot">
            <title>
              {p.date}: {p[metric].toFixed(1)} {unit}
            </title>
          </circle>
        ))}
      </svg>
      {secondary && (
        <div class="chart-legend">
          <span>
            <i class="legend-average" />
            7-day average
          </span>
          <span>
            <i />
            Daily measurement
          </span>
        </div>
      )}
    </div>
  );
}
export function WeekBars({ days, field = 'proteinLow', label = 'Protein', unit = 'g' }) {
  const max = Math.max(1, ...days.map((d) => d[field] || 0));
  return (
    <div
      class="week-bars"
      role="img"
      aria-label={`${label} by day. ${days.map((d) => `${d.date}: ${d[field] == null ? 'not logged' : Math.round(d[field]) + unit}`).join('. ')}`}
    >
      {days.map((d) => (
        <div class={`day-bar ${d[field] == null ? 'missing' : ''}`} key={d.date}>
          <span class="bar-value">{d[field] == null ? '—' : Math.round(d[field])}</span>
          <div class="bar-track">
            <div
              style={{ height: `${d[field] == null ? 3 : Math.max(3, (d[field] / max) * 100)}%` }}
            />
          </div>
          <span>
            {new Date(`${d.date}T12:00:00`)
              .toLocaleDateString(undefined, { weekday: 'short' })
              .slice(0, 1)}
          </span>
          {d.fasting.length > 0 && <i class="fast-dot" title="Fasting logged" />}
        </div>
      ))}
    </div>
  );
}
