App({
  globalData: {
    apiBaseUrl: 'http://127.0.0.1:3002/api/v1'
  },
  onLaunch() {
    const customApiBaseUrl = wx.getStorageSync('api_base_url');
    if (customApiBaseUrl) {
      this.globalData.apiBaseUrl = customApiBaseUrl;
    }
  }
});
