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
  
  // TAPD 配置
  const [pluginType, setPluginType] = useState<'local_todo' | 'tapd'>('local_todo');
  const [workspaceId, setWorkspaceId] = useState('');
  const [contentType, setContentType] = useState<'all' | 'requirements' | 'bugs'>('all');
  const [iterationId, setIterationId] = useState('');

  useEffect(() => {
    if (card) {
      setName(card.name);
      setSortBy(card.sortBy);
      setSortOrder(card.sortOrder);
      setSelectedTagIds((Array.isArray(card.tags) ? card.tags : []).map((t) => t.id));
      
      // 解析 pluginConfig
      if (card.pluginType === 'tapd' && card.pluginConfigJson) {
        try {
          const config = JSON.parse(card.pluginConfigJson);
          setPluginType('tapd');
          setWorkspaceId(config.workspaceId || '');
          setContentType(config.contentType || 'all');
          setIterationId(config.iterationId || '');
        } catch {
          setPluginType('tapd');
        }
      } else {
        setPluginType(card.pluginType === 'tapd' ? 'tapd' : 'local_todo');
      }
    }
  }, [card]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    let pluginConfig: Record<string, unknown> | undefined;
    if (pluginType === 'tapd') {
      pluginConfig = {
        workspaceId: workspaceId.trim(),
        contentType,
        iterationId: iterationId.trim() || undefined,
      };
    }

    const data: CreateCardDto | UpdateCardDto = {
      name: name.trim(),
      sortBy,
      sortOrder,
      tagIds: selectedTagIds,
      pluginType,
      pluginConfig,
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
              <label>数据来源</label>
              <select 
                value={pluginType} 
                onChange={(e) => setPluginType(e.target.value as 'local_todo' | 'tapd')}
                style={{ width: '100%' }}
              >
                <option value="local_todo">本地待办</option>
                <option value="tapd">TAPD</option>
              </select>
            </div>

            {pluginType === 'tapd' && (
              <>
                <div className="mb">
                  <label>Workspace ID <span style={{color: '#999'}}>(必填)</span></label>
                  <input
                    type="text"
                    placeholder="例如: 54330609"
                    value={workspaceId}
                    onChange={(e) => setWorkspaceId(e.target.value)}
                    required={pluginType === 'tapd'}
                  />
                </div>

                <div className="mb">
                  <label>展示内容</label>
                  <select 
                    value={contentType}
                    onChange={(e) => setContentType(e.target.value as 'all' | 'requirements' | 'bugs')}
                    style={{ width: '100%' }}
                  >
                    <option value="all">需求 + 缺陷</option>
                    <option value="requirements">仅需求</option>
                    <option value="bugs">仅缺陷</option>
                  </select>
                </div>

                <div className="mb">
                  <label>迭代 ID <span style={{color: '#999'}}>(可选)</span></label>
                  <input
                    type="text"
                    placeholder="不填则显示全部迭代"
                    value={iterationId}
                    onChange={(e) => setIterationId(e.target.value)}
                  />
                </div>
              </>
            )}

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
