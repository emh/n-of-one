import { Icon, IconButton } from './ui.jsx';
import { LABELS, validateEvent } from '../../shared/schema.js';
import { durationLabel, rangeLabel } from '../../shared/model.js';
export function eventDetails(event) {
  const d = event.data;
  switch (event.type) {
    case 'food':
      return [
        rangeLabel(d.proteinLow, d.proteinHigh, 'g protein'),
        rangeLabel(d.caloriesLow, d.caloriesHigh, ' kcal'),
      ];
    case 'exercise':
      return [`${d.durationMinutes ?? '—'} min`, LABELS[d.modality] || d.modality];
    case 'body_composition':
      return [
        d.weightLb != null ? `${d.weightLb} lb` : null,
        d.bodyFatPct != null ? `${d.bodyFatPct}% body fat` : null,
      ].filter(Boolean);
    case 'hydration':
      return [`${Number((d.volumeMl / 1000).toFixed(2))} L water`];
    case 'sleep':
      return [
        d.sleepAction === 'bed'
          ? 'Bedtime'
          : d.sleepAction === 'wake'
            ? 'Woke up'
            : durationLabel(d.durationMinutes),
        d.wakeState,
      ].filter(Boolean);
    case 'fasting':
      return [LABELS[d.fastType] || 'Other fast'];
    default:
      return [d.note || event.sourceText];
  }
}
const detailFields = [
  ['weightLb', 'Weight', 'lb'],
  ['bodyFatPct', 'Body fat', '%'],
  ['proteinLow', 'Protein · low', 'g'],
  ['proteinHigh', 'Protein · high', 'g'],
  ['caloriesLow', 'Calories · low', 'kcal'],
  ['caloriesHigh', 'Calories · high', 'kcal'],
  ['volumeMl', 'Water', 'ml'],
  ['durationMinutes', 'Duration', 'min'],
  ['modality', 'Modality'],
  ['sleepAction', 'Sleep event'],
  ['wakeState', 'Wake state'],
  ['fastType', 'Fast type'],
  ['note', 'Notes'],
];
const sleepLabels = { bed: 'Went to bed', wake: 'Woke up', duration: 'Sleep duration' };
export function EventCard({
  event,
  onEdit,
  onDelete,
  compact = false,
  remembered = false,
  expandable = false,
}) {
  let needsDetails = false;
  try {
    validateEvent(event);
  } catch {
    needsDetails = true;
  }
  const summary = (
    <>
      {compact && <time class="event-time">{event.time}</time>}
      <span class={`event-icon ${event.type}`}>
        <Icon name={event.type} size={compact ? 17 : 20} />
      </span>
      <div class="event-content">
        {!compact && (
          <div class="event-eyebrow">
            {LABELS[event.type]} <span>· {event.time}</span>
            {event.origin === 'manual' && <span class="manual-badge">Manual</span>}
          </div>
        )}
        <h3>{event.title}</h3>
        <div class="event-details">
          {eventDetails(event).map((detail, i) => (
            <span key={i}>{detail}</span>
          ))}
        </div>
        {needsDetails && <span class="needs-details">Needs details</span>}
        {remembered && (
          <span class="remembered">
            <Icon name="check" size={11} /> Will remember
          </span>
        )}
      </div>
    </>
  );
  if (expandable)
    return (
      <details class="event-card expandable-event">
        <summary>
          {summary}
          <span class="event-disclosure">
            <Icon name="next" size={18} />
          </span>
        </summary>
        <dl class="expanded-event-details">
          <div>
            <dt>Date</dt>
            <dd>{event.date}</dd>
          </div>
          <div>
            <dt>Time</dt>
            <dd>{event.time}</dd>
          </div>
          {detailFields
            .filter(([key]) => event.data[key] != null && event.data[key] !== '')
            .map(([key, label, unit]) => (
              <div key={key} class={key === 'note' ? 'long-detail' : ''}>
                <dt>{label}</dt>
                <dd>
                  {key === 'sleepAction'
                    ? sleepLabels[event.data[key]] || event.data[key]
                    : ['modality', 'fastType'].includes(key)
                      ? LABELS[event.data[key]] || event.data[key]
                      : event.data[key]}
                  {unit && ` ${unit}`}
                </dd>
              </div>
            ))}
          {event.sourceText && (
            <div class="long-detail">
              <dt>Source</dt>
              <dd>{event.sourceText}</dd>
            </div>
          )}
        </dl>
      </details>
    );
  return (
    <article class={`event-card ${compact ? 'timeline-card' : ''}`}>
      {summary}
      <div class="event-actions">
        {onEdit && <IconButton icon="edit" label={`Edit ${event.title}`} onClick={onEdit} />}{' '}
        {onDelete && (
          <IconButton icon="delete" label={`Remove ${event.title}`} onClick={onDelete} />
        )}
      </div>
    </article>
  );
}
