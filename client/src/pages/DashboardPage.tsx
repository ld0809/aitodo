import { useEffect, useMemo, useRef, useState, type ComponentType } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import GridLayout, { noCompactor } from 'react-grid-layout';
import axios from 'axios';
import { useAuthStore } from '../store/authStore';
import { todosApi, type CreateTodoDto, type UpdateTodoDto } from '../api/todos';
import { cardsApi, type CreateCardDto, type UpdateCardDto } from '../api/cards';
import { reportsApi, type AiReportResult } from '../api/reports';
import { tagsApi, type CreateTagDto, type UpdateTagDto } from '../api/tags';
import { usersApi } from '../api/users';
import type { Todo, Card, LayoutViewport, TodoProgressEntry } from '../types';
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

function toValidTimestamp(value?: string | null): number | null {
  if (!value) {
    return null;
  }
  const timestamp = new Date(value).getTime();
  if (Number.isNaN(timestamp)) {
    return null;
  }
  return timestamp;
}

interface GridLayoutItem {
  i: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

const dragFreeCompactor = {
  ...noCompactor,
  allowOverlap: true,
};

function intersectsHorizontally(left: GridLayoutItem, right: GridLayoutItem): boolean {
  return left.x < right.x + right.w && right.x < left.x + left.w;
}

function intersectsVertically(left: GridLayoutItem, right: GridLayoutItem): boolean {
  return left.y < right.y + right.h && right.y < left.y + left.h;
}

function calculateOverlapArea(left: GridLayoutItem, right: GridLayoutItem): number {
  const overlapX = Math.max(0, Math.min(left.x + left.w, right.x + right.w) - Math.max(left.x, right.x));
  const overlapY = Math.max(0, Math.min(left.y + left.h, right.y + right.h) - Math.max(left.y, right.y));
  return overlapX * overlapY;
}

function resolveLayoutOverlaps(
  layout: readonly GridLayoutItem[],
  options?: { compactUp?: boolean; pinItemId?: string; frozenItemIds?: readonly string[] },
): GridLayoutItem[] {
  const compactUp = options?.compactUp ?? false;
  const pinItemId = options?.pinItemId;
  const frozenItemIdSet = new Set(options?.frozenItemIds ?? []);
  const sorted = [...layout]
    .map((item) => ({ ...item }))
    .sort((a, b) => (a.y === b.y ? a.x - b.x : a.y - b.y));
  const frozenItems = sorted.filter((item) => frozenItemIdSet.has(item.i));
  const movableItems = sorted.filter((item) => !frozenItemIdSet.has(item.i));
  const pinnedItem = pinItemId ? movableItems.find((item) => item.i === pinItemId) : undefined;
  const queue = [
    ...(pinnedItem ? [pinnedItem] : []),
    ...movableItems.filter((item) => item.i !== pinItemId),
  ];
  const placed: GridLayoutItem[] = frozenItems.map((item) => ({ ...item }));

  for (const item of queue) {
    const isPinned = !!pinItemId && item.i === pinItemId;
    const shouldApplyPinnedFloor = !isPinned && !!pinnedItem && item.y >= pinnedItem.y;
    const overlapFloorY = shouldApplyPinnedFloor
      ? placed
          .filter((placedItem) => intersectsHorizontally(item, placedItem))
          .reduce((maxY, placedItem) => Math.max(maxY, placedItem.y + placedItem.h), 0)
      : 0;
    const baseY = isPinned ? item.y : compactUp ? 0 : item.y;
    let nextY = Math.max(Math.max(0, baseY), overlapFloorY);
    while (true) {
      const probe = { ...item, y: nextY };
      const collisions = placed.filter(
        (placedItem) =>
          intersectsHorizontally(probe, placedItem) && intersectsVertically(probe, placedItem),
      );
      if (collisions.length === 0) {
        break;
      }
      nextY = Math.max(...collisions.map((collision) => collision.y + collision.h));
    }
    placed.push({ ...item, y: nextY });
  }

  return placed;
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
  const [showCompletedByCard, setShowCompletedByCard] = useState<Record<string, boolean>>({});
  const [hoveredCardId, setHoveredCardId] = useState<string | null>(null);
  const [focusedQuickInputCardId, setFocusedQuickInputCardId] = useState<string | null>(null);
  const [quickTodoDraftByCardId, setQuickTodoDraftByCardId] = useState<Record<string, string>>({});
  const [quickCreatingCardId, setQuickCreatingCardId] = useState<string | null>(null);
  const CARD_H = 3;
  const CARD_MIN_H = 2;
  const CARD_W = 1;
  const CARD_MIN_PIXEL_WIDTH = 360;
  const GRID_ROW_HEIGHT = 150;
  const GRID_MARGIN: [number, number] = [10, 10];
  const [gridWidth, setGridWidth] = useState<number>(Math.max(320, window.innerWidth - 48));
  const gridContainerRef = useRef<HTMLDivElement | null>(null);
  const gridColsByViewport: Record<LayoutViewport, number> = {
    mobile: 1,
    tablet: 3,
    desktop_normal: 5,
    desktop_big: 8,
  };

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

  const currentViewport = useMemo<LayoutViewport>(() => {
    const cardsPerRow = Math.max(1, Math.floor(gridWidth / CARD_MIN_PIXEL_WIDTH));
    if (cardsPerRow <= 1) return 'mobile';
    if (cardsPerRow <= 3) return 'tablet';
    if (cardsPerRow <= 5) return 'desktop_normal';
    return 'desktop_big';
  }, [gridWidth]);

  const gridCols = gridColsByViewport[currentViewport];
  const userScope = user?.id ?? 'anonymous';

  const { data: todos = [], isLoading: todosLoading } = useQuery({
    queryKey: ['todos', userScope],
    queryFn: () => todosApi.getAll().then((res) => res.data),
  });

  const { data: cards = [], isLoading: cardsLoading } = useQuery({
    queryKey: ['cards', userScope, currentViewport],
    queryFn: () => cardsApi.getAll(currentViewport).then((res) => res.data),
  });

  const remoteCardsKey = (Array.isArray(cards) ? cards : [])
    .filter((card: Card) => card.pluginType === 'tapd' || card.cardType === 'shared')
    .map((card: Card) => `${card.id}:${card.updatedAt}`)
    .sort()
    .join('|');

  const { data: remoteCardTodos = {} } = useQuery({
    queryKey: ['card-todos', userScope, remoteCardsKey],
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
    queryKey: ['tags', userScope],
    queryFn: () => tagsApi.getAll().then((res) => res.data),
  });

  const { data: meProfile } = useQuery({
    queryKey: ['me', userScope],
    enabled: !!user,
    queryFn: () => usersApi.getMe().then((res) => res.data),
  });

  const { data: todoProgressEntries = [] } = useQuery({
    queryKey: ['todo-progress', userScope, activeProgressTodo?.id],
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
      queryClient.invalidateQueries({ queryKey: ['todos', userScope] });
      queryClient.invalidateQueries({ queryKey: ['card-todos', userScope] });
      setShowTodoModal(false);
      setActiveTodoCard(null);
    },
  });

