import { useState } from 'preact/hooks';
import { Icon, Empty, SectionTitle } from './ui.jsx';
import { LineChart, WeekBars } from './charts.jsx';
import { LABELS } from '../../shared/schema.js';
import { addDays, durationLabel, rangeLabel, startOfWeek } from '../../shared/model.js';
import { dailySummary, weekSummary, bodySeries } from '../../shared/analytics.js';
export function Metric({ label, value, unit, detail, accent = false, icon }) {
  return (
    <div class={`metric ${accent ? 'accent' : ''}`}>
      <div class="metric-label">
        {icon && <Icon name={icon} size={14} />} {label}
      </div>
      <div class="metric-value">
        {value ?? '—'}
        {value != null && unit && <small>{unit}</small>}
      </div>
      {detail && <div class="metric-detail">{detail}</div>}
    </div>
  );
}
export function ActivityBreakdown({ activity }) {
  const values = Object.entries(activity).sort((a, b) => b[1] - a[1]);
  const max = Math.max(1, ...Object.values(activity));
  return values.length ? (
    <div class="activity-list">
      {values.map(([key, value]) => (
        <div class="activity-row" key={key}>
          <div>
            <span>{LABELS[key] || key}</span>
            <span class="mono">
              {value}
              <small> min</small>
            </span>
          </div>
          <div class="activity-track">
            <i style={{ width: `${(value / max) * 100}%` }} />
          </div>
        </div>
      ))}
    </div>
  ) : (
    <p class="muted small">No activity</p>
  );
}
export function DaySummary({ events, date, compact = false }) {
  const s = dailySummary(events, date);
  return (
    <section class={`panel day-summary ${compact ? 'side-summary' : ''}`}>
      <SectionTitle
        aside={
          s.events.length
            ? `${s.events.length} ${s.events.length === 1 ? 'event' : 'events'}`
            : undefined
        }
      >
        Day totals
      </SectionTitle>
      {s.fasting.length > 0 && (
        <div class="fast-banner">
          <Icon name="fasting" size={16} />
          {[...new Set(s.fasting)].map((f) => LABELS[f] || 'Other fast').join(' · ')}
        </div>
      )}
      <div class="summary-protein">
        <span class="eyebrow">PROTEIN</span>
        <div>
          {s.proteinLow == null ? '—' : rangeLabel(s.proteinLow, s.proteinHigh)}
          <small>g</small>
        </div>
      </div>
      <div class="summary-grid">
        <Metric
          icon="energy"
          label="Energy"
          value={s.caloriesLow == null ? null : rangeLabel(s.caloriesLow, s.caloriesHigh)}
          unit="kcal"
        />
        <Metric
          icon="exercise"
          label="Movement"
          value={s.events.some((e) => e.type === 'exercise') ? s.exercise : null}
          unit="min"
        />
        <Metric
          icon="hydration"
          label="Water"
          value={s.water == null ? null : Number((s.water / 1000).toFixed(2))}
          unit="L"
        />
        <Metric
          icon="sleep"
          label="Sleep"
          value={durationLabel(s.sleep)}
          detail={s.wakeState ? `Woke ${s.wakeState}` : undefined}
        />
      </div>
      {(s.weight != null || s.bodyFat != null) && (
        <div class="body-strip">
          <Icon name="body_composition" size={16} />
          {s.weight != null && (
            <span>
              {s.weight} <small>lb</small>
            </span>
          )}
          {s.bodyFat != null && (
            <span>
              {s.bodyFat}
              <small>% body fat</small>
            </span>
          )}
        </div>
      )}
      {Object.keys(s.activity).length > 0 && (
        <>
          <div class="summary-divider" />
          <ActivityBreakdown activity={s.activity} />
        </>
      )}
    </section>
  );
}
export function WeekView({ events, date }) {
  const [tab, setTab] = useState('Nutrition');
  const week = weekSummary(events, startOfWeek(date));
  return (
    <div class="week-view">
      <div class="segmented" aria-label="Weekly view">
        {['Nutrition', 'Movement', 'Sleep'].map((t) => (
          <button
            key={t}
            class={tab === t ? 'active' : ''}
            aria-pressed={tab === t}
            onClick={() => setTab(t)}
          >
            {t}
          </button>
        ))}
      </div>
      <div class="week-metrics panel">
        {tab === 'Nutrition' && (
          <>
            <Metric
              label="Daily protein"
              value={week.protein == null ? null : `~${Math.round(week.protein)}`}
              unit="g"
              detail={`${week.foodDays} logged days`}
              accent
            />
          </>
        )}
        {tab === 'Movement' && (
          <Metric
            label="Movement"
            value={
              Object.keys(week.activity).length
                ? Object.values(week.activity).reduce((a, b) => a + b, 0)
                : null
            }
            unit="min"
          />
        )}
        {tab === 'Sleep' && <Metric label="Average sleep" value={durationLabel(week.sleep)} />}
        {tab === 'Nutrition' && (
          <Metric
            label="Fasting"
            value={week.loggedDays ? week.fastDays : null}
            unit={week.fastDays === 1 ? 'day' : 'days'}
          />
        )}
      </div>
      <div class="week-panels">
        {tab === 'Nutrition' && (
          <section class="panel">
            <SectionTitle aside="est. grams / day">Protein</SectionTitle>
            <WeekBars
              days={week.days.map((d) => ({
                ...d,
                protein: d.proteinLow == null ? null : (d.proteinLow + d.proteinHigh) / 2,
              }))}
              field="protein"
            />
          </section>
        )}
        {tab === 'Nutrition' && (
          <section class="panel">
            <SectionTitle>Energy estimates</SectionTitle>
            <Metric
              label="Daily average"
              value={rangeLabel(week.caloriesLow, week.caloriesHigh)}
              unit="kcal"
              detail={`${week.foodDays} logged days`}
            />
            <div class="daily-rows">
              {week.days.map((day) => (
                <div key={day.date}>
                  <span>
                    {new Date(`${day.date}T12:00:00`).toLocaleDateString(undefined, {
                      weekday: 'long',
                    })}
                  </span>
                  <span class="mono">{rangeLabel(day.caloriesLow, day.caloriesHigh)}</span>
                </div>
              ))}
            </div>
          </section>
        )}
        {tab === 'Movement' && (
          <>
            <section class="panel">
              <SectionTitle aside="minutes">Time by modality</SectionTitle>
              <ActivityBreakdown activity={week.activity} />
            </section>
            <section class="panel">
              <SectionTitle aside="minutes / day">Daily movement</SectionTitle>
              <WeekBars
                days={week.days.map((d) => ({
                  ...d,
                  movement: Object.keys(d.activity).length ? d.exercise : null,
                }))}
                field="movement"
                label="Movement"
                unit="min"
              />
            </section>
          </>
        )}
        {tab === 'Sleep' && (
          <section class="panel">
            <SectionTitle>Sleep & waking</SectionTitle>
            <div class="sleep-week">
              {week.days.map((day) => (
                <div key={day.date}>
                  <span>
                    {new Date(`${day.date}T12:00:00`).toLocaleDateString(undefined, {
                      weekday: 'short',
                    })}
                  </span>
                  <div class="sleep-track">
                    <i style={{ width: `${Math.min(100, ((day.sleep || 0) / 600) * 100)}%` }} />
                  </div>
                  <span class="mono">{durationLabel(day.sleep)}</span>
                  <small>{day.wakeState || '—'}</small>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
      <p class="view-footnote">{week.loggedDays}/7 days logged</p>
    </div>
  );
}
export function BodyView({ events, date }) {
  const [range, setRange] = useState(30);
  const [selected, setSelected] = useState('weight');
  const points = bodySeries(events).filter(
    (p) => p.date <= date && (range === 0 || p.date >= addDays(date, -range + 1)),
  );
  const latest = (key) => [...points].reverse().find((p) => p[key] != null)?.[key];
  const metrics = [
    ['weight', 'Weight', 'lb'],
    ['bodyFat', 'Body fat', '%'],
    ['leanMass', 'Lean mass', 'lb'],
    ['fatMass', 'Fat mass', 'lb'],
  ];
  return (
    <div>
      <div class="view-toolbar">
        <div class="segmented small-segment">
          {[30, 90, 0].map((n) => (
            <button
              key={n}
              class={range === n ? 'active' : ''}
              aria-pressed={range === n}
              onClick={() => setRange(n)}
            >
              {n ? `${n}D` : 'All'}
            </button>
          ))}
        </div>
      </div>
      <div class="segmented" aria-label="Body measurement">
        {metrics.map(([key, label]) => (
          <button
            key={key}
            class={selected === key ? 'active' : ''}
            aria-pressed={selected === key}
            onClick={() => setSelected(key)}
          >
            {label}
          </button>
        ))}
      </div>
      <div class="body-panels">
        {metrics
          .filter(([key]) => key === selected)
          .map(([key, label, unit]) => (
            <section class={`panel ${key === 'weight' ? 'weight-panel' : ''}`} key={key}>
              <SectionTitle aside={key.includes('Mass') ? 'estimated' : undefined}>
                {label}
              </SectionTitle>
              <div class="body-number">
                {latest(key)?.toFixed(1) ?? '—'}
                <small>{unit}</small>
                {key === 'weight' && latest('average') != null && (
                  <span>
                    {latest('average').toFixed(1)}
                    <small>7-day avg</small>
                  </span>
                )}
              </div>
              <LineChart
                points={points}
                metric={key}
                secondary={key === 'weight' ? 'average' : undefined}
                unit={unit}
                label={label}
                color={key === 'bodyFat' ? 'sage' : 'mint'}
              />
            </section>
          ))}
      </div>
    </div>
  );
}
