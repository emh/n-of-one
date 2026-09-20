import branch from '../assets/branch.svg';
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
const organicIcons = {
  food: () => (
    <>
      <path fill="currentColor" d="M3 11h18c-.8 6.1-3.8 10-9 10S3.8 17.1 3 11Z" />
      <path
        fill="currentColor"
        opacity=".7"
        d="M11 9C6 10 5 6 5 3c4 0 7 2 6 6Zm2 0c-1-5 3-7 7-7 0 4-3 7-7 7Z"
      />
    </>
  ),
  sleep: () => <path fill="currentColor" d="M19.8 16.7A8.7 8.7 0 0 1 8 4.2a9 9 0 1 0 11.8 12.5Z" />,
  fasting: () => (
    <>
      <path
        fill="currentColor"
        d="M4 19C1 7 12 4 22 2c0 12-6 20-16 19 3-6 7-11 11-14-6 3-10 7-13 12Z"
      />
      <path
        d="M3 23c2-6 7-12 13-16"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
    </>
  ),
  exercise: () => (
    <>
      <circle cx="15" cy="4" r="2.1" fill="currentColor" />
      <path
        d="m8 20 3-6 3 2 2 5M4 12l4-5 4 1 3 4 5 1M12 8l-2 6-5 2"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </>
  ),
};
export function Icon({ name, size = 18, ...props }) {
  const Illustration = organicIcons[name];
  if (Illustration)
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" {...props}>
        <Illustration />
      </svg>
    );
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
        <>
          {icon === 'journal' && !compact ? (
            <img class="botanical" src={branch} alt="" aria-hidden="true" />
          ) : (
            <Icon name={icon} size={25} />
          )}
        </>
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
