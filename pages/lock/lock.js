const store = require('../../utils/store');

const LOCK_TIMEOUT = 30;       // 错误锁定时间（秒）
const MAX_ERROR = 5;           // 最大错误次数

Page({
  data: {
    mode: 'set',               // set | unlock
    pwd: '',
    pwd2: '',
    error: '',
    errorCount: 0,             // 当前错误次数
    lockedUntil: 0,            // 锁定截止时间戳（毫秒）
    lockCountdown: 0,          // 剩余秒数（用于显示）
    soterSupported: false,     // 是否支持生物识别
    soterEnabled: false         // 用户是否开启了生物识别
  },

  onLoad(options) {
    const mode = options.mode || 'set';
    this.setData({ mode });
    wx.setNavigationBarTitle({ title: mode === 'set' ? '设置密码锁' : '密码锁' });
    if (mode === 'unlock') {
      this.checkSoter();
      // 恢复错误次数和锁定状态
      const errCount = wx.getStorageSync('lb_lock_err_count') || 0;
      const lockedUntil = wx.getStorageSync('lb_lock_until') || 0;
      this.setData({ errorCount: errCount, lockedUntil });
      if (lockedUntil > Date.now()) this.startCountdown(lockedUntil);
    }
  },

  // 检查生物识别支持
  checkSoter() {
    const openid = store.getCurrentOpenid();
    const soterEnabled = wx.getStorageSync('lb_soter_' + openid) === true;
    wx.checkIsSupportSoterAuthentication({
      success: (res) => {
        const supported = res.supportMode && res.supportMode.length > 0;
        this.setData({ soterSupported: supported, soterEnabled: supported && soterEnabled });
        if (this.data.soterEnabled) this.trySoter();
      }
    });
  },

  // 尝试生物识别解锁
  trySoter() {
    if (this.data.lockedUntil > Date.now()) return;
    wx.startSoterAuthentication({
      requestAuthModes: ['fingerPrint', 'facial'],
      challenge: 'unlock_' + Date.now(),
      authContent: '解锁阿秀礼簿',
      success: () => {
        this.unlockSuccess();
      },
      fail: () => {
        // 用户取消或失败，不做提示，让用户手动输密码
      }
    });
  },

  onPwd(e) {
    this.setData({ pwd: e.detail.value, error: '' });
  },
  onPwd2(e) {
    this.setData({ pwd2: e.detail.value, error: '' });
  },

  confirm() {
    const { mode, pwd, pwd2, lockedUntil } = this.data;

    // 锁定中不允许提交
    if (lockedUntil > Date.now()) {
      const left = Math.ceil((lockedUntil - Date.now()) / 1000);
      this.setData({ error: `密码错误次数过多，请 ${left} 秒后再试` });
      return;
    }

    if (mode === 'set') {
      if (pwd.length < 4) {
        this.setData({ error: '密码至少 4 位' });
        return;
      }
      if (pwd !== pwd2) {
        this.setData({ error: '两次输入的密码不一致' });
        return;
      }
      // 加密存储
      const key = store.getUserKey(store.KEYS.PASSWORD);
      wx.setStorageSync(key, store.hashPwd(pwd));
      // 清除错误计数
      wx.removeStorageSync('lb_lock_err_count');
      wx.removeStorageSync('lb_lock_until');
      getApp().globalData.unlocked = true;
      // 记录解锁时间
      wx.setStorageSync('lb_unlock_time', Date.now());
      wx.showToast({ title: '密码锁已开启', icon: 'success' });
      setTimeout(() => wx.navigateBack(), 400);
    } else {
      const stored = wx.getStorageSync(store.getUserKey(store.KEYS.PASSWORD));
      if (store.verifyPwd(pwd, stored)) {
        this.unlockSuccess();
      } else {
        this.unlockFail();
      }
    }
  },

  unlockSuccess() {
    // 清除错误计数
    wx.removeStorageSync('lb_lock_err_count');
    wx.removeStorageSync('lb_lock_until');
    getApp().globalData.unlocked = true;
    wx.setStorageSync('lb_unlock_time', Date.now());
    wx.reLaunch({ url: '/pages/index/index' });
  },

  unlockFail() {
    const errCount = this.data.errorCount + 1;
    wx.setStorageSync('lb_lock_err_count', errCount);
    this.setData({ errorCount: errCount, pwd: '' });

    if (errCount >= MAX_ERROR) {
      const lockedUntil = Date.now() + LOCK_TIMEOUT * 1000;
      wx.setStorageSync('lb_lock_until', lockedUntil);
      this.setData({ lockedUntil });
      this.startCountdown(lockedUntil);
    } else {
      const left = MAX_ERROR - errCount;
      this.setData({ error: `密码错误，还可尝试 ${left} 次` });
    }
  },

  // 启动倒计时
  startCountdown(lockedUntil) {
    const update = () => {
      const left = Math.ceil((lockedUntil - Date.now()) / 1000);
      if (left <= 0) {
        this.setData({ lockCountdown: 0, lockedUntil: 0, error: '' });
        wx.removeStorageSync('lb_lock_until');
        wx.removeStorageSync('lb_lock_err_count');
        this.setData({ errorCount: 0 });
      } else {
        this.setData({ lockCountdown: left, error: `密码错误次数过多，请 ${left} 秒后再试` });
        setTimeout(update, 1000);
      }
    };
    update();
  },

  // 忘记密码：通过微信身份验证后关闭密码锁（不清空数据）
  // 流程：wx.login 拿 code -> 发后端 /api/auth/verify 做 code2Session 校验
  // -> 服务端比对真实 openid 与当前数据主人 openid，一致才允许关锁。
  // 本地 Docker 联调：服务端未配置 WX_APPID/WX_SECRET 时返回 mockPass=true 直接放行（仅测试用）。
  resetAll() {
    console.log('[忘记密码] resetAll 被点击，mode=', this.data.mode);
    wx.showModal({
      title: '忘记密码',
      content: '将通过微信身份验证关闭密码锁，数据不受影响，验证后可重新设置密码。是否继续？',
      confirmText: '验证关闭',
      success: (r) => {
        console.log('[忘记密码] showModal success:', JSON.stringify(r));
        if (!r.confirm) return;
        wx.showLoading({ title: '验证中...', mask: true });
        wx.login({
          success: (loginRes) => {
            console.log('[忘记密码] wx.login 成功，code=', loginRes.code ? '有' : '无');
            if (!loginRes.code) {
              wx.hideLoading();
              wx.showToast({ title: '验证失败，请重试', icon: 'none' });
              return;
            }
            store.apiVerifyAuth({ code: loginRes.code }).then(data => {
              console.log('[忘记密码] 后端返回:', JSON.stringify(data));
              wx.hideLoading();
              if (data && data.pass) {
                wx.removeStorageSync(store.getUserKey(store.KEYS.PASSWORD));
                wx.removeStorageSync('lb_lock_err_count');
                wx.removeStorageSync('lb_lock_until');
                const openid = store.getCurrentOpenid();
                wx.removeStorageSync('lb_soter_' + openid);
                getApp().globalData.unlocked = true;
                wx.setStorageSync('lb_unlock_time', Date.now());
                wx.showToast({ title: '密码锁已关闭', icon: 'success' });
                setTimeout(() => wx.reLaunch({ url: '/pages/index/index' }), 1000);
              } else {
                wx.showToast({ title: '身份验证不通过', icon: 'none' });
              }
            }).catch(err => {
              wx.hideLoading();
              console.warn('[忘记密码] 后端校验失败：', err && err.message);
              wx.showToast({ title: '验证服务不可用', icon: 'none' });
            });
          },
          fail: (err) => {
            wx.hideLoading();
            console.warn('[忘记密码] wx.login 失败：', err);
            wx.showToast({ title: '验证失败，请检查网络', icon: 'none' });
          }
        });
      },
      fail: (err) => {
        console.warn('[忘记密码] showModal fail:', err);
      }
    });
  }
});
