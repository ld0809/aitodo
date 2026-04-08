const CALENDAR_AUTH_SCOPE = 'scope.addPhoneCalendar';
const CALENDAR_PERMISSION_DENIED_MESSAGE = '请在小程序设置中开启“写入手机日历”权限后重试';
const CALENDAR_UNSUPPORTED_MESSAGE = '当前微信版本或设备不支持写入手机日历';
const CALENDAR_INVALID_DUE_AT_MESSAGE = '待办截止时间无效，无法同步到日历';

function buildPhoneCalendarPayload(todo, options = {}) {
  const dueAt = new Date(todo.dueAt);
  if (Number.isNaN(dueAt.getTime())) {
    throw new Error('invalid dueAt');
  }

  const durationSeconds = options.durationSeconds || 60;
  const startTime = Math.floor(dueAt.getTime() / 1000);
  const title = String(todo.content || '').trim() || 'AI待办提醒';

  return {
    title,
    startTime,
    endTime: startTime + durationSeconds,
    description: '来自 AI待办 小程序同步'
  };
}

function normalizeCalendarErrorMessage(error) {
  const rawMessage = String((error && (error.message || error.errMsg)) || '').trim();
  const lowerMessage = rawMessage.toLowerCase();

  if (!rawMessage) {
    return '写入手机日历失败';
  }

  if (rawMessage.includes('invalid dueAt')) {
    return CALENDAR_INVALID_DUE_AT_MESSAGE;
  }

  if (
    lowerMessage.includes('auth deny') ||
    lowerMessage.includes('auth denied') ||
    lowerMessage.includes('permission denied') ||
    lowerMessage.includes('authorize:fail')
  ) {
    return CALENDAR_PERMISSION_DENIED_MESSAGE;
  }

  if (lowerMessage.includes('cancel')) {
    return '已取消写入手机日历';
  }

  if (
    lowerMessage.includes('not support') ||
    lowerMessage.includes('not supported') ||
    lowerMessage.includes('not a function')
  ) {
    return CALENDAR_UNSUPPORTED_MESSAGE;
  }

  return rawMessage;
}

module.exports = {
  CALENDAR_AUTH_SCOPE,
  CALENDAR_PERMISSION_DENIED_MESSAGE,
  CALENDAR_UNSUPPORTED_MESSAGE,
  buildPhoneCalendarPayload,
  normalizeCalendarErrorMessage
};
