import { useEffect, useMemo, useRef, useState, type ComponentType } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import GridLayout from 'react-grid-layout';
import axios from 'axios';
import { useAuthStore } from '../store/authStore';
import { todosApi, type CreateTodoDto, type UpdateTodoDto } from '../api/todos';
import { cardsApi, type CreateCardDto, type UpdateCardDto } from '../api/cards';
import { reportsApi, type AiReportResult } from '../api/reports';
import { tagsApi, type CreateTagDto, type UpdateTagDto } from '../api/tags';
import { usersApi } from '../api/users';
import type { Todo, Card, TodoProgressEntry } from '../types';
import { Header } from '../components/Header';
import { TodoCard } from '../components/TodoCard';
import { CardModal } from '../components/CardModal';
import { TodoModal } from '../components/TodoModal';
import { TagModal } from '../components/TagModal';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import './DashboardPage.css';

function formatDateInput(date: Date): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getDefaultLastWeekRange(): { startDate: string; endDate: string } {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const dayOfWeek = now.getDay();
  const daysSinceMonday = (dayOfWeek + 6) % 7;

  const currentWeekMonday = new Date(now);
  currentWeekMonday.setDate(currentWeekMonday.getDate() - daysSinceMonday);

  const lastWeekMonday = new Date(currentWeekMonday);
  lastWeekMonday.setDate(lastWeekMonday.getDate() - 7);

  const lastWeekSunday = new Date(currentWeekMonday);
  lastWeekSunday.setDate(lastWeekSunday.getDate() - 1);

  return {
    startDate: formatDateInput(lastWeekMonday),
    endDate: formatDateInput(lastWeekSunday),
  };
}

function toRangeBoundaryIso(dateText: string, boundary: 'start' | 'end'): string {
  const date = new Date(`${dateText}T00:00:00`);
  if (boundary === 'end') {
    date.setHours(23, 59, 59, 999);
  } else {
    date.setHours(0, 0, 0, 0);
  }
  return date.toISOString();
}

interface GridLayoutItem {
  i: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

const GridLayoutComponent = GridLayout as unknown as ComponentType<Record<string, unknown>>;

export function DashboardPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const logout = useAuthStore((state) => state.logout);
  const user = useAuthStore((state) => state.user);
  const updateUser = useAuthStore((state) => state.updateUser);

  const [showTodoModal, setShowTodoModal] = useState(false);
  const [showCardModal, setShowCardModal] = useState(false);
  const [showTagModal, setShowTagModal] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [showGoalModal, setShowGoalModal] = useState(false);
  const [showProgressModal, setShowProgressModal] = useState(false);
  const [showAiReportModal, setShowAiReportModal] = useState(false);
  const [nicknameDraft, setNicknameDraft] = useState('');
  const [goalDraft, setGoalDraft] = useState('');
  const [progressDraft, setProgressDraft] = useState('');
  const [editingTodo, setEditingTodo] = useState<Todo | null>(null);
  const [editingCard, setEditingCard] = useState<Card | null>(null);
  const [activeTodoCard, setActiveTodoCard] = useState<Card | null>(null);
  const [activeProgressTodo, setActiveProgressTodo] = useState<Todo | null>(null);
  const defaultLastWeekRange = getDefaultLastWeekRange();
  const [reportStartDate, setReportStartDate] = useState(defaultLastWeekRange.startDate);
  const [reportEndDate, setReportEndDate] = useState(defaultLastWeekRange.endDate);
  const [aiReportResult, setAiReportResult] = useState<AiReportResult | null>(null);
  const [pendingDeleteCardId, setPendingDeleteCardId] = useState<string | null>(null);
  const [defaultTagIds, setDefaultTagIds] = useState<string[]>([]);
  const CARD_H = 3;
  const CARD_W = 4;
  const BASE_CARD_WIDTH = 380;
  const GRID_ROW_HEIGHT = 150;
  const GRID_MARGIN: [number, number] = [10, 10];
  const [gridWidth, setGridWidth] = useState<number>(Math.max(320, window.innerWidth - 48));
  const gridContainerRef = useRef<HTMLDivElement | null>(null);

