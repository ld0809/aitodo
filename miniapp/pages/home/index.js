const {
  getMiniappHome,
  toggleTodoComplete,
  prepareCalendarSync,
  confirmCalendarSync
} = require('../../utils/todo');
const {
  CALENDAR_AUTH_SCOPE,
  CALENDAR_PERMISSION_DENIED_MESSAGE,
  CALENDAR_UNSUPPORTED_MESSAGE,
  buildPhoneCalendarPayload,
  normalizeCalendarErrorMessage
} = require('../../utils/calendar-sync');

const TODO_ACTION_WIDTH = 96;
const TODO_ACTION_OPEN_THRESHOLD = 36;

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
    _tagId: firstTag ? firstTag.id : '',
    _swipeOffset: 0,
    _swipeStyle: 'transform: translateX(0px);',
    _swipeActionClass: todo.dueAt ? '' : 'todo-calendar-action-disabled'
  };
}

function applyTodoSwipeState(todos, activeTodoId, offsetPx) {
  return (todos || []).map((todo) => {
    const currentOffset = todo.id === activeTodoId ? offsetPx : 0;
    return {
      ...todo,
      _swipeOffset: currentOffset,
      _swipeStyle: `transform: translateX(${currentOffset}px);`
    };
  });
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
    syncQueue: [],
    syncCursor: 0,
    syncActionLabel: '',
    currentSyncTodoContent: '',
    calendarPermissionReady: false,
    swipeTodoId: '',
    swipeStartX: 0,
    swipeStartY: 0,
    swipeBaseOffset: 0,
    swipeCurrentOffset: 0,
    activeSwipeTodoId: '',
    syncResult: {
      added: 0,
      skipped: 0,
      failed: 0,
      message: ''
    }
  },

  onLoad() {
    this.syncLayoutMetrics();
  },

  onShow() {
    this.ensureSession();
    this.syncLayoutMetrics();
    this.refreshCalendarPermissionState();
    this.refreshHomeData();
  },

  refreshCalendarPermissionState() {
    if (typeof wx.addPhoneCalendar !== 'function') {
      this.setData({ calendarPermissionReady: false });
      return;
    }

    if (typeof wx.getSetting !== 'function') {
      this.setData({ calendarPermissionReady: true });
      return;
    }

    wx.getSetting({
      success: (res) => {
        const authSetting = (res && res.authSetting) || {};
        this.setData({ calendarPermissionReady: authSetting[CALENDAR_AUTH_SCOPE] === true });
      },
      fail: () => {
        this.setData({ calendarPermissionReady: false });
      }
    });
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
        todos: applyTodoSwipeState(todos, this.data.activeSwipeTodoId, this.data.swipeCurrentOffset),
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
    this.closeSwipeActions();
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
    this.closeSwipeActions();
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
    this.closeSwipeActions();
    const showUncompletedOnly = !!event.detail.value;
    this.setData({
      includeCompleted: !showUncompletedOnly,
      showUncompletedOnly
    });
    this.refreshHomeData();
  },

  openCreateTodo() {
    this.closeSwipeActions();
    wx.navigateTo({
      url: `/pages/todo-editor/index?mode=create&tagId=${encodeURIComponent(this.data.selectedTagId)}`
    });
  },

  openTodoEditor(event) {
    if (this.data.activeSwipeTodoId === event.currentTarget.dataset.todoId) {
      this.closeSwipeActions();
      return;
    }
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

  onTodoTouchStart(event) {
    const touch = event.touches && event.touches[0];
    const todoId = event.currentTarget.dataset.todoId;
    if (!touch || !todoId) {
      return;
    }

    const baseOffset = this.data.activeSwipeTodoId === todoId ? -TODO_ACTION_WIDTH : 0;
    this.setData({
      swipeTodoId: todoId,
      swipeStartX: touch.clientX,
      swipeStartY: touch.clientY,
      swipeBaseOffset: baseOffset,
      swipeCurrentOffset: baseOffset
    });
  },

  onTodoTouchMove(event) {
    const touch = event.touches && event.touches[0];
    const swipeTodoId = this.data.swipeTodoId;
    if (!touch || !swipeTodoId) {
      return;
    }

    const deltaX = touch.clientX - this.data.swipeStartX;
    const deltaY = touch.clientY - this.data.swipeStartY;
    if (Math.abs(deltaY) > Math.abs(deltaX) && Math.abs(deltaY) > 8) {
      return;
    }

    const nextOffset = Math.max(-TODO_ACTION_WIDTH, Math.min(0, this.data.swipeBaseOffset + deltaX));
    this.setData({
      swipeCurrentOffset: nextOffset,
      activeSwipeTodoId: swipeTodoId,
      todos: applyTodoSwipeState(this.data.todos, swipeTodoId, nextOffset)
    });
  },

  onTodoTouchEnd() {
    const swipeTodoId = this.data.swipeTodoId;
    if (!swipeTodoId) {
      return;
    }

    const shouldOpen = this.data.swipeCurrentOffset <= -TODO_ACTION_OPEN_THRESHOLD;
    const activeSwipeTodoId = shouldOpen ? swipeTodoId : '';
    const finalOffset = shouldOpen ? -TODO_ACTION_WIDTH : 0;

    this.setData({
      swipeTodoId: '',
      swipeStartX: 0,
      swipeStartY: 0,
      swipeBaseOffset: 0,
      swipeCurrentOffset: finalOffset,
      activeSwipeTodoId,
      todos: applyTodoSwipeState(this.data.todos, activeSwipeTodoId, finalOffset)
    });
  },

  closeSwipeActions() {
    if (!this.data.activeSwipeTodoId && !this.data.swipeTodoId) {
      return;
    }

    this.setData({
      swipeTodoId: '',
      swipeStartX: 0,
      swipeStartY: 0,
      swipeBaseOffset: 0,
      swipeCurrentOffset: 0,
      activeSwipeTodoId: '',
      todos: applyTodoSwipeState(this.data.todos, '', 0)
    });
  },

  async handleTodoCalendarTap(event) {
    const todoId = event.currentTarget.dataset.todoId;
    const todo = (this.data.todos || []).find((item) => item.id === todoId);
    if (!todo) {
      return;
    }

    if (!todo.dueAt) {
      wx.showToast({ title: '请先给待办设置截止时间', icon: 'none' });
      return;
    }

    let prepareData;
    try {
      prepareData = await prepareCalendarSync({
        device: getDevicePayload(),
        todoIds: [todo.id],
        includeCompleted: true
      });
    } catch (error) {
      wx.showToast({ title: error.message || '同步状态检查失败', icon: 'none' });
      return;
    }

    if ((prepareData.todosToSync || []).length === 0 && Number(prepareData.alreadySyncedCount || 0) > 0) {
      this.closeSwipeActions();
      wx.showToast({ title: '当前待办已同步', icon: 'none' });
      return;
    }

    if (!this.data.calendarPermissionReady) {
      try {
        await this.ensureCalendarPermission();
        this.setData({ calendarPermissionReady: true });
        wx.showToast({ title: '权限已开启，请再点一次', icon: 'none' });
      } catch (error) {
        wx.showToast({ title: error.message || CALENDAR_PERMISSION_DENIED_MESSAGE, icon: 'none' });
      } finally {
        this.refreshCalendarPermissionState();
      }
      return;
    }

    const result = await this.addTodoToCalendar(todo);
    if (!result.ok) {
      wx.showToast({ title: result.message || '添加到日历失败', icon: 'none' });
      return;
    }

    try {
      await confirmCalendarSync({
        device: getDevicePayload(),
        todoIds: [todo.id]
      });
    } catch (error) {
      wx.showToast({ title: error.message || '同步记录保存失败', icon: 'none' });
      return;
    }

    this.closeSwipeActions();
    wx.showToast({ title: '已添加到日历', icon: 'success' });
  },

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
    this.closeSwipeActions();
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
          syncQueue: [],
          syncCursor: 0,
          syncActionLabel: '',
          currentSyncTodoContent: '',
          syncResult: { added: 0, skipped, failed: 0, message: '' },
          drawerVisible: false,
          drawerClass: ''
        });
        return;
      }

      this.setData({
        syncResultVisible: true,
        syncSheetClass: 'sync-sheet-open',
        syncQueue: todosToSync,
        syncCursor: 0,
        syncActionLabel: this.buildSyncActionLabel(0, todosToSync.length),
        currentSyncTodoContent: todosToSync[0] ? todosToSync[0].content : '',
        syncResult: {
          added: 0,
          skipped,
          failed: 0,
          message: '微信要求写入手机日历必须由用户点击触发，请点击下方按钮逐条添加。'
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

  buildSyncActionLabel(cursor, total) {
    if (total <= 0 || cursor >= total) {
      return '';
    }
    return `添加第 ${cursor + 1}/${total} 条到日历`;
  },

  ensureCalendarPermission() {
    if (typeof wx.addPhoneCalendar !== 'function') {
      return Promise.reject({ message: CALENDAR_UNSUPPORTED_MESSAGE });
    }

    if (typeof wx.getSetting !== 'function' || typeof wx.authorize !== 'function') {
      return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
      wx.getSetting({
        success: (res) => {
          const authSetting = (res && res.authSetting) || {};
          const scopeStatus = authSetting[CALENDAR_AUTH_SCOPE];

          if (scopeStatus === true) {
            resolve();
            return;
          }

          if (scopeStatus === false) {
            this.promptOpenCalendarSetting().then(resolve).catch(reject);
            return;
          }

          wx.authorize({
            scope: CALENDAR_AUTH_SCOPE,
            success: () => resolve(),
            fail: (error) => {
              const message = normalizeCalendarErrorMessage(error) || CALENDAR_PERMISSION_DENIED_MESSAGE;
              this.promptOpenCalendarSetting(message).then(resolve).catch(reject);
            }
          });
        },
        fail: () => {
          wx.authorize({
            scope: CALENDAR_AUTH_SCOPE,
            success: () => resolve(),
            fail: (error) => reject({ message: normalizeCalendarErrorMessage(error) })
          });
        }
      });
    });
  },

  promptOpenCalendarSetting(message = CALENDAR_PERMISSION_DENIED_MESSAGE) {
    if (typeof wx.showModal !== 'function' || typeof wx.openSetting !== 'function') {
      return Promise.reject({ message });
    }

    return new Promise((resolve, reject) => {
      wx.showModal({
        title: '需要日历权限',
        content: message,
        confirmText: '去开启',
        cancelText: '取消',
        success: (modalRes) => {
          if (!modalRes.confirm) {
            reject({ message });
            return;
          }

          wx.openSetting({
            success: (settingRes) => {
              const authSetting = (settingRes && settingRes.authSetting) || {};
              if (authSetting[CALENDAR_AUTH_SCOPE]) {
                resolve();
                return;
              }
              reject({ message: CALENDAR_PERMISSION_DENIED_MESSAGE });
            },
            fail: (error) => reject({ message: normalizeCalendarErrorMessage(error) })
          });
        },
        fail: (error) => reject({ message: normalizeCalendarErrorMessage(error) })
      });
    });
  },

  async handleSyncActionTap() {
    const queue = this.data.syncQueue || [];
    const cursor = Number(this.data.syncCursor || 0);

    if (cursor >= queue.length) {
      this.closeSyncResult();
      return;
    }

    if (!this.data.calendarPermissionReady) {
      try {
        await this.ensureCalendarPermission();
        this.setData({
          calendarPermissionReady: true,
          syncResult: {
            ...this.data.syncResult,
            message: '日历权限已开启，请再次点击按钮继续同步。'
          }
        });
      } catch (error) {
        this.setData({
          syncResult: {
            ...this.data.syncResult,
            message: error.message || CALENDAR_PERMISSION_DENIED_MESSAGE
          }
        });
      } finally {
        this.refreshCalendarPermissionState();
      }
      return;
    }

    const currentTodo = queue[cursor];
    const result = await this.addTodoToCalendar(currentTodo);

    let nextAdded = this.data.syncResult.added;
    let nextFailed = this.data.syncResult.failed;
    let nextMessage = result.message || '';

    if (result.ok) {
      try {
        await confirmCalendarSync({
          device: getDevicePayload(),
          todoIds: [currentTodo.id]
        });
        nextAdded += 1;
        nextMessage = '';
      } catch (error) {
        nextFailed += 1;
        nextMessage = error.message || '同步记录保存失败';
      }
    } else {
      nextFailed += 1;
    }

    const nextCursor = cursor + 1;
    const nextQueueDone = nextCursor >= queue.length;

    this.setData({
      syncCursor: nextCursor,
      syncActionLabel: nextQueueDone ? '' : this.buildSyncActionLabel(nextCursor, queue.length),
      currentSyncTodoContent: nextQueueDone ? '' : (queue[nextCursor] ? queue[nextCursor].content : ''),
      syncResult: {
        ...this.data.syncResult,
        added: nextAdded,
        failed: nextFailed,
        message: nextQueueDone ? nextMessage : (nextMessage || `已处理 ${nextCursor}/${queue.length} 条，请继续点击添加下一条。`)
      }
    });
  },

  addTodoToCalendar(todo) {
    return new Promise((resolve) => {
      if (typeof wx.addPhoneCalendar !== 'function') {
        resolve({
          ok: false,
          message: CALENDAR_UNSUPPORTED_MESSAGE
        });
        return;
      }

      let payload;
      try {
        payload = buildPhoneCalendarPayload(todo);
      } catch (error) {
        resolve({
          ok: false,
          message: normalizeCalendarErrorMessage(error)
        });
        return;
      }

      try {
        wx.addPhoneCalendar({
          ...payload,
          success: () =>
            resolve({
              ok: true
            }),
          fail: (error) => {
            console.warn('[miniapp-calendar-sync] addPhoneCalendar failed', {
              todoId: todo.id,
              errMsg: error && error.errMsg ? error.errMsg : ''
            });
            resolve({
              ok: false,
              message: normalizeCalendarErrorMessage(error)
            });
          }
        });
      } catch (error) {
        resolve({
          ok: false,
          message: normalizeCalendarErrorMessage(error)
        });
      }
    });
  },

  closeSyncResult() {
    this.setData({
      syncResultVisible: false,
      syncSheetClass: '',
      syncQueue: [],
      syncCursor: 0,
      syncActionLabel: '',
      currentSyncTodoContent: ''
    });
  }
});
