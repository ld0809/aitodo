const {
  getMiniappHome,
  toggleTodoComplete,
  prepareCalendarSync,
  confirmCalendarSync
} = require('../../utils/todo');

function formatDueText(iso) {
  if (!iso) {
    return '';
  }
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    return '';
  }
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hour = String(d.getHours()).padStart(2, '0');
  const minute = String(d.getMinutes()).padStart(2, '0');
  return `${month}-${day} ${hour}:${minute}`;
}

function normalizeTodo(todo) {
  const completed = todo.status !== 'todo';
  const firstTag = todo.tags && todo.tags[0] ? todo.tags[0] : null;
  const dueText = formatDueText(todo.dueAt);
  return {
    ...todo,
    _completed: completed,
    _doneClass: completed ? 'todo-done' : '',
    _dueText: dueText,
    _dueTextDisplay: dueText || '无截止时间',
    _tagName: firstTag ? firstTag.name : '无标签',
    _tagId: firstTag ? firstTag.id : ''
  };
}

function normalizeTags(tags, selectedTagId, draggingTagId) {
  return (tags || []).map((tag) => ({
    id: tag.id,
    name: tag.name,
    fixed: !!tag.fixed,
    color: tag.color || '',
    _activeClass: selectedTagId === tag.id ? 'tag-active' : '',
    _draggingClass: draggingTagId === tag.id ? 'tag-dragging' : ''
  }));
}

function getDevicePayload() {
  const deviceInfo = typeof wx.getDeviceInfo === 'function' ? wx.getDeviceInfo() : {};
  const windowInfo = typeof wx.getWindowInfo === 'function' ? wx.getWindowInfo() : wx.getSystemInfoSync();
  return {
    brand: deviceInfo.brand || 'unknown',
    model: deviceInfo.model || 'unknown',
    screenWidth: windowInfo.screenWidth || 1,
    screenHeight: windowInfo.screenHeight || 1
  };
}

function getNavMetrics() {
  let statusBarHeight = 20;

  try {
    const windowInfo = typeof wx.getWindowInfo === 'function' ? wx.getWindowInfo() : wx.getSystemInfoSync();
    statusBarHeight = windowInfo.statusBarHeight || 20;
  } catch (error) {}
  const drawerTopPx = statusBarHeight + 8;
  return {
    drawerTopPx,
    drawerContentStyle: `padding-top:${drawerTopPx}px;`
  };
}

