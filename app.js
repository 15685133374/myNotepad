App({
  globalData: {
    unlocked: false,
    userInfo: null,
    openid: null,
    isLoggedIn: false
  },

  onLaunch() {
    this.wxLogin();
  },

  // 微信登录
  wxLogin() {
    wx.login({
      success: (res) => {
        if (res.code) {
          // 家庭使用：直接用 code 作为临时用户标识
          // 生产环境应该发送到后端换取 openid
          console.log('微信登录成功，code:', res.code);
          
          // 模拟获取 openid（实际应调用后端接口）
          // 这里用 code 的 hash 作为临时 openid
          const tempOpenid = 'user_' + this.hashCode(res.code);
          
          this.globalData.openid = tempOpenid;
          this.globalData.isLoggedIn = true;
          
          // 保存到本地
          wx.setStorageSync('lb_openid', tempOpenid);
          
          // 获取用户信息
          this.getUserProfile();
        } else {
          console.error('登录失败：' + res.errMsg);
          wx.showToast({
            title: '登录失败，请重试',
            icon: 'none'
          });
        }
      },
      fail: (err) => {
        console.error('wx.login 调用失败：', err);
        // 使用本地存储的 openid（如果有）
        const savedOpenid = wx.getStorageSync('lb_openid');
        if (savedOpenid) {
          this.globalData.openid = savedOpenid;
          this.globalData.isLoggedIn = true;
        }
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

  onShow() {
    const pwd = wx.getStorageSync('lb_password');
    if (pwd && !this.globalData.unlocked) {
      const pages = getCurrentPages();
      const cur = pages.length ? pages[pages.length - 1].route : '';
      if (cur !== 'pages/lock/lock') {
        wx.reLaunch({ url: '/pages/lock/lock?mode=unlock' });
      }
    }
  }
});
