App({
  globalData: {
    apiBaseUrl: 'https://todo.vipke888.com/api/v1'
  },
  onLaunch() {
    const customApiBaseUrl = wx.getStorageSync('api_base_url');
    if (customApiBaseUrl) {
      this.globalData.apiBaseUrl = customApiBaseUrl;
    }
  }
});
