/* eslint-disable react-hooks/set-state-in-effect */
import { useEffect, useMemo, useState } from 'react';
import type { Card, Organization, OrganizationMember, Tag } from '../types';
import type { CreateCardDto, UpdateCardDto } from '../api/cards';
import { organizationsApi } from '../api/organizations';
import { getStatusOptions, getUsers, type TapdStatusOption, type TapdUser } from '../api/tapd';
import { useAuthStore } from '../store/authStore';
import { Button } from './ui/Button';
import './Modal.css';

interface CardModalProps {
  card: Card | null;
  cards: Card[];
  tags: Tag[];
  isSaving?: boolean;
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

function parseTapdFilterValues(value: unknown): string[] {
  if (Array.isArray(value)) {
    return [...new Set(value.map((item) => String(item || '').trim()).filter(Boolean))];
  }

  if (typeof value === 'string') {
    return [...new Set(value.split(/[\s,，]+/).map((item) => item.trim()).filter(Boolean))];
  }

  return [];
}

function mergeTapdStatusOptions(optionGroups: TapdStatusOption[][]): TapdStatusOption[] {
  const merged = new Map<string, TapdStatusOption>();

  optionGroups.flat().forEach((option) => {
    const value = String(option.value || '').trim();
    const label = String(option.label || option.value || '').trim();
    if (!value || !label) {
      return;
    }

    const key = value.toLowerCase();
    if (!merged.has(key)) {
      merged.set(key, { value, label });
    }
  });

  return Array.from(merged.values()).sort((left, right) => left.label.localeCompare(right.label, 'zh-CN'));
}

type CardMode = 'personal' | 'shared' | 'tapd';

export function CardModal({ card, cards, tags, onSave, onCreateTag, onClose, isSaving = false }: CardModalProps) {
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
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [organizationMembersById, setOrganizationMembersById] = useState<Record<string, OrganizationMember[]>>({});
  const [selectedOrganizationId, setSelectedOrganizationId] = useState('');
  const [organizationsLoading, setOrganizationsLoading] = useState(false);
  const [organizationMembersLoading, setOrganizationMembersLoading] = useState(false);
  const [showOrganizationMemberPicker, setShowOrganizationMemberPicker] = useState(false);
  const [pendingOrganizationMemberIds, setPendingOrganizationMemberIds] = useState<string[]>([]);

  const [workspaceInput, setWorkspaceInput] = useState('');
  const [contentType, setContentType] = useState<'all' | 'requirements' | 'bugs'>('all');
  const [requirementStatuses, setRequirementStatuses] = useState<string[]>([]);
  const [bugStatuses, setBugStatuses] = useState<string[]>([]);
  const [iterationId, setIterationId] = useState('');
  const [ownerIds, setOwnerIds] = useState<string[]>([]);
  const [ownerNames, setOwnerNames] = useState<string[]>([]);
  const [tapdUsers, setTapdUsers] = useState<TapdUser[]>([]);
  const [userKeyword, setUserKeyword] = useState('');
  const [requirementStatusOptions, setRequirementStatusOptions] = useState<TapdStatusOption[]>([]);
  const [bugStatusOptions, setBugStatusOptions] = useState<TapdStatusOption[]>([]);
  const [statusOptionsLoading, setStatusOptionsLoading] = useState(false);

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
      setSelectedOrganizationId('');
      setShowOrganizationMemberPicker(false);
      setPendingOrganizationMemberIds([]);

      if (card.pluginType === 'tapd' && card.pluginConfigJson) {
        try {
          const rawConfig = typeof card.pluginConfigJson === 'string' ? JSON.parse(card.pluginConfigJson) : card.pluginConfigJson;
          const config = rawConfig as {
            workspaceId?: string;
            workspaceIds?: string[];
            contentType?: 'all' | 'requirements' | 'bugs';
            requirementStatuses?: string[];
            bugStatuses?: string[];
            requirementStatus?: string | string[];
            bugStatus?: string | string[];
            iterationId?: string;
            ownerIds?: string[];
            owners?: string[];
            status?: string | string[];
          };
          const workspaceIds = Array.isArray(config.workspaceIds) ? config.workspaceIds : [];
          const workspaceText = workspaceIds.length > 0 ? workspaceIds.join(',') : (config.workspaceId || '');
          setWorkspaceInput(workspaceText);
          setContentType(config.contentType || 'all');
          setRequirementStatuses(parseTapdFilterValues(config.requirementStatuses ?? config.requirementStatus ?? config.status));
          setBugStatuses(parseTapdFilterValues(config.bugStatuses ?? config.bugStatus ?? config.status));
          setIterationId(config.iterationId || '');
          setOwnerIds(Array.isArray(config.ownerIds) ? config.ownerIds : []);
          setOwnerNames(Array.isArray(config.owners) ? config.owners : []);
        } catch {
          setWorkspaceInput('');
          setContentType('all');
          setRequirementStatuses([]);
          setBugStatuses([]);
          setIterationId('');
          setOwnerIds([]);
          setOwnerNames([]);
        }
      } else {
        setWorkspaceInput('');
        setContentType('all');
        setRequirementStatuses([]);
        setBugStatuses([]);
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
    setOrganizations([]);
    setOrganizationMembersById({});
    setSelectedOrganizationId('');
    setShowOrganizationMemberPicker(false);
    setPendingOrganizationMemberIds([]);
    setWorkspaceInput('');
    setContentType('all');
    setRequirementStatuses([]);
    setBugStatuses([]);
    setIterationId('');
    setOwnerIds([]);
    setOwnerNames([]);
    setTapdUsers([]);
    setUserKeyword('');
    setRequirementStatusOptions([]);
    setBugStatusOptions([]);
    setStatusOptionsLoading(false);
  }, [card]);

