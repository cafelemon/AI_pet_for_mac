import { useMemo, useState } from 'react';
import type { FormEvent, ReactElement } from 'react';

import type {
  CreateReminderInput,
  ReminderNotification,
  ReminderPriority,
  ReminderRecord,
  ReminderRepeatRule
} from '../../shared/types';

const PRIORITY_LABELS: Record<ReminderPriority, string> = {
  high: '高',
  normal: '中',
  low: '低'
};
const REPEAT_LABELS: Record<ReminderRepeatRule, string> = {
  none: '不重复',
  daily: '每天',
  weekly: '每周',
  monthly: '每月'
};
const STATUS_LABELS: Record<ReminderRecord['status'], string> = {
  scheduled: '待提醒',
  triggered: '已提醒',
  dismissed: '已清除'
};

interface ReminderPanelProps {
  open: boolean;
  reminders: ReminderRecord[];
  activeReminder: ReminderNotification | null;
  defaultSnoozeMinutes: number;
  onCreateReminder: (input: CreateReminderInput) => Promise<void>;
  onDismissReminder: (id: number) => Promise<void>;
  onDismissNotification: (id: number) => Promise<void>;
  onSnoozeReminder: (id: number, minutes: number) => Promise<void>;
  onClose: () => void;
}

function pad(value: number): string {
  return value.toString().padStart(2, '0');
}

function localDateTimeValue(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(
    date.getMinutes()
  )}`;
}

function defaultDueValue(): string {
  return localDateTimeValue(new Date(Date.now() + 15 * 60_000));
}

function formatDueAt(dueAt: string): string {
  const parsed = new Date(dueAt);
  if (Number.isNaN(parsed.getTime())) {
    return dueAt;
  }

  return new Intl.DateTimeFormat(undefined, {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(parsed);
}

function dueAtFromLocalValue(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error('时间无效');
  }
  return parsed.toISOString();
}

export function ReminderPanel({
  open,
  reminders,
  activeReminder,
  defaultSnoozeMinutes,
  onCreateReminder,
  onDismissReminder,
  onDismissNotification,
  onSnoozeReminder,
  onClose
}: ReminderPanelProps): ReactElement | null {
  const [title, setTitle] = useState('');
  const [dueAt, setDueAt] = useState(defaultDueValue);
  const [priority, setPriority] = useState<ReminderPriority>('normal');
  const [repeatRule, setRepeatRule] = useState<ReminderRepeatRule>('none');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const sortedReminders = useMemo(
    () =>
      [...reminders].sort((left, right) => {
        if (left.status !== right.status) {
          return left.status === 'triggered' ? -1 : 1;
        }
        return Date.parse(left.dueAt) - Date.parse(right.dueAt);
      }),
    [reminders]
  );

  if (!open) {
    return null;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const nextTitle = title.trim();
    if (!nextTitle) {
      setError('请输入事项');
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      await onCreateReminder({
        title: nextTitle,
        dueAt: dueAtFromLocalValue(dueAt),
        priority,
        repeatRule
      });
      setTitle('');
      setDueAt(defaultDueValue());
      setPriority('normal');
      setRepeatRule('none');
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : '新增失败');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="reminder-panel" aria-label="PA4 提醒面板" data-hit-interactive="true">
      <header className="reminder-panel__header">
        <div>
          <p className="status-panel__eyebrow">PA4</p>
          <h1 className="status-panel__title">提醒</h1>
        </div>
        <button className="icon-button" type="button" aria-label="关闭提醒面板" onClick={onClose}>
          x
        </button>
      </header>

      {activeReminder ? (
        <div className="reminder-alert">
          <p className="reminder-alert__title">{activeReminder.reminder.title}</p>
          <p className="reminder-alert__meta">{formatDueAt(activeReminder.reminder.dueAt)}</p>
          <div className="reminder-alert__actions">
            <button
              className="panel-button"
              type="button"
              onClick={() => onSnoozeReminder(activeReminder.reminder.id, defaultSnoozeMinutes)}
            >
              {defaultSnoozeMinutes} 分钟
            </button>
            <button
              className="panel-button panel-button--active"
              type="button"
              onClick={() => onDismissNotification(activeReminder.reminder.id)}
            >
              知道了
            </button>
          </div>
        </div>
      ) : null}

      <form className="reminder-form" onSubmit={handleSubmit}>
        <input
          className="reminder-input"
          type="text"
          value={title}
          maxLength={80}
          placeholder="事项"
          aria-label="提醒事项"
          onChange={(event) => setTitle(event.currentTarget.value)}
        />
        <input
          className="reminder-input"
          type="datetime-local"
          value={dueAt}
          aria-label="提醒时间"
          onChange={(event) => setDueAt(event.currentTarget.value)}
        />
        <div className="reminder-form__row">
          <select
            className="reminder-select"
            value={priority}
            aria-label="提醒优先级"
            onChange={(event) => setPriority(event.currentTarget.value as ReminderPriority)}
          >
            {Object.entries(PRIORITY_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <select
            className="reminder-select"
            value={repeatRule}
            aria-label="重复规则"
            onChange={(event) => setRepeatRule(event.currentTarget.value as ReminderRepeatRule)}
          >
            {Object.entries(REPEAT_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
        {error ? <p className="reminder-form__error">{error}</p> : null}
        <button className="panel-button panel-button--active reminder-form__submit" type="submit" disabled={submitting}>
          新增
        </button>
      </form>

      <div className="reminder-list" aria-label="提醒列表">
        {sortedReminders.length === 0 ? (
          <p className="reminder-list__empty">暂无提醒</p>
        ) : (
          sortedReminders.map((reminder) => (
            <article className="reminder-item" key={reminder.id}>
              <div className="reminder-item__main">
                <p className="reminder-item__title">{reminder.title}</p>
                <p className="reminder-item__meta">
                  {formatDueAt(reminder.dueAt)} · {REPEAT_LABELS[reminder.repeatRule]} · {STATUS_LABELS[reminder.status]}
                </p>
              </div>
              <span className={`reminder-priority reminder-priority--${reminder.priority}`}>
                {PRIORITY_LABELS[reminder.priority]}
              </span>
              <button
                className="icon-button reminder-item__clear"
                type="button"
                aria-label="清除提醒"
                onClick={() => onDismissReminder(reminder.id)}
              >
                x
              </button>
            </article>
          ))
        )}
      </div>
    </section>
  );
}
