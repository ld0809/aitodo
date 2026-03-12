/* eslint-disable react-hooks/set-state-in-effect */
import { useEffect, useMemo, useState } from 'react';
import type { Card, Tag } from '../types';
import type { CreateCardDto, UpdateCardDto } from '../api/cards';
import { getUsers, type TapdUser } from '../api/tapd';
import { useAuthStore } from '../store/authStore';
import './Modal.css';

interface CardModalProps {
  card: Card | null;
  cards: Card[];
  tags: Tag[];
  onSave: (data: CreateCardDto | UpdateCardDto) => void;
  onCreateTag: (name: string, color: string) => Promise<Tag | void>;
  onClose: () => void;
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function parseWorkspaceIds(input: string): string[] {
  return [...new Set(input.split(/[\s,，]+/).map((item) => item.trim()).filter(Boolean))];
}

type CardMode = 'personal' | 'shared' | 'tapd';

export function CardModal({ card, cards, tags, onSave, onCreateTag, onClose }: CardModalProps) {
  const currentUser = useAuthStore((state) => state.user);

  const [name, setName] = useState('');
  const [cardMode, setCardMode] = useState<CardMode>('personal');
  const [sortBy, setSortBy] = useState<'due_at' | 'created_at' | 'execute_at'>('due_at');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [newTagName, setNewTagName] = useState('');

  const [participantEmails, setParticipantEmails] = useState<string[]>([]);
  const [participantEmailDraft, setParticipantEmailDraft] = useState('');
  const [copyFromCardId, setCopyFromCardId] = useState('');

  const [workspaceInput, setWorkspaceInput] = useState('');
  const [contentType, setContentType] = useState<'all' | 'requirements' | 'bugs'>('all');
  const [iterationId, setIterationId] = useState('');
  const [ownerIds, setOwnerIds] = useState<string[]>([]);
  const [ownerNames, setOwnerNames] = useState<string[]>([]);
  const [tapdUsers, setTapdUsers] = useState<TapdUser[]>([]);
  const [userKeyword, setUserKeyword] = useState('');

  const cardType: 'personal' | 'shared' = cardMode === 'shared' ? 'shared' : 'personal';
  const pluginType: 'local_todo' | 'tapd' = cardMode === 'tapd' ? 'tapd' : 'local_todo';
  const isSharedCard = cardMode === 'shared';
  const isTapdCard = cardMode === 'tapd';

  useEffect(() => {
    if (card) {
      setName(card.name);
      if (card.pluginType === 'tapd') {
        setCardMode('tapd');
      } else if ((card.cardType ?? 'personal') === 'shared') {
        setCardMode('shared');
      } else {
        setCardMode('personal');
      }
      setSortBy(card.sortBy);
      setSortOrder(card.sortOrder);
      setSelectedTagIds((Array.isArray(card.tags) ? card.tags : []).map((t) => t.id));
      setParticipantEmails(
        [...new Set((Array.isArray(card.participants) ? card.participants : []).map((participant) => normalizeEmail(participant.email)))]
      );
      setCopyFromCardId('');

      if (card.pluginType === 'tapd' && card.pluginConfigJson) {
        try {
          const rawConfig = typeof card.pluginConfigJson === 'string' ? JSON.parse(card.pluginConfigJson) : card.pluginConfigJson;
          const config = rawConfig as {
            workspaceId?: string;
            workspaceIds?: string[];
            contentType?: 'all' | 'requirements' | 'bugs';
            iterationId?: string;
            ownerIds?: string[];
            owners?: string[];
          };
          const workspaceIds = Array.isArray(config.workspaceIds) ? config.workspaceIds : [];
          const workspaceText = workspaceIds.length > 0 ? workspaceIds.join(',') : (config.workspaceId || '');
          setWorkspaceInput(workspaceText);
          setContentType(config.contentType || 'all');
          setIterationId(config.iterationId || '');
          setOwnerIds(Array.isArray(config.ownerIds) ? config.ownerIds : []);
          setOwnerNames(Array.isArray(config.owners) ? config.owners : []);
        } catch {
          setWorkspaceInput('');
          setContentType('all');
          setIterationId('');
          setOwnerIds([]);
          setOwnerNames([]);
        }
      } else {
        setWorkspaceInput('');
        setContentType('all');
        setIterationId('');
        setOwnerIds([]);
        setOwnerNames([]);
      }
      return;
    }

    setName('');
    setCardMode('personal');
    setSortBy('due_at');
    setSortOrder('asc');
    setSelectedTagIds([]);
    setNewTagName('');
    setParticipantEmails([]);
    setParticipantEmailDraft('');
    setCopyFromCardId('');
    setWorkspaceInput('');
    setContentType('all');
    setIterationId('');
    setOwnerIds([]);
    setOwnerNames([]);
    setTapdUsers([]);
    setUserKeyword('');
  }, [card]);

  useEffect(() => {
    if (!isTapdCard) {
      setTapdUsers([]);
      return;
    }

    const workspaceIds = parseWorkspaceIds(workspaceInput);
    if (workspaceIds.length === 0) {
      setTapdUsers([]);
      return;
    }

    Promise.all(workspaceIds.map((workspaceId) => getUsers(workspaceId)))
      .then((usersByWorkspace) => {
        const merged = usersByWorkspace.flatMap((users) => (Array.isArray(users) ? users : []));
        const deduped = [...new Map(merged.map((user) => [user.id, user])).values()];
        setTapdUsers(deduped);
      })
      .catch(() => setTapdUsers([]));
  }, [isTapdCard, workspaceInput]);

  const filteredUsers = useMemo(() => {
    const keyword = userKeyword.trim().toLowerCase();
    if (!keyword) return tapdUsers;
    return tapdUsers.filter((user) => {
      const label = `${user.name || ''} ${user.nickname || ''} ${user.id || ''}`.toLowerCase();
      return label.includes(keyword);
    });
  }, [tapdUsers, userKeyword]);

  const selectedUsers = useMemo(
    () => tapdUsers.filter((user) => ownerIds.includes(user.id)),
    [tapdUsers, ownerIds],
  );

  useEffect(() => {
    if (ownerIds.length > 0 || ownerNames.length === 0 || tapdUsers.length === 0) {
      return;
    }

    const ownerSet = new Set(
      ownerNames
        .map((item) => item.trim().toLowerCase())
        .filter(Boolean),
    );
    if (ownerSet.size === 0) {
      return;
    }

    const matchedIds = tapdUsers
      .filter((user) =>
        ownerSet.has((user.name || user.nickname || user.id || '').trim().toLowerCase()) ||
        ownerSet.has((user.id || '').trim().toLowerCase()),
      )
      .map((user) => user.id);

    if (matchedIds.length > 0) {
      setOwnerIds([...new Set(matchedIds)]);
    }
  }, [tapdUsers, ownerIds, ownerNames]);

  const copySourceCards = useMemo(
    () =>
      (Array.isArray(cards) ? cards : []).filter(
        (item) => item.cardType === 'shared' && item.id !== card?.id && item.userId === currentUser?.id,
      ),
    [cards, card?.id, currentUser?.id],
  );

  const toggleOwner = (id: string) => {
    setOwnerIds((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]));
  };

