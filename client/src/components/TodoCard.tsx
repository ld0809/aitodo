import type { ReactNode } from 'react';
import type { Todo, Tag } from '../types';
import './TodoCard.css';

interface TodoCardProps {
  todo: Todo;
  tags: Tag[];
  currentUserId?: string;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
  showToggle?: boolean;
  canUpdateProgress?: boolean;
  onOpenProgress?: () => void;
  hiddenTagIds?: string[];
  readOnly?: boolean;
  progressButtonTitle?: string;
  className?: string;
  onCardClick?: () => void;
  headerAddon?: ReactNode;
}

export function TodoCard({
  todo,
  currentUserId,
  onToggle,
  onEdit,
  showToggle = true,
  canUpdateProgress = false,
  onOpenProgress,
  hiddenTagIds = [],
  readOnly = false,
  progressButtonTitle = '更新进度',
  className,
  onCardClick,
  headerAddon,
}: TodoCardProps) {
  const isDone = todo.status === 'done' || todo.status === 'completed';
  const hiddenTagIdSet = new Set(hiddenTagIds);

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return null;
    const date = new Date(dateStr);
    const now = new Date();
    const diff = date.getTime() - now.getTime();
    const DAY_MS = 1000 * 60 * 60 * 24;
    const remainingDays = diff / DAY_MS;

    if (diff < 0) {
      return { text: '已过期', className: 'due-depth-overdue' };
    }

    let className = 'due-depth-4';
    if (remainingDays > 5) {
      className = 'due-depth-1';
    } else if (remainingDays > 3) {
      className = 'due-depth-2';
    } else if (remainingDays > 1) {
      className = 'due-depth-3';
    }

    if (remainingDays <= 1) {
      return {
        text: `⏰ ${date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`,
        className,
      };
    }

    return {
      text: `📅 ${date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })}`,
      className,
    };
  };

  const dueInfo = formatDate(todo.dueAt);
  const isCompleted = todo.status === 'completed';
  const visibleTags = (Array.isArray(todo.tags) ? todo.tags : []).filter(
    (tag) => !hiddenTagIdSet.has(tag.id),
  );
  const handlerNames = Array.isArray(todo.handlerNames)
    ? todo.handlerNames.map((name) => String(name || '').trim()).filter(Boolean)
    : [];
  const handlerLabel = handlerNames.length > 0 ? `[${handlerNames.join(' ')}]` : null;
  const creatorBadge = todo.creatorUserId && todo.creatorUserId !== currentUserId
    ? `创建人：${todo.creatorName || '未知成员'}`
    : null;

  return (
    <div
      className={`todo-item ${isDone ? 'done' : ''} ${readOnly ? 'readonly' : ''} ${className || ''}`.trim()}
      onClick={() => {
        if (onCardClick) {
          onCardClick();
          return;
        }
        if (todo.url) {
          window.open(todo.url, '_blank');
          return;
        }
        if (!readOnly) {
          onEdit();
        }
      }}
    >
      <div className="todo-row">
        {(showToggle || canUpdateProgress) && (
          <div className="todo-left">
            {showToggle && (
              <div
                className={`checkbox ${isDone ? 'checked' : ''}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onToggle();
                }}
              >
                {isDone && '✓'}
              </div>
            )}
            {canUpdateProgress && (
              <button
                type="button"
                className="progress-entry-btn"
                title={progressButtonTitle}
                aria-label={progressButtonTitle}
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenProgress?.();
                }}
              >
                {todo.progressCount ?? 0}
              </button>
            )}
          </div>
        )}
        <div className="todo-content">
          <div className={`todo-text ${isDone ? 'done' : ''}`}>
            {todo.content}
          </div>
          {headerAddon}
          {creatorBadge && <div className="todo-creator-badge">{creatorBadge}</div>}
          {handlerLabel && <div className="todo-handler-list">{handlerLabel}</div>}
          <div className="todo-meta">
            {visibleTags.map((tag) => (
              <span key={tag.id} className={`tag ${getTagClass(tag.name)}`}>
                {tag.name}
              </span>
            ))}
            {dueInfo && (
              <span className={`time ${dueInfo.className}`}>{dueInfo.text}</span>
            )}
            {isCompleted && <span className="time">✅ 已完成</span>}
          </div>
        </div>
      </div>
    </div>
  );
}

function getTagClass(tagName: string): string {
  const map: Record<string, string> = {
    工作: 'work',
    个人: 'personal',
    紧急: 'urgent',
    学习: 'learn',
  };
  return map[tagName] || 'default';
}
