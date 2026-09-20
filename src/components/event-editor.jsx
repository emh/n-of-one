import { useState } from 'preact/hooks';
import { Modal, Icon } from './ui.jsx';
import {
  TYPES,
  LABELS,
  MODALITIES,
  blankData,
  validateEvent,
  normalizeModality,
} from '../../shared/schema.js';
const Field = ({ label, children, hint }) => (
  <label class="field">
    <span>{label}</span>
    {children}
    {hint && <small>{hint}</small>}
  </label>
);
export function EventEditor({ event, memory, onSave, onClose }) {
  const [value, setValue] = useState(() => {
    const copy = structuredClone(event);
    copy.data.modality = normalizeModality(copy.data.modality);
    return copy;
  });
  const [remember, setRemember] = useState(Boolean(memory));
  const [alias, setAlias] = useState(memory?.alias || event.title.toLowerCase());
  const [error, setError] = useState('');
  const patch = (part) => setValue((v) => ({ ...v, ...part }));
  const data = (key, next) => setValue((v) => ({ ...v, data: { ...v.data, [key]: next } }));
  function number(key, label, max) {
    return (
      <Field label={label}>
        <input
          type="number"
          min="0"
          max={max}
          step="any"
          value={value.data[key] ?? ''}
          onInput={(e) =>
            data(key, e.currentTarget.value === '' ? null : Number(e.currentTarget.value))
          }
        />
      </Field>
    );
  }
  function submit(e) {
    e.preventDefault();
    try {
      const fallback =
        value.type === 'fasting'
          ? { water: 'Water fast', sardine: 'Sardine fast', other: 'Other fast' }[
              value.data.fastType
            ]
          : value.type === 'exercise'
            ? LABELS[value.data.modality]
            : value.type === 'sleep'
              ? { bed: 'Went to bed', wake: 'Woke up', duration: 'Sleep duration' }[
                  value.data.sleepAction
                ]
              : null;
      const saved = { ...value, title: value.title.trim() || fallback || LABELS[value.type] };
      validateEvent(saved);
      if (remember && !alias.trim()) throw new Error('Give this memory a phrase.');
      onSave(
        saved,
        remember
          ? { alias: alias.trim(), type: value.type, eventData: value.data, title: saved.title }
          : null,
      );
    } catch (e) {
      setError(e.message);
    }
  }
  return (
    <Modal title="Details" onClose={onClose} closeLabel="Cancel">
      <form id="event-details" onSubmit={submit} class="editor-form">
        <div class="field-row">
          <Field label="Type">
            <select
              value={value.type}
              onChange={(e) => {
                patch({ type: e.currentTarget.value, data: blankData() });
                setRemember(false);
              }}
            >
              {TYPES.map((type) => (
                <option value={type} key={type}>
                  {LABELS[type]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Time">
            <input
              required
              type="time"
              value={value.time}
              onInput={(e) => patch({ time: e.currentTarget.value })}
            />
          </Field>
        </div>
        <Field label="Description (optional)">
          <input
            maxLength="300"
            value={value.title}
            onInput={(e) => patch({ title: e.currentTarget.value })}
          />
        </Field>
        <Field label="Date">
          <input
            required
            type="date"
            value={value.date}
            onInput={(e) => patch({ date: e.currentTarget.value })}
          />
        </Field>
        {value.type === 'food' && (
          <>
            <div class="field-row">
              {number('proteinLow', 'Protein · low (g)')}
              {number('proteinHigh', 'Protein · high (g)')}
            </div>
            <div class="field-row">
              {number('caloriesLow', 'Calories · low (kcal)')}
              {number('caloriesHigh', 'Calories · high (kcal)')}
            </div>
          </>
        )}
        {value.type === 'body_composition' && (
          <div class="field-row">
            {number('weightLb', 'Weight (lb)')}
            {number('bodyFatPct', 'Body fat (%)', 100)}
          </div>
        )}
        {value.type === 'hydration' && number('volumeMl', 'Water (ml)')}
        {value.type === 'exercise' && (
          <div class="field-row">
            <Field label="Modality">
              <select
                required
                value={value.data.modality || ''}
                onChange={(e) => data('modality', e.currentTarget.value)}
              >
                <option value="" disabled>
                  Choose…
                </option>
                {MODALITIES.map((m) => (
                  <option value={m} key={m}>
                    {LABELS[m] || m}
                  </option>
                ))}
              </select>
            </Field>
            {number('durationMinutes', 'Duration (min)', 1440)}
          </div>
        )}
        {value.type === 'sleep' && (
          <>
            <div class="field-row">
              <Field label="Sleep event">
                <select
                  required
                  value={value.data.sleepAction || ''}
                  onChange={(e) => data('sleepAction', e.currentTarget.value)}
                >
                  <option value="" disabled>
                    Choose…
                  </option>
                  <option value="bed">Went to bed</option>
                  <option value="wake">Woke up</option>
                  <option value="duration">Sleep duration</option>
                </select>
              </Field>
              {value.data.sleepAction === 'duration' &&
                number('durationMinutes', 'Duration (min)', 1440)}
            </div>
            {value.data.sleepAction !== 'bed' && (
              <Field label="Wake state">
                <select
                  value={value.data.wakeState || ''}
                  onChange={(e) => data('wakeState', e.currentTarget.value || null)}
                >
                  <option value="">Not recorded</option>
                  {['great', 'good', 'normal', 'tired', 'groggy', 'poor'].map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </Field>
            )}
          </>
        )}
        {value.type === 'fasting' && (
          <Field label="Fast type">
            <select
              required
              value={value.data.fastType || ''}
              onChange={(e) => data('fastType', e.currentTarget.value)}
            >
              <option value="" disabled>
                Choose…
              </option>
              <option value="water">Water fast</option>
              <option value="sardine">Sardine fast</option>
              <option value="other">Other fast</option>
            </select>
          </Field>
        )}
        <Field label="Notes (optional)">
          <textarea
            rows="2"
            value={value.data.note || ''}
            onInput={(e) => data('note', e.currentTarget.value || null)}
          />
        </Field>
        {['food', 'exercise'].includes(value.type) && (
          <div class="memory-option">
            <label class="checkbox">
              <input
                type="checkbox"
                checked={remember}
                onChange={(e) => setRemember(e.currentTarget.checked)}
              />
              <span>Remember this</span>
            </label>
            {remember && (
              <Field label="Phrase">
                <input
                  maxLength="200"
                  required
                  value={alias}
                  onInput={(e) => setAlias(e.currentTarget.value)}
                  placeholder="e.g. protein shake"
                />
              </Field>
            )}
          </div>
        )}
        {error && (
          <p role="alert" class="error-message">
            {error}
          </p>
        )}
        <div class="modal-actions">
          <button class="button primary" type="submit">
            <Icon name="check" />
            Save
          </button>
        </div>
      </form>
    </Modal>
  );
}
