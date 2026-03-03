import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import GridLayout from 'react-grid-layout';
import { useAuthStore } from '../store/authStore';
import { todosApi, type CreateTodoDto, type UpdateTodoDto } from '../api/todos';
import { cardsApi, type CreateCardDto, type UpdateCardDto } from '../api/cards';
import { tagsApi, type CreateTagDto, type UpdateTagDto } from '../api/tags';
import { getRequirements, getBugs, type TapdRequirement, type TapdBug } from '../api/tapd';
import type { Todo, Card } from '../types';
import { Header } from '../components/Header';
import { TodoCard } from '../components/TodoCard';
import { CardModal } from '../components/CardModal';
import { TodoModal } from '../components/TodoModal';
import { TagModal } from '../components/TagModal';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import './DashboardPage.css';

export function DashboardPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const logout = useAuthStore((state) => state.logout);
  const user = useAuthStore((state) => state.user);

  const [showTodoModal, setShowTodoModal] = useState(false);
  const [showCardModal, setShowCardModal] = useState(false);
  const [showTagModal, setShowTagModal] = useState(false);
  const [editingTodo, setEditingTodo] = useState<Todo | null>(null);
  const [editingCard, setEditingCard] = useState<Card | null>(null);
  const [pendingDeleteCardId, setPendingDeleteCardId] = useState<string | null>(null);
  const [defaultTagIds, setDefaultTagIds] = useState<string[]>([]);
  const CARD_H = 3;
  const GRID_MARGIN_Y = 16;
  const [viewportHeight, setViewportHeight] = useState<number>(window.innerHeight);

  useEffect(() => {
    const onResize = () => setViewportHeight(window.innerHeight);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const adaptiveRowHeight = useMemo(() => {
    const headerHeight = 72;
    const mainPaddingTopBottom = 48;
    const safetyBuffer = 120;
    const availableHeight = Math.max(300, viewportHeight - headerHeight - mainPaddingTopBottom - safetyBuffer);
    const perCardHeight = (availableHeight - GRID_MARGIN_Y) / 2;
    const computed = Math.floor((perCardHeight - (CARD_H - 1) * GRID_MARGIN_Y) / CARD_H);
    return Math.max(28, Math.min(52, computed));
  }, [viewportHeight]);

  const { data: todos = [], isLoading: todosLoading } = useQuery({
    queryKey: ['todos'],
    queryFn: () => todosApi.getAll().then((res) => res.data),
  });

  const { data: cards = [], isLoading: cardsLoading } = useQuery({
    queryKey: ['cards'],
    queryFn: () => cardsApi.getAll().then((res) => res.data),
  });


  const { data: tapdCardTodos = {} } = useQuery({
    queryKey: ['tapd-card-todos', (Array.isArray(cards) ? cards : []).map((c: Card) => `${c.id}:${c.updatedAt}`).join('|')],
    enabled: (Array.isArray(cards) ? cards : []).some((card: Card) => card.pluginType === 'tapd'),
    queryFn: async () => {
      const tapdCards = (Array.isArray(cards) ? cards : []).filter((card: Card) => card.pluginType === 'tapd');
      const settled = await Promise.allSettled(
        tapdCards.map(async (card: Card) => {
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

  const createTodoMutation = useMutation({
    mutationFn: (data: CreateTodoDto) => todosApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['todos'] });
      setShowTodoModal(false);
    },
  });

  const updateTodoMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateTodoDto }) =>
      todosApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['todos'] });
      setShowTodoModal(false);
      setEditingTodo(null);
    },
  });

  const deleteTodoMutation = useMutation({
    mutationFn: (id: string) => todosApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['todos'] });
    },
  });

  const toggleTodoMutation = useMutation({
    mutationFn: ({ id, completed }: { id: string; completed: boolean }) => todosApi.toggleStatus(id, completed),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['todos'] });
    },
  });

  const createCardMutation = useMutation({
    mutationFn: (data: CreateCardDto) => cardsApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cards'] });
      queryClient.invalidateQueries({ queryKey: ['tapd-card-todos'] });
      setShowCardModal(false);
    },
  });

  const updateCardMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateCardDto }) =>
      cardsApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cards'] });
      queryClient.invalidateQueries({ queryKey: ['tapd-card-todos'] });
      setShowCardModal(false);
      setEditingCard(null);
    },
  });

  const deleteCardMutation = useMutation({
    mutationFn: (id: string) => cardsApi.delete(id),
    onSuccess: () => {
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

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const handleOpenTodoModal = (todo?: Todo, card?: Card) => {
    if (card) {
      const ids = (Array.isArray(card.tags) ? card.tags : []).map((t: any) => t.id);
      setDefaultTagIds(ids);
    } else {
      setDefaultTagIds([]);
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
      createTodoMutation.mutate(data as CreateTodoDto);
    }
  };

  const handleSaveCard = (data: CreateCardDto | UpdateCardDto) => {
    if (editingCard) {
      updateCardMutation.mutate({ id: editingCard.id, data: data as UpdateCardDto });
      return;
    }

    const DEFAULT_W = 4;
    const DEFAULT_H = CARD_H;
    const COLS = 12;
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

  const handleDragStop = (_layout: readonly any[], _oldItem: any, newItem: any) => {
    const card = cards.find((c: Card) => c.id === newItem.i);
    if (!card) return;
    if (card.x === newItem.x && card.y === newItem.y) return;

    updateCardLayoutMutation.mutate({
      id: newItem.i,
      layout: {
        i: newItem.i,
        x: newItem.x,
        y: newItem.y,
        w: card.w || 4,
        h: CARD_H,
      },
    });
  };

  const getTodosForCard = (card: Card) => {
    if (card.pluginType === 'tapd') {
      return tapdCardTodos[card.id] || [];
    }
    if (!card.tags?.length) return todos;
    const cardTagIds = (Array.isArray(card.tags) ? card.tags : []).map((t) => t.id);
    return todos.filter((todo) =>
      (Array.isArray(todo.tags) ? todo.tags : []).some((tag) => cardTagIds.includes(tag.id))
    );
  };

  const gridLayout = cards.map((card: Card) => ({
    i: card.id,
    x: card.x || 0,
    y: card.y || 0,
    w: card.w || 4,
    h: CARD_H,
    minW: 2,
    minH: CARD_H,
    maxH: CARD_H,
  }));

  if (todosLoading || cardsLoading) {
    return <div className="loading">加载中...</div>;
  }

  return (
    <div className="dashboard">
      <Header
        user={user}
        onLogout={handleLogout}
        onNewTodo={() => handleOpenTodoModal()}
        onNewCard={() => handleOpenCardModal()}
        onOpenTags={() => setShowTagModal(true)}
      />

      <main className="main">
        <GridLayout
          key={`grid-${adaptiveRowHeight}-${cards.map((c: Card) => `${c.id}:${c.x}:${c.y}`).join("|")}`}
          verticalCompact={false}
          compactType={null}
          isBounded
          autoSize
          className="layout"
          layout={gridLayout}
          cols={12}
          rowHeight={adaptiveRowHeight}
          width={1200}
          margin={[16, GRID_MARGIN_Y]}
          onDragStop={handleDragStop}
          draggableHandle=".card-header"
          draggableCancel=".card-actions, .card-actions button"
          isResizable={false}
        >
          {(Array.isArray(cards) ? cards : []).map((card: Card) => (
            <div key={card.id} className="grid-card-inner">
              <div className="card">
                <div className="card-header">
                  <div className="card-title">
                    {card.name}
                    <span className="count">{getTodosForCard(card).length}</span>
                  </div>
                  <div className="card-actions">
                    <button onMouseDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); handleOpenTodoModal(undefined, card); }} title="添加待办">+</button>
                    <button onMouseDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); handleOpenCardModal(card); }}>✎</button>
                    <button onMouseDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); handleDeleteCard(card.id); }}>🗑</button>
                  </div>
                </div>
                <div className="card-body">
                  {(Array.isArray(getTodosForCard(card)) ? getTodosForCard(card) : []).map((todo: Todo) => (
                    <TodoCard
                      key={todo.id}
                      todo={todo}
                      tags={tags}
                      onToggle={() => handleToggleTodo(todo.id, todo.status)}
                      onEdit={() => handleOpenTodoModal(todo)}
                      onDelete={() => handleDeleteTodo(todo.id)}
                    />
                  ))}
              </div>
            </div>
            </div>
          ))}
        </GridLayout>
      </main>

      {showTodoModal && (
        <TodoModal
          todo={editingTodo}
          tags={tags}
          onSave={handleSaveTodo}
          onCreateTag={(name, color) => createTagMutation.mutate({ name, color })}
          defaultTagIds={defaultTagIds}
          onClose={() => {
            setShowTodoModal(false);
            setEditingTodo(null);
          }}
        />
      )}

      {showCardModal && (
        <CardModal
          card={editingCard}
          tags={tags}
          onSave={handleSaveCard}
          onCreateTag={(name, color) => createTagMutation.mutate({ name, color })}
          onClose={() => {
            setShowCardModal(false);
            setEditingCard(null);
          }}
        />
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
    </div>
  );
}
