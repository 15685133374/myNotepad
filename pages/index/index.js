const store = require('../../utils/store');

Page({
  data: {
    books: [],
    showCreate: false,
    newName: ''
  },
  onShow() {
    this.load();
  },
  load() {
    const books = store.getBooks().map(b => {
      const s = store.bookStats(b.id);
      return Object.assign({}, b, {
        totalText: store.fmtMoney(s.total),
        countText: s.count + ' 笔',
        dateText: store.fmtDate(b.createdAt)
      });
    });
    this.setData({ books });
  },
  goSearch() {
    wx.navigateTo({ url: '/pages/search/search' });
  },
  openCreate() {
    this.setData({ showCreate: true, newName: '' });
  },
  closeCreate() {
    this.setData({ showCreate: false });
  },
  onNameInput(e) {
    this.setData({ newName: e.detail.value });
  },
  confirmCreate() {
    const name = this.data.newName.trim();
    if (!name) {
      wx.showToast({ title: '请输入礼簿名称', icon: 'none' });
      return;
    }
    store.addBook(name);
    this.setData({ showCreate: false });
    this.load();
    wx.showToast({ title: '创建成功', icon: 'success' });
  },
  goDetail(e) {
    wx.navigateTo({ url: '/pages/book/book?id=' + e.currentTarget.dataset.id });
  },
  onBookAction(e) {
    const { id, name } = e.currentTarget.dataset;
    wx.showActionSheet({
      itemList: ['重命名', '删除礼簿'],
      success: (res) => {
        if (res.tapIndex === 0) {
          wx.showModal({
            title: '重命名',
            editable: true,
            content: name,
            placeholderText: '请输入新名称',
            success: (r) => {
              if (r.confirm && r.content && r.content.trim()) {
                store.updateBook(id, { name: r.content.trim() });
                this.load();
              }
            }
          });
        } else if (res.tapIndex === 1) {
          wx.showModal({
            title: '删除礼簿',
            content: '将同时删除该礼簿下全部收礼记录，确认删除？',
            confirmColor: '#d4380d',
            success: (r) => {
              if (r.confirm) {
                store.deleteBook(id);
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
