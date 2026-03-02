import { useState, useEffect } from 'react';
import type { Card, Tag } from '../types';
import type { CreateCardDto, UpdateCardDto } from '../api/cards';
import './Modal.css';

interface CardModalProps {
  card: Card | null;
  tags: Tag[];
  onSave: (data: CreateCardDto | UpdateCardDto) => void;
  onCreateTag: (name: string, color: string) => void;
  onClose: () => void;
}

export function CardModal({ card, tags, onSave, onCreateTag, onClose }: CardModalProps) {
  const [name, setName] = useState('');
  const [sortBy, setSortBy] = useState<'due_at' | 'created_at' | 'execute_at'>('due_at');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [newTagName, setNewTagName] = useState('');

  useEffect(() => {
    if (card) {
      setName(card.name);
      setSortBy(card.sortBy);
      setSortOrder(card.sortOrder);
      setSelectedTagIds((Array.isArray(card.tags) ? card.tags : []).map((t) => t.id));
    }
  }, [card]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    const data: CreateCardDto | UpdateCardDto = {
      name: name.trim(),
      sortBy,
      sortOrder,
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

  const handleCreateTag = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTagName.trim()) return;
    onCreateTag(newTagName.trim(), '#3b82f6');
    setNewTagName('');
  };

  return (
    <div className="overlay open" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">
            {card ? '编辑卡片' : '新建卡片'}
          </div>
          <button className="modal-close" onClick={onClose}>
            ×
          </button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            <div className="mb">
              <label>卡片名称</label>
              <input
                type="text"
                placeholder="输入卡片名称..."
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>
            <div className="mb">
              <label>排序方式</label>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <select value={sortBy} onChange={(e) => setSortBy(e.target.value as any)} style={{ flex: 1 }}>
                  <option value="due_at">按截止时间</option>
                  <option value="created_at">按创建时间</option>
                  <option value="execute_at">按执行时间</option>
                </select>
                <select value={sortOrder} onChange={(e) => setSortOrder(e.target.value as any)} style={{ flex: 1 }}>
                  <option value="asc">升序</option>
                  <option value="desc">降序</option>
                </select>
              </div>
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
              <form onSubmit={handleCreateTag} style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                <input
                  type="text"
                  placeholder="输入新标签名，回车添加..."
                  value={newTagName}
                  onChange={(e) => setNewTagName(e.target.value)}
                  style={{ flex: 1, padding: '8px 12px' }}
                />
              </form>
            </div>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-outline" onClick={onClose}>
              取消
            </button>
            <button type="submit" className="btn btn-primary">
              {card ? '保存' : '创建'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