Page({
  data: {
    loading: false,
    refreshing: false,
    syncing: false,
    includeCompleted: false,
    showUncompletedOnly: true,
    drawerVisible: false,
    tags: [{ id: 'all', name: '全部', fixed: true }],
    selectedTagId: 'all',
    selectedTagName: '全部',
    todos: [],
    emptyVisible: false,
    userNickname: '',
    draggingTagId: '',
    draggingIndex: -1,
    dragStartY: 0,
    drawerContentStyle: '',
    drawerClass: '',
    syncSheetClass: '',
    syncResultVisible: false,
    syncResult: {
      added: 0,
      skipped: 0,
      failed: 0
    }
  },

  onLoad() {
    this.syncLayoutMetrics();
  },

  onShow() {
    this.ensureSession();
    this.refreshHomeData();
  },

  syncLayoutMetrics() {
    this.setData(getNavMetrics());
  },

  ensureSession() {
    const token = wx.getStorageSync('access_token');
    if (!token) {
      wx.redirectTo({ url: '/pages/email-auth/index' });
      return;
    }

    const user = wx.getStorageSync('current_user') || {};
    this.setData({ userNickname: user.nickname || user.email || '当前用户' });
  },

  async refreshHomeData() {
    this.setData({ loading: true });
    await this.loadHomeData();
    this.setData({ loading: false, refreshing: false });
  },

  async onPullDownRefresh() {
    this.setData({ refreshing: true });
    await this.loadHomeData();
    this.setData({ refreshing: false });
  },

  async loadHomeData() {
    try {
      const data = await getMiniappHome(this.data.selectedTagId, this.data.includeCompleted);
      const rawTags = data.tags || [];
      const todos = (data.todos || []).map(normalizeTodo);
      const selectedTag = rawTags.find((tag) => tag.id === this.data.selectedTagId) || rawTags[0] || { id: 'all', name: '全部' };
      const tags = normalizeTags(rawTags, selectedTag.id, this.data.draggingTagId);

      wx.setStorageSync('cached_tags', rawTags);

      this.setData({
        tags,
        todos,
        emptyVisible: todos.length === 0,
        selectedTagId: selectedTag.id,
        selectedTagName: selectedTag.name
      });
    } catch (error) {
      if (error.statusCode === 401) {
        wx.removeStorageSync('access_token');
        wx.redirectTo({ url: '/pages/email-auth/index' });
        return;
      }
      wx.showToast({ title: error.message || '加载失败', icon: 'none' });
    }
  },

  toggleDrawer() {
    const drawerVisible = !this.data.drawerVisible;
    this.setData({
      drawerVisible,
      drawerClass: drawerVisible ? 'drawer-open' : ''
    });
  },

  closeDrawer() {
    this.setData({
      drawerVisible: false,
      drawerClass: ''
    });
  },

  async selectTag(event) {
    const { id, name } = event.currentTarget.dataset;
    this.setData({
      selectedTagId: id,
      selectedTagName: name,
      drawerVisible: false,
      drawerClass: ''
    });
    await this.refreshHomeData();
  },

  onTagTouchStart(event) {
    const index = Number(event.currentTarget.dataset.index);
    if (index <= 0) {
      return;
    }
    const touch = event.touches && event.touches[0];
    if (!touch) {
      return;
    }

    this.setData({
      draggingIndex: index,
      draggingTagId: this.data.tags[index].id,
      dragStartY: touch.clientY
    });
  },

  onTagTouchMove(event) {
    if (this.data.draggingIndex <= 0) {
      return;
    }

    const touch = event.touches && event.touches[0];
    if (!touch) {
      return;
    }

    const offsetY = touch.clientY - this.data.dragStartY;
    const step = Math.round(offsetY / 44);
    const target = this.data.draggingIndex + step;
    const min = 1;
    const max = this.data.tags.length - 1;
    const targetIndex = Math.max(min, Math.min(max, target));

    if (targetIndex === this.data.draggingIndex) {
      return;
    }

    const nextTags = [...this.data.tags];
    const [movingTag] = nextTags.splice(this.data.draggingIndex, 1);
    nextTags.splice(targetIndex, 0, movingTag);
    const normalizedTags = normalizeTags(nextTags, this.data.selectedTagId, movingTag.id);

    this.setData({
      tags: normalizedTags,
      draggingIndex: targetIndex,
      dragStartY: touch.clientY
    });

    wx.setStorageSync(
      'cached_tags',
      normalizedTags.map((tag) => ({
        id: tag.id,
        name: tag.name,
        fixed: tag.fixed,
        color: tag.color
      })),
    );
  },

  onTagTouchEnd() {
    const tags = normalizeTags(this.data.tags, this.data.selectedTagId, '');
    this.setData({
      tags,
      draggingTagId: '',
      draggingIndex: -1,
      dragStartY: 0
    });
  },

  onToggleUncompleted(event) {
    const showUncompletedOnly = !!event.detail.value;
    this.setData({
      includeCompleted: !showUncompletedOnly,
      showUncompletedOnly
    });
    this.refreshHomeData();
  },

  openCreateTodo() {
    wx.navigateTo({
      url: `/pages/todo-editor/index?mode=create&tagId=${encodeURIComponent(this.data.selectedTagId)}`
    });
  },

  openTodoEditor(event) {
    const dataset = event.currentTarget.dataset;
    const content = encodeURIComponent(dataset.content || '');
    const dueAt = dataset.dueAt ? encodeURIComponent(dataset.dueAt) : '';
    const tagId = dataset.tagId || '';
    wx.navigateTo({
      url:
        `/pages/todo-editor/index?mode=edit&todoId=${dataset.todoId}` +
        `&content=${content}&dueAt=${dueAt}&tagId=${encodeURIComponent(tagId)}`
    });
  },

  noop() {},

  async onTodoCompleteChange(event) {
    const id = event.currentTarget.dataset.id;
    const wasCompleted = !!event.currentTarget.dataset.completed;
    try {
      await toggleTodoComplete(id, !wasCompleted);
      await this.refreshHomeData();
    } catch (error) {
      wx.showToast({ title: error.message || '更新失败', icon: 'none' });
    }
  },

  async handleSync() {
    if (this.data.syncing) {
      return;
    }

    this.setData({ syncing: true });

    try {
      const payload = {
        device: getDevicePayload()
      };
      if (this.data.selectedTagId !== 'all') {
        payload.tagId = this.data.selectedTagId;
      }
      payload.includeCompleted = this.data.includeCompleted;

      const prepareData = await prepareCalendarSync(payload);
      const todosToSync = prepareData.todosToSync || [];
      const skipped = Number(prepareData.alreadySyncedCount || 0);

      if (todosToSync.length === 0) {
        this.setData({
          syncResultVisible: true,
          syncSheetClass: 'sync-sheet-open',
          syncResult: { added: 0, skipped, failed: 0 },
          drawerVisible: false,
          drawerClass: ''
        });
        return;
      }

      const successTodoIds = [];
      let failed = 0;

      for (const todo of todosToSync) {
        const ok = await this.addTodoToCalendar(todo);
        if (ok) {
          successTodoIds.push(todo.id);
        } else {
          failed += 1;
        }
      }

      if (successTodoIds.length > 0) {
        await confirmCalendarSync({
          device: getDevicePayload(),
          todoIds: successTodoIds
        });
      }

      this.setData({
        syncResultVisible: true,
        syncSheetClass: 'sync-sheet-open',
        syncResult: {
          added: successTodoIds.length,
          skipped,
          failed
        },
        drawerVisible: false,
        drawerClass: ''
      });
    } catch (error) {
      wx.showToast({ title: error.message || '同步失败', icon: 'none' });
    } finally {
      this.setData({ syncing: false });
    }
  },

  addTodoToCalendar(todo) {
    return new Promise((resolve) => {
      if (typeof wx.addPhoneCalendar !== 'function') {
        resolve(false);
        return;
      }

      const dueAt = new Date(todo.dueAt);
      const startDate = `${dueAt.getFullYear()}-${String(dueAt.getMonth() + 1).padStart(2, '0')}-${String(dueAt.getDate()).padStart(2, '0')}`;
      const startTime = `${String(dueAt.getHours()).padStart(2, '0')}:${String(dueAt.getMinutes()).padStart(2, '0')}`;

      wx.addPhoneCalendar({
        title: todo.content,
        startTime,
        startDate,
        description: '来自 AI待办 小程序同步',
        success: () => resolve(true),
        fail: () => resolve(false)
      });
    });
  },

  closeSyncResult() {
    this.setData({
      syncResultVisible: false,
      syncSheetClass: ''
    });
  }
});
