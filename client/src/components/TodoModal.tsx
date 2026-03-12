/* eslint-disable react-hooks/set-state-in-effect */
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Card, CardParticipant, Todo, Tag } from '../types';
import type { CreateTodoDto, UpdateTodoDto } from '../api/todos';
import './Modal.css';

interface TodoModalProps {
  defaultTagIds?: string[];
  todo: Todo | null;
  card?: Card | null;
  tags: Tag[];
  mentionCandidates?: CardParticipant[];
  onSave: (data: CreateTodoDto | UpdateTodoDto) => void;
  onCreateTag: (name: string, color: string) => Promise<Tag | void>;
  onClose: () => void;
}

interface ActiveMention {
  start: number;
  end: number;
  query: string;
}

interface MentionAnchor {
  left: number;
  top: number;
}

function toDateTimeLocalInputValue(value?: string | null): string {
  if (!value) {
    return '';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value).replace(' ', 'T').slice(0, 16);
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function getMentionAnchor(textarea: HTMLTextAreaElement, cursor: number): MentionAnchor {
  const style = window.getComputedStyle(textarea);
  const mirror = document.createElement('div');
  const copiedStyleKeys = [
    'boxSizing',
    'fontFamily',
    'fontSize',
    'fontStyle',
    'fontWeight',
    'letterSpacing',
    'lineHeight',
    'paddingTop',
    'paddingRight',
    'paddingBottom',
    'paddingLeft',
    'borderTopWidth',
    'borderRightWidth',
    'borderBottomWidth',
    'borderLeftWidth',
    'textTransform',
    'textIndent',
    'textAlign',
    'whiteSpace',
    'wordBreak',
    'overflowWrap',
  ] as const;

  for (const key of copiedStyleKeys) {
    mirror.style[key] = style[key];
  }

  mirror.style.position = 'absolute';
  mirror.style.visibility = 'hidden';
  mirror.style.pointerEvents = 'none';
  mirror.style.left = '-9999px';
  mirror.style.top = '0';
  mirror.style.whiteSpace = 'pre-wrap';
  mirror.style.wordWrap = 'break-word';
  mirror.style.overflow = 'hidden';
  mirror.style.width = `${textarea.clientWidth}px`;

  mirror.textContent = textarea.value.slice(0, cursor);

  const marker = document.createElement('span');
  marker.textContent = textarea.value.slice(cursor) || ' ';
  mirror.appendChild(marker);
  document.body.appendChild(mirror);

  const lineHeight = Number.parseFloat(style.lineHeight) || Number.parseFloat(style.fontSize) * 1.4 || 20;
  const rawLeft = marker.offsetLeft - textarea.scrollLeft;
  const rawTop = marker.offsetTop - textarea.scrollTop + lineHeight;

  document.body.removeChild(mirror);

  const dropdownWidth = 280;
  const clampedLeft = Math.max(0, Math.min(rawLeft, Math.max(0, textarea.clientWidth - dropdownWidth - 8)));
  const clampedTop = Math.max(0, rawTop);

  return {
    left: clampedLeft,
    top: clampedTop,
  };
}

function detectActiveMention(text: string, cursor: number): ActiveMention | null {
  const prefix = text.slice(0, cursor);
  const atIndex = prefix.lastIndexOf('@');
  if (atIndex < 0) {
    return null;
  }

  const token = prefix.slice(atIndex + 1);
  if (token.includes(' ') || token.includes('\n') || token.includes('\t') || token.includes('@')) {
    return null;
  }

  return {
    start: atIndex,
    end: cursor,
    query: token.trim().toLowerCase(),
  };
}

export function TodoModal({ todo, card, tags, onSave, onCreateTag, onClose, defaultTagIds = [], mentionCandidates = [] }: TodoModalProps) {
  const [content, setContent] = useState('');
  const [dueAt, setDueAt] = useState('');
  const [executeAt, setExecuteAt] = useState('');
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>(defaultTagIds);
  const [newTagName, setNewTagName] = useState('');
  const [activeMention, setActiveMention] = useState<ActiveMention | null>(null);
  const [mentionAnchor, setMentionAnchor] = useState<MentionAnchor | null>(null);
  const [highlightedMentionIndex, setHighlightedMentionIndex] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const isSharedCard = (card?.cardType ?? 'personal') === 'shared';

  const normalizedMentionCandidates = useMemo(
    () =>
      [...new Map(mentionCandidates.map((item) => [item.id, item])).values()].map((item) => ({
        ...item,
        mentionKey: item.mentionKey?.trim() || item.email.split('@')[0] || item.email,
      })),
    [mentionCandidates],
  );

  const filteredMentionCandidates = useMemo(() => {
    if (!isSharedCard || !activeMention) {
      return [];
    }
    const query = activeMention.query;
    if (!query) {
      return normalizedMentionCandidates;
    }
    return normalizedMentionCandidates.filter((item) => {
      const nickname = (item.nickname || '').toLowerCase();
      const mentionKey = (item.mentionKey || '').toLowerCase();
      const email = item.email.toLowerCase();
      return nickname.includes(query) || mentionKey.includes(query) || email.includes(query);
    });
  }, [isSharedCard, activeMention, normalizedMentionCandidates]);

  useEffect(() => {
    if (todo) {
      setContent(todo.content);
      setDueAt(toDateTimeLocalInputValue(todo.dueAt));
      setExecuteAt(toDateTimeLocalInputValue(todo.executeAt));
      setSelectedTagIds((Array.isArray(todo.tags) ? todo.tags : []).map((t) => t.id));
      setActiveMention(null);
      setMentionAnchor(null);
      setHighlightedMentionIndex(0);
      return;
    }

    setContent('');
    setDueAt('');
    setExecuteAt('');
    setSelectedTagIds(defaultTagIds);
    setNewTagName('');
    setActiveMention(null);
    setMentionAnchor(null);
    setHighlightedMentionIndex(0);
  }, [todo, defaultTagIds]);

  useEffect(() => {
    if (highlightedMentionIndex >= filteredMentionCandidates.length) {
      setHighlightedMentionIndex(0);
    }
  }, [filteredMentionCandidates.length, highlightedMentionIndex]);

  const updateMentionStateByCursor = (text: string, cursor: number) => {
    if (!isSharedCard) {
      setActiveMention(null);
      setMentionAnchor(null);
      return;
    }

    const detected = detectActiveMention(text, cursor);
    setActiveMention(detected);
    if (detected) {
      if (textareaRef.current) {
        setMentionAnchor(getMentionAnchor(textareaRef.current, cursor));
      }
      setHighlightedMentionIndex(0);
      return;
    }
    setMentionAnchor(null);
  };

  const applyMention = (candidate: CardParticipant & { mentionKey: string }) => {
    if (!activeMention) {
      return;
    }
    const before = content.slice(0, activeMention.start);
    const after = content.slice(activeMention.end);
    const inserted = `@${candidate.mentionKey} `;
    const nextContent = `${before}${inserted}${after}`;
    const nextCursor = before.length + inserted.length;

    setContent(nextContent);
    setActiveMention(null);
    setMentionAnchor(null);
    setHighlightedMentionIndex(0);

    requestAnimationFrame(() => {
      if (!textareaRef.current) {
        return;
      }
      textareaRef.current.focus();
      textareaRef.current.setSelectionRange(nextCursor, nextCursor);
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim()) return;

    if (todo) {
      const data: UpdateTodoDto = {
        content: content.trim(),
        dueAt: dueAt || undefined,
        executeAt: executeAt || undefined,
        tagIds: selectedTagIds,
      };
      onSave(data);
      return;
    }

    const data: CreateTodoDto = {
      content: content.trim(),
      dueAt: dueAt || undefined,
      executeAt: executeAt || undefined,
      tagIds: selectedTagIds,
      cardId: card?.id,
    };
    onSave(data);
  };

  const toggleTag = (tagId: string) => {
    setSelectedTagIds((prev) => (prev.includes(tagId) ? prev.filter((id) => id !== tagId) : [...prev, tagId]));
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

  const handleTextareaChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    const text = event.target.value;
    setContent(text);
    updateMentionStateByCursor(text, event.target.selectionStart);
  };

  const handleTextareaClickOrKeyUp = (event: React.KeyboardEvent<HTMLTextAreaElement> | React.MouseEvent<HTMLTextAreaElement>) => {
    if ('key' in event) {
      const navKeys = new Set(['ArrowDown', 'ArrowUp', 'Enter', 'Escape']);
      if (navKeys.has(event.key) && activeMention) {
        return;
      }
    }
    const target = event.currentTarget;
    updateMentionStateByCursor(target.value, target.selectionStart);
  };

  const handleTextareaKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (!activeMention || filteredMentionCandidates.length === 0) {
      if (event.key === 'Escape') {
        setActiveMention(null);
      }
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setHighlightedMentionIndex((prev) => (prev + 1) % filteredMentionCandidates.length);
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setHighlightedMentionIndex((prev) => (prev - 1 + filteredMentionCandidates.length) % filteredMentionCandidates.length);
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      const targetCandidate = filteredMentionCandidates[highlightedMentionIndex] ?? filteredMentionCandidates[0];
      if (targetCandidate) {
        applyMention(targetCandidate);
      }
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      setActiveMention(null);
    }
  };

  return (
    <div className="overlay open" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">{todo ? '编辑待办' : '新建待办'}</div>
          <button className="modal-close" onClick={onClose}>
            ×
          </button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            <div className="mb">
              <label>待办内容</label>
              <div className="mention-editor">
                <textarea
                  ref={textareaRef}
                  className="tx"
                  placeholder="输入待办内容..."
                  value={content}
                  onChange={handleTextareaChange}
                  onKeyDown={handleTextareaKeyDown}
                  onKeyUp={handleTextareaClickOrKeyUp}
                  onClick={handleTextareaClickOrKeyUp}
                  required
                />
                {isSharedCard && activeMention && (
                  <div
                    className="mention-dropdown"
                    style={mentionAnchor ? { left: `${mentionAnchor.left}px`, top: `${mentionAnchor.top + 6}px` } : undefined}
                  >
                    {filteredMentionCandidates.length === 0 ? (
                      <div className="mention-empty">无匹配参与人员</div>
                    ) : (
                      filteredMentionCandidates.map((candidate, index) => (
                        <button
                          key={candidate.id}
                          type="button"
                          className={`mention-option ${index === highlightedMentionIndex ? 'active' : ''}`}
                          onMouseDown={(e) => {
                            e.preventDefault();
                            applyMention(candidate);
                          }}
                        >
                          <span>{candidate.mentionKey}</span>
                          <small>{candidate.nickname ? `${candidate.nickname} · ${candidate.email}` : candidate.email}</small>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
              {isSharedCard && <div className="mention-hint">输入 `@` 后可选择共享卡片参与人员，按回车确认。</div>}
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
            <div className="fr">
              <div className="mb">
                <label>截止时间</label>
                <input type="datetime-local" value={dueAt} onChange={(e) => setDueAt(e.target.value)} />
              </div>
              <div className="mb">
                <label>执行时间</label>
                <input type="datetime-local" value={executeAt} onChange={(e) => setExecuteAt(e.target.value)} />
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