  const updateTodoMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateTodoDto }) =>
      todosApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['todos', userScope] });
      queryClient.invalidateQueries({ queryKey: ['card-todos', userScope] });
      setShowTodoModal(false);
      setEditingTodo(null);
      setActiveTodoCard(null);
    },
  });

  const deleteTodoMutation = useMutation({
    mutationFn: (id: string) => todosApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['todos', userScope] });
      queryClient.invalidateQueries({ queryKey: ['card-todos', userScope] });
    },
  });

  const toggleTodoMutation = useMutation({
    mutationFn: ({ id, completed }: { id: string; completed: boolean }) => todosApi.toggleStatus(id, completed),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['todos', userScope] });
      queryClient.invalidateQueries({ queryKey: ['card-todos', userScope] });
    },
  });

  const createProgressMutation = useMutation({
    mutationFn: ({ id, content }: { id: string; content: string }) =>
      todosApi.createProgress(id, { content }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['todos', userScope] });
      queryClient.invalidateQueries({ queryKey: ['card-todos', userScope] });
      queryClient.invalidateQueries({ queryKey: ['todo-progress', userScope, activeProgressTodo?.id] });
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
      queryClient.invalidateQueries({ queryKey: ['cards', userScope] });
      queryClient.invalidateQueries({ queryKey: ['card-todos', userScope] });
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
      queryClient.invalidateQueries({ queryKey: ['cards', userScope] });
      queryClient.invalidateQueries({ queryKey: ['card-todos', userScope] });
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
      queryClient.removeQueries({ queryKey: ['card-todos', userScope] });
      queryClient.invalidateQueries({ queryKey: ['cards', userScope] });
    },
  });

  const createTagMutation = useMutation({
    mutationFn: (data: CreateTagDto) => tagsApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tags', userScope] });
    },
  });

  const updateTagMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateTagDto }) =>
      tagsApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tags', userScope] });
    },
  });

  const deleteTagMutation = useMutation({
    mutationFn: (id: string) => tagsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tags', userScope] });
    },
  });

  const updateProfileMutation = useMutation({
    mutationFn: (data: { target?: string; nickname?: string }) => usersApi.updateMe(data),
    onSuccess: (res) => {
      updateUser(res.data);
      queryClient.invalidateQueries({ queryKey: ['me', userScope] });
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
      const createData = data as CreateTodoDto;
      const normalizedTagIds = (Array.isArray(createData.tagIds) ? createData.tagIds : []).filter(Boolean);
      const createPayload: CreateTodoDto = {
        ...createData,
        tagIds: normalizedTagIds.length > 0 ? normalizedTagIds : undefined,
        cardId: activeTodoCard && normalizedTagIds.length === 0 ? activeTodoCard.id : undefined,
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
      const lastW = CARD_W;
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

  const handleToggleCompletedVisibility = (cardId: string) => {
    setShowCompletedByCard((prev) => ({
      ...prev,
      [cardId]: !(prev[cardId] ?? true),
    }));
  };

  const handleChangeQuickTodoDraft = (cardId: string, content: string) => {
    setQuickTodoDraftByCardId((prev) => ({
      ...prev,
      [cardId]: content,
    }));
  };

  const handleQuickCreateTodo = (card: Card) => {
    const content = (quickTodoDraftByCardId[card.id] ?? '').trim();
    if (!content || quickCreatingCardId === card.id) {
      return;
    }

    const cardTagIds = (Array.isArray(card.tags) ? card.tags : []).map((tag) => tag.id);
    const normalizedTagIds = cardTagIds.filter(Boolean);
    setQuickCreatingCardId(card.id);
    createTodoMutation.mutate(
      {
        content,
        tagIds: normalizedTagIds.length > 0 ? normalizedTagIds : undefined,
        cardId: normalizedTagIds.length === 0 ? card.id : undefined,
      },
      {
        onSuccess: () => {
          setQuickTodoDraftByCardId((prev) => ({
            ...prev,
            [card.id]: '',
          }));
          setFocusedQuickInputCardId((prev) => (prev === card.id ? null : prev));
        },
        onError: (error: unknown) => {
          alert(getErrorMessage(error, '快捷创建待办失败'));
        },
        onSettled: () => {
          setQuickCreatingCardId((prev) => (prev === card.id ? null : prev));
        },
      },
    );
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

  const applyResolvedLayout = (
    layout: readonly GridLayoutItem[],
    options?: { compactUp?: boolean; pinItemId?: string; frozenItemIds?: readonly string[] },
  ) => {
    const cardMap = new Map((Array.isArray(cards) ? cards : []).map((card: Card) => [card.id, card]));
    const normalizedLayout = layout
      .filter((item): item is GridLayoutItem => typeof item.i === 'string')
      .map((item) => ({
        i: item.i,
        x: Math.max(0, Math.round(item.x)),
        y: Math.max(0, Math.round(item.y)),
        w: CARD_W,
        h: Math.max(CARD_MIN_H, Math.round(item.h)),
      }))
      .filter((item) => cardMap.has(item.i));
    const resolvedLayout = resolveLayoutOverlaps(normalizedLayout, options);

    const changedLayouts = resolvedLayout.filter((item) => {
      const card = cardMap.get(item.i);
      if (!card) return false;
      const currentX = card.x ?? 0;
      const currentY = card.y ?? 0;
      const currentW = CARD_W;
      const currentH = card.h || CARD_H;
      return currentX !== item.x || currentY !== item.y || currentW !== item.w || currentH !== item.h;
    });

    if (changedLayouts.length === 0) return;

    const changedMap = new Map(changedLayouts.map((item) => [item.i, item]));
    queryClient.setQueryData(['cards', userScope, currentViewport], (previous: Card[] | undefined) => {
      if (!Array.isArray(previous)) return previous;
      return previous.map((card) => {
        const next = changedMap.get(card.id);
        if (!next) return card;
        return {
          ...card,
          x: next.x,
          y: next.y,
          w: next.w,
          h: next.h,
        };
      });
    });

    void Promise.all(
      changedLayouts.map((item) =>
        cardsApi.updateLayout(item.i, { x: item.x, y: item.y, w: CARD_W, h: item.h, viewport: currentViewport }),
      ),
    ).finally(() => {
      queryClient.invalidateQueries({ queryKey: ['cards', userScope] });
    });
  };

  const handleDragStop = (
    layout: readonly GridLayoutItem[],
    oldItem: GridLayoutItem | null,
    newItem: GridLayoutItem | null,
  ) => {
    if (!newItem) return;
    const normalizedLayout = layout
      .filter((item): item is GridLayoutItem => typeof item.i === 'string')
      .map((item) => ({
        i: item.i,
        x: Math.max(0, Math.round(item.x)),
        y: Math.max(0, Math.round(item.y)),
        w: CARD_W,
        h: Math.max(CARD_MIN_H, Math.round(item.h)),
      }));
    const draggedItem = normalizedLayout.find((item) => item.i === newItem.i);
    if (!draggedItem) return;
    const targetCollisions = normalizedLayout
      .filter(
        (item) =>
          item.i !== draggedItem.i &&
          intersectsHorizontally(item, draggedItem) &&
          intersectsVertically(item, draggedItem),
      )
      .map((item) => ({
        item,
        overlapArea: calculateOverlapArea(item, draggedItem),
      }))
      .filter((entry) => entry.overlapArea > 0)
      .sort((left, right) =>
        right.overlapArea - left.overlapArea || left.item.y - right.item.y || left.item.x - right.item.x,
      );
    const selectedTarget = targetCollisions[0]?.item;

    const fallbackOldItem = cards.find((card: Card) => card.id === draggedItem.i);
    const sourceAnchor: GridLayoutItem = {
      i: draggedItem.i,
      x: Math.max(0, Math.round(oldItem?.x ?? fallbackOldItem?.x ?? draggedItem.x)),
      y: Math.max(0, Math.round(oldItem?.y ?? fallbackOldItem?.y ?? draggedItem.y)),
      w: CARD_W,
      h: Math.max(CARD_MIN_H, Math.round(oldItem?.h ?? fallbackOldItem?.h ?? draggedItem.h)),
    };

    if (!selectedTarget) {
      const sourceMinY = sourceAnchor.y + sourceAnchor.h;
      const sourceFollowerIds = normalizedLayout
        .filter(
          (item) =>
            item.i !== draggedItem.i &&
            intersectsHorizontally(item, sourceAnchor) &&
            item.y >= sourceMinY,
        )
        .map((item) => item.i);
      if (sourceFollowerIds.length === 0) {
        applyResolvedLayout([draggedItem]);
        return;
      }
      const movableIdSet = new Set([draggedItem.i, ...sourceFollowerIds]);
      const frozenItemIds = normalizedLayout
        .filter((item) => !movableIdSet.has(item.i))
        .map((item) => item.i);

      applyResolvedLayout(normalizedLayout, {
        compactUp: true,
        pinItemId: draggedItem.i,
        frozenItemIds,
      });
      return;
    }

    const swappedLayout = normalizedLayout.map((item) => {
      if (item.i === draggedItem.i) {
        return {
          ...item,
          x: selectedTarget.x,
          y: selectedTarget.y,
        };
      }
      if (item.i === selectedTarget.i) {
        return {
          ...item,
          x: Math.max(0, Math.min(sourceAnchor.x, Math.max(0, gridCols - item.w))),
          y: sourceAnchor.y,
        };
      }
      return item;
    });
    const frozenItemIds = swappedLayout
      .filter((item) => item.i !== draggedItem.i && item.i !== selectedTarget.i)
      .map((item) => item.i);

    applyResolvedLayout(swappedLayout, {
      pinItemId: draggedItem.i,
      frozenItemIds,
    });
  };

  const handleResizeStop = (layout: readonly GridLayoutItem[]) => {
    applyResolvedLayout(layout, { compactUp: true });
  };

  const getTodosForCard = (card: Card) => {
    if (card.pluginType === 'tapd' || card.cardType === 'shared') {
      return remoteCardTodos[card.id] || [];
    }

    const cardTagIds = new Set((Array.isArray(card.tags) ? card.tags : []).map((tag) => tag.id));
    const relatedByCard = (Array.isArray(todos) ? todos : []).filter((todo) => todo.cardId === card.id);
    const relatedByTags = cardTagIds.size === 0
      ? []
      : (Array.isArray(todos) ? todos : []).filter((todo) =>
          (Array.isArray(todo.tags) ? todo.tags : []).some((tag) => cardTagIds.has(tag.id)),
        );

    return Array.from(new Map([...relatedByCard, ...relatedByTags].map((todo) => [todo.id, todo])).values());
  };

  const isCompletedTodo = (todo: Todo) => todo.status === 'done' || todo.status === 'completed';

  const gridLayout = useMemo(() => {
    const baseLayout = (Array.isArray(cards) ? cards : []).map((card: Card) => {
        const normalizedW = CARD_W;
        const normalizedX = Math.min(card.x || 0, Math.max(0, gridCols - CARD_W));
        return {
          i: card.id,
          x: normalizedX,
          y: Math.max(0, card.y || 0),
          w: normalizedW,
          h: Math.max(CARD_MIN_H, card.h || CARD_H),
          minW: CARD_W,
          maxW: CARD_W,
          minH: CARD_MIN_H,
        };
      });
    return resolveLayoutOverlaps(baseLayout);
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
          compactor={dragFreeCompactor}
          dragConfig={{
            handle: '.card-header',
            cancel: '.card-actions, .card-actions button, .card-quick-input',
          }}
          resizeConfig={{
            enabled: true,
            handles: ['s'],
          }}
          onDragStop={handleDragStop}
          onResizeStop={handleResizeStop}
        >
          {(Array.isArray(cards) ? cards : []).map((card: Card) => (
            <div key={card.id} className="grid-card-inner">
              {(() => {
                const cardTodos = getTodosForCard(card);
                const sortField = card.sortBy;
                const sortOrder = card.sortOrder === 'asc' ? 1 : -1;
                const sortedCardTodos = [...(Array.isArray(cardTodos) ? cardTodos : [])].sort(
                  (left, right) => {
                    const completedDiff = Number(isCompletedTodo(left)) - Number(isCompletedTodo(right));
                    if (completedDiff !== 0) {
                      return completedDiff;
                    }

                    const getSortValue = (todo: Todo) => {
                      if (sortField === 'due_at') {
                        return toValidTimestamp(todo.dueAt);
                      }
                      if (sortField === 'execute_at') {
                        return toValidTimestamp(todo.executeAt);
                      }
                      return toValidTimestamp(todo.createdAt);
                    };

                    const leftValue = getSortValue(left);
                    const rightValue = getSortValue(right);

                    if (leftValue === rightValue) {
                      const leftCreated = toValidTimestamp(left.createdAt) ?? 0;
                      const rightCreated = toValidTimestamp(right.createdAt) ?? 0;
                      return (leftCreated - rightCreated) * sortOrder;
                    }
                    if (leftValue === null) {
                      return 1;
                    }
                    if (rightValue === null) {
                      return -1;
                    }
                    return (leftValue - rightValue) * sortOrder;
                  },
                );
                const showCompleted = showCompletedByCard[card.id] ?? true;
                const visibleCardTodos = showCompleted
                  ? sortedCardTodos
                  : sortedCardTodos.filter((todo) => !isCompletedTodo(todo));
                const cardTagIds = (Array.isArray(card.tags) ? card.tags : []).map((tag) => tag.id);
                const isCardOwner = card.userId === user?.id;
                const isTapdCard = card.pluginType === 'tapd';
                const canQuickCreate = isCardOwner && !isTapdCard;
                const quickTodoDraft = quickTodoDraftByCardId[card.id] ?? '';
                const showQuickInput =
                  canQuickCreate &&
                  (hoveredCardId === card.id || focusedQuickInputCardId === card.id);
                return (
              <div
                className="card"
                onMouseEnter={() => setHoveredCardId(card.id)}
                onMouseLeave={() => {
                  setHoveredCardId((prev) => (prev === card.id ? null : prev));
                }}
              >
                <div className="card-header">
                  {showQuickInput ? (
                    <input
                      className="card-quick-input"
                      value={quickTodoDraft}
                      placeholder="输入待办，回车创建"
                      maxLength={500}
                      disabled={quickCreatingCardId === card.id}
                      onMouseDown={(e) => e.stopPropagation()}
                      onFocus={() => setFocusedQuickInputCardId(card.id)}
                      onBlur={() => {
                        setFocusedQuickInputCardId((prev) => (prev === card.id ? null : prev));
                      }}
                      onChange={(e) => handleChangeQuickTodoDraft(card.id, e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          e.stopPropagation();
                          handleQuickCreateTodo(card);
                          e.currentTarget.blur();
                          return;
                        }
                        if (e.key === 'Escape') {
                          e.preventDefault();
                          e.stopPropagation();
                          setQuickTodoDraftByCardId((prev) => ({
                            ...prev,
                            [card.id]: '',
                          }));
                          e.currentTarget.blur();
                        }
                      }}
                    />
                  ) : (
                    <div className="card-title">
                      <span className="card-title-text">
                        {card.name}{card.cardType === 'shared' ? ' · 共享' : ''}
                      </span>
                      <span className="count">{visibleCardTodos.length}</span>
                    </div>
                  )}
                  <div className="card-actions">
                    {!isTapdCard && (
                      <button
                        className={`toggle-completed-btn ${showCompleted ? 'active' : ''}`}
                        onMouseDown={(e) => e.stopPropagation()}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleToggleCompletedVisibility(card.id);
                        }}
                        title={showCompleted ? '隐藏已完成待办' : '显示已完成待办'}
                      >
                        {showCompleted ? '☑' : '☐'}
                      </button>
                    )}
                    {isCardOwner && !isTapdCard && (
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
                  {visibleCardTodos.map((todo: Todo) => (
                    <TodoCard
                      key={todo.id}
                      todo={todo}
                      tags={tags}
                      hiddenTagIds={cardTagIds}
                      onToggle={() => handleToggleTodo(todo.id, todo.status)}
                      showToggle={card.pluginType !== 'tapd'}
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
