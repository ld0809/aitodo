import { useState } from 'react';
import type { Tag } from '../types';
import type { CreateTagDto, UpdateTagDto } from '../api/tags';
import './Modal.css';

interface TagModalProps {
  tags: Tag[];
  isSaving?: boolean;
  onSave: (data: CreateTagDto | UpdateTagDto, id?: string) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}

const TAG_COLORS = [
  '#f59e0b', // 工作 - 黄色
  '#3b82f6', // 个人 - 蓝色
  '#ef4444', // 紧急 - 红色
  '#10b981', // 学习 - 绿色
  '#8b5cf6', // 紫色
  '#ec4899', // 粉色
  '#06b6d4', // 青色
  '#84cc16', //  lime
];

export function TagModal({ tags, onSave, onDelete, onClose, isSaving = false }: TagModalProps) {
  const [newTagName, setNewTagName] = useState('');
  const [newTagColor, setNewTagColor] = useState(TAG_COLORS[0]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editColor, setEditColor] = useState('');

  const handleAddTag = (e: React.FormEvent) => {
    e.preventDefault();
    if (isSaving) return;
    if (!newTagName.trim()) return;
    onSave({ name: newTagName.trim(), color: newTagColor });
    setNewTagName('');
  };

  const handleStartEdit = (tag: Tag) => {
    setEditingId(tag.id);
    setEditName(tag.name);
    setEditColor(tag.color || TAG_COLORS[0]);
  };

  const handleSaveEdit = (id: string) => {
    if (isSaving) return;
    if (!editName.trim()) return;
    onSave({ name: editName.trim(), color: editColor }, id);
    setEditingId(null);
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditName('');
    setEditColor('');
  };

  return (
    <div className="overlay open" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">标签管理</div>
          <button className="modal-close" onClick={onClose} disabled={isSaving}>
            ×
          </button>
        </div>
        <div className="modal-body">
          <form onSubmit={handleAddTag} className="mb">
            <label>新建标签</label>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                type="text"
                placeholder="输入标签名"
                value={newTagName}
                onChange={(e) => setNewTagName(e.target.value)}
                disabled={isSaving}
              />
              <button type="submit" className="btn btn-primary" style={{ width: 'auto' }} disabled={isSaving}>
                {isSaving ? '提交中...' : '添加'}
              </button>
            </div>
            <div className="color-picker" style={{ marginTop: '8px' }}>
              {TAG_COLORS.map((color) => (
                <span
                  key={color}
                  className={`color-option ${newTagColor === color ? 'selected' : ''}`}
                  style={{ backgroundColor: color }}
                  onClick={() => {
                    if (isSaving) return;
                    setNewTagColor(color);
                  }}
                />
              ))}
            </div>
          </form>

          <div className="tag-list">
            {(Array.isArray(tags) ? tags : []).map((tag) => (
              <div key={tag.id} className="tag-item">
                {editingId === tag.id ? (
                  <div className="tag-edit">
                    <input
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      disabled={isSaving}
                    />
                    <div className="color-picker">
                      {TAG_COLORS.map((color) => (
                        <span
                          key={color}
                          className={`color-option ${editColor === color ? 'selected' : ''}`}
                          style={{ backgroundColor: color }}
                          onClick={() => {
                            if (isSaving) return;
                            setEditColor(color);
                          }}
                        />
                      ))}
                    </div>
                    <div className="tag-actions">
                      <button className="tb" onClick={() => handleSaveEdit(tag.id)} disabled={isSaving}>
                        ✓
                      </button>
                      <button className="tb" onClick={handleCancelEdit} disabled={isSaving}>
                        ×
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="tag-view">
                    <div className="tag-info">
                      <span
                        className="tag-color"
                        style={{ backgroundColor: tag.color || TAG_COLORS[0] }}
                      />
                      <span className="tag-name">{tag.name}</span>
                    </div>
                    <div className="tag-actions">
                      <button className="tb" onClick={() => handleStartEdit(tag)} disabled={isSaving}>
                        ✎
                      </button>
                      <button className="tb danger" onClick={() => onDelete(tag.id)} disabled={isSaving}>
                        🗑
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-outline" onClick={onClose} disabled={isSaving}>
            关闭
          </button>
        </div>
      </div>
    </div>
  );
}
