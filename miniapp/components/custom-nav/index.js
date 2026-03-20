Component({
  options: {
    multipleSlots: true
  },

  properties: {
    title: {
      type: String,
      value: ''
    },
    subtitle: {
      type: String,
      value: ''
    },
    showBack: {
      type: Boolean,
      value: false
    },
    background: {
      type: String,
      value: '#F4F8FF'
    }
  },

  data: {
    statusBarHeight: 20,
    navBarHeight: 44,
    sideWidth: 96
  },

  lifetimes: {
    attached() {
      this.syncMetrics();
    }
  },

  methods: {
    syncMetrics() {
      let statusBarHeight = 20;
      let navBarHeight = 44;
      let sideWidth = 96;

      try {
        const windowInfo = typeof wx.getWindowInfo === 'function' ? wx.getWindowInfo() : wx.getSystemInfoSync();
        statusBarHeight = windowInfo.statusBarHeight || 20;
      } catch (error) {}

      try {
        const rect = wx.getMenuButtonBoundingClientRect();
        if (rect && rect.top && rect.height) {
          navBarHeight = rect.height + (rect.top - statusBarHeight) * 2;
          sideWidth = rect.width;
        }
      } catch (error) {}

      this.setData({
        statusBarHeight,
        navBarHeight,
        sideWidth
      });
    },

    handleBack() {
      const pages = getCurrentPages();
      if (pages.length > 1) {
        wx.navigateBack();
        return;
      }

      wx.redirectTo({
        url: '/pages/home/index'
      });
    }
  }
});
