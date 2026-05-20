import { useEffect, useMemo, useRef, useState } from 'react';
import type { Todo, TodoAiMessage, TodoAiSuggestion } from '../types';
import { Button } from './ui/Button';
import './TodoAiDrawer.css';

interface TodoAiDrawerProps {
  todo: Todo;
  messages: TodoAiMessage[];
  suggestions: TodoAiSuggestion[];
  draft: string;
  isLoading: boolean;
  isSending: boolean;
  applyingSuggestionId?: string | null;
  errorMessage?: string | null;
  onDraftChange: (value: string) => void;
  onSend: () => void;
  onApplySuggestion: (suggestionId: string) => void;
  onClose: () => void;
}

export function TodoAiDrawer({
  todo,
  messages,
  suggestions,
  draft,
  isLoading,
  isSending,
  applyingSuggestionId,
  errorMessage,
  onDraftChange,
  onSend,
  onApplySuggestion,
  onClose,
}: TodoAiDrawerProps) {
  const [expandedSuggestionId, setExpandedSuggestionId] = useState<string | null>(null);
  const messagesRef = useRef<HTMLDivElement | null>(null);
  const pendingSuggestions = useMemo(
    () => suggestions.filter((suggestion) => suggestion.status === 'pending'),
    [suggestions],
  );

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const node = messagesRef.current;
      if (node) {
        node.scrollTop = node.scrollHeight;
      }
    });

    return () => window.cancelAnimationFrame(frame);
  }, [isLoading, isSending, messages.length, suggestions.length, todo.id]);

  const handleSubmit = () => {
    if (!draft.trim() || isSending) {
      return;
    }
    onSend();
  };

  return (
    <div className="todo-ai-drawer-shell" role="dialog" aria-modal="true" aria-label="待办 AI 对话">
      <button type="button" className="todo-ai-drawer-backdrop" aria-label="关闭 AI 对话" onClick={onClose} />
      <aside className="todo-ai-drawer">
        <header className="todo-ai-drawer__header">
          <div>
            <div className="todo-ai-drawer__title">AI 对话</div>
            <div className="todo-ai-drawer__todo">{todo.content}</div>
          </div>
          <button type="button" className="todo-ai-drawer__close" aria-label="关闭 AI 对话" onClick={onClose}>
            x
          </button>
        </header>

        <div className="todo-ai-drawer__messages" ref={messagesRef}>
          {isLoading ? (
            <div className="todo-ai-drawer__empty">加载中...</div>
          ) : messages.length === 0 ? (
            <div className="todo-ai-drawer__empty">围绕这条待办开始一次 AI 对话。</div>
          ) : (
            messages.map((message) => (
              <div key={message.id} className={`todo-ai-message todo-ai-message--${message.role}`}>
                <div className="todo-ai-message__role">{message.role === 'user' ? '我' : 'AI'}</div>
                <div className="todo-ai-message__content">{message.content}</div>
              </div>
            ))
          )}
          {isSending && <div className="todo-ai-drawer__empty">AI 正在思考...</div>}
        </div>

        {pendingSuggestions.length > 0 && (
          <section className="todo-ai-suggestions">
            <div className="todo-ai-suggestions__title">可沉淀进度</div>
            {pendingSuggestions.map((suggestion) => {
              const expanded = expandedSuggestionId === suggestion.id;
              return (
                <div key={suggestion.id} className="todo-ai-suggestion">
                  <button
                    type="button"
                    className="todo-ai-suggestion__content"
                    onClick={() => setExpandedSuggestionId(expanded ? null : suggestion.id)}
                  >
                    {expanded ? suggestion.content : collapseText(suggestion.content)}
                  </button>
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={applyingSuggestionId === suggestion.id}
                    onClick={() => onApplySuggestion(suggestion.id)}
                  >
                    {applyingSuggestionId === suggestion.id ? '沉淀中' : '沉淀'}
                  </Button>
                </div>
              );
            })}
          </section>
        )}

        {errorMessage && <div className="todo-ai-drawer__error">{errorMessage}</div>}

        <footer className="todo-ai-drawer__composer">
          <textarea
            value={draft}
            maxLength={4000}
            placeholder="和 AI 讨论这条待办..."
            disabled={isSending}
            onChange={(event) => onDraftChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                event.preventDefault();
                handleSubmit();
              }
            }}
          />
          <Button variant="primary" onClick={handleSubmit} disabled={isSending || !draft.trim()}>
            {isSending ? '发送中' : '发送'}
          </Button>
        </footer>
      </aside>
    </div>
  );
}

function collapseText(value: string) {
  const normalized = value.trim();
  return normalized.length > 84 ? `${normalized.slice(0, 84)}...` : normalized;
}
