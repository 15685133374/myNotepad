const store = require('../../utils/store');

Page({
  data: {
    exportData: '',
    showExport: false,
    users: []
  },
  
  onShow() {
    this.loadUsers();
  },

  loadUsers() {
    const users = store.getAllUsers();
    this.setData({ users });
  },

  // 导出当前用户数据
  exportData() {
    const openid = store.getCurrentOpenid();
    const data = {
      version: '1.0.0',
      exportTime: new Date().toISOString(),
      openid: openid,
      books: store.getBooks(),
      receives: store.getReceives(),
      gifts: store.getGifts()
    };
    
    const jsonStr = JSON.stringify(data, null, 2);
    this.setData({ 
      exportData: jsonStr,
      showExport: true 
    });
    
    wx.showToast({
      title: '数据已生成',
      icon: 'success'
    });
  },

  // 复制导出数据
  copyExportData() {
    wx.setClipboardData({
      data: this.data.exportData,
      success: () => {
        wx.showToast({
          title: '已复制到剪贴板',
          icon: 'success'
        });
      }
    });
  },

  // 关闭导出弹窗
  closeExport() {
    this.setData({ showExport: false });
  },

  // 导入数据
  importData() {
    wx.showModal({
      title: '导入数据',
      content: '请将之前导出的 JSON 数据粘贴到输入框',
      editable: true,
      placeholderText: '粘贴 JSON 数据...',
      success: (res) => {
        if (res.confirm && res.content) {
          try {
            const data = JSON.parse(res.content);
            
            // 验证数据格式
            if (!data.books || !data.receives || !data.gifts) {
              throw new Error('数据格式不正确');
            }
            
            // 确认导入
            wx.showModal({
              title: '确认导入',
              content: `将导入 ${data.books.length} 个礼簿、${data.receives.length} 条收礼记录、${data.gifts.length} 条送礼记录`,
              success: (r) => {
                if (r.confirm) {
                  // 保存数据
                  store.saveBooks(data.books);
                  data.receives.forEach(r => store.addReceive(r));
                  data.gifts.forEach(g => store.addGift(g));
                  
                  wx.showToast({
                    title: '导入成功',
                    icon: 'success'
                  });
                  
                  setTimeout(() => {
                    wx.switchTab({ url: '/pages/index/index' });
                  }, 1500);
                }
              }
            });
          } catch (e) {
            wx.showToast({
              title: '数据格式错误',
              icon: 'none'
            });
          }
        }
      }
    });
  },

  // 切换用户（查看其他用户数据）
  switchUser(e) {
    const openid = e.currentTarget.dataset.openid;
    const nickname = e.currentTarget.dataset.nickname;
    
    wx.showModal({
      title: '切换用户',
      content: `切换到「${nickname}」的数据视图？`,
      success: (r) => {
        if (r.confirm) {
          // 临时切换 openid
          getApp().globalData.openid = openid;
          wx.setStorageSync('lb_openid', openid);
          
          wx.showToast({
            title: '已切换',
            icon: 'success'
          });
          
          setTimeout(() => {
            wx.switchTab({ url: '/pages/index/index' });
          }, 1000);
        }
      }
    });
  },

  // 查看数据统计
  viewStats() {
    wx.navigateTo({ url: '/pages/stats/stats' });
  },

  // 上传到云端备份
  cloudBackup() {
    if (!store.cloudOk()) {
      wx.showToast({ title: '当前环境不支持云服务', icon: 'none' });
      return;
    }
    wx.showLoading({ title: '备份中...', mask: true });
    store.cloudLogin().then(openid => {
      if (!openid) throw new Error('云登录失败');
      return store.pushToCloud();
    }).then(r => {
      wx.hideLoading();
      if (r) {
        wx.showModal({
          title: '备份成功',
          content: `已上传：礼簿 ${r.books} 个、收礼 ${r.receives} 条、送礼 ${r.gifts} 条`,
          showCancel: false
        });
      } else {
        wx.showToast({ title: '备份失败，请稍后重试', icon: 'none' });
      }
    }).catch(() => {
      wx.hideLoading();
      wx.showToast({ title: '备份失败，请检查网络', icon: 'none' });
    });
  },

  // 从云端恢复（覆盖本地）
  cloudRestore() {
    if (!store.cloudOk()) {
      wx.showToast({ title: '当前环境不支持云服务', icon: 'none' });
      return;
    }
    wx.showModal({
      title: '从云端恢复',
      content: '云端数据将覆盖本机现有数据，确定继续？',
      confirmColor: '#e64340',
      success: (res) => {
        if (!res.confirm) return;
        wx.showLoading({ title: '恢复中...', mask: true });
        store.cloudLogin().then(openid => {
          if (!openid) throw new Error('云登录失败');
          return store.pullFromCloud();
        }).then(ok => {
          wx.hideLoading();
          if (ok) {
            wx.showToast({ title: '恢复成功', icon: 'success' });
            setTimeout(() => {
              wx.switchTab({ url: '/pages/index/index' });
            }, 1200);
          } else {
            wx.showToast({ title: '恢复失败，请稍后重试', icon: 'none' });
          }
        }).catch(() => {
          wx.hideLoading();
          wx.showToast({ title: '恢复失败，请检查网络', icon: 'none' });
        });
      }
    });
  }
});
