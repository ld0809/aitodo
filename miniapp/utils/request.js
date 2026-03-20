function getBaseUrl() {
  const app = getApp();
  if (app && app.globalData && app.globalData.apiBaseUrl) {
    return app.globalData.apiBaseUrl;
  }
  return 'http://127.0.0.1:3002/api/v1';
}

function getToken() {
  return wx.getStorageSync('access_token') || '';
}

function request({ url, method = 'GET', data, auth = false }) {
  const headers = {
    'Content-Type': 'application/json'
  };

  if (auth) {
    const token = getToken();
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
  }

  return new Promise((resolve, reject) => {
    wx.request({
      url: `${getBaseUrl()}${url}`,
      method,
      data,
      header: headers,
      success: (res) => {
        const payload = res.data || {};
        if (res.statusCode >= 200 && res.statusCode < 300 && payload.code === 0) {
          resolve(payload.data);
          return;
        }
        reject({
          statusCode: res.statusCode,
          message: payload.message || payload.error || '请求失败',
          raw: payload
        });
      },
      fail: (err) => {
        reject({
          message: err.errMsg || '网络异常'
        });
      }
    });
  });
}

module.exports = {
  request
};
