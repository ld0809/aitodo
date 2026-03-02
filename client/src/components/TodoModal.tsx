import { useState, useEffect } from 'react';
import type { Todo, Tag } from '../types';
import type { CreateTodoDto, UpdateTodoDto } from '../api/todos';
import './Modal.css';

interface TodoModalProps {
  defaultTagIds?: string[];
  todo: Todo | null;
  tags: Tag[];
  onSave: (data: CreateTodoDto | UpdateTodoDto) => void;
  onCreateTag: (name: string, color: string) => void;
  onClose: () => void;
}

export function TodoModal({ todo, tags, onSave, onCreateTag, onClose, defaultTagIds = [] }: TodoModalProps) {
  const [content, setContent] = useState('');
  const [dueAt, setDueAt] = useState('');
  const [executeAt, setExecuteAt] = useState('');
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>(defaultTagIds);
  const [newTagName, setNewTagName] = useState('');

  useEffect(() => {
    if (todo) {
      setContent(todo.content);
      setDueAt(todo.dueAt ? todo.dueAt.slice(0, 16) : '');
      setExecuteAt(todo.executeAt ? todo.executeAt.slice(0, 16) : '');
      setSelectedTagIds((Array.isArray(todo.tags) ? todo.tags : []).map((t) => t.id));
    }
  }, [todo]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim()) return;

    const data: CreateTodoDto | UpdateTodoDto = {
      content: content.trim(),
      dueAt: dueAt || undefined,
      executeAt: executeAt || undefined,
      tagIds: selectedTagIds,
    };

    onSave(data);
  };

  const toggleTag = (tagId: string) => {
    setSelectedTagIds((prev) =>
      prev.includes(tagId)
        ? prev.filter((id) => id !== tagId)
        : [...prev, tagId]
    );
  };

  const handleCreateTag = () => {
    if (!newTagName.trim()) return;
    onCreateTag(newTagName.trim(), '#3b82f6');
    setNewTagName('');
  };

  return (
    <div className="overlay open" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">
            {todo ? '编辑待办' : '新建待办'}
          </div>
          <button className="modal-close" onClick={onClose}>
            ×
          </button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            <div className="mb">
              <label>待办内容</label>
              <textarea
                className="tx"
                placeholder="输入待办内容..."
                value={content}
                onChange={(e) => setContent(e.target.value)}
                required
              />
            </div>
            <div className="mb">
              <label>标签</label>
              <div className="tag-selector">
                {(Array.isArray(tags) ? tags : []).map((tag) => (
                  <span
                    key={tag.id}
                    className={`tag-option ${selectedTagIds.includes(tag.id) ? 'selected' : ''}`}
                    onClick={() => toggleTag(tag.id)}
                  >
                    {tag.name}
                  </span>
                ))}
              </div>
              <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                <input
                  type="text"
                  placeholder="输入新标签名，回车添加..."
                  value={newTagName}
                  onChange={(e) => setNewTagName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleCreateTag();
                    }
                  }}
                  style={{ flex: 1, padding: '8px 12px' }}
                />
              </div>
            </div>
            <div className="fr">
              <div className="mb">
                <label>截止时间</label>
                <input
                  type="datetime-local"
                  value={dueAt}
                  onChange={(e) => setDueAt(e.target.value)}
                />
              </div>
              <div className="mb">
                <label>执行时间</label>
                <input
                  type="datetime-local"
                  value={executeAt}
                  onChange={(e) => setExecuteAt(e.target.value)}
                />
              </div>
            </div>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-outline" onClick={onClose}>
              取消
            </button>
            <button type="submit" className="btn btn-primary">
              {todo ? '保存' : '创建'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
