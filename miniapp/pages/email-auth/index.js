const { register, sendEmailCode, verifyEmail, login, getBindingStatus } = require('../../utils/auth');

Page({
  data: {
    mode: 'login',
    registerStep: 'form',
    email: '',
    password: '',
    code: '',
    loadingSubmit: false,
    loadingResend: false,
    errorMessage: ''
  },

  switchMode(event) {
    const mode = event.currentTarget.dataset.mode;
    this.setData({
      mode,
      registerStep: 'form',
      code: '',
      errorMessage: ''
    });
  },

  onEmailInput(event) {
    this.setData({ email: event.detail.value.trim(), errorMessage: '' });
  },

  onPasswordInput(event) {
    this.setData({ password: event.detail.value, errorMessage: '' });
  },

  onCodeInput(event) {
    this.setData({ code: event.detail.value.trim(), errorMessage: '' });
  },

  async handleLogin() {
    if (this.data.loadingSubmit) {
      return;
    }

    if (!this.data.email || !this.data.password) {
      this.setData({ errorMessage: '请输入邮箱和密码' });
      return;
    }

    this.setData({ loadingSubmit: true, errorMessage: '' });
    try {
      const loginData = await login(this.data.email, this.data.password);
      this.persistSession(loginData);
      await this.routeAfterAuth();
    } catch (error) {
      this.setData({ errorMessage: error.message || '登录失败' });
    } finally {
      this.setData({ loadingSubmit: false });
    }
  },

  async handleRegister() {
    if (this.data.loadingSubmit) {
      return;
    }

    if (!this.data.email || !this.data.password) {
      this.setData({ errorMessage: '请输入邮箱和密码' });
      return;
    }

    this.setData({ loadingSubmit: true, errorMessage: '' });
    try {
      await register(this.data.email, this.data.password);
      await sendEmailCode(this.data.email);
      this.setData({ registerStep: 'verify' });
      wx.showToast({ title: '验证码已发送', icon: 'success' });
    } catch (error) {
      this.setData({ errorMessage: error.message || '注册失败' });
    } finally {
      this.setData({ loadingSubmit: false });
    }
  },

  async handleVerify() {
    if (this.data.loadingSubmit) {
      return;
    }

    if (!this.data.code) {
      this.setData({ errorMessage: '请输入验证码' });
      return;
    }

    this.setData({ loadingSubmit: true, errorMessage: '' });
    try {
      await verifyEmail(this.data.email, this.data.code);
      const loginData = await login(this.data.email, this.data.password);
      this.persistSession(loginData);
      await this.routeAfterAuth();
    } catch (error) {
      this.setData({ errorMessage: error.message || '验证失败' });
    } finally {
      this.setData({ loadingSubmit: false });
    }
  },

  async handleResendCode() {
    if (this.data.loadingResend) {
      return;
    }

    this.setData({ loadingResend: true, errorMessage: '' });
    try {
      await sendEmailCode(this.data.email);
      wx.showToast({ title: '已重发', icon: 'success' });
    } catch (error) {
      this.setData({ errorMessage: error.message || '重发失败' });
    } finally {
      this.setData({ loadingResend: false });
    }
  },

  persistSession(loginData) {
    wx.setStorageSync('access_token', loginData.accessToken || loginData.access_token || '');
    wx.setStorageSync('current_user', loginData.user || null);
  },

  async routeAfterAuth() {
    const binding = await getBindingStatus();
    if (binding.bound) {
      wx.redirectTo({ url: '/pages/home/index' });
      return;
    }
    wx.redirectTo({ url: '/pages/bind/index' });
  }
});
