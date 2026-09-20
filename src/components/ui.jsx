import { useLayoutEffect, useRef } from 'preact/hooks';
import {
  BookOpen,
  CalendarDays,
  ChartNoAxesCombined,
  Activity,
  Settings,
  ArrowUpRight,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Plus,
  Check,
  X,
  Utensils,
  Dumbbell,
  Moon,
  Droplets,
  Scale,
  Pencil,
  Trash2,
  RefreshCw,
  Cloud,
  CloudOff,
  Download,
  Upload,
  Copy,
  Link,
  LoaderCircle,
  Sprout,
  MessageSquare,
  Flame,
  Clock,
  Menu,
  CheckCheck,
} from 'lucide-preact';
export const icons = {
  journal: BookOpen,
  today: CalendarDays,
  week: ChartNoAxesCombined,
  body: Activity,
  settings: Settings,
  arrow: ArrowUpRight,
  right: ArrowRight,
  left: ChevronLeft,
  next: ChevronRight,
  plus: Plus,
  check: Check,
  close: X,
  food: Utensils,
  exercise: Dumbbell,
  sleep: Moon,
  hydration: Droplets,
  body_composition: Scale,
  edit: Pencil,
  delete: Trash2,
  sync: RefreshCw,
  cloud: Cloud,
  offline: CloudOff,
  download: Download,
  upload: Upload,
  copy: Copy,
  link: Link,
  loading: LoaderCircle,
  fasting: Sprout,
  subjective: MessageSquare,
  other: MessageSquare,
  energy: Flame,
  time: Clock,
  menu: Menu,
  done: CheckCheck,
};
export function Icon({ name, size = 18, ...props }) {
  const Component = icons[name] || MessageSquare;
  return <Component size={size} strokeWidth={1.6} aria-hidden="true" {...props} />;
}
export function IconButton({ icon, label, ...props }) {
  return (
    <button type="button" class="icon-button" aria-label={label} title={label} {...props}>
      <Icon name={icon} />
    </button>
  );
}
export function Empty({ icon = 'journal', title, children, compact = false }) {
  return (
    <div class={`empty ${compact ? 'compact' : ''}`}>
      <span class="empty-icon">
        <Icon name={icon} size={25} />
      </span>
      <h3>{title}</h3>
      {children && <p>{children}</p>}
    </div>
  );
}
export function SectionTitle({ children, aside }) {
  return (
    <div class="section-title">
      <h2>{children}</h2>
      {aside && <span>{aside}</span>}
    </div>
  );
}
export function Modal({ title, subtitle, children, onClose, action, closeLabel, wide = false }) {
  const ref = useRef();
  useLayoutEffect(() => {
    const old = document.activeElement;
    const dialog = ref.current;
    dialog.showModal();
    return () => {
      dialog.close();
      old?.focus?.();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      class={`modal ${wide ? 'wide' : ''}`}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === ref.current) {
          const r = ref.current.getBoundingClientRect();
          if (
            event.clientX < r.left ||
            event.clientX > r.right ||
            event.clientY < r.top ||
            event.clientY > r.bottom
          )
            onClose();
        }
      }}
      aria-label={title}
    >
      <header class="modal-head">
        <button type="button" class="text-button" onClick={onClose}>
          {closeLabel || (action ? 'Cancel' : 'Done')}
        </button>
        <div>
          <h2>{title}</h2>
          {subtitle && <p>{subtitle}</p>}
        </div>
        {action || <span class="nav-spacer" />}
      </header>
      {children}
    </dialog>
  );
}
export function DatePicker({ date, onChange, step = 1, label }) {
  function move(amount) {
    const d = new Date(`${date}T12:00:00`);
    d.setDate(d.getDate() + amount);
    onChange(
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
    );
  }
  return (
    <div class="date-picker">
      <IconButton icon="left" label="Previous period" onClick={() => move(-step)} />
      <label class="date-label">
        <Icon name="today" size={15} />
        <span>
          {label ||
            new Date(`${date}T12:00:00`).toLocaleDateString(undefined, {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
            })}
        </span>
        <input
          type="date"
          aria-label="Journal date"
          value={date}
          onChange={(e) => e.currentTarget.value && onChange(e.currentTarget.value)}
        />
      </label>
      <IconButton icon="next" label="Next period" onClick={() => move(step)} />
    </div>
  );
}