  const getErrorMessage = (error: unknown, fallback: string) => {
    if (axios.isAxiosError(error)) {
      const message = (error.response?.data as { message?: string } | undefined)?.message;
      if (message) {
        return message;
      }
    }
    return fallback;
  };

  useEffect(() => {
    const updateGridWidth = () => {
      const container = gridContainerRef.current;
      if (!container) {
        setGridWidth(Math.max(320, window.innerWidth - 48));
        return;
      }
      const measured = Math.floor(container.getBoundingClientRect().width);
      setGridWidth(Math.max(320, measured));
    };

    updateGridWidth();
    const container = gridContainerRef.current;
    if (!container || typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', updateGridWidth);
      return () => window.removeEventListener('resize', updateGridWidth);
    }

    const observer = new ResizeObserver(() => updateGridWidth());
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  const gridCols = useMemo(() => {
    const cardsPerRow = Math.max(1, Math.round(gridWidth / BASE_CARD_WIDTH));
    return cardsPerRow * CARD_W;
  }, [gridWidth]);

  const { data: todos = [], isLoading: todosLoading } = useQuery({
    queryKey: ['todos'],
    queryFn: () => todosApi.getAll().then((res) => res.data),
  });

  const { data: cards = [], isLoading: cardsLoading } = useQuery({
    queryKey: ['cards'],
    queryFn: () => cardsApi.getAll().then((res) => res.data),
  });


  const remoteCardsKey = (Array.isArray(cards) ? cards : [])
    .filter((card: Card) => card.pluginType === 'tapd' || card.cardType === 'shared')
    .map((card: Card) => `${card.id}:${card.updatedAt}`)
    .sort()
    .join('|');

  const { data: remoteCardTodos = {} } = useQuery({
    queryKey: ['card-todos', remoteCardsKey],
    enabled: (Array.isArray(cards) ? cards : []).some((card: Card) => card.pluginType === 'tapd' || card.cardType === 'shared'),
    queryFn: async () => {
      const targetCards = (Array.isArray(cards) ? cards : []).filter((card: Card) => card.pluginType === 'tapd' || card.cardType === 'shared');
      const settled = await Promise.allSettled(
        targetCards.map(async (card: Card) => {
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

  const { data: tags = [] } = useQuery({
    queryKey: ['tags'],
    queryFn: () => tagsApi.getAll().then((res) => res.data),
  });

  const { data: meProfile } = useQuery({
    queryKey: ['me'],
    enabled: !!user,
    queryFn: () => usersApi.getMe().then((res) => res.data),
  });

  const { data: todoProgressEntries = [] } = useQuery({
    queryKey: ['todo-progress', activeProgressTodo?.id],
    enabled: !!activeProgressTodo?.id && showProgressModal,
    queryFn: () => todosApi.getProgress(activeProgressTodo!.id).then((res) => res.data as TodoProgressEntry[]),
  });

  useEffect(() => {
    if (meProfile) {
      updateUser(meProfile);
    }
  }, [meProfile, updateUser]);

  const createTodoMutation = useMutation({
    mutationFn: (data: CreateTodoDto) => todosApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['todos'] });
      queryClient.invalidateQueries({ queryKey: ['card-todos'] });
      setShowTodoModal(false);
      setActiveTodoCard(null);
    },
  });

  const updateTodoMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateTodoDto }) =>
      todosApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['todos'] });
      queryClient.invalidateQueries({ queryKey: ['card-todos'] });
      setShowTodoModal(false);
      setEditingTodo(null);
      setActiveTodoCard(null);
    },
  });

  const deleteTodoMutation = useMutation({
    mutationFn: (id: string) => todosApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['todos'] });
      queryClient.invalidateQueries({ queryKey: ['card-todos'] });
    },
  });

  const toggleTodoMutation = useMutation({
    mutationFn: ({ id, completed }: { id: string; completed: boolean }) => todosApi.toggleStatus(id, completed),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['todos'] });
      queryClient.invalidateQueries({ queryKey: ['card-todos'] });
    },
  });

  const createProgressMutation = useMutation({
    mutationFn: ({ id, content }: { id: string; content: string }) =>
      todosApi.createProgress(id, { content }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['todos'] });
      queryClient.invalidateQueries({ queryKey: ['card-todos'] });
      queryClient.invalidateQueries({ queryKey: ['todo-progress', activeProgressTodo?.id] });
      setProgressDraft('');
      setShowProgressModal(false);
      setActiveProgressTodo(null);
    },
  });

  const generateAiReportMutation = useMutation({
    mutationFn: ({ startDate, endDate }: { startDate: string; endDate: string }) =>
      reportsApi.generateAiReport({
        startAt: toRangeBoundaryIso(startDate, 'start'),
        endAt: toRangeBoundaryIso(endDate, 'end'),
      }),
    onSuccess: (res) => {
      setAiReportResult(res.data);
    },
  });

  const createCardMutation = useMutation({
    mutationFn: (data: CreateCardDto) => cardsApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cards'] });
      queryClient.invalidateQueries({ queryKey: ['card-todos'] });
      setShowCardModal(false);
    },
    onError: (error: unknown) => {
      alert(getErrorMessage(error, '创建卡片失败'));
    },
  });

  const updateCardMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateCardDto }) =>
      cardsApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cards'] });
      queryClient.invalidateQueries({ queryKey: ['card-todos'] });
      setShowCardModal(false);
      setEditingCard(null);
    },
    onError: (error: unknown) => {
      alert(getErrorMessage(error, '更新卡片失败'));
    },
  });

  const deleteCardMutation = useMutation({
    mutationFn: (id: string) => cardsApi.delete(id),
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: ['card-todos'] });
      queryClient.invalidateQueries({ queryKey: ['cards'] });
    },
  });

  const updateCardLayoutMutation = useMutation({
    mutationFn: ({ id, layout }: { id: string; layout: { i: string; x: number; y: number; w: number; h: number } }) =>
      cardsApi.updateLayout(id, { x: layout.x, y: layout.y, w: layout.w, h: layout.h }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cards'] });
    },
  });

  const createTagMutation = useMutation({
    mutationFn: (data: CreateTagDto) => tagsApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tags'] });
    },
  });

  const updateTagMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateTagDto }) =>
      tagsApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tags'] });
    },
  });

  const deleteTagMutation = useMutation({
    mutationFn: (id: string) => tagsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tags'] });
    },
  });

  const updateProfileMutation = useMutation({
    mutationFn: (data: { target?: string; nickname?: string }) => usersApi.updateMe(data),
    onSuccess: (res) => {
      updateUser(res.data);
      queryClient.invalidateQueries({ queryKey: ['me'] });
      setShowProfileModal(false);
      setShowGoalModal(false);
    },
  });

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const handleOpenTodoModal = (todo?: Todo, card?: Card) => {
    if (card) {
      const ids = (Array.isArray(card.tags) ? card.tags : []).map((t) => t.id);
      setDefaultTagIds(ids);
      setActiveTodoCard(card);
    } else {
      setDefaultTagIds([]);
      setActiveTodoCard(null);
    }
    setEditingTodo(todo || null);
    setShowTodoModal(true);
  };

  const handleOpenCardModal = (card?: Card) => {
    setEditingCard(card || null);
    setShowCardModal(true);
  };

  const handleSaveTodo = (data: CreateTodoDto | UpdateTodoDto) => {
    if (editingTodo) {
      updateTodoMutation.mutate({ id: editingTodo.id, data: data as UpdateTodoDto });
    } else {
      const createPayload: CreateTodoDto = {
        ...(data as CreateTodoDto),
        cardId: activeTodoCard?.id,
      };
      createTodoMutation.mutate(createPayload);
    }
  };

  const handleSaveCard = (data: CreateCardDto | UpdateCardDto) => {
    if (editingCard) {
      updateCardMutation.mutate({ id: editingCard.id, data: data as UpdateCardDto });
      return;
    }

    const DEFAULT_W = CARD_W;
    const DEFAULT_H = CARD_H;
    const COLS = gridCols;
    const sortedCards = [...(Array.isArray(cards) ? cards : [])].sort((a, b) =>
      a.y === b.y ? a.x - b.x : a.y - b.y
    );

    let nextX = 0;
    let nextY = 0;
    if (sortedCards.length > 0) {
      const last = sortedCards[sortedCards.length - 1];
      const lastW = last.w || DEFAULT_W;
      const lastH = last.h || DEFAULT_H;
      nextX = (last.x || 0) + lastW;
      nextY = last.y || 0;
      if (nextX + DEFAULT_W > COLS) {
        nextX = 0;
        nextY = (last.y || 0) + lastH;
      }
    }

    createCardMutation.mutate({
      ...(data as CreateCardDto),
      x: nextX,
      y: nextY,
      w: DEFAULT_W,
      h: DEFAULT_H,
    });
  };

  const handleSaveTag = (data: CreateTagDto | UpdateTagDto, id?: string) => {
    if (id) {
      updateTagMutation.mutate({ id, data: data as UpdateTagDto });
    } else {
      createTagMutation.mutate(data as CreateTagDto);
    }
  };

  const handleDeleteTodo = (id: string) => {
    if (confirm('确定要删除这个待办吗？')) {
      deleteTodoMutation.mutate(id);
    }
  };

  const handleToggleTodo = (id: string, currentStatus: string) => {
    const completed = currentStatus !== 'done';
    toggleTodoMutation.mutate({ id, completed });
  };

  const handleOpenProgressModal = (todo: Todo) => {
    setActiveProgressTodo(todo);
    setProgressDraft('');
    setShowProgressModal(true);
  };

  const handleSaveProgress = () => {
    if (!activeProgressTodo) return;
    const content = progressDraft.trim();
    if (!content) {
      alert('请输入进度内容');
      return;
    }
    createProgressMutation.mutate({ id: activeProgressTodo.id, content });
  };

  const handleOpenAiReportModal = () => {
    const lastWeekRange = getDefaultLastWeekRange();
    setReportStartDate(lastWeekRange.startDate);
    setReportEndDate(lastWeekRange.endDate);
    setAiReportResult(null);
    setShowAiReportModal(true);
  };

  const handleGenerateAiReport = () => {
    if (!reportStartDate || !reportEndDate) {
      alert('请选择完整的时间段');
      return;
    }
    if (reportStartDate > reportEndDate) {
      alert('开始日期不能晚于结束日期');
      return;
    }
    setAiReportResult(null);
    generateAiReportMutation.mutate({
      startDate: reportStartDate,
      endDate: reportEndDate,
    });
  };

  const handleDeleteCard = (id: string) => {
    setPendingDeleteCardId(id);
  };

  const confirmDeleteCard = () => {
    if (!pendingDeleteCardId) return;
    deleteCardMutation.mutate(pendingDeleteCardId);
    setPendingDeleteCardId(null);
  };

  const handleDeleteTag = (id: string) => {
    if (confirm('确定要删除这个标签吗？')) {
      deleteTagMutation.mutate(id);
    }
  };

  const handleSaveGoal = () => {
    const nextTarget = goalDraft.trim().slice(0, 100);
    updateProfileMutation.mutate({ target: nextTarget });
  };

  const handleSaveProfile = () => {
    const nextNickname = nicknameDraft.trim().slice(0, 100);
    updateProfileMutation.mutate({ nickname: nextNickname });
  };

  const handleDragStop = (
    _layout: readonly GridLayoutItem[],
    _oldItem: GridLayoutItem | null,
    newItem: GridLayoutItem | null,
  ) => {
    if (!newItem) return;
    const card = cards.find((c: Card) => c.id === newItem.i);
    if (!card) return;
    if (card.x === newItem.x && card.y === newItem.y) return;

    updateCardLayoutMutation.mutate({
      id: newItem.i,
      layout: {
        i: newItem.i,
        x: newItem.x,
        y: newItem.y,
        w: card.w || CARD_W,
        h: CARD_H,
      },
    });
  };

  const getTodosForCard = (card: Card) => {
    if (card.pluginType === 'tapd' || card.cardType === 'shared') {
      return remoteCardTodos[card.id] || [];
    }
    if (!card.tags?.length) return todos;
    const cardTagIds = (Array.isArray(card.tags) ? card.tags : []).map((t) => t.id);
    return todos.filter((todo) =>
      (Array.isArray(todo.tags) ? todo.tags : []).some((tag) => cardTagIds.includes(tag.id))
    );
  };

  const gridLayout = useMemo(() => {
    const orderedCards = [...(Array.isArray(cards) ? cards : [])].sort((a, b) =>
      a.y === b.y ? a.x - b.x : a.y - b.y
    );

    return orderedCards.reduce<Array<{
      i: string;
      x: number;
      y: number;
      w: number;
      h: number;
      minW: number;
      minH: number;
      maxH: number;
    }>>((items, card) => {
      const last = items[items.length - 1];
      const nextXBase = last ? last.x + last.w : 0;
      const nextYBase = last ? last.y : 0;
      const normalizedW = Math.min(card.w || CARD_W, gridCols);
      const wraps = nextXBase + normalizedW > gridCols;
      const x = wraps ? 0 : nextXBase;
      const y = wraps ? nextYBase + CARD_H : nextYBase;

      items.push({
        i: card.id,
        x,
        y,
        w: normalizedW,
        h: CARD_H,
        minW: 2,
        minH: CARD_H,
        maxH: CARD_H,
      });
      return items;
    }, []);
  }, [cards, gridCols]);

  if (todosLoading || cardsLoading) {
    return <div className="loading">加载中...</div>;
  }

  return (
    <div className="dashboard">
      <Header
        user={user}
        currentTarget={user?.target?.trim() || ''}
        onLogout={handleLogout}
        onNewTodo={() => handleOpenTodoModal()}
        onNewCard={() => handleOpenCardModal()}
        onOpenAiReport={handleOpenAiReportModal}
        onOpenTags={() => setShowTagModal(true)}
        onOpenProfileSettings={() => {
          setNicknameDraft(user?.nickname?.trim() || '');
          setShowProfileModal(true);
        }}
        onOpenGoalSettings={() => {
          setGoalDraft(user?.target || '');
          setShowGoalModal(true);
        }}
      />

      <main className="main">
        <div ref={gridContainerRef}>
        <GridLayoutComponent
          key={`grid-${gridCols}-${cards.map((c: Card) => `${c.id}:${c.x}:${c.y}`).join("|")}`}
          autoSize
          className="layout"
          layout={gridLayout}
          width={gridWidth}
          gridConfig={{
            cols: gridCols,
            rowHeight: GRID_ROW_HEIGHT,
            margin: GRID_MARGIN,
          }}
          dragConfig={{
            handle: '.card-header',
            cancel: '.card-actions, .card-actions button',
          }}
          resizeConfig={{
            enabled: false,
          }}
          onDragStop={handleDragStop}
        >
          {(Array.isArray(cards) ? cards : []).map((card: Card) => (
            <div key={card.id} className="grid-card-inner">
              {(() => {
                const cardTodos = getTodosForCard(card);
                const isCardOwner = card.userId === user?.id;
                return (
              <div className="card">
                <div className="card-header">
                  <div className="card-title">
                    {card.name}{card.cardType === 'shared' ? ' · 共享' : ''}
                    <span className="count">{cardTodos.length}</span>
                  </div>
                  <div className="card-actions">
                    {isCardOwner && (
                      <button onMouseDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); handleOpenTodoModal(undefined, card); }} title="添加待办">+</button>
                    )}
                    {isCardOwner && (
                      <button onMouseDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); handleOpenCardModal(card); }}>✎</button>
                    )}
                    {isCardOwner && (
                      <button onMouseDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); handleDeleteCard(card.id); }}>🗑</button>
                    )}
                  </div>
                </div>
                <div className="card-body">
                  {(Array.isArray(cardTodos) ? cardTodos : []).map((todo: Todo) => (
                    <TodoCard
                      key={todo.id}
                      todo={todo}
                      tags={tags}
                      onToggle={() => handleToggleTodo(todo.id, todo.status)}
                      onEdit={() => {
                        if (card.pluginType === 'tapd') return;
                        if (card.cardType === 'shared' && card.userId !== user?.id) return;
                        handleOpenTodoModal(todo, card);
                      }}
                      onDelete={() => handleDeleteTodo(todo.id)}
                      canUpdateProgress={card.pluginType !== 'tapd'}
                      onOpenProgress={() => handleOpenProgressModal(todo)}
                    />
                  ))}
              </div>
            </div>
                );
              })()}
            </div>
          ))}
        </GridLayoutComponent>
        </div>
      </main>

      {showTodoModal && (
        <TodoModal
          todo={editingTodo}
          card={activeTodoCard}
          tags={tags}
          mentionCandidates={activeTodoCard?.participants ?? []}
          onSave={handleSaveTodo}
          onCreateTag={async (name, color) => {
            const res = await createTagMutation.mutateAsync({ name, color });
            return res.data;
          }}
          defaultTagIds={defaultTagIds}
          onClose={() => {
            setShowTodoModal(false);
            setEditingTodo(null);
            setActiveTodoCard(null);
          }}
        />
      )}

      {showCardModal && (
        <CardModal
          card={editingCard}
          cards={cards}
          tags={tags}
          onSave={handleSaveCard}
          onCreateTag={async (name, color) => {
            const res = await createTagMutation.mutateAsync({ name, color });
            return res.data;
          }}
          onClose={() => {
            setShowCardModal(false);
            setEditingCard(null);
          }}
        />
      )}

      {showProgressModal && activeProgressTodo && (
        <div className="overlay open" onClick={() => { setShowProgressModal(false); setActiveProgressTodo(null); }}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title">更新进度</div>
              <button className="modal-close" onClick={() => { setShowProgressModal(false); setActiveProgressTodo(null); }}>×</button>
            </div>
            <div className="modal-body">
              <div className="progress-todo-title">{activeProgressTodo.content}</div>
              <textarea
                className="goal-input"
                rows={4}
                maxLength={2000}
                placeholder="输入当前进度，例如：已完成接口联调，待补充异常处理。"
                value={progressDraft}
                onChange={(e) => setProgressDraft(e.target.value)}
              />
              <div className="goal-meta">
                <span>本地待办可更新进度，第三方待办不支持。</span>
                <span>{progressDraft.length}/2000</span>
              </div>

              <div className="progress-history">
                <div className="progress-history-title">最近进度记录</div>
                {(Array.isArray(todoProgressEntries) ? todoProgressEntries : []).length === 0 ? (
                  <div className="progress-history-empty">暂无记录</div>
                ) : (
                  (Array.isArray(todoProgressEntries) ? todoProgressEntries : []).map((entry) => (
                    <div key={entry.id} className="progress-history-item">
                      <div className="progress-history-time">{new Date(entry.createdAt).toLocaleString('zh-CN')}</div>
                      <div className="progress-history-content">{entry.content}</div>
                    </div>
                  ))
                )}
              </div>
            </div>
            <div className="modal-footer">
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => {
                  setShowProgressModal(false);
                  setActiveProgressTodo(null);
                }}
                disabled={createProgressMutation.isPending}
              >
                取消
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleSaveProgress}
                disabled={createProgressMutation.isPending}
              >
                {createProgressMutation.isPending ? '保存中...' : '保存进度'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showAiReportModal && (
        <div className="overlay open" onClick={() => setShowAiReportModal(false)}>
          <div className="modal ai-report-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title">AI报告</div>
              <button className="modal-close" onClick={() => setShowAiReportModal(false)}>×</button>
            </div>
            <div className="modal-body">
              <div className="report-period-row">
                <div className="report-period-field">
                  <label htmlFor="report-start-date">开始日期</label>
                  <input
                    id="report-start-date"
                    className="goal-input report-date-input"
                    type="date"
                    value={reportStartDate}
                    onChange={(e) => setReportStartDate(e.target.value)}
                  />
                </div>
                <div className="report-period-field">
                  <label htmlFor="report-end-date">结束日期</label>
                  <input
                    id="report-end-date"
                    className="goal-input report-date-input"
                    type="date"
                    value={reportEndDate}
                    onChange={(e) => setReportEndDate(e.target.value)}
                  />
                </div>
              </div>
              <div className="report-hint">默认时间段为上周（周一到周日）。</div>
              {aiReportResult && (
                <div className="report-result">
                  <div className="report-meta">
                    <span>来源：iFlow</span>
                    <span>待办数：{aiReportResult.todoCount}</span>
                    <span>进度条数：{aiReportResult.progressCount}</span>
                  </div>
                  <pre>{aiReportResult.report}</pre>
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-outline" onClick={() => setShowAiReportModal(false)}>
                关闭
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleGenerateAiReport}
                disabled={generateAiReportMutation.isPending}
              >
                {generateAiReportMutation.isPending ? '生成中...' : '生成报告'}
              </button>
            </div>
          </div>
        </div>
      )}


      {pendingDeleteCardId && (
        <div className="overlay open" onClick={() => setPendingDeleteCardId(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title">删除卡片</div>
              <button className="modal-close" onClick={() => setPendingDeleteCardId(null)}>×</button>
            </div>
            <div className="modal-body">确定要删除这个卡片吗？</div>
            <div className="modal-footer">
              <button type="button" className="btn btn-outline" onClick={() => setPendingDeleteCardId(null)}>取消</button>
              <button type="button" className="btn btn-primary" onClick={confirmDeleteCard}>删除</button>
            </div>
          </div>
        </div>
      )}

      {showTagModal && (
        <TagModal
          tags={tags}
          onSave={handleSaveTag}
          onDelete={handleDeleteTag}
          onClose={() => setShowTagModal(false)}
        />
      )}

      {showProfileModal && (
        <div className="overlay open" onClick={() => setShowProfileModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title">个人信息</div>
              <button className="modal-close" onClick={() => setShowProfileModal(false)}>×</button>
            </div>
            <div className="modal-body">
              <label className="goal-label" htmlFor="nickname-input">昵称（最多 100 字）</label>
              <input
                id="nickname-input"
                className="goal-input"
                maxLength={100}
                placeholder="用于共享卡片 @ 提及展示"
                value={nicknameDraft}
                onChange={(e) => setNicknameDraft(e.target.value)}
              />
              <div className="goal-meta">
                <span>留空后保存将恢复为邮箱前缀显示</span>
                <span>{nicknameDraft.length}/100</span>
              </div>
            </div>
            <div className="modal-footer">
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => setShowProfileModal(false)}
                disabled={updateProfileMutation.isPending}
              >
                取消
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleSaveProfile}
                disabled={updateProfileMutation.isPending}
              >
                {updateProfileMutation.isPending ? '保存中...' : '保存'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showGoalModal && (
        <div className="overlay open" onClick={() => setShowGoalModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title">设置当前目标</div>
              <button className="modal-close" onClick={() => setShowGoalModal(false)}>×</button>
            </div>
            <div className="modal-body">
              <label className="goal-label" htmlFor="goal-input">目标内容（最多 100 字）</label>
              <textarea
                id="goal-input"
                className="goal-input"
                maxLength={100}
                rows={4}
                placeholder="例如：本周完成支付模块联调并上线灰度。"
                value={goalDraft}
                onChange={(e) => setGoalDraft(e.target.value)}
              />
              <div className="goal-meta">
                <span>留空后保存可清空目标</span>
                <span>{goalDraft.length}/100</span>
              </div>
            </div>
            <div className="modal-footer">
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => setShowGoalModal(false)}
                disabled={updateProfileMutation.isPending}
              >
                取消
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleSaveGoal}
                disabled={updateProfileMutation.isPending}
              >
                {updateProfileMutation.isPending ? '保存中...' : '保存'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
