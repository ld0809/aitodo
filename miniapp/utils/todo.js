const { request } = require('./request');

function getMiniappHome(tagId, includeCompleted = false) {
  const query = [];
  if (tagId && tagId !== 'all') {
    query.push(`tagId=${encodeURIComponent(tagId)}`);
  }
  if (includeCompleted) {
    query.push('includeCompleted=true');
  }
  const suffix = query.length > 0 ? `?${query.join('&')}` : '';

  return request({
    url: `/miniapp/home${suffix}`,
    method: 'GET',
    auth: true
  });
}

function createTodo(payload) {
  return request({
    url: '/todos',
    method: 'POST',
    data: payload,
    auth: true
  });
}

function updateTodo(id, payload) {
  return request({
    url: `/todos/${id}`,
    method: 'PATCH',
    data: payload,
    auth: true
  });
}

function toggleTodoComplete(id, completed) {
  return request({
    url: `/todos/${id}/complete`,
    method: 'PATCH',
    data: { completed },
    auth: true
  });
}

function prepareCalendarSync(payload) {
  return request({
    url: '/miniapp/calendar-sync/prepare',
    method: 'POST',
    data: payload,
    auth: true
  });
}

function confirmCalendarSync(payload) {
  return request({
    url: '/miniapp/calendar-sync/confirm',
    method: 'POST',
    data: payload,
    auth: true
  });
}

module.exports = {
  getMiniappHome,
  createTodo,
  updateTodo,
  toggleTodoComplete,
  prepareCalendarSync,
  confirmCalendarSync
};
