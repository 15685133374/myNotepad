const store = require('../../utils/store');

Page({
  data: {
    id: '',
    book: null,
    stats: { totalText: '0.00', count: 0, cashTotal: '0.00', cashCount: 0, wechatTotal: '0.00', wechatCount: 0 },
    keyword: '',
    records: []
  },
  onLoad(options) {
    this.setData({ id: options.id || '' });
  },
  onShow() {
    this.load();
  },
  load() {
    const book = store.getBook(this.data.id);
    if (!book) {
      wx.navigateBack();
      return;
    }
    wx.setNavigationBarTitle({ title: book.name });
    const s = store.bookStats(this.data.id);
    const kw = this.data.keyword.trim().toLowerCase();
    const records = store.getReceives(this.data.id)
      .filter(r => !kw || (r.name || '').toLowerCase().indexOf(kw) >= 0 || (r.note || '').toLowerCase().indexOf(kw) >= 0)
      .map(r => Object.assign({}, r, {
        amountText: store.fmtMoney(r.amount),
        timeText: store.fmtTime(r.time),
        giftValueText: r.giftValue ? store.fmtMoney(r.giftValue) : ''
      }));
    this.setData({
      book,
      records,
      stats: {
        totalText: store.fmtMoney(s.total),
        count: s.count,
        cashTotal: store.fmtMoney(s.cashTotal),
        cashCount: s.cashCount,
        wechatTotal: store.fmtMoney(s.wechatTotal),
        wechatCount: s.wechatCount
      }
    });
  },
  onKeyword(e) {
    this.setData({ keyword: e.detail.value });
    this.load();
  },
  addRecord() {
    wx.navigateTo({ url: '/pages/receive-edit/receive-edit?bookId=' + this.data.id });
  },
  goPerson(e) {
    const name = e.currentTarget.dataset.name;
    if (name) wx.navigateTo({ url: '/pages/person/person?name=' + encodeURIComponent(name) });
  },
  onRecordAction(e) {
    const id = e.currentTarget.dataset.id;
    wx.showActionSheet({
      itemList: ['编辑', '删除'],
      success: (res) => {
        if (res.tapIndex === 0) {
          wx.navigateTo({ url: '/pages/receive-edit/receive-edit?id=' + id + '&bookId=' + this.data.id });
        } else if (res.tapIndex === 1) {
          wx.showModal({
            title: '删除记录',
            content: '确认删除这条收礼记录？',
            confirmColor: '#d4380d',
            success: (r) => {
              if (r.confirm) {
                store.deleteReceive(id);
                this.load();
                wx.showToast({ title: '已删除', icon: 'success' });
              }
            }
          });
        }
      }
    });
  }
});
