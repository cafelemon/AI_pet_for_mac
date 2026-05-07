import { useMemo, useState } from 'react';
import type { FormEvent, ReactElement } from 'react';

import type { CreateTaskInput, TaskCenterSnapshot, TaskNotification, TaskRecord, TaskStatus } from '../../shared/types';

const STATUS_LABELS: Record<TaskStatus, string> = {
  todo: '待办',
  active: '进行中',
  blocked: '卡住',
  done: '完成',
  failed: '失败'
};
const SOURCE_LABELS: Record<TaskRecord['source'], string> = {
  manual: '手动',
  codex: 'Codex'
};

interface TaskPanelProps {
  open: boolean;
  snapshot: TaskCenterSnapshot;
  notification: TaskNotification | null;
  onCreateTask: (input: CreateTaskInput) => Promise<void>;
  onUpdateTaskStatus: (id: number, status: TaskStatus) => Promise<void>;
  onDeleteTask: (id: number) => Promise<void>;
  onDismissNotification: (id: number) => Promise<void>;
  onClose: () => void;
}

function formatTime(value: string | null): string {
  if (!value) {
    return '暂无';
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(undefined, {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(parsed);
}

function taskMeta(task: TaskRecord): string {
  return `${SOURCE_LABELS[task.source]} · ${STATUS_LABELS[task.status]} · ${formatTime(
    task.completedAt ?? task.lastActivityAt ?? task.updatedAt
  )}`;
}

export function TaskPanel({
  open,
  snapshot,
  notification,
  onCreateTask,
  onUpdateTaskStatus,
  onDeleteTask,
  onDismissNotification,
  onClose
}: TaskPanelProps): ReactElement | null {
  const [title, setTitle] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const manualTasks = useMemo(() => snapshot.today.filter((task) => task.source === 'manual'), [snapshot.today]);

  if (!open) {
    return null;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const nextTitle = title.trim();
    if (!nextTitle) {
      setError('请输入任务');
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      await onCreateTask({ title: nextTitle });
      setTitle('');
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : '新增失败');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="task-panel" aria-label="PA6 任务中心" data-hit-interactive="true">
      <header className="task-panel__header">
        <div>
          <p className="status-panel__eyebrow">PA6</p>
          <h1 className="status-panel__title">任务中心</h1>
        </div>
        <button className="icon-button" type="button" aria-label="关闭任务中心" onClick={onClose}>
          x
        </button>
      </header>

      {notification ? (
        <div className="task-alert">
          <p className="task-alert__title">{notification.task.title}</p>
          <p className="task-alert__meta">可能卡住 · {formatTime(notification.task.lastActivityAt)}</p>
          <button
            className="panel-button panel-button--active"
            type="button"
            onClick={() => onDismissNotification(notification.task.id)}
          >
            知道了
          </button>
        </div>
      ) : null}

      <section className="task-panel__section">
        <p className="status-panel__label">Codex 当前任务</p>
        {snapshot.currentCodex ? (
          <article className={`task-item task-item--${snapshot.currentCodex.status}`}>
            <div className="task-item__main">
              <p className="task-item__title">{snapshot.currentCodex.title}</p>
              <p className="task-item__meta">{taskMeta(snapshot.currentCodex)}</p>
            </div>
            <span className={`task-status task-status--${snapshot.currentCodex.status}`}>
              {STATUS_LABELS[snapshot.currentCodex.status]}
            </span>
          </article>
        ) : (
          <p className="task-list__empty">暂无 Codex 任务</p>
        )}
      </section>

      <section className="task-panel__section">
        <p className="status-panel__label">今日任务</p>
        <form className="task-form" onSubmit={handleSubmit}>
          <input
            className="task-input"
            type="text"
            value={title}
            maxLength={120}
            placeholder="新增今日任务"
            aria-label="新增今日任务"
            onChange={(event) => setTitle(event.currentTarget.value)}
          />
          <button className="panel-button panel-button--active task-form__submit" type="submit" disabled={submitting}>
            新增
          </button>
        </form>
        {error ? <p className="task-form__error">{error}</p> : null}
        <div className="task-list">
          {manualTasks.length === 0 ? (
            <p className="task-list__empty">暂无今日任务</p>
          ) : (
            manualTasks.map((task) => (
              <article className={`task-item task-item--${task.status}`} key={task.id}>
                <div className="task-item__main">
                  <p className="task-item__title">{task.title}</p>
                  <p className="task-item__meta">{taskMeta(task)}</p>
                </div>
                <div className="task-item__actions">
                  <button className="mini-button" type="button" onClick={() => onUpdateTaskStatus(task.id, 'active')}>
                    做
                  </button>
                  <button className="mini-button" type="button" onClick={() => onUpdateTaskStatus(task.id, 'blocked')}>
                    卡
                  </button>
                  <button className="mini-button mini-button--primary" type="button" onClick={() => onUpdateTaskStatus(task.id, 'done')}>
                    完
                  </button>
                  <button className="mini-button" type="button" onClick={() => onDeleteTask(task.id)}>
                    x
                  </button>
                </div>
              </article>
            ))
          )}
        </div>
      </section>

      <section className="task-panel__section">
        <p className="status-panel__label">最近完成</p>
        <div className="task-list task-list--compact">
          {snapshot.recentCompleted.length === 0 ? (
            <p className="task-list__empty">暂无完成记录</p>
          ) : (
            snapshot.recentCompleted.map((task) => (
              <article className={`task-item task-item--${task.status}`} key={task.id}>
                <div className="task-item__main">
                  <p className="task-item__title">{task.title}</p>
                  <p className="task-item__meta">{taskMeta(task)}</p>
                </div>
                <span className={`task-status task-status--${task.status}`}>{STATUS_LABELS[task.status]}</span>
              </article>
            ))
          )}
        </div>
      </section>
    </section>
  );
}
