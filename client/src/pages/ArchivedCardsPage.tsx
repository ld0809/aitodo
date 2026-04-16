import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { cardsApi } from '../api/cards';
import { todosApi } from '../api/todos';
import { Header } from '../components/Header';
import { ProgressModal } from '../components/ProgressModal';
import { TodoCard } from '../components/TodoCard';
import { Button } from '../components/ui/Button';
import { getTodosForCard } from '../lib/cardTodos';
import { sortTodosForCardDisplay } from '../lib/todoSort';
import { useAuthStore } from '../store/authStore';
import type { Card, Todo, TodoProgressEntry } from '../types';
import './DashboardPage.css';
import './ArchivedCardsPage.css';

const ARCHIVED_VIEWPORT = 'desktop_normal' as const;

export function ArchivedCardsPage() {
  const navigate = useNavigate();
  const logout = useAuthStore((state) => state.logout);
  const user = useAuthStore((state) => state.user);
  const [activeProgressTodo, setActiveProgressTodo] = useState<Todo | null>(null);
  const [showProgressModal, setShowProgressModal] = useState(false);

  const { data: archivedCards = [], isLoading } = useQuery({
    queryKey: ['cards', user?.id ?? 'anonymous', 'archived'],
    enabled: !!user,
    queryFn: () => cardsApi.getAll(ARCHIVED_VIEWPORT, 'archived').then((res) => res.data),
  });

  const { data: todos = [] } = useQuery({
    queryKey: ['todos', user?.id ?? 'anonymous'],
    enabled: !!user,
    queryFn: () => todosApi.getAll().then((res) => res.data),
  });

  const remoteCardsKey = archivedCards
    .filter((card) => card.pluginType === 'tapd' || card.cardType === 'shared')
    .map((card) => `${card.id}:${card.updatedAt}`)
    .sort()
    .join('|');

  const { data: remoteCardTodos = {} } = useQuery({
    queryKey: ['archived-card-todos', user?.id ?? 'anonymous', remoteCardsKey],
    enabled: !!user && archivedCards.some((card) => card.pluginType === 'tapd' || card.cardType === 'shared'),
    queryFn: async () => {
      const settled = await Promise.allSettled(
        archivedCards
          .filter((card) => card.pluginType === 'tapd' || card.cardType === 'shared')
          .map(async (card) => {
            const res = await cardsApi.getTodos(card.id);
            return [card.id, Array.isArray(res.data) ? res.data : []] as const;
          }),
      );

      const entries = settled
        .filter((item): item is PromiseFulfilledResult<readonly [string, Todo[]]> => item.status === 'fulfilled')
        .map((item) => item.value);

      return Object.fromEntries(entries) as Record<string, Todo[]>;
    },
  });

  const { data: todoProgressEntries = [] } = useQuery({
    queryKey: ['archived-todo-progress', user?.id ?? 'anonymous', activeProgressTodo?.id],
    enabled: !!user && !!activeProgressTodo?.id && showProgressModal,
    queryFn: () => todosApi.getProgress(activeProgressTodo!.id).then((res) => res.data as TodoProgressEntry[]),
  });

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const handleOpenProgressModal = (todo: Todo) => {
    setActiveProgressTodo(todo);
    setShowProgressModal(true);
  };

  return (
    <div className="archived-cards-page">
      <Header
        user={user}
        currentTarget={user?.target?.trim() || ''}
        onLogout={handleLogout}
        onNewTodo={() => navigate('/dashboard')}
        onNewCard={() => navigate('/dashboard')}
        onOpenAiReport={() => navigate('/dashboard')}
        onOpenTags={() => navigate('/dashboard')}
        onOpenArchivedCards={() => navigate('/archived-cards')}
        onOpenProfileSettings={() => navigate('/settings/profile')}
        onOpenOrganizationSettings={() => navigate('/settings/organizations')}
        onOpenGoalSettings={() => navigate('/dashboard')}
      />

      <main className="archived-cards-main">
        <div className="archived-cards-topbar">
          <div>
            <h1>我的归档卡片</h1>
            <p>这里只展示你创建并已归档的卡片。</p>
          </div>
          <Button size="sm" variant="secondary" onClick={() => navigate('/dashboard')}>
            返回看板
          </Button>
        </div>

        {isLoading ? (
          <div className="archived-cards-empty">加载中...</div>
        ) : archivedCards.length === 0 ? (
          <div className="archived-cards-empty">暂无归档卡片</div>
        ) : (
          <div className="archived-card-board">
            {archivedCards.map((card: Card) => {
              const cardTodos = sortTodosForCardDisplay(getTodosForCard(card, todos, remoteCardTodos));
              const cardTagIds = (Array.isArray(card.tags) ? card.tags : []).map((tag) => tag.id);

              return (
                <div key={card.id} className="grid-card-inner">
                  <div className="card archived-card-panel">
                    <div className="card-header">
                      <div className="card-title">
                        <span className="card-title-text">
                          {card.name}
                          {card.cardType === 'shared' ? ' · 共享' : ''}
                          {' · 已归档'}
                        </span>
                        <span className="count">{cardTodos.length}</span>
                      </div>
                    </div>
                    <div className="card-body">
                      {cardTodos.length === 0 ? (
                        <div className="archived-card-empty">暂无待办</div>
                      ) : (
                        cardTodos.map((todo) => (
                          <TodoCard
                            key={todo.id}
                            todo={todo}
                            tags={[]}
                            currentUserId={user?.id}
                            hiddenTagIds={cardTagIds}
                            onToggle={() => {}}
                            onEdit={() => {}}
                            onDelete={() => {}}
                            showToggle={false}
                            canUpdateProgress
                            onOpenProgress={() => handleOpenProgressModal(todo)}
                            progressButtonTitle="查看进度"
                            readOnly
                          />
                        ))
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {showProgressModal && activeProgressTodo && (
        <ProgressModal
          todo={activeProgressTodo}
          entries={Array.isArray(todoProgressEntries) ? todoProgressEntries : []}
          draft=""
          onDraftChange={() => {}}
          readOnly
          onClose={() => {
            setShowProgressModal(false);
            setActiveProgressTodo(null);
          }}
        />
      )}
    </div>
  );
}
