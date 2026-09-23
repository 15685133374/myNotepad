const store = require('../../utils/store');

function today() { return store.fmtDate(Date.now()); }

Page({
  data: {
    id: '',
    name: '',
    amount: '',
    giftItem: '',
    giftValue: '',
    event: '',
    date: today(),
    payType: 'cash',
    note: '',
    nameSuggestions: []
  },
  onLoad(options) {
    const id = options.id || '';
    if (id) {
      const g = store.getGift(id);
      if (g) {
        this.setData({
          id,
          name: g.name,
          amount: String(g.amount),
          giftItem: g.giftItem || '',
          giftValue: g.giftValue ? String(g.giftValue) : '',
          event: g.event || '',
          date: store.fmtDate(g.date),
          payType: g.payType || 'cash',
          note: g.note || ''
        });
      }
      wx.setNavigationBarTitle({ title: '编辑送礼记录' });
    }
  },
  onName(e) {
    const name = e.detail.value;
    const kw = name.trim();
    let nameSuggestions = [];
    if (kw) {
      nameSuggestions = store.getAllNames().filter(n => n.indexOf(kw) >= 0 && n !== kw).slice(0, 6);
    }
    this.setData({ name, nameSuggestions });
  },
  onNameFocus() {
    const kw = this.data.name.trim();
    if (kw) {
      this.setData({
        nameSuggestions: store.getAllNames().filter(n => n.indexOf(kw) >= 0 && n !== kw).slice(0, 6)
      });
    }
  },
  onNameBlur() {
    setTimeout(() => this.setData({ nameSuggestions: [] }), 200);
  },
  pickName(e) {
    this.setData({ name: e.currentTarget.dataset.name, nameSuggestions: [] });
  },
  onAmount(e) { this.setData({ amount: e.detail.value }); },
  onGiftItem(e) { this.setData({ giftItem: e.detail.value }); },
  onGiftValue(e) { this.setData({ giftValue: e.detail.value }); },
  onEvent(e) { this.setData({ event: e.detail.value }); },
  onNote(e) { this.setData({ note: e.detail.value }); },
  onDate(e) { this.setData({ date: e.detail.value }); },
  setPayType(e) { this.setData({ payType: e.currentTarget.dataset.type }); },
  save() {
    const { id, name, amount, giftItem, giftValue, event, date, payType, note } = this.data;
    if (!name.trim()) {
      wx.showToast({ title: '请输入姓名', icon: 'none' });
      return;
    }
    const num = parseFloat(amount);
    if (!num || num <= 0) {
      wx.showToast({ title: '请输入正确金额', icon: 'none' });
      return;
    }
    const giftValueNum = parseFloat(giftValue);
    const data = {
      name: name.trim(),
      amount: Math.round(num * 100) / 100,
      giftItem: giftItem.trim(),
      giftValue: giftValueNum > 0 ? Math.round(giftValueNum * 100) / 100 : 0,
      event: event.trim(),
      date: new Date(date + 'T00:00:00').getTime(),
      payType,
      note: note.trim()
    };
    if (id) store.updateGift(id, data);
    else store.addGift(data);
    wx.showToast({ title: '已保存', icon: 'success' });
    setTimeout(() => wx.navigateBack(), 400);
  },
  remove() {
    wx.showModal({
      title: '删除记录',
      content: '确认删除这条送礼记录？',
      confirmColor: '#d4380d',
      success: (r) => {
        if (r.confirm) {
          store.deleteGift(this.data.id);
          wx.showToast({ title: '已删除', icon: 'success' });
          setTimeout(() => wx.navigateBack(), 400);
        }
      }
    });
  }
});
