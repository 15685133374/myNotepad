App({
  globalData: {
    unlocked: false,
    userInfo: null,
    openid: null,
    isLoggedIn: false
  },

  onLaunch() {
    this.wxLogin();
    // 延迟检查密码锁，确保页面栈已准备好
    setTimeout(() => this.checkLock(), 100);
  },

  // 微信登录
  wxLogin() {
    // 优先使用已存储的 openid，避免每次 wx.login 生成新 code 导致数据"丢失"
    const savedOpenid = wx.getStorageSync('lb_openid');
    if (savedOpenid) {
      this.globalData.openid = savedOpenid;
      this.globalData.isLoggedIn = true;
      const savedUserInfo = wx.getStorageSync('lb_userinfo');
      if (savedUserInfo) {
        this.globalData.userInfo = savedUserInfo;
      }
      return;
    }

    wx.login({
      success: (res) => {
        if (res.code) {
          // 首次登录：用 code hash 生成临时 openid 并固定存储
          const tempOpenid = 'user_' + this.hashCode(res.code);
          this.globalData.openid = tempOpenid;
          this.globalData.isLoggedIn = true;
          wx.setStorageSync('lb_openid', tempOpenid);
          this.getUserProfile();
        } else {
          console.error('登录失败：' + res.errMsg);
        }
      },
      fail: (err) => {
        console.error('wx.login 调用失败：', err);
      }
    });
  },

  // 获取用户信息
  getUserProfile() {
    wx.getUserProfile({
      desc: '用于完善用户资料',
      success: (res) => {
        this.globalData.userInfo = res.userInfo;
        wx.setStorageSync('lb_userinfo', res.userInfo);
        console.log('获取用户信息成功：', res.userInfo);
      },
      fail: (err) => {
        console.log('用户拒绝授权，使用默认信息');
        // 使用本地存储的用户信息（如果有）
        const savedUserInfo = wx.getStorageSync('lb_userinfo');
        if (savedUserInfo) {
          this.globalData.userInfo = savedUserInfo;
        }
      }
    });
  },

  // 简单 hash 函数（用于生成临时 openid）
  hashCode(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(36);
  },

  // 检查密码锁
  checkLock() {
    const store = require('./utils/store');
    const key = store.getUserKey(store.KEYS.PASSWORD);
    const pwd = wx.getStorageSync(key);
    console.log('[密码锁检查] key:', key, 'pwd:', pwd, 'unlocked:', this.globalData.unlocked);
    if (pwd && !this.globalData.unlocked) {
      wx.reLaunch({ url: '/pages/lock/lock?mode=unlock' });
    }
  },

  onShow() {
    // 页面切换时也检查，但排除锁屏页本身，并避免重复 reLaunch
    const store = require('./utils/store');
    const pwd = wx.getStorageSync(store.getUserKey(store.KEYS.PASSWORD));
    if (pwd && !this.globalData.unlocked) {
      const pages = getCurrentPages();
      const cur = pages.length ? pages[pages.length - 1].route : '';
      if (cur && cur !== 'pages/lock/lock') {
        this.globalData.unlocked = false; // 重置解锁状态
        wx.reLaunch({ url: '/pages/lock/lock?mode=unlock' });
      }
    }
  }
});