  const toggleTag = (tagId: string) => {
    setSelectedTagIds((prev) => (prev.includes(tagId) ? prev.filter((id) => id !== tagId) : [...prev, tagId]));
  };

  const addParticipantEmail = () => {
    const normalized = normalizeEmail(participantEmailDraft);
    if (!normalized) {
      return;
    }
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailPattern.test(normalized)) {
      alert('请输入有效邮箱');
      return;
    }

    setParticipantEmails((prev) => [...new Set([...prev, normalized])]);
    setParticipantEmailDraft('');
  };

  const removeParticipantEmail = (email: string) => {
    setParticipantEmails((prev) => prev.filter((item) => item !== email));
  };

  const handleCopyParticipants = () => {
    if (!copyFromCardId) {
      return;
    }
    const sourceCard = copySourceCards.find((item) => item.id === copyFromCardId);
    if (!sourceCard) {
      return;
    }
    const copiedEmails = [...new Set((Array.isArray(sourceCard.participants) ? sourceCard.participants : []).map((item) => normalizeEmail(item.email)))];
    setParticipantEmails(copiedEmails);
  };

  const handleCreateTag = async () => {
    if (!newTagName.trim()) return;
    try {
      const createdTag = await onCreateTag(newTagName.trim(), '#3b82f6');
      if (createdTag?.id) {
        setSelectedTagIds((prev) => (prev.includes(createdTag.id) ? prev : [...prev, createdTag.id]));
      }
    } catch {
      alert('创建标签失败，请稍后重试');
    }
    setNewTagName('');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    let pluginConfig: Record<string, unknown> | undefined;
    if (pluginType === 'tapd') {
      const workspaceIds = parseWorkspaceIds(workspaceInput);
      const owners = selectedUsers
        .map((user) => (user.name || user.nickname || user.id || '').trim())
        .filter(Boolean);
      pluginConfig = {
        workspaceId: workspaceIds[0],
        workspaceIds,
        contentType,
        iterationId: iterationId.trim() || undefined,
        ownerIds,
        owners: [...new Set(owners)],
      };
    }

    const data: CreateCardDto | UpdateCardDto = {
      name: name.trim(),
      cardType,
      sortBy,
      sortOrder,
      tagIds: selectedTagIds,
      pluginType,
      pluginConfig,
      participantEmails: isSharedCard ? participantEmails : undefined,
    };

    onSave(data);
  };

  return (
    <div className="overlay open" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">{card ? '编辑卡片' : '新建卡片'}</div>
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
              <label>卡片类型</label>
              <select value={cardMode} onChange={(e) => setCardMode(e.target.value as CardMode)} style={{ width: '100%' }}>
                <option value="personal">个人卡片</option>
                <option value="shared">共享卡片</option>
                <option value="tapd">TAPD卡片</option>
              </select>
            </div>

            {isSharedCard && (
              <>
                <div className="mb">
                  <label>参与人员（邮箱）</label>
                  <div className="participant-input-row">
                    <input
                      type="email"
                      placeholder="输入邮箱后回车或点击添加"
                      value={participantEmailDraft}
                      onChange={(e) => setParticipantEmailDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          addParticipantEmail();
                        }
                      }}
                    />
                    <button type="button" className="owner-action-btn" onClick={addParticipantEmail}>
                      添加
                    </button>
                  </div>
                  <div className="participant-chip-list">
                    {participantEmails.map((email) => (
                      <span key={email} className="participant-chip" onClick={() => removeParticipantEmail(email)}>
                        {email} ×
                      </span>
                    ))}
                    {participantEmails.length === 0 && <div className="owner-empty">暂无参与人员</div>}
                  </div>
                </div>

                <div className="mb">
                  <label>从共享卡片复制参与人员</label>
                  <div className="participant-copy-row">
                    <select value={copyFromCardId} onChange={(e) => setCopyFromCardId(e.target.value)}>
                      <option value="">选择共享卡片</option>
                      {copySourceCards.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name}
                        </option>
                      ))}
                    </select>
                    <button type="button" className="owner-action-btn" onClick={handleCopyParticipants}>
                      复制
                    </button>
                  </div>
                </div>
              </>
            )}

            {isTapdCard && (
              <>
                <div className="mb">
                  <label>
                    Workspace ID <span style={{ color: '#999' }}>(必填，可多个)</span>
                  </label>
                  <input
                    type="text"
                    placeholder="例如: 54330609,54330610"
                    value={workspaceInput}
                    onChange={(e) => setWorkspaceInput(e.target.value)}
                    required={isTapdCard}
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
                  <label>
                    迭代 ID <span style={{ color: '#999' }}>(可选)</span>
                  </label>
                  <input type="text" placeholder="不填则显示全部迭代" value={iterationId} onChange={(e) => setIterationId(e.target.value)} />
                </div>

                <div className="mb">
                  <label>
                    处理人过滤 <span style={{ color: '#999' }}>(可多选)</span>
                  </label>
                  <div className="owner-filter-box">
                    <div className="owner-filter-toolbar">
                      <input type="text" placeholder="搜索姓名或ID" value={userKeyword} onChange={(e) => setUserKeyword(e.target.value)} />
                      <button type="button" className="owner-action-btn" onClick={() => setOwnerIds(filteredUsers.map((u) => u.id))}>
                        全选
                      </button>
                      <button type="button" className="owner-action-btn" onClick={() => setOwnerIds([])}>
                        清空
                      </button>
                    </div>

                    {selectedUsers.length > 0 && (
                      <div className="owner-selected-list">
                        {selectedUsers.map((user) => (
                          <span key={user.id} className="owner-chip" onClick={() => toggleOwner(user.id)}>
                            {user.name || user.nickname || user.id} ×
                          </span>
                        ))}
                      </div>
                    )}

                    <div className="owner-options">
                      {filteredUsers.map((item) => (
                        <label key={item.id} className="owner-option">
                          <input type="checkbox" checked={ownerIds.includes(item.id)} onChange={() => toggleOwner(item.id)} />
                          <span>{item.name || item.nickname || item.id}</span>
                        </label>
                      ))}
                      {filteredUsers.length === 0 && <div className="owner-empty">无匹配成员</div>}
                    </div>
                  </div>
                </div>
              </>
            )}

            <div className="mb">
              <label>排序方式</label>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <select value={sortBy} onChange={(e) => setSortBy(e.target.value as 'due_at' | 'created_at' | 'execute_at')} style={{ flex: 1 }}>
                  <option value="due_at">按截止时间</option>
                  <option value="created_at">按创建时间</option>
                  <option value="execute_at">按执行时间</option>
                </select>
                <select value={sortOrder} onChange={(e) => setSortOrder(e.target.value as 'asc' | 'desc')} style={{ flex: 1 }}>
                  <option value="asc">升序</option>
                  <option value="desc">降序</option>
                </select>
              </div>
            </div>

            <div className="mb">
              <label>标签</label>
              <div className="tag-selector">
                {(Array.isArray(tags) ? tags : []).map((tag) => (
                  <span key={tag.id} className={`tag-option ${selectedTagIds.includes(tag.id) ? 'selected' : ''}`} onClick={() => toggleTag(tag.id)}>
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
                      void handleCreateTag();
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
