const store = require('../../utils/store');

Page({
  data: {
    hasPassword: false,
    showAbout: false,
    userInfo: null,
    openid: '',
    cloudEnabled: false,
    pendingCount: 0,
    syncing: false,
    aboutText: '一款免费、无广告的人情往来记账小程序。\n\n· 礼簿管理：为婚宴、寿宴等场合独立记账\n· 收送统计：自动汇总现金 / 微信收入支出\n· 人员往来：自动计算与每个人的人情结余\n· 全局检索：快速查找任意记录\n· 数据可视化：条形图与扇形图直观展示\n· 云端同步：自动备份，换机一键恢复\n· 本地备份：导出导入，离线也能备份\n· 密码锁：保护你的隐私数据\n\n数据优先存储在本机，联网时自动加密备份到云端，换手机也能恢复。'
  },
  onShow() {
    const app = getApp();
    const openid = store.getCurrentOpenid();
    this.setData({
      hasPassword: !!wx.getStorageSync(store.getUserKey(store.KEYS.PASSWORD)),
      userInfo: app.globalData.userInfo,
      openid: openid,
      cloudEnabled: store.cloudOk(),
      pendingCount: store.getPendingCount()
    });
  },

  goStats() {
    wx.navigateTo({ url: '/pages/stats/stats' });
  },
  goSearch() {
    wx.navigateTo({ url: '/pages/search/search' });
  },
  goBackup() {
    wx.navigateTo({ url: '/pages/backup/backup' });
  },
  goFeature() {
    wx.navigateTo({ url: '/pages/feature/feature' });
  },
  toggleLock() {
    if (this.data.hasPassword) {
      this.removeLock();
    } else {
      wx.navigateTo({ url: '/pages/lock/lock?mode=set' });
    }
  },
  removeLock() {
    wx.showModal({
      title: '关闭密码锁',
      content: '关闭后再次进入小程序将不再验证密码，确认关闭？',
      success: (r) => {
        if (r.confirm) {
          wx.removeStorageSync(store.getUserKey(store.KEYS.PASSWORD));
          this.setData({ hasPassword: false });
          wx.showToast({ title: '已关闭', icon: 'success' });
        }
      }
    });
  },
  clearAll() {
    wx.showModal({
      title: '清空全部数据',
      content: '将删除所有礼簿、收礼和送礼记录，且无法恢复，确认清空？',
      confirmColor: '#d4380d',
      success: (r) => {
        if (r.confirm) {
          store.clearAll();
          wx.showToast({ title: '已清空', icon: 'success' });
        }
      }
    });
  },
  openAbout() {
    this.setData({ showAbout: true });
  },
  closeAbout() {
    this.setData({ showAbout: false });
  }
});
