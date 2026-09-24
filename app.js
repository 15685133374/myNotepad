App({
  globalData: {
    unlocked: false,
    userInfo: null,
    openid: null,
    isLoggedIn: false
  },

  onLaunch() {
    // 初始化云环境（云托管调用前置条件）
    if (wx.cloud) {
      wx.cloud.init({ env: 'prod-d5gu9xtoxaabb6a55', traceUser: true });
    }
    this.wxLogin();
    this.cloudInit();
    // 延迟检查密码锁，确保页面栈已准备好
    setTimeout(() => this.checkLock(), 100);
  },

  // 云端初始化：登录换 openid -> 迁移/拉取 -> 补同步脏数据 -> 定时对账
  cloudInit() {
    const store = require('./utils/store');
    if (!store.cloudOk()) return;
    store.cloudLogin().then(openid => {
      if (!openid) return;
      const hasLocal = store.getBooks().length > 0 ||
                       store.getReceives().length > 0 ||
                       store.getGifts().length > 0;
      const migrated = wx.getStorageSync('lb_cloud_migrated');
      if (hasLocal && !migrated) {
        // 老用户首次：本地数据推送到云端
        store.pushToCloud().then(r => {
          if (r) wx.setStorageSync('lb_cloud_migrated', Date.now());
        });
      } else if (!hasLocal) {
        // 新设备 / 换机：从云端拉取
        store.pullFromCloud().then(ok => {
          if (ok) {
            const pages = getCurrentPages();
            const cur = pages.length ? pages[pages.length - 1] : null;
            if (cur && cur.onShow && cur.route !== 'pages/lock/lock') cur.onShow();
          }
        });
      }
      // 启动后 3 秒补同步之前的脏数据（不阻塞首页）
      setTimeout(() => store.flushDirty(), 3000);
      // 每 5 分钟定时对账一次
      this._syncTimer = setInterval(() => store.flushDirty(), 5 * 60 * 1000);
    });
  },

  // 本地身份初始化
  // 设计：首次启动生成随机 UUID 并永久固定，不再依赖 wx.login 的 code（code 每次都变，
  // 用 code 生成 id 会导致清缓存/换机后身份漂移、数据"丢失"）。
  // 云托管接入后，云端会下发真实 openid，届时自动把本地 UUID 名下的数据迁移过去。
  wxLogin() {
    let savedOpenid = wx.getStorageSync('lb_openid');
    if (!savedOpenid) {
      savedOpenid = 'user_' + this.uuid();
      wx.setStorageSync('lb_openid', savedOpenid);
    }
    this.globalData.openid = savedOpenid;
    this.globalData.isLoggedIn = true;
    const savedUserInfo = wx.getStorageSync('lb_userinfo');
    if (savedUserInfo) {
      this.globalData.userInfo = savedUserInfo;
    }
    // 首次启动时尝试获取用户资料（拒绝授权不影响使用）
    if (!savedUserInfo) {
      this.getUserProfile();
    }
  },

  // 生成随机 UUID（本地临时身份用）
  uuid() {
    return 'xxxxxxxxxxxx'.replace(/x/g, () =>
      Math.floor(Math.random() * 16).toString(16)
    ) + Date.now().toString(36);
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
      fail: () => {
        console.log('用户拒绝授权，使用默认信息');
        // 使用本地存储的用户信息（如果有）
        const savedUserInfo = wx.getStorageSync('lb_userinfo');
        if (savedUserInfo) {
          this.globalData.userInfo = savedUserInfo;
        }
      }
    });
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
