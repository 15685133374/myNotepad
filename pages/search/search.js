const store = require('../../utils/store');

function segs(text, kw) {
  if (!kw || !text) return [{ t: text || '', hit: false }];
  const lower = String(text).toLowerCase();
  const k = kw.toLowerCase();
  const out = [];
  let i = 0;
  while (i < text.length) {
    const idx = lower.indexOf(k, i);
    if (idx < 0) {
      out.push({ t: text.slice(i), hit: false });
      break;
    }
    if (idx > i) out.push({ t: text.slice(i, idx), hit: false });
    out.push({ t: text.slice(idx, idx + k.length), hit: true });
    i = idx + k.length;
  }
  return out;
}

Page({
  data: {
    keyword: '',
    searched: false,
    books: [],
    receives: [],
    gifts: []
  },
  onKeyword(e) {
    this.setData({ keyword: e.detail.value });
    this.doSearch();
  },
  clear() {
    this.setData({ keyword: '', searched: false, books: [], receives: [], gifts: [] });
  },
  doSearch() {
    const kw = this.data.keyword.trim();
    if (!kw) {
      this.setData({ searched: false, books: [], receives: [], gifts: [] });
      return;
    }
    const res = store.searchAll(kw);
    this.setData({
      searched: true,
      books: res.books.map(b => Object.assign({}, b, { nameSegs: segs(b.name, kw) })),
      receives: res.receives.map(r => Object.assign({}, r, {
        amountText: store.fmtMoney(r.amount),
        timeText: store.fmtTime(r.time),
        nameSegs: segs(r.name, kw),
        noteSegs: r.note ? segs(r.note, kw) : null
      })),
      gifts: res.gifts.map(g => Object.assign({}, g, {
        amountText: store.fmtMoney(g.amount),
        dateText: store.fmtDate(g.date),
        nameSegs: segs(g.name, kw),
        eventSegs: g.event ? segs(g.event, kw) : null,
        noteSegs: g.note ? segs(g.note, kw) : null
      }))
    });
  },
  goBook(e) {
    wx.navigateTo({ url: '/pages/book/book?id=' + e.currentTarget.dataset.id });
  },
  goReceive(e) {
    wx.navigateTo({ url: '/pages/receive-edit/receive-edit?id=' + e.currentTarget.dataset.id });
  },
  goGift(e) {
    wx.navigateTo({ url: '/pages/gift-edit/gift-edit?id=' + e.currentTarget.dataset.id });
  }
});
