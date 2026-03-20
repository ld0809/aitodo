const { bindMiniappByCode } = require('../../utils/auth');

Page({
  data: {
    email: '',
    loading: false,
    errorMessage: ''
  },

  onShow() {
    const user = wx.getStorageSync('current_user') || {};
    this.setData({ email: user.email || '' });
  },

  async handleBind() {
    if (this.data.loading) {
      return;
    }

    this.setData({ loading: true, errorMessage: '' });

    try {
      const profile = await this.fetchUserProfile();
      const loginRes = await this.wxLogin();

      const payload = {
        code: loginRes.code,
        miniNickname: profile && profile.nickName ? profile.nickName : '',
        miniAvatarUrl: profile && profile.avatarUrl ? profile.avatarUrl : ''
      };

      await bindMiniappByCode(payload);
      wx.showToast({ title: '绑定成功', icon: 'success' });
      wx.redirectTo({ url: '/pages/home/index' });
    } catch (error) {
      this.setData({ errorMessage: error.message || '绑定失败' });
    } finally {
      this.setData({ loading: false });
    }
  },

  fetchUserProfile() {
    return new Promise((resolve, reject) => {
      if (typeof wx.getUserProfile !== 'function') {
        resolve({});
        return;
      }

      wx.getUserProfile({
        desc: '用于展示绑定后的昵称和头像',
        success: (res) => resolve(res.userInfo || {}),
        fail: () => reject({ message: '用户取消授权' })
      });
    });
  },

  wxLogin() {
    return new Promise((resolve, reject) => {
      wx.login({
        success: (res) => {
          if (res.code) {
            resolve(res);
            return;
          }
          reject({ message: '获取微信登录态失败' });
        },
        fail: () => reject({ message: '调用 wx.login 失败' })
      });
    });
  }
});
