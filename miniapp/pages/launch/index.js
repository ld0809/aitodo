const { getBindingStatus } = require('../../utils/auth');

function performNavigate(url) {
  wx.redirectTo({
    url,
    fail() {}
  });
}

Page({
  data: {
    loading: false
  },

  onShow() {
    this.routeByStatus();
  },

  async handleStart() {
    await this.routeByStatus();
  },

  startNavigate(url) {
    if (!url) {
      return;
    }
    if (this.navigationStarted) {
      return;
    }

    this.navigationStarted = true;
    setTimeout(() => {
      performNavigate(url);
    }, 300);
  },

  async routeByStatus() {
    if (this.data.loading) {
      return;
    }

    this.setData({ loading: true });
    try {
      const token = wx.getStorageSync('access_token');
      if (!token) {
        this.startNavigate('/pages/email-auth/index');
        return;
      }

      const binding = await getBindingStatus();
      if (binding.bound) {
        this.startNavigate('/pages/home/index');
      } else {
        this.startNavigate('/pages/bind/index');
      }
    } catch (error) {
      wx.removeStorageSync('access_token');
      this.startNavigate('/pages/email-auth/index');
    } finally {
      this.setData({ loading: false });
    }
  }
});
