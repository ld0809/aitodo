import { Button } from './ui/Button';
import './Modal.css';
import './ProgressModal.css';
import type { Todo, TodoProgressEntry } from '../types';

interface ProgressModalProps {
  todo: Todo;
  entries: TodoProgressEntry[];
  draft: string;
  onDraftChange: (value: string) => void;
  onClose: () => void;
  onSave?: () => void;
  isSaving?: boolean;
  readOnly?: boolean;
}

export function ProgressModal({
  todo,
  entries,
  draft,
  onDraftChange,
  onClose,
  onSave,
  isSaving = false,
  readOnly = false,
}: ProgressModalProps) {
  return (
    <div className="overlay open" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">{readOnly ? '查看进度' : '更新进度'}</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          <div className="progress-todo-title">{todo.content}</div>
          {!readOnly && (
            <>
              <textarea
                className="goal-input"
                rows={4}
                maxLength={2000}
                placeholder="输入当前进度，例如：已完成接口联调，待补充异常处理。"
                value={draft}
                onChange={(e) => onDraftChange(e.target.value)}
              />
              <div className="goal-meta">
                <span>本地待办可更新进度，第三方待办不支持。</span>
                <span>{draft.length}/2000</span>
              </div>
            </>
          )}

          <div className="progress-history">
            <div className="progress-history-title">最近进度记录</div>
            {entries.length === 0 ? (
              <div className="progress-history-empty">暂无记录</div>
            ) : (
              entries.map((entry) => (
                <div key={entry.id} className="progress-history-item">
                  <div className="progress-history-time">{new Date(entry.createdAt).toLocaleString('zh-CN')}</div>
                  <div className="progress-history-content">{entry.content}</div>
                </div>
              ))
            )}
          </div>
        </div>
        <div className="modal-footer">
          <Button
            type="button"
            variant="secondary"
            onClick={onClose}
            disabled={isSaving}
          >
            {readOnly ? '关闭' : '取消'}
          </Button>
          {!readOnly && (
            <Button
              type="button"
              variant="primary"
              onClick={onSave}
              disabled={isSaving}
            >
              {isSaving ? '保存中...' : '保存进度'}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
