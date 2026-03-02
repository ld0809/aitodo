import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import GridLayout from 'react-grid-layout';
import { useAuthStore } from '../store/authStore';
import { todosApi, type CreateTodoDto, type UpdateTodoDto } from '../api/todos';
import { cardsApi, type CreateCardDto, type UpdateCardDto } from '../api/cards';
import { tagsApi, type CreateTagDto, type UpdateTagDto } from '../api/tags';
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
  const [defaultTagIds, setDefaultTagIds] = useState<string[]>([]);

  const { data: todos = [], isLoading: todosLoading } = useQuery({
    queryKey: ['todos'],
    queryFn: () => todosApi.getAll().then((res) => res.data),
  });

  const { data: cards = [], isLoading: cardsLoading } = useQuery({
    queryKey: ['cards'],
    queryFn: () => cardsApi.getAll().then((res) => res.data),
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
      setShowCardModal(false);
    },
  });

  const updateCardMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateCardDto }) =>
      cardsApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cards'] });
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
    } else {
      createCardMutation.mutate(data as CreateCardDto);
    }
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
    if (confirm('确定要删除这个卡片吗？')) {
      deleteCardMutation.mutate(id);
    }
  };

  const handleDeleteTag = (id: string) => {
    if (confirm('确定要删除这个标签吗？')) {
      deleteTagMutation.mutate(id);
    }
  };

  const handleLayoutChange = (layout: any[]) => {
    layout.forEach((item) => {
      const card = cards.find((c: Card) => c.id === item.i);
      if (card && (card.x !== item.x || card.y !== item.y || card.w !== item.w || card.h !== item.h)) {
        updateCardLayoutMutation.mutate({ id: item.i, layout: item });
      }
    });
  };

  const getTodosForCard = (card: Card) => {
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
    h: card.h || 4,
    minW: 2,
    minH: 2,
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
          verticalCompact={false}
          compactType={null}
          isBounded
          autoSize
          className="layout"
          layout={gridLayout}
          cols={12}
          rowHeight={80}
          width={1200}
          onLayoutChange={handleLayoutChange}
          draggableHandle=".card-header"
          resizeHandles={['se']}
        >
          {(Array.isArray(cards) ? cards : []).map((card: Card) => (
            <div key={card.id} className="grid-card">
              <div className="card">
                <div className="card-header">
                  <div className="card-title">
                    {card.name}
                    <span className="count">{getTodosForCard(card).length}</span>
                  </div>
                  <div className="card-actions">
                    <button onClick={() => handleOpenTodoModal(undefined, card)} title="添加待办">+</button>
                    <button onClick={() => handleOpenCardModal(card)}>✎</button>
                    <button onClick={() => handleDeleteCard(card.id)}>🗑</button>
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
