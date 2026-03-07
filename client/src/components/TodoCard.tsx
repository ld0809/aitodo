import type { Todo, Tag } from '../types';
import './TodoCard.css';

interface TodoCardProps {
  todo: Todo;
  tags: Tag[];
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
  canUpdateProgress?: boolean;
  onOpenProgress?: () => void;
}

export function TodoCard({ todo, onToggle, onEdit, canUpdateProgress = false, onOpenProgress }: TodoCardProps) {
  const isDone = todo.status === 'done' || todo.status === 'completed';

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return null;
    const date = new Date(dateStr);
    const now = new Date();
    const diff = date.getTime() - now.getTime();
    const hours = Math.floor(diff / (1000 * 60 * 60));
    
    if (hours < 0) {
      return { text: '已过期', className: 'danger' };
    }
    if (hours < 24) {
      return { text: `⏰ ${date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`, className: 'warn' };
    }
    return { text: `📅 ${date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })}`, className: '' };
  };

  const dueInfo = formatDate(todo.dueAt);
  const isCompleted = todo.status === 'completed';

  return (
    <div className={`todo-item ${isDone ? 'done' : ''}`} onClick={() => {
      if (todo.url) {
        window.open(todo.url, '_blank');
      } else {
        onEdit();
      }
    }}>
      <div className="todo-row">
        <div className="todo-left">
          <div
            className={`checkbox ${isDone ? 'checked' : ''}`}
            onClick={(e) => {
              e.stopPropagation();
              onToggle();
            }}
          >
            {isDone && '✓'}
          </div>
          {canUpdateProgress && (
            <button
              type="button"
              className="progress-entry-btn"
              title="更新进度"
              onClick={(e) => {
                e.stopPropagation();
                onOpenProgress?.();
              }}
            >
              {todo.progressCount ?? 0}
            </button>
          )}
        </div>
        <div className="todo-content">
          <div className={`todo-text ${isDone ? 'done' : ''}`}>
            {todo.content}
          </div>
          <div className="todo-meta">
            {(Array.isArray(todo.tags) ? todo.tags : []).map((tag) => (
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
