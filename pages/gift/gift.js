const store = require('../../utils/store');

const RANGES = [
  { key: 'all', label: '全部' },
  { key: 'today', label: '今日' },
  { key: 'week', label: '本周' },
  { key: 'month', label: '本月' },
  { key: 'year', label: '全年' }
];

Page({
  data: {
    keyword: '',
    years: [],
    yearIndex: 0,
    ranges: RANGES,
    range: 'all',
    rangeTotal: '0.00',
    rangeCount: 0,
    stats: { totalText: '0.00', count: 0, cashTotal: '0.00', cashCount: 0, wechatTotal: '0.00', wechatCount: 0 },
    records: []
  },
  onShow() {
    this.load();
  },
  load() {
    const all = store.getGifts();
    const yearSet = {};
    all.forEach(g => {
      const y = new Date(g.date).getFullYear();
      yearSet[y] = 1;
    });
    const years = Object.keys(yearSet).sort((a, b) => b - a);

    let list = all;
    const year = years[this.data.yearIndex];
    if (year) list = list.filter(g => String(new Date(g.date).getFullYear()) === String(year));

    const kw = this.data.keyword.trim().toLowerCase();
    if (kw) {
      list = list.filter(g =>
        (g.name || '').toLowerCase().indexOf(kw) >= 0 ||
        (g.event || '').toLowerCase().indexOf(kw) >= 0 ||
        (g.note || '').toLowerCase().indexOf(kw) >= 0
      );
    }

    const start = store.rangeStart(this.data.range);
    const rangeList = start ? list.filter(g => g.date >= start) : list;

    const s = store.calcStats(list);
    this.setData({
      years,
      records: list.map(g => Object.assign({}, g, {
        amountText: store.fmtMoney(g.amount),
        dateText: store.fmtDate(g.date),
        giftValueText: g.giftValue ? store.fmtMoney(g.giftValue) : ''
      })),
      rangeTotal: store.fmtMoney(rangeList.reduce((sum, g) => sum + (Number(g.amount) || 0), 0)),
      rangeCount: rangeList.length,
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
  onYearChange(e) {
    this.setData({ yearIndex: Number(e.detail.value) });
    this.load();
  },
  setRange(e) {
    this.setData({ range: e.currentTarget.dataset.key });
    this.load();
  },
  addRecord() {
    wx.navigateTo({ url: '/pages/gift-edit/gift-edit' });
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
          wx.navigateTo({ url: '/pages/gift-edit/gift-edit?id=' + id });
        } else if (res.tapIndex === 1) {
          wx.showModal({
            title: '删除记录',
            content: '确认删除这条送礼记录？',
            confirmColor: '#d4380d',
            success: (r) => {
              if (r.confirm) {
                store.deleteGift(id);
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
