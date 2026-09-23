const store = require('../../utils/store');

Page({
  data: {
    mode: 'set', // set | unlock
    pwd: '',
    pwd2: '',
    error: ''
  },
  onLoad(options) {
    const mode = options.mode || 'set';
    this.setData({ mode });
    wx.setNavigationBarTitle({ title: mode === 'set' ? '设置密码锁' : '密码锁' });
  },
  onPwd(e) {
    this.setData({ pwd: e.detail.value, error: '' });
  },
  onPwd2(e) {
    this.setData({ pwd2: e.detail.value, error: '' });
  },
  confirm() {
    const { mode, pwd, pwd2 } = this.data;
    if (mode === 'set') {
      if (pwd.length < 4) {
        this.setData({ error: '密码至少 4 位' });
        return;
      }
      if (pwd !== pwd2) {
        this.setData({ error: '两次输入的密码不一致' });
        return;
      }
      const key = store.getUserKey(store.KEYS.PASSWORD);
      wx.setStorageSync(key, pwd);
      console.log('[密码锁设置] key:', key, 'pwd:', pwd);
      getApp().globalData.unlocked = true;
      wx.showToast({ title: '密码锁已开启', icon: 'success' });
      setTimeout(() => wx.navigateBack(), 400);
    } else {
      if (pwd === wx.getStorageSync(store.getUserKey(store.KEYS.PASSWORD))) {
        getApp().globalData.unlocked = true;
        wx.reLaunch({ url: '/pages/index/index' });
      } else {
        this.setData({ error: '密码错误，请重试', pwd: '' });
      }
    }
  },
  resetAll() {
    wx.showModal({
      title: '忘记密码',
      content: '重置密码将清空全部数据（礼簿与记录），是否继续？',
      confirmColor: '#d4380d',
      success: (r) => {
        if (r.confirm) {
          store.clearAll();
          wx.removeStorageSync(store.getUserKey(store.KEYS.PASSWORD));
          getApp().globalData.unlocked = true;
          wx.reLaunch({ url: '/pages/index/index' });
        }
      }
    });
  }
});
