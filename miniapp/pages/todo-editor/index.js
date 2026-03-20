const { createTodo, updateTodo } = require('../../utils/todo');
const { listTags, createTag } = require('../../utils/tags');

const TAG_COLOR_PRESETS = ['#2F7AF8', '#23B26D', '#FF8A3D', '#8B5CF6', '#E45C87', '#14B8A6'];
const CURRENT_YEAR = new Date().getFullYear();
const YEAR_START = CURRENT_YEAR - 1;
const YEAR_END = CURRENT_YEAR + 10;

function pad2(value) {
  return String(value).padStart(2, '0');
}

function getDaysInMonth(year, month) {
  return new Date(year, month, 0).getDate();
}

function normalizeEditorTags(tags) {
  const safeTags = Array.isArray(tags) ? tags : [];
  return safeTags
    .filter((tag) => tag && tag.id && tag.id !== 'all')
    .map((tag) => ({
      id: tag.id,
      name: tag.name,
      color: tag.color || ''
    }));
}

function mergeEditorTags() {
  const merged = [];
  const seen = new Set();

  for (let i = 0; i < arguments.length; i += 1) {
    const tags = normalizeEditorTags(arguments[i]);
    for (let j = 0; j < tags.length; j += 1) {
      const tag = tags[j];
      if (seen.has(tag.id)) {
        continue;
      }
      seen.add(tag.id);
      merged.push(tag);
    }
  }

  return merged;
}

function pickTagColor(name) {
  let total = 0;
  for (let i = 0; i < name.length; i += 1) {
    total += name.charCodeAt(i);
  }
  return TAG_COLOR_PRESETS[total % TAG_COLOR_PRESETS.length];
}

function parseIsoToDateTime(iso) {
  if (!iso) {
    return { date: '', time: '' };
  }
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    return { date: '', time: '' };
  }
  const year = d.getFullYear();
  const month = pad2(d.getMonth() + 1);
  const day = pad2(d.getDate());
  const hour = pad2(d.getHours());
  const minute = pad2(d.getMinutes());
  return {
    date: `${year}-${month}-${day}`,
    time: `${hour}:${minute}`
  };
}

function formatDueDisplay(date, time) {
  if (!date) {
    return '请选择截止时间';
  }
  return `${date} ${time || '00:00'}`;
}

function buildDuePickerColumns(year, month) {
  const years = [];
  const months = [];
  const days = [];
  const hours = [];
  const minutes = [];
  const totalDays = getDaysInMonth(year, month);

  for (let y = YEAR_START; y <= YEAR_END; y += 1) {
    years.push(`${y}年`);
  }
  for (let m = 1; m <= 12; m += 1) {
    months.push(`${pad2(m)}月`);
  }
  for (let d = 1; d <= totalDays; d += 1) {
    days.push(`${pad2(d)}日`);
  }
  for (let h = 0; h < 24; h += 1) {
    hours.push(`${pad2(h)}时`);
  }
  for (let minute = 0; minute < 60; minute += 1) {
    minutes.push(`${pad2(minute)}分`);
  }

  return [years, months, days, hours, minutes];
}

function buildDuePickerState(date, time) {
  const now = new Date();
  const selectedDate = date ? date.split('-') : [];
  const selectedTime = time ? time.split(':') : [];
  const year = Number(selectedDate[0]) || now.getFullYear();
  const month = Number(selectedDate[1]) || now.getMonth() + 1;
  const totalDays = getDaysInMonth(year, month);
  const day = Math.min(Number(selectedDate[2]) || now.getDate(), totalDays);
  const hour = Number(selectedTime[0]);
  const minute = Number(selectedTime[1]);
  const columns = buildDuePickerColumns(year, month);

  return {
    duePickerColumns: columns,
    duePickerValue: [
      Math.max(0, Math.min(year - YEAR_START, columns[0].length - 1)),
      Math.max(0, Math.min(month - 1, columns[1].length - 1)),
      Math.max(0, Math.min(day - 1, columns[2].length - 1)),
      Math.max(0, Math.min(Number.isNaN(hour) ? now.getHours() : hour, columns[3].length - 1)),
      Math.max(0, Math.min(Number.isNaN(minute) ? now.getMinutes() : minute, columns[4].length - 1))
    ]
  };
}

