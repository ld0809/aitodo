const { request } = require('./request');

function register(email, password) {
  return request({
    url: '/auth/register',
    method: 'POST',
    data: { email, password }
  });
}

function sendEmailCode(email) {
  return request({
    url: '/auth/send-email-code',
    method: 'POST',
    data: { email }
  });
}

function verifyEmail(email, code) {
  return request({
    url: '/auth/verify-email',
    method: 'POST',
    data: { email, code }
  });
}

function login(email, password) {
  return request({
    url: '/auth/login',
    method: 'POST',
    data: { email, password }
  });
}

function getBindingStatus() {
  return request({
    url: '/miniapp/binding',
    method: 'GET',
    auth: true
  });
}

function bindMiniappUser(payload) {
  return request({
    url: '/miniapp/bind',
    method: 'POST',
    data: payload,
    auth: true
  });
}

function bindMiniappByCode(payload) {
  return request({
    url: '/miniapp/wechat/bind-by-code',
    method: 'POST',
    data: payload,
    auth: true
  });
}

module.exports = {
  register,
  sendEmailCode,
  verifyEmail,
  login,
  getBindingStatus,
  bindMiniappUser,
  bindMiniappByCode
};
