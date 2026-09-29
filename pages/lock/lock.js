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
    soterEnabled: false,       // 用户是否开启了生物识别
    cloudEnabled: false,       // 是否连接后台服务
    // 安全问题（本地降级方案）
    securityQuestion: '',      // 设置密码时选的问题
    securityAnswer: '',        // 设置密码时填的答案
    showSecurityPicker: false, // 是否显示问题选择器
    securityOptions: [
      '你的出生城市是？',
      '你母亲的姓名是？',
      '你的小学名称是？',
      '你第一份工作的公司是？',
      '你最喜欢的食物是？'
    ],
    // 忘记密码 - 安全问题验证
    showSecurityVerify: false, // 是否显示安全问题验证界面
    verifyQuestion: '',        // 当前验证的问题
    verifyAnswer: ''           // 用户输入的答案
  },

  onLoad(options) {
    const mode = options.mode || 'set';
    this.setData({ mode, cloudEnabled: store.cloudOk() });
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

  // 安全问题选择
  onSecurityQuestionChange(e) {
    this.setData({ securityQuestion: this.data.securityOptions[e.detail.value], error: '' });
  },
  onSecurityAnswer(e) {
    this.setData({ securityAnswer: e.detail.value, error: '' });
  },
  // 忘记密码 - 安全问题答案输入
  onVerifyAnswer(e) {
    this.setData({ verifyAnswer: e.detail.value, error: '' });
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
      if (!this.data.securityQuestion) {
        this.setData({ error: '请选择一个安全问题' });
        return;
      }
      if (!this.data.securityAnswer.trim()) {
        this.setData({ error: '请填写安全问题答案' });
        return;
      }
      // 加密存储
      const key = store.getUserKey(store.KEYS.PASSWORD);
      wx.setStorageSync(key, store.hashPwd(pwd));
      // 存安全问题（答案 hash 后存储，不存明文）
      const openid = store.getCurrentOpenid();
      wx.setStorageSync('lb_sec_q_' + openid, this.data.securityQuestion);
      wx.setStorageSync('lb_sec_a_' + openid, store.hashPwd(this.data.securityAnswer.trim().toLowerCase()));
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

  // 忘记密码：优先走服务端校验，服务端不可用时降级到安全问题验证
  resetAll() {
    console.log('[忘记密码] resetAll 被点击，mode=', this.data.mode);
    const openid = store.getCurrentOpenid();
    const secQ = wx.getStorageSync('lb_sec_q_' + openid);
    const cloudOk = store.cloudOk();

    wx.showModal({
      title: '忘记密码',
      content: cloudOk
        ? '将通过微信身份验证关闭密码锁，数据不受影响。是否继续？'
        : '将通过安全问题验证关闭密码锁，数据不受影响。是否继续？',
      confirmText: '继续',
      success: (r) => {
        if (!r.confirm) return;

        // 有服务端 -> 走服务端校验
        if (store.cloudOk()) {
          this.resetViaServer();
        } else if (secQ) {
          // 无服务端但有安全问题 -> 走本地安全问题验证
          this.setData({ showSecurityVerify: true, verifyQuestion: secQ, verifyAnswer: '' });
        } else {
          // 都没有 -> 提示用户
          wx.showToast({ title: '无法验证身份，请清除小程序数据重试', icon: 'none', duration: 3000 });
        }
      }
    });
  },

  // 服务端校验方式
  resetViaServer() {
    wx.showLoading({ title: '验证中...', mask: true });
    wx.login({
      success: (loginRes) => {
        if (!loginRes.code) {
          wx.hideLoading();
          // 服务端失败，降级到安全问题
          this.fallbackToSecurityQuestion();
          return;
        }
        store.apiVerifyAuth({ code: loginRes.code }).then(data => {
          wx.hideLoading();
          if (data && data.pass) {
            this.doResetLock();
          } else {
            // 服务端校验不通过，尝试安全问题降级
            this.fallbackToSecurityQuestion();
          }
        }).catch(() => {
          wx.hideLoading();
          // 服务端不可用，降级到安全问题
          this.fallbackToSecurityQuestion();
        });
      },
      fail: () => {
        wx.hideLoading();
        this.fallbackToSecurityQuestion();
      }
    });
  },

  // 降级到安全问题验证
  fallbackToSecurityQuestion() {
    const openid = store.getCurrentOpenid();
    const secQ = wx.getStorageSync('lb_sec_q_' + openid);
    if (secQ) {
      this.setData({ showSecurityVerify: true, verifyQuestion: secQ, verifyAnswer: '', error: '' });
    } else {
      wx.showToast({ title: '无法验证身份，请清除小程序数据', icon: 'none', duration: 3000 });
    }
  },

  // 安全问题验证提交
  confirmSecurityVerify() {
    const openid = store.getCurrentOpenid();
    const storedAnswer = wx.getStorageSync('lb_sec_a_' + openid);
    const inputAnswer = this.data.verifyAnswer.trim().toLowerCase();

    if (!inputAnswer) {
      this.setData({ error: '请输入答案' });
      return;
    }

    if (store.verifyPwd(inputAnswer, storedAnswer)) {
      this.setData({ showSecurityVerify: false });
      this.doResetLock();
    } else {
      this.setData({ error: '答案错误，请重试', verifyAnswer: '' });
    }
  },

  // 取消安全问题验证
  cancelSecurityVerify() {
    this.setData({ showSecurityVerify: false, verifyAnswer: '', error: '' });
  },

  // 执行关闭密码锁
  doResetLock() {
    wx.removeStorageSync(store.getUserKey(store.KEYS.PASSWORD));
    wx.removeStorageSync('lb_lock_err_count');
    wx.removeStorageSync('lb_lock_until');
    const openid = store.getCurrentOpenid();
    wx.removeStorageSync('lb_soter_' + openid);
    wx.removeStorageSync('lb_sec_q_' + openid);
    wx.removeStorageSync('lb_sec_a_' + openid);
    getApp().globalData.unlocked = true;
    wx.setStorageSync('lb_unlock_time', Date.now());
    wx.showToast({ title: '密码锁已关闭', icon: 'success' });
    setTimeout(() => wx.reLaunch({ url: '/pages/index/index' }), 1000);
  }
});
