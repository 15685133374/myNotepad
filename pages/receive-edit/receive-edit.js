const store = require('../../utils/store');

Page({
  data: {
    id: '',
    bookId: '',
    name: '',
    amount: '',
    giftItem: '',
    giftValue: '',
    payType: 'cash',
    note: '',
    nameSuggestions: [],
    dupWarning: false
  },
  onLoad(options) {
    const id = options.id || '';
    const bookId = options.bookId || '';
    this.setData({ id, bookId });
    if (id) {
      const rec = store.getReceive(id);
      if (rec) {
        this.setData({
          name: rec.name,
          amount: String(rec.amount),
          giftItem: rec.giftItem || '',
          giftValue: rec.giftValue ? String(rec.giftValue) : '',
          payType: rec.payType || 'cash',
          note: rec.note || '',
          bookId: rec.bookId
        });
      }
      wx.setNavigationBarTitle({ title: '编辑收礼记录' });
    }
  },
  onName(e) {
    const name = e.detail.value;
    const kw = name.trim();
    let nameSuggestions = [];
    if (kw) {
      nameSuggestions = store.getAllNames().filter(n => n.indexOf(kw) >= 0 && n !== kw).slice(0, 6);
    }
    const dupWarning = !!(kw && store.getReceives(this.data.bookId).some(r => r.name === kw && r.id !== this.data.id));
    this.setData({ name, nameSuggestions, dupWarning });
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
    const name = e.currentTarget.dataset.name;
    const dupWarning = store.getReceives(this.data.bookId).some(r => r.name === name && r.id !== this.data.id);
    this.setData({ name, nameSuggestions: [], dupWarning });
  },
  onAmount(e) {
    this.setData({ amount: e.detail.value });
  },
  onGiftItem(e) {
    this.setData({ giftItem: e.detail.value });
  },
  onGiftValue(e) {
    this.setData({ giftValue: e.detail.value });
  },
  onNote(e) {
    this.setData({ note: e.detail.value });
  },
  setPayType(e) {
    this.setData({ payType: e.currentTarget.dataset.type });
  },
  save() {
    const { id, bookId, name, amount, giftItem, giftValue, payType, note } = this.data;
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
      payType, 
      note: note.trim() 
    };
    if (id) {
      store.updateReceive(id, data);
    } else {
      store.addReceive(Object.assign({ bookId }, data));
    }
    wx.showToast({ title: '已保存', icon: 'success' });
    setTimeout(() => wx.navigateBack(), 400);
  },
  remove() {
    wx.showModal({
      title: '删除记录',
      content: '确认删除这条收礼记录？',
      confirmColor: '#d4380d',
      success: (r) => {
        if (r.confirm) {
          store.deleteReceive(this.data.id);
          wx.showToast({ title: '已删除', icon: 'success' });
          setTimeout(() => wx.navigateBack(), 400);
        }
      }
    });
  }
});
