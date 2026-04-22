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
import type { Todo, Card, LayoutViewport, TodoProgressEntry, Tag } from '../types';
import { Header } from '../components/Header';
import { TodoCard } from '../components/TodoCard';
import { CardModal } from '../components/CardModal';
import { TodoModal } from '../components/TodoModal';
import { TagModal } from '../components/TagModal';
import { ProgressModal } from '../components/ProgressModal';
import { Button } from '../components/ui/Button';
import { getTodosForCard, isCompletedTodo } from '../lib/cardTodos';
import { compareTodosForCardDisplay, sortTodosForCardDisplay } from '../lib/todoSort';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import './DashboardPage.css';

function formatDateInput(date: Date): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
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

type DashboardViewMode = 'board' | 'list';

const DASHBOARD_VIEW_MODE_STORAGE_KEY = 'aitodo:dashboard:view-mode';

interface ListTodoEntry {
  todo: Todo;
  effectiveTags: Tag[];
  sourceCard: Card | null;
  sourceLabel: string;
  canToggle: boolean;
  canEdit: boolean;
  canUpdateProgress: boolean;
  canDelete: boolean;
  isExternal: boolean;
}

interface ListFilterItem {
  id: string;
  kind: 'all' | 'tag' | 'tapd_card';
  name: string;
  count: number;
  sourceCard?: Card;
}

const dragFreeCompactor = {
  ...noCompactor,
  allowOverlap: true,
};
const TAPD_CARD_AUTO_REFRESH_INTERVAL_MS = 5 * 60 * 1000;
const TAPD_DETAIL_VIEW_BASE_URL = `${import.meta.env.VITE_API_BASE_URL || '/api/v1'}/api/tapd/detail-view`;

interface TapdDetailViewRef {
  workspaceId: string;
  type: 'story' | 'bug';
  id: string;
}

function parseTapdDetailViewRef(url?: string | null): TapdDetailViewRef | null {
  if (!url) {
    return null;
  }

  try {
    const parsedUrl = new URL(
      url,
      typeof window !== 'undefined' ? window.location.origin : 'http://localhost',
    );
    const segments = parsedUrl.pathname.split('/').filter(Boolean);
    const tapdFeIndex = segments.indexOf('tapd_fe');
    const typeIndex = segments.findIndex((segment) => segment === 'story' || segment === 'bug');
    const workspaceId = tapdFeIndex >= 0 ? segments[tapdFeIndex + 1] : '';
    const type = typeIndex >= 0 ? segments[typeIndex] : null;
    const detailMarker = typeIndex >= 0 ? segments[typeIndex + 1] : '';
    const id = typeIndex >= 0 ? segments[typeIndex + 2] : '';

    if (!workspaceId || !type || detailMarker !== 'detail' || !id) {
      return null;
    }

    return {
      workspaceId,
      type: type as 'story' | 'bug',
      id,
    };
  } catch {
    return null;
  }
}

function buildTapdDetailViewUrl(url?: string | null): string | null {
  const detailRef = parseTapdDetailViewRef(url);
  if (!detailRef) {
    return null;
  }

  const query = new URLSearchParams({
    workspaceId: detailRef.workspaceId,
    type: detailRef.type,
    id: detailRef.id,
  });
  return `${TAPD_DETAIL_VIEW_BASE_URL}?${query.toString()}`;
}

function SaveIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path
        d="M4.5 3.5h8.379l2.621 2.621V16.5h-11z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path
        d="M7 3.5h5.5v4H7z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path
        d="M7 12.25h6"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path
        d="M10 4.5v11M4.5 10h11"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function ExternalLinkIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path
        d="M11.5 4.5h4v4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M9 11l6.5-6.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
      <path
        d="M15.5 10.5v4a1 1 0 0 1-1 1h-9a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1h4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function getStoredDashboardViewMode(): DashboardViewMode {
  if (typeof window === 'undefined') {
    return 'board';
  }

  const storedValue = window.localStorage.getItem(DASHBOARD_VIEW_MODE_STORAGE_KEY);
  return storedValue === 'list' ? 'list' : 'board';
}

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
  const [showGoalModal, setShowGoalModal] = useState(false);
  const [showProgressModal, setShowProgressModal] = useState(false);
  const [showAiReportModal, setShowAiReportModal] = useState(false);
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
  const [openCardMenuId, setOpenCardMenuId] = useState<string | null>(null);
  const [defaultTagIds, setDefaultTagIds] = useState<string[]>([]);
  const [showCompletedByCard, setShowCompletedByCard] = useState<Record<string, boolean>>({});
  const [hoveredCardId, setHoveredCardId] = useState<string | null>(null);
  const [focusedQuickInputCardId, setFocusedQuickInputCardId] = useState<string | null>(null);
  const [quickTodoDraftByCardId, setQuickTodoDraftByCardId] = useState<Record<string, string>>({});
  const [quickCreatingCardId, setQuickCreatingCardId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<DashboardViewMode>(() => getStoredDashboardViewMode());
  const [showViewModeModal, setShowViewModeModal] = useState(false);
  const [selectedListFilterId, setSelectedListFilterId] = useState('all');
  const [selectedListTodoId, setSelectedListTodoId] = useState<string | null>(null);
  const [listQuickCreateDraft, setListQuickCreateDraft] = useState('');
  const [listDetailContent, setListDetailContent] = useState('');
  const [listDetailDueAt, setListDetailDueAt] = useState('');
  const [listDetailExecuteAt, setListDetailExecuteAt] = useState('');
  const [listDetailTagIds, setListDetailTagIds] = useState<string[]>([]);
  const CARD_H = 3;
  const CARD_MIN_H = 2;
  const CARD_W = 1;
  const CARD_MIN_PIXEL_WIDTH = 360;
  const GRID_ROW_HEIGHT = 150;
  const GRID_MARGIN: [number, number] = [10, 10];
  const [gridWidth, setGridWidth] = useState<number>(Math.max(320, window.innerWidth - 48));
  const gridContainerRef = useRef<HTMLDivElement | null>(null);
  const cardMenuRef = useRef<HTMLDivElement | null>(null);
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

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    window.localStorage.setItem(DASHBOARD_VIEW_MODE_STORAGE_KEY, viewMode);
  }, [viewMode]);

  useEffect(() => {
    if (!openCardMenuId) {
      return;
    }

    const handleClickOutside = (event: MouseEvent) => {
      if (cardMenuRef.current && !cardMenuRef.current.contains(event.target as Node)) {
        setOpenCardMenuId(null);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [openCardMenuId]);

  const currentViewport = useMemo<LayoutViewport>(() => {
    const cardsPerRow = Math.max(1, Math.floor(gridWidth / CARD_MIN_PIXEL_WIDTH));
    if (cardsPerRow <= 1) return 'mobile';
    if (cardsPerRow <= 3) return 'tablet';
    if (cardsPerRow <= 5) return 'desktop_normal';
    return 'desktop_big';
  }, [gridWidth]);

  const gridCols = gridColsByViewport[currentViewport];
  const userScope = user?.id ?? 'anonymous';
  const creatingTodoRef = useRef(false);
  const creatingCardRef = useRef(false);
  const creatingTagRef = useRef(false);

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
  const hasRemoteCards = (Array.isArray(cards) ? cards : []).some(
    (card: Card) => card.pluginType === 'tapd' || card.cardType === 'shared',
  );
  const hasTapdCards = (Array.isArray(cards) ? cards : []).some(
    (card: Card) => card.pluginType === 'tapd',
  );

  const { data: remoteCardTodos = {} } = useQuery({
    queryKey: ['card-todos', userScope, remoteCardsKey],
    enabled: hasRemoteCards,
    refetchInterval: hasTapdCards ? TAPD_CARD_AUTO_REFRESH_INTERVAL_MS : false,
    refetchIntervalInBackground: hasTapdCards,
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

  const cardById = useMemo(
    () => new Map((Array.isArray(cards) ? cards : []).map((card: Card) => [card.id, card])),
    [cards],
  );

  const listTodoEntries = useMemo(() => {
    const entryMap = new Map<string, ListTodoEntry>();

    const upsertEntry = (todo: Todo, sourceCard?: Card | null) => {
      const resolvedCard = sourceCard ?? (todo.cardId ? cardById.get(todo.cardId) ?? null : null);
      const effectiveTags = Array.isArray(todo.tags) && todo.tags.length > 0
        ? todo.tags
        : (Array.isArray(resolvedCard?.tags) ? resolvedCard.tags : []);
      const todoWithEffectiveTags = effectiveTags === todo.tags
        ? todo
        : {
            ...todo,
            tags: effectiveTags,
          };
      const isExternal = resolvedCard?.pluginType === 'tapd';

      entryMap.set(todo.id, {
        todo: todoWithEffectiveTags,
        effectiveTags,
        sourceCard: resolvedCard,
        sourceLabel: resolvedCard
          ? `${resolvedCard.name}${resolvedCard.cardType === 'shared' ? ' · 共享' : ''}`
          : '本地待办',
        canToggle: !isExternal,
        canEdit: !isExternal,
        canUpdateProgress: !isExternal,
        canDelete: todo.userId === user?.id,
        isExternal,
      });
    };

    (Array.isArray(todos) ? todos : []).forEach((todo) => upsertEntry(todo));

    (Array.isArray(cards) ? cards : [])
      .filter((card: Card) => card.pluginType === 'tapd' || card.cardType === 'shared')
      .forEach((card: Card) => {
        const sourceTodos = remoteCardTodos[card.id] ?? [];
        sourceTodos.forEach((todo) => upsertEntry(todo, card));
      });

    return [...entryMap.values()].sort((left, right) => compareTodosForCardDisplay(left.todo, right.todo));
  }, [cardById, cards, remoteCardTodos, todos, user?.id]);

  const listFilterItems = useMemo<ListFilterItem[]>(() => {
    const countByTagId = new Map<string, number>();
    listTodoEntries.forEach((entry) => {
      entry.effectiveTags.forEach((tag) => {
        countByTagId.set(tag.id, (countByTagId.get(tag.id) ?? 0) + 1);
      });
    });

    return [
      {
        id: 'all',
        kind: 'all' as const,
        name: '全部',
        count: listTodoEntries.length,
      },
      ...(Array.isArray(tags) ? tags : []).map((tag) => ({
        id: `tag:${tag.id}`,
        kind: 'tag' as const,
        name: tag.name,
        count: countByTagId.get(tag.id) ?? 0,
      })),
      ...(Array.isArray(cards) ? cards : [])
        .filter((card: Card) => card.pluginType === 'tapd')
        .map((card: Card) => ({
          id: `tapd:${card.id}`,
          kind: 'tapd_card' as const,
          name: card.name,
          count: Array.isArray(remoteCardTodos[card.id]) ? remoteCardTodos[card.id].length : 0,
          sourceCard: card,
      })),
    ];
  }, [cards, listTodoEntries, remoteCardTodos, tags]);

  const filteredListTodoEntries = useMemo(() => {
    if (selectedListFilterId === 'all') {
      return listTodoEntries;
    }

    if (selectedListFilterId.startsWith('tapd:')) {
      const cardId = selectedListFilterId.slice('tapd:'.length);
      return listTodoEntries.filter((entry) => entry.sourceCard?.id === cardId);
    }

    const tagId = selectedListFilterId.startsWith('tag:')
      ? selectedListFilterId.slice('tag:'.length)
      : selectedListFilterId;

    return listTodoEntries.filter((entry) =>
      entry.effectiveTags.some((tag) => tag.id === tagId),
    );
  }, [listTodoEntries, selectedListFilterId]);

  const selectedListTodoEntry = useMemo(
    () => filteredListTodoEntries.find((entry) => entry.todo.id === selectedListTodoId) ?? null,
    [filteredListTodoEntries, selectedListTodoId],
  );
  const selectedTapdDetailViewUrl = useMemo(() => {
    if (!selectedListTodoEntry || selectedListTodoEntry.sourceCard?.pluginType !== 'tapd') {
      return null;
    }
    return buildTapdDetailViewUrl(selectedListTodoEntry.todo.url);
  }, [selectedListTodoEntry]);
  const showListDetailFloatingActions = viewMode === 'list' && !!selectedListTodoEntry;
  const { data: selectedTodoProgressEntries = [] } = useQuery({
    queryKey: ['todo-progress-inline', userScope, selectedListTodoEntry?.todo.id],
    enabled: viewMode === 'list' && !!selectedListTodoEntry?.todo.id && selectedListTodoEntry.canUpdateProgress,
    queryFn: () => todosApi.getProgress(selectedListTodoEntry!.todo.id).then((res) => res.data as TodoProgressEntry[]),
  });

  useEffect(() => {
    if (meProfile) {
      updateUser(meProfile);
    }
  }, [meProfile, updateUser]);

  useEffect(() => {
    const hasSelectedFilter = selectedListFilterId === 'all'
      || listFilterItems.some((item) => item.id === selectedListFilterId);
    if (!hasSelectedFilter) {
      setSelectedListFilterId('all');
    }
  }, [listFilterItems, selectedListFilterId]);

  useEffect(() => {
    if (viewMode !== 'list') {
      return;
    }

    const nextSelectedTodoId = filteredListTodoEntries.some((entry) => entry.todo.id === selectedListTodoId)
      ? selectedListTodoId
      : filteredListTodoEntries[0]?.todo.id ?? null;

    if (nextSelectedTodoId !== selectedListTodoId) {
      setSelectedListTodoId(nextSelectedTodoId);
    }
  }, [filteredListTodoEntries, selectedListTodoId, viewMode]);

  useEffect(() => {
    if (!selectedListTodoEntry) {
      setListDetailContent('');
      setListDetailDueAt('');
      setListDetailExecuteAt('');
      setListDetailTagIds([]);
      return;
    }

    setListDetailContent(selectedListTodoEntry.todo.content);
    setListDetailDueAt(toDateTimeLocalInputValue(selectedListTodoEntry.todo.dueAt));
    setListDetailExecuteAt(toDateTimeLocalInputValue(selectedListTodoEntry.todo.executeAt));
    setListDetailTagIds(selectedListTodoEntry.effectiveTags.map((tag) => tag.id));
  }, [selectedListTodoEntry]);

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
      queryClient.invalidateQueries({ queryKey: ['todo-progress'] });
      queryClient.invalidateQueries({ queryKey: ['todo-progress-inline'] });
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

  const archiveCardMutation = useMutation({
    mutationFn: (id: string) => cardsApi.archive(id),
    onSuccess: (_, archivedCardId) => {
      queryClient.removeQueries({ queryKey: ['card-todos', userScope] });
      queryClient.setQueryData(['cards', userScope, currentViewport], (previous: Card[] | undefined) => {
        if (!Array.isArray(previous)) {
          return previous;
        }
        return previous.filter((card) => card.id !== archivedCardId);
      });
      queryClient.invalidateQueries({ queryKey: ['cards', userScope] });
    },
    onError: (error: unknown) => {
      alert(getErrorMessage(error, '归档卡片失败'));
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

  const buildMentionCandidates = (card?: Card | null) => {
    const candidates = [
      ...(card?.owner ? [card.owner] : []),
      ...((card && Array.isArray(card.participants)) ? card.participants : []),
    ];
    return [...new Map(candidates.map((item) => [item.id, item])).values()];
  };

  const handleOpenCardModal = (card?: Card) => {
    setEditingCard(card || null);
    setShowCardModal(true);
  };

  const handleSaveTodo = (data: CreateTodoDto | UpdateTodoDto) => {
    if (editingTodo) {
      updateTodoMutation.mutate({ id: editingTodo.id, data: data as UpdateTodoDto });
    } else {
      if (creatingTodoRef.current || createTodoMutation.isPending) {
        return;
      }
      const createData = data as CreateTodoDto;
      const normalizedTagIds = (Array.isArray(createData.tagIds) ? createData.tagIds : []).filter(Boolean);
      const shouldAttachCardId =
        !!activeTodoCard && (activeTodoCard.cardType === 'shared' || normalizedTagIds.length === 0);
      const createPayload: CreateTodoDto = {
        ...createData,
        tagIds: normalizedTagIds.length > 0 ? normalizedTagIds : undefined,
        cardId: shouldAttachCardId ? activeTodoCard?.id : undefined,
      };
      creatingTodoRef.current = true;
      createTodoMutation.mutate(createPayload, {
        onSettled: () => {
          creatingTodoRef.current = false;
        },
      });
    }
  };

  const handleSaveCard = (data: CreateCardDto | UpdateCardDto) => {
    if (editingCard) {
      updateCardMutation.mutate({ id: editingCard.id, data: data as UpdateCardDto });
      return;
    }
    if (creatingCardRef.current || createCardMutation.isPending) {
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

    creatingCardRef.current = true;
    createCardMutation.mutate(
      {
        ...(data as CreateCardDto),
        x: nextX,
        y: nextY,
        w: DEFAULT_W,
        h: DEFAULT_H,
      },
      {
        onSettled: () => {
          creatingCardRef.current = false;
        },
      },
    );
  };

  const handleSaveTag = (data: CreateTagDto | UpdateTagDto, id?: string) => {
    if (id) {
      updateTagMutation.mutate({ id, data: data as UpdateTagDto });
    } else {
      if (creatingTagRef.current || createTagMutation.isPending) {
        return;
      }
      creatingTagRef.current = true;
      createTagMutation.mutate(data as CreateTagDto, {
        onSettled: () => {
          creatingTagRef.current = false;
        },
      });
    }
  };

  const createTagSafely = async (payload: CreateTagDto) => {
    if (creatingTagRef.current || createTagMutation.isPending) {
      return undefined;
    }
    creatingTagRef.current = true;
    try {
      const res = await createTagMutation.mutateAsync(payload);
      return res.data;
    } finally {
      creatingTagRef.current = false;
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

  const handleQuickCreateListTodo = () => {
    const content = listQuickCreateDraft.trim();
    if (!content || createTodoMutation.isPending || selectedListFilterId.startsWith('tapd:')) {
      return;
    }

    const tagIds = selectedListFilterId === 'all'
      ? undefined
      : selectedListFilterId.startsWith('tag:')
        ? [selectedListFilterId.slice('tag:'.length)]
        : undefined;
    createTodoMutation.mutate(
      {
        content,
        tagIds,
      },
      {
        onSuccess: (res) => {
          setListQuickCreateDraft('');
          setSelectedListTodoId(res.data.id);
        },
        onError: (error: unknown) => {
          alert(getErrorMessage(error, '快捷创建待办失败'));
        },
      },
    );
  };

  const handleToggleListDetailTag = (tagId: string) => {
    const isSharedTodo = selectedListTodoEntry?.sourceCard?.cardType === 'shared';
    if (!selectedListTodoEntry || selectedListTodoEntry.isExternal || isSharedTodo) {
      return;
    }

    setListDetailTagIds((prev) =>
      prev.includes(tagId) ? prev.filter((currentId) => currentId !== tagId) : [...prev, tagId],
    );
  };

  const handleSaveListDetail = () => {
    if (!selectedListTodoEntry || !selectedListTodoEntry.canEdit) {
      return;
    }

    const normalizedContent = listDetailContent.trim();
    if (!normalizedContent) {
      alert('请输入待办内容');
      return;
    }

    const isSharedTodo = selectedListTodoEntry.sourceCard?.cardType === 'shared';
    const payload: UpdateTodoDto = {
      content: normalizedContent,
      dueAt: listDetailDueAt || undefined,
      executeAt: listDetailExecuteAt || undefined,
      tagIds: isSharedTodo ? selectedListTodoEntry.effectiveTags.map((tag) => tag.id) : listDetailTagIds,
    };

    updateTodoMutation.mutate({
      id: selectedListTodoEntry.todo.id,
      data: payload,
    });
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
    setOpenCardMenuId(null);
    setPendingDeleteCardId(id);
  };

  const handleArchiveCard = (id: string) => {
    setOpenCardMenuId(null);
    archiveCardMutation.mutate(id);
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
    const shouldAttachCardId = card.cardType === 'shared' || normalizedTagIds.length === 0;
    setQuickCreatingCardId(card.id);
    createTodoMutation.mutate(
      {
        content,
        tagIds: normalizedTagIds.length > 0 ? normalizedTagIds : undefined,
        cardId: shouldAttachCardId ? card.id : undefined,
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
    updateProfileMutation.mutate(nextTarget ? { target: nextTarget } : { target: '' }, {
      onSuccess: () => {
        setShowGoalModal(false);
      },
    });
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
      .filter((item) => item.i === draggedItem.i || item.i === selectedTarget.i)
      .map((item) => item.i);

    applyResolvedLayout(swappedLayout, {
      compactUp: true,
      frozenItemIds,
    });
  };

  const handleResizeStop = (layout: readonly GridLayoutItem[]) => {
    applyResolvedLayout(layout, { compactUp: true });
  };

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

  const selectedListFilterItem = listFilterItems.find((item) => item.id === selectedListFilterId) ?? listFilterItems[0];

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
        onOpenArchivedCards={() => navigate('/archived-cards')}
        onOpenProfileSettings={() => navigate('/settings/profile')}
        onOpenOrganizationSettings={() => navigate('/settings/organizations')}
        onOpenGoalSettings={() => {
          setGoalDraft(user?.target || '');
          setShowGoalModal(true);
        }}
        onOpenViewModeSwitch={() => setShowViewModeModal(true)}
      />

      <main className="main">
        {viewMode === 'board' ? (
          <div ref={gridContainerRef}>
            <GridLayoutComponent
              key={`grid-${gridCols}-${cards.map((c: Card) => `${c.id}:${c.x}:${c.y}`).join('|')}`}
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
                    const cardTodos = getTodosForCard(card, todos, remoteCardTodos);
                    const sortedCardTodos = sortTodosForCardDisplay(
                      Array.isArray(cardTodos) ? cardTodos : [],
                    );
                    const showCompleted = showCompletedByCard[card.id] ?? true;
                    const visibleCardTodos = showCompleted
                      ? sortedCardTodos
                      : sortedCardTodos.filter((todo) => !isCompletedTodo(todo));
                    const cardTagIds = (Array.isArray(card.tags) ? card.tags : []).map((tag) => tag.id);
                    const isCardOwner = card.userId === user?.id;
                    const isTapdCard = card.pluginType === 'tapd';
                    const canManageSharedTodos = !isTapdCard && (isCardOwner || card.cardType === 'shared');
                    const canQuickCreate = canManageSharedTodos;
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
                                {card.name}
                                {card.cardType === 'shared' ? ' · 共享' : ''}
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
                            {canManageSharedTodos && (
                              <button
                                onMouseDown={(e) => e.stopPropagation()}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleOpenTodoModal(undefined, card);
                                }}
                                title="添加待办"
                              >
                                +
                              </button>
                            )}
                            {isCardOwner && (
                              <button
                                onMouseDown={(e) => e.stopPropagation()}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleOpenCardModal(card);
                                }}
                              >
                                ✎
                              </button>
                            )}
                            {isCardOwner && (
                              <div
                                className="card-action-menu-wrap"
                                ref={openCardMenuId === card.id ? cardMenuRef : null}
                              >
                                <button
                                  className="card-actions__more-trigger"
                                  aria-haspopup="menu"
                                  aria-expanded={openCardMenuId === card.id}
                                  onMouseDown={(e) => e.stopPropagation()}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setOpenCardMenuId((prev) => (prev === card.id ? null : card.id));
                                  }}
                                >
                                  更多
                                </button>
                                {openCardMenuId === card.id && (
                                  <div className="card-action-menu" role="menu" aria-label={`${card.name}更多操作`}>
                                    <button
                                      role="menuitem"
                                      onMouseDown={(e) => e.stopPropagation()}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleArchiveCard(card.id);
                                      }}
                                    >
                                      归档卡片
                                    </button>
                                    <button
                                      role="menuitem"
                                      className="danger"
                                      onMouseDown={(e) => e.stopPropagation()}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleDeleteCard(card.id);
                                      }}
                                    >
                                      删除卡片
                                    </button>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="card-body">
                          {visibleCardTodos.map((todo: Todo) => (
                            <TodoCard
                              key={todo.id}
                              todo={todo}
                              tags={tags}
                              currentUserId={user?.id}
                              hiddenTagIds={cardTagIds}
                              onToggle={() => handleToggleTodo(todo.id, todo.status)}
                              showToggle={card.pluginType !== 'tapd'}
                              onEdit={() => {
                                if (card.pluginType === 'tapd') return;
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
        ) : (
          <section className="list-mode-shell">
            <div className="list-mode-board">
              <aside className="list-mode-pane list-mode-pane--tags">
                <div className="list-mode-pane-body list-mode-tag-list">
                  {listFilterItems.map((item) => (
                    <div
                      key={item.id}
                      className={`list-mode-tag-item-wrap ${selectedListFilterId === item.id ? 'active' : ''} ${item.kind === 'tapd_card' ? 'tapd' : ''}`}
                    >
                      <button
                        type="button"
                        className={`list-mode-tag-item ${selectedListFilterId === item.id ? 'active' : ''} ${item.kind === 'tapd_card' ? 'tapd' : ''}`}
                        onClick={() => setSelectedListFilterId(item.id)}
                      >
                        <span className="list-mode-tag-item__main">
                          <span className="list-mode-tag-item__title">{item.name}</span>
                          {item.kind === 'tapd_card' && (
                            <span className="list-mode-tag-item__badge tapd-badge tapd-badge--compact">TAPD</span>
                          )}
                        </span>
                        <span className="list-mode-tag-item__count">{item.count}</span>
                      </button>
                      {item.kind === 'tapd_card' && item.sourceCard?.userId === user?.id && (
                        <button
                          type="button"
                          className="list-mode-tag-item__settings"
                          title="设置 TAPD 卡片"
                          aria-label={`设置 ${item.name}`}
                          onClick={() => handleOpenCardModal(item.sourceCard)}
                        >
                          ⚙
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </aside>

              <section className="list-mode-pane list-mode-pane--todos">
                <div className="list-mode-pane-header">
                  <div className="list-mode-quick-create">
                    <input
                      type="text"
                      className="list-mode-quick-create__input"
                      value={listQuickCreateDraft}
                      placeholder={
                        selectedListFilterId.startsWith('tapd:')
                          ? 'TAPD 列表为只读视图，请在卡片设置中调整筛选条件'
                          : selectedListFilterId === 'all'
                          ? '快速新建待办，输入后按回车'
                          : `在“${selectedListFilterItem?.name || ''}”下快速新建待办，输入后按回车`
                      }
                      maxLength={500}
                      disabled={createTodoMutation.isPending || selectedListFilterId.startsWith('tapd:')}
                      onChange={(e) => setListQuickCreateDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                          e.preventDefault();
                          handleQuickCreateListTodo();
                        }
                      }}
                    />
                  </div>
                </div>
                <div className="list-mode-pane-body list-mode-todo-list">
                  {filteredListTodoEntries.length === 0 ? (
                    <div className="list-mode-empty">当前标签下暂无待办</div>
                  ) : (
                    filteredListTodoEntries.map((entry) => (
                      <TodoCard
                        key={entry.todo.id}
                        todo={entry.todo}
                        tags={entry.effectiveTags}
                        currentUserId={user?.id}
                        className={selectedListTodoEntry?.todo.id === entry.todo.id ? 'todo-item--selected' : undefined}
                        headerAddon={(
                          <div
                            className={`list-mode-source-badge ${entry.sourceCard?.pluginType === 'tapd' ? 'tapd-badge' : ''}`}
                          >
                            {entry.sourceCard?.pluginType === 'tapd'
                              ? `TAPD · ${entry.sourceCard.name}`
                              : entry.sourceLabel}
                          </div>
                        )}
                        onCardClick={() => setSelectedListTodoId(entry.todo.id)}
                        onToggle={() => handleToggleTodo(entry.todo.id, entry.todo.status)}
                        onEdit={() => {}}
                        onDelete={() => handleDeleteTodo(entry.todo.id)}
                        showToggle={entry.canToggle}
                        canUpdateProgress={entry.canUpdateProgress}
                        onOpenProgress={() => setSelectedListTodoId(entry.todo.id)}
                        progressButtonTitle="在右侧查看进度"
                      />
                    ))
                  )}
                </div>
              </section>

              <section className="list-mode-pane list-mode-pane--detail">
                {!selectedListTodoEntry ? (
                  <div className="list-mode-pane-body list-mode-detail-empty">
                    选择一条待办后，可在这里查看详情、编辑内容和追加进度。
                  </div>
                ) : (
                  selectedListTodoEntry.isExternal && selectedListTodoEntry.sourceCard?.pluginType === 'tapd' ? (
                    <>
                      <div className="list-mode-pane-body list-mode-tapd-detail-body">
                        {selectedTapdDetailViewUrl ? (
                          <iframe
                            key={selectedListTodoEntry.todo.id}
                            className="list-mode-tapd-iframe"
                            src={selectedTapdDetailViewUrl}
                            title={selectedListTodoEntry.todo.content}
                          />
                        ) : (
                          <div className="list-mode-detail-empty">
                            当前 TAPD 待办暂不支持生成同源详情页，请使用“打开原链接”查看。
                          </div>
                        )}
                      </div>
                    </>
                  ) : (
                  <>
                    <div className="list-mode-pane-body list-mode-detail-body">
                      <label className="list-mode-field">
                        <textarea
                          className="goal-input list-mode-detail-textarea"
                          value={listDetailContent}
                          maxLength={2000}
                          disabled={!selectedListTodoEntry.canEdit || updateTodoMutation.isPending}
                          onChange={(e) => setListDetailContent(e.target.value)}
                        />
                      </label>

                      <div className="list-mode-detail-grid">
                        <label className="list-mode-field">
                          <span>截止时间</span>
                          <input
                            className="goal-input report-date-input"
                            type="datetime-local"
                            value={listDetailDueAt}
                            disabled={!selectedListTodoEntry.canEdit || updateTodoMutation.isPending}
                            onChange={(e) => setListDetailDueAt(e.target.value)}
                          />
                        </label>
                        <label className="list-mode-field">
                          <span>执行时间</span>
                          <input
                            className="goal-input report-date-input"
                            type="datetime-local"
                            value={listDetailExecuteAt}
                            disabled={!selectedListTodoEntry.canEdit || updateTodoMutation.isPending}
                            onChange={(e) => setListDetailExecuteAt(e.target.value)}
                          />
                        </label>
                      </div>

                      <div className="list-mode-field">
                        <span>标签</span>
                        <div className="tag-selector list-mode-tag-selector">
                          {(Array.isArray(tags) ? tags : []).map((tag) => {
                            const isSelected = listDetailTagIds.includes(tag.id);
                            const isDisabled = selectedListTodoEntry.isExternal || selectedListTodoEntry.sourceCard?.cardType === 'shared';
                            return (
                              <button
                                key={tag.id}
                                type="button"
                                className={`tag-option ${isSelected ? 'selected' : ''} ${isDisabled ? 'disabled' : ''}`}
                                onClick={() => handleToggleListDetailTag(tag.id)}
                                disabled={isDisabled}
                              >
                                {tag.name}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      <div className="progress-history list-mode-progress-section">
                        <div className="progress-history-title">进度列表</div>
                        {selectedTodoProgressEntries.length === 0 ? (
                          <div className="progress-history-empty">暂无记录</div>
                        ) : (
                          selectedTodoProgressEntries.map((entry) => (
                            <div key={entry.id} className="progress-history-item">
                              <div className="progress-history-time">
                                {new Date(entry.createdAt).toLocaleString('zh-CN')}
                              </div>
                              <div className="progress-history-content">{entry.content}</div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </>
                  )
                )}
              </section>
            </div>
          </section>
        )}
      </main>

      {viewMode === 'list' && selectedListTodoEntry && (
        <div
          className={`list-mode-screen-floating-actions ${showListDetailFloatingActions ? 'visible' : ''}`}
        >
          {selectedListTodoEntry.todo.url && (
            <Button
              variant="secondary"
              className="list-mode-fab list-mode-fab--secondary"
              onClick={() => window.open(selectedListTodoEntry.todo.url, '_blank')}
              title="打开原链接"
              aria-label="打开原链接"
            >
              <ExternalLinkIcon />
            </Button>
          )}
          {!selectedListTodoEntry.isExternal && selectedListTodoEntry.canEdit && (
            <Button
              variant="primary"
              className="list-mode-fab"
              onClick={handleSaveListDetail}
              disabled={updateTodoMutation.isPending}
              title={updateTodoMutation.isPending ? '保存详情中' : '保存详情'}
              aria-label={updateTodoMutation.isPending ? '保存详情中' : '保存详情'}
            >
              <SaveIcon />
            </Button>
          )}
          {!selectedListTodoEntry.isExternal && selectedListTodoEntry.canUpdateProgress && (
            <Button
              variant="primary"
              className="list-mode-fab"
              onClick={() => handleOpenProgressModal(selectedListTodoEntry.todo)}
              title="新增进度"
              aria-label="新增进度"
            >
              <PlusIcon />
            </Button>
          )}
        </div>
      )}

      {showViewModeModal && (
        <div className="overlay open" onClick={() => setShowViewModeModal(false)}>
          <div className="modal list-view-mode-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title">切换首页视图</div>
              <button className="modal-close" onClick={() => setShowViewModeModal(false)}>×</button>
            </div>
            <div className="modal-body list-view-mode-modal__body">
              <button
                type="button"
                className={`list-view-mode-option ${viewMode === 'board' ? 'active' : ''}`}
                onClick={() => {
                  setViewMode('board');
                  setShowViewModeModal(false);
                }}
              >
                <span className="list-view-mode-option__title">卡片模式</span>
                <span className="list-view-mode-option__desc">保持当前看板布局和拖拽卡片方式。</span>
              </button>
              <button
                type="button"
                className={`list-view-mode-option ${viewMode === 'list' ? 'active' : ''}`}
                onClick={() => {
                  setViewMode('list');
                  setShowViewModeModal(false);
                }}
              >
                <span className="list-view-mode-option__title">列表模式</span>
                <span className="list-view-mode-option__desc">按标签浏览待办，并在右侧直接查看详情与进度。</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {showTodoModal && (
        <TodoModal
          todo={editingTodo}
          card={activeTodoCard}
          tags={tags}
          mentionCandidates={buildMentionCandidates(activeTodoCard)}
          isSaving={createTodoMutation.isPending || updateTodoMutation.isPending || createTagMutation.isPending}
          onSave={handleSaveTodo}
          onCreateTag={(name, color) => createTagSafely({ name, color })}
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
          isSaving={createCardMutation.isPending || updateCardMutation.isPending || createTagMutation.isPending}
          onSave={handleSaveCard}
          onCreateTag={(name, color) => createTagSafely({ name, color })}
          onClose={() => {
            setShowCardModal(false);
            setEditingCard(null);
          }}
        />
      )}

      {showProgressModal && activeProgressTodo && (
        <ProgressModal
          todo={activeProgressTodo}
          entries={Array.isArray(todoProgressEntries) ? todoProgressEntries : []}
          draft={progressDraft}
          onDraftChange={setProgressDraft}
          onSave={handleSaveProgress}
          isSaving={createProgressMutation.isPending}
          onClose={() => {
            setShowProgressModal(false);
            setActiveProgressTodo(null);
          }}
        />
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
                    <span>来源：{aiReportResult.provider === 'openclaw' ? 'OpenClaw' : 'OpenAI'}</span>
                    <span>待办数：{aiReportResult.todoCount}</span>
                    <span>进度条数：{aiReportResult.progressCount}</span>
                  </div>
                  <pre>{aiReportResult.report}</pre>
                </div>
              )}
            </div>
            <div className="modal-footer">
              <Button type="button" variant="secondary" onClick={() => setShowAiReportModal(false)}>
                关闭
              </Button>
              <Button
                type="button"
                variant="primary"
                onClick={handleGenerateAiReport}
                disabled={generateAiReportMutation.isPending}
              >
                {generateAiReportMutation.isPending ? '生成中...' : '生成报告'}
              </Button>
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
              <Button type="button" variant="secondary" onClick={() => setPendingDeleteCardId(null)}>取消</Button>
              <Button type="button" variant="danger" onClick={confirmDeleteCard}>删除</Button>
            </div>
          </div>
        </div>
      )}

      {showTagModal && (
        <TagModal
          tags={tags}
          isSaving={createTagMutation.isPending || updateTagMutation.isPending || deleteTagMutation.isPending}
          onSave={handleSaveTag}
          onDelete={handleDeleteTag}
          onClose={() => setShowTagModal(false)}
        />
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
              <Button
                type="button"
                variant="secondary"
                onClick={() => setShowGoalModal(false)}
                disabled={updateProfileMutation.isPending}
              >
                取消
              </Button>
              <Button
                type="button"
                variant="primary"
                onClick={handleSaveGoal}
                disabled={updateProfileMutation.isPending}
              >
                {updateProfileMutation.isPending ? '保存中...' : '保存'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