  useEffect(() => {
    let cancelled = false;
    if (!isSharedCard) {
      setOrganizations([]);
      setOrganizationMembersById({});
      setSelectedOrganizationId('');
      setShowOrganizationMemberPicker(false);
      setPendingOrganizationMemberIds([]);
      setOrganizationsLoading(false);
      return () => {
        cancelled = true;
      };
    }

    setOrganizationsLoading(true);
    organizationsApi.getAll()
      .then((response) => {
        if (cancelled) {
          return;
        }
        setOrganizations(Array.isArray(response.data) ? response.data : []);
      })
      .catch(() => {
        if (cancelled) {
          return;
        }
        setOrganizations([]);
      })
      .finally(() => {
        if (!cancelled) {
          setOrganizationsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [isSharedCard]);

  useEffect(() => {
    let cancelled = false;
    if (!isSharedCard || !selectedOrganizationId) {
      setOrganizationMembersLoading(false);
      return () => {
        cancelled = true;
      };
    }

    setOrganizationMembersLoading(true);
    organizationsApi.getMembers(selectedOrganizationId)
      .then((response) => {
        if (cancelled) {
          return;
        }
        setOrganizationMembersById((prev) => ({
          ...prev,
          [selectedOrganizationId]: Array.isArray(response.data) ? response.data : [],
        }));
      })
      .catch(() => {
        if (cancelled) {
          return;
        }
        setOrganizationMembersById((prev) => ({
          ...prev,
          [selectedOrganizationId]: [],
        }));
      })
      .finally(() => {
        if (!cancelled) {
          setOrganizationMembersLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [isSharedCard, selectedOrganizationId]);

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

  useEffect(() => {
    let cancelled = false;
    if (!isTapdCard) {
      setRequirementStatusOptions([]);
      setBugStatusOptions([]);
      setStatusOptionsLoading(false);
      return () => {
        cancelled = true;
      };
    }

    const workspaceIds = parseWorkspaceIds(workspaceInput);
    if (workspaceIds.length === 0) {
      setRequirementStatusOptions([]);
      setBugStatusOptions([]);
      setRequirementStatuses([]);
      setBugStatuses([]);
      setStatusOptionsLoading(false);
      return () => {
        cancelled = true;
      };
    }

    setStatusOptionsLoading(true);
    Promise.all(workspaceIds.map((workspaceId) => getStatusOptions(workspaceId)))
      .then((responses) => {
        if (cancelled) {
          return;
        }

        const nextRequirementOptions = mergeTapdStatusOptions(
          responses.map((response) => Array.isArray(response.requirementStatuses) ? response.requirementStatuses : []),
        );
        const nextBugOptions = mergeTapdStatusOptions(
          responses.map((response) => Array.isArray(response.bugStatuses) ? response.bugStatuses : []),
        );

        setRequirementStatusOptions(nextRequirementOptions);
        setBugStatusOptions(nextBugOptions);
        setRequirementStatuses((prev) => prev.filter((item) => nextRequirementOptions.some((option) => option.value === item)));
        setBugStatuses((prev) => prev.filter((item) => nextBugOptions.some((option) => option.value === item)));
      })
      .catch(() => {
        if (cancelled) {
          return;
        }
        setRequirementStatusOptions([]);
        setBugStatusOptions([]);
      })
      .finally(() => {
        if (!cancelled) {
          setStatusOptionsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
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
  const selectedRequirementStatusOptions = useMemo(
    () => requirementStatuses.map((value) => {
      const matched = requirementStatusOptions.find((option) => option.value === value);
      return matched || { value, label: value };
    }),
    [requirementStatuses, requirementStatusOptions],
  );
  const selectedBugStatusOptions = useMemo(
    () => bugStatuses.map((value) => {
      const matched = bugStatusOptions.find((option) => option.value === value);
      return matched || { value, label: value };
    }),
    [bugStatuses, bugStatusOptions],
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
    setOwnerNames([]);
  }, [tapdUsers, ownerIds, ownerNames]);

  const copySourceCards = useMemo(
    () =>
      (Array.isArray(cards) ? cards : []).filter(
        (item) => item.cardType === 'shared' && item.id !== card?.id && item.userId === currentUser?.id,
      ),
    [cards, card?.id, currentUser?.id],
  );
  const selectedOrganizationMembers = selectedOrganizationId ? (organizationMembersById[selectedOrganizationId] ?? []) : [];
  const selectedOrganization = organizations.find((organization) => organization.id === selectedOrganizationId) ?? null;
  const pendingMemberCount = pendingOrganizationMemberIds.length;
  const allOrganizationMembersSelected = selectedOrganizationMembers.length > 0 && pendingMemberCount === selectedOrganizationMembers.length;

  const toggleOwner = (id: string) => {
    setOwnerIds((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]));
  };

  const toggleTapdStatus = (
    value: string,
    selectedValues: string[],
    setSelectedValues: React.Dispatch<React.SetStateAction<string[]>>,
  ) => {
    setSelectedValues(selectedValues.includes(value) ? selectedValues.filter((item) => item !== value) : [...selectedValues, value]);
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

  const openOrganizationMemberPicker = () => {
    if (!selectedOrganizationId) {
      return;
    }

    setPendingOrganizationMemberIds(
      selectedOrganizationMembers
        .filter((member) => participantEmails.includes(normalizeEmail(member.email)))
        .map((member) => member.id),
    );
    setShowOrganizationMemberPicker(true);
  };

  const toggleOrganizationMember = (memberId: string) => {
    setPendingOrganizationMemberIds((prev) => (
      prev.includes(memberId)
        ? prev.filter((item) => item !== memberId)
        : [...prev, memberId]
    ));
  };

  const confirmOrganizationParticipants = () => {
    if (!selectedOrganizationId || pendingOrganizationMemberIds.length === 0) {
      setShowOrganizationMemberPicker(false);
      return;
    }

    const nextEmails = selectedOrganizationMembers
      .filter((member) => pendingOrganizationMemberIds.includes(member.id))
      .map((member) => normalizeEmail(member.email));
    setParticipantEmails((prev) => [...new Set([...prev, ...nextEmails])]);
    setShowOrganizationMemberPicker(false);
  };

  const selectAllOrganizationMembers = () => {
    setPendingOrganizationMemberIds(selectedOrganizationMembers.map((member) => member.id));
  };

  const clearPendingOrganizationMembers = () => {
    setPendingOrganizationMemberIds([]);
  };

  const handleCreateTag = async () => {
    if (isSaving) return;
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
    if (isSaving) return;
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
        requirementStatuses: requirementStatuses.length > 0 ? requirementStatuses : undefined,
        bugStatuses: bugStatuses.length > 0 ? bugStatuses : undefined,
        requirementStatus: requirementStatuses.length > 0 ? requirementStatuses.join(',') : undefined,
        bugStatus: bugStatuses.length > 0 ? bugStatuses.join(',') : undefined,
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
    <div className="overlay open">
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">{card ? '编辑卡片' : '新建卡片'}</div>
          <button className="modal-close" onClick={onClose} disabled={isSaving}>
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
                  <label>选择组织</label>
                  <div className="participant-copy-row">
                    <select value={selectedOrganizationId} onChange={(e) => setSelectedOrganizationId(e.target.value)}>
                      <option value="">{organizationsLoading ? '组织加载中...' : '选择组织'}</option>
                      {organizations.map((organization) => (
                        <option key={organization.id} value={organization.id}>
                          {organization.name}（{organization.memberCount}人）
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="owner-action-btn"
                      onClick={openOrganizationMemberPicker}
                      disabled={!selectedOrganizationId}
                    >
                      从组织添加
                    </button>
                  </div>
                  <div className="mention-hint">点击后会弹框展示该组织成员，支持多选后一次性添加。</div>
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
                    需求状态过滤 <span style={{ color: '#999' }}>(可选)</span>
                  </label>
                  <div className="owner-filter-box">
                    <div className="tapd-status-toolbar">
                      <span className="selection-muted">
                        {statusOptionsLoading ? '状态加载中...' : `共 ${requirementStatusOptions.length} 个可选状态`}
                      </span>
                      <div className="tapd-status-actions">
                        <button
                          type="button"
                          className="owner-action-btn"
                          onClick={() => setRequirementStatuses(requirementStatusOptions.map((item) => item.value))}
                          disabled={requirementStatusOptions.length === 0}
                        >
                          全选
                        </button>
                        <button
                          type="button"
                          className="owner-action-btn"
                          onClick={() => setRequirementStatuses([])}
                          disabled={requirementStatuses.length === 0}
                        >
                          清空
                        </button>
                      </div>
                    </div>

                    {selectedRequirementStatusOptions.length > 0 && (
                      <div className="owner-selected-list">
                        {selectedRequirementStatusOptions.map((item) => (
                          <span
                            key={item.value}
                            className="owner-chip"
                            onClick={() => toggleTapdStatus(item.value, requirementStatuses, setRequirementStatuses)}
                          >
                            {item.label} ×
                          </span>
                        ))}
                      </div>
                    )}

                    <div className="owner-options">
                      {requirementStatusOptions.map((item) => (
                        <label key={item.value} className="owner-option">
                          <input
                            type="checkbox"
                            checked={requirementStatuses.includes(item.value)}
                            onChange={() => toggleTapdStatus(item.value, requirementStatuses, setRequirementStatuses)}
                          />
                          <span>{item.label}</span>
                        </label>
                      ))}
                      {requirementStatusOptions.length === 0 && <div className="owner-empty">请输入有效 workspace ID 后自动加载</div>}
                    </div>
                  </div>
                </div>

                <div className="mb">
                  <label>
                    缺陷状态过滤 <span style={{ color: '#999' }}>(可选)</span>
                  </label>
                  <div className="owner-filter-box">
                    <div className="tapd-status-toolbar">
                      <span className="selection-muted">
                        {statusOptionsLoading ? '状态加载中...' : `共 ${bugStatusOptions.length} 个可选状态`}
                      </span>
                      <div className="tapd-status-actions">
                        <button
                          type="button"
                          className="owner-action-btn"
                          onClick={() => setBugStatuses(bugStatusOptions.map((item) => item.value))}
                          disabled={bugStatusOptions.length === 0}
                        >
                          全选
                        </button>
                        <button
                          type="button"
                          className="owner-action-btn"
                          onClick={() => setBugStatuses([])}
                          disabled={bugStatuses.length === 0}
                        >
                          清空
                        </button>
                      </div>
                    </div>

                    {selectedBugStatusOptions.length > 0 && (
                      <div className="owner-selected-list">
                        {selectedBugStatusOptions.map((item) => (
                          <span
                            key={item.value}
                            className="owner-chip"
                            onClick={() => toggleTapdStatus(item.value, bugStatuses, setBugStatuses)}
                          >
                            {item.label} ×
                          </span>
                        ))}
                      </div>
                    )}

                    <div className="owner-options">
                      {bugStatusOptions.map((item) => (
                        <label key={item.value} className="owner-option">
                          <input
                            type="checkbox"
                            checked={bugStatuses.includes(item.value)}
                            onChange={() => toggleTapdStatus(item.value, bugStatuses, setBugStatuses)}
                          />
                          <span>{item.label}</span>
                        </label>
                      ))}
                      {bugStatusOptions.length === 0 && <div className="owner-empty">请输入有效 workspace ID 后自动加载</div>}
                    </div>
                  </div>
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
            <Button type="button" variant="secondary" onClick={onClose} disabled={isSaving}>
              取消
            </Button>
            <Button type="submit" variant="primary" disabled={isSaving}>
              {isSaving ? '提交中...' : card ? '保存' : '创建'}
            </Button>
          </div>
        </form>

        {showOrganizationMemberPicker && (
          <div className="nested-modal-overlay" onClick={() => setShowOrganizationMemberPicker(false)}>
            <div className="nested-modal" onClick={(e) => e.stopPropagation()}>
              <div className="nested-modal-header">
                <div>
                  <div className="nested-modal-title">从组织添加成员</div>
                  <div className="nested-modal-subtitle">
                    {selectedOrganization ? `${selectedOrganization.name} 的组织成员` : '选择要加入共享卡片的组织成员'}
                  </div>
                </div>
                <button
                  type="button"
                  className="modal-close"
                  onClick={() => setShowOrganizationMemberPicker(false)}
                >
                  ×
                </button>
              </div>

              <div className="nested-modal-body">
                {organizationMembersLoading ? (
                  <div className="owner-empty">成员加载中...</div>
                ) : selectedOrganizationMembers.length === 0 ? (
                  <div className="owner-empty">当前组织还没有可选成员</div>
                ) : (
                  <>
                    <div className="nested-modal-toolbar">
                      <div className="nested-modal-toolbar-meta">
                        <span className="selection-badge">已选 {pendingMemberCount}</span>
                        <span className="selection-muted">共 {selectedOrganizationMembers.length} 位成员</span>
                      </div>
                      <div className="nested-modal-toolbar-actions">
                        <button
                          type="button"
                          className="owner-action-btn"
                          onClick={allOrganizationMembersSelected ? clearPendingOrganizationMembers : selectAllOrganizationMembers}
                        >
                          {allOrganizationMembersSelected ? '取消全选' : '全选'}
                        </button>
                        <button type="button" className="owner-action-btn" onClick={clearPendingOrganizationMembers} disabled={pendingMemberCount === 0}>
                          清空
                        </button>
                      </div>
                    </div>
                    <div className="organization-member-list">
                    {selectedOrganizationMembers.map((member) => {
                      const checked = pendingOrganizationMemberIds.includes(member.id);
                      const normalizedEmail = normalizeEmail(member.email);
                      const inParticipantList = participantEmails.includes(normalizedEmail);
                      const displayName = member.nickname?.trim() || member.email;
                      const displayInitial = displayName.slice(0, 1).toUpperCase();
                      return (
                        <label
                          key={member.id}
                          className={`organization-member-option${checked ? ' selected' : ''}${inParticipantList ? ' exists' : ''}`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleOrganizationMember(member.id)}
                          />
                          <span className="organization-member-avatar" aria-hidden="true">{displayInitial}</span>
                          <div className="organization-member-copy">
                            <div className="organization-member-topline">
                              <strong>{displayName}</strong>
                              {inParticipantList && <span className="organization-member-state">已在参与人</span>}
                            </div>
                            <span className="organization-member-email">{member.email}</span>
                          </div>
                          <span className={`organization-member-check${checked ? ' selected' : ''}`} aria-hidden="true">
                            ✓
                          </span>
                        </label>
                      );
                    })}
                    </div>
                  </>
                )}
              </div>

              <div className="nested-modal-actions">
                <Button variant="secondary" onClick={() => setShowOrganizationMemberPicker(false)}>
                  取消
                </Button>
                <Button
                  variant="primary"
                  onClick={confirmOrganizationParticipants}
                  disabled={organizationMembersLoading || pendingOrganizationMemberIds.length === 0}
                >
                  确认添加
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
