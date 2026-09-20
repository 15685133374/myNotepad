const store = require('../../utils/store');

Page({
  data: {
    name: '',
    tab: 'receive',
    inTotal: '0.00',
    outTotal: '0.00',
    balance: '0.00',
    receives: [],
    gifts: []
  },
  onLoad(options) {
    const name = decodeURIComponent(options.name || '');
    this.setData({ name });
    wx.setNavigationBarTitle({ title: name });
  },
  onShow() {
    this.load();
  },
  load() {
    const { name } = this.data;
    const data = store.personRecords(name);
    const books = store.getBooks();
    const bookName = (id) => {
      const b = books.find(x => x.id === id);
      return b ? b.name : '已删除礼簿';
    };
    this.setData({
      inTotal: store.fmtMoney(data.inTotal),
      outTotal: store.fmtMoney(data.outTotal),
      balance: store.fmtMoney(Math.abs(data.balance)),
      receives: data.receives.map(r => Object.assign({}, r, {
        amountText: store.fmtMoney(r.amount),
        timeText: store.fmtTime(r.time),
        bookName: bookName(r.bookId)
      })),
      gifts: data.gifts.map(g => Object.assign({}, g, {
        amountText: store.fmtMoney(g.amount),
        dateText: store.fmtDate(g.date)
      }))
    });
  },
  setTab(e) {
    this.setData({ tab: e.currentTarget.dataset.key });
  },
  editReceive(e) {
    wx.navigateTo({ url: '/pages/receive-edit/receive-edit?id=' + e.currentTarget.dataset.id });
  },
  editGift(e) {
    wx.navigateTo({ url: '/pages/gift-edit/gift-edit?id=' + e.currentTarget.dataset.id });
  }
});