function getDateTimeFromPickerValue(value) {
  const safeValue = Array.isArray(value) ? value : [0, 0, 0, 0, 0];
  const year = YEAR_START + Number(safeValue[0] || 0);
  const month = Number(safeValue[1] || 0) + 1;
  const day = Number(safeValue[2] || 0) + 1;
  const hour = Number(safeValue[3] || 0);
  const minute = Number(safeValue[4] || 0);

  return {
    date: `${year}-${pad2(month)}-${pad2(day)}`,
    time: `${pad2(hour)}:${pad2(minute)}`
  };
}

Page({
  data: {
    navTitle: '新建待办',
    mode: 'create',
    todoId: '',
    content: '',
    tags: [],
    selectedTagId: '',
    newTagName: '',
    creatingTag: false,
    dueDate: '',
    dueTime: '',
    dueDisplay: '请选择截止时间',
    duePickerColumns: [[], [], [], [], []],
    duePickerValue: [0, 0, 0, 0, 0],
    loading: false,
    errorMessage: ''
  },

  async onLoad(options) {
    const safeOptions = options || {};
    this.options = safeOptions;
    const dateTime = parseIsoToDateTime(safeOptions.dueAt);
    const duePickerState = buildDuePickerState(dateTime.date, dateTime.time);

    this.setData({
      navTitle: (safeOptions.mode || 'create') === 'edit' ? '编辑待办' : '新建待办',
      mode: safeOptions.mode || 'create',
      todoId: safeOptions.todoId || '',
      content: decodeURIComponent(safeOptions.content || ''),
      dueDate: dateTime.date,
      dueTime: dateTime.time,
      dueDisplay: formatDueDisplay(dateTime.date, dateTime.time),
      duePickerColumns: duePickerState.duePickerColumns,
      duePickerValue: duePickerState.duePickerValue
    });

    await this.bootstrapTags();
  },

  async bootstrapTags() {
    const cachedTags = normalizeEditorTags(wx.getStorageSync('cached_tags') || []);
    if (cachedTags.length > 0) {
      this.applyTags(cachedTags, this.options.tagId);
    }

    try {
      const remoteTags = normalizeEditorTags(await listTags());
      const mergedTags = mergeEditorTags(remoteTags, cachedTags, this.data.tags);
      this.applyTags(mergedTags, this.options.tagId);
      wx.setStorageSync('cached_tags', mergedTags);
    } catch (error) {
      if (cachedTags.length === 0) {
        this.setData({ errorMessage: error.message || '加载标签失败' });
      }
    }
  },

  applyTags(tags, preferredTagId) {
    const safeTags = normalizeEditorTags(tags);
    let selectedTagId = '';

    if (preferredTagId && preferredTagId !== 'all') {
      const preferredTag = safeTags.find((item) => item.id === preferredTagId);
      selectedTagId = preferredTag ? preferredTag.id : '';
    }

    if (!selectedTagId && this.data.selectedTagId) {
      const existingTag = safeTags.find((item) => item.id === this.data.selectedTagId);
      selectedTagId = existingTag ? existingTag.id : '';
    }

    if (!selectedTagId && safeTags.length > 0 && this.data.mode === 'create') {
      selectedTagId = safeTags[0].id;
    }

    this.setData({
      tags: safeTags,
      selectedTagId
    });
  },

  onContentInput(event) {
    this.setData({ content: event.detail.value, errorMessage: '' });
  },

  onNewTagInput(event) {
    this.setData({
      newTagName: event.detail.value,
      errorMessage: ''
    });
  },

  onTagSelect(event) {
    const id = event.currentTarget.dataset.id;
    if (!id) {
      return;
    }

    this.setData({
      selectedTagId: id,
      errorMessage: ''
    });
  },

  onDuePickerColumnChange(event) {
    const detail = event.detail || {};
    const column = Number(detail.column);
    const value = Number(detail.value);
    const nextValue = [...this.data.duePickerValue];
    nextValue[column] = value;

    if (column === 0 || column === 1) {
      const year = YEAR_START + nextValue[0];
      const month = nextValue[1] + 1;
      const nextColumns = buildDuePickerColumns(year, month);
      const maxDayIndex = nextColumns[2].length - 1;
      if (nextValue[2] > maxDayIndex) {
        nextValue[2] = maxDayIndex;
      }

      this.setData({
        duePickerColumns: nextColumns,
        duePickerValue: nextValue
      });
      return;
    }

    this.setData({
      duePickerValue: nextValue
    });
  },

  onDuePickerChange(event) {
    const value = event.detail.value || [0, 0, 0, 0, 0];
    const nextDateTime = getDateTimeFromPickerValue(value);
    const nextColumns = buildDuePickerColumns(
      Number(nextDateTime.date.slice(0, 4)),
      Number(nextDateTime.date.slice(5, 7))
    );

    this.setData({
      dueDate: nextDateTime.date,
      dueTime: nextDateTime.time,
      dueDisplay: formatDueDisplay(nextDateTime.date, nextDateTime.time),
      duePickerColumns: nextColumns,
      duePickerValue: value,
      errorMessage: ''
    });
  },

  clearDueDateTime() {
    const nextPickerState = buildDuePickerState('', '');
    this.setData({
      dueDate: '',
      dueTime: '',
      dueDisplay: formatDueDisplay('', ''),
      duePickerColumns: nextPickerState.duePickerColumns,
      duePickerValue: nextPickerState.duePickerValue
    });
  },

  async handleCreateTagIfNeeded() {
    if (this.data.creatingTag) {
      return false;
    }

    const name = this.data.newTagName.trim();
    if (!name) {
      return false;
    }

    const existingTag = this.data.tags.find((tag) => tag.name === name);
    if (existingTag) {
      this.setData({
        selectedTagId: existingTag.id,
        newTagName: '',
        errorMessage: ''
      });
      return true;
    }

    this.setData({
      creatingTag: true,
      errorMessage: ''
    });

    try {
      const createdTag = await createTag({
        name,
        color: pickTagColor(name)
      });
      const tags = mergeEditorTags([createdTag], this.data.tags);
      wx.setStorageSync('cached_tags', tags);
      this.setData({
        tags,
        selectedTagId: createdTag.id,
        newTagName: ''
      });
      wx.showToast({ title: '标签已创建', icon: 'success' });
      return true;
    } catch (error) {
      this.setData({ errorMessage: error.message || '创建标签失败' });
      return false;
    } finally {
      this.setData({ creatingTag: false });
    }
  },

  async onNewTagBlur() {
    await this.handleCreateTagIfNeeded();
  },

  async handleSave() {
    if (this.data.loading) {
      return;
    }

    if (!this.data.content.trim()) {
      this.setData({ errorMessage: '待办内容不能为空' });
      return;
    }

    if (this.data.newTagName.trim()) {
      const ok = await this.handleCreateTagIfNeeded();
      if (!ok && !this.data.selectedTagId) {
        return;
      }
    }

    if (this.data.mode === 'create' && !this.data.selectedTagId) {
      this.setData({ errorMessage: '新建待办必须指定正式标签' });
      return;
    }

    this.setData({ loading: true, errorMessage: '' });
    try {
      const payload = {
        content: this.data.content.trim()
      };

      if (this.data.selectedTagId) {
        payload.tagIds = [this.data.selectedTagId];
      }

      if (this.data.dueDate && this.data.dueTime) {
        payload.dueAt = new Date(`${this.data.dueDate}T${this.data.dueTime}:00`).toISOString();
      }

      if (this.data.mode === 'edit' && this.data.todoId) {
        await updateTodo(this.data.todoId, payload);
      } else {
        await createTodo(payload);
      }

      wx.showToast({ title: '保存成功', icon: 'success' });
      const pages = getCurrentPages();
      const prevPage = pages[pages.length - 2];
      if (prevPage && typeof prevPage.refreshHomeData === 'function') {
        prevPage.refreshHomeData();
      }
      wx.navigateBack();
    } catch (error) {
      this.setData({ errorMessage: error.message || '保存失败' });
    } finally {
      this.setData({ loading: false });
    }
  }
});
