const store = require('../../utils/store');

Page({
  data: {
    books: [],
    showCreate: false,
    newName: '',
    newDate: '',
    newDateText: '',
    showEditDate: false,
    editBookId: '',
    editDate: '',
    editDateText: ''
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
    const today = new Date();
    const dateStr = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0') + '-' + String(today.getDate()).padStart(2, '0');
    this.setData({ 
      showCreate: true, 
      newName: '',
      newDate: dateStr,
      newDateText: dateStr
    });
  },
  closeCreate() {
    this.setData({ showCreate: false });
  },
  onNameInput(e) {
    this.setData({ newName: e.detail.value });
  },
  onDateChange(e) {
    this.setData({ 
      newDate: e.detail.value,
      newDateText: e.detail.value
    });
  },
  confirmCreate() {
    const name = this.data.newName.trim();
    if (!name) {
      wx.showToast({ title: '请输入礼簿名称', icon: 'none' });
      return;
    }
    store.addBook(name, this.data.newDate);
    this.setData({ showCreate: false });
    this.load();
    wx.showToast({ title: '创建成功', icon: 'success' });
  },
  goDetail(e) {
    wx.navigateTo({ url: '/pages/book/book?id=' + e.currentTarget.dataset.id });
  },
  closeEditDate() {
    this.setData({ showEditDate: false });
  },
  onEditDateChange(e) {
    this.setData({ 
      editDate: e.detail.value,
      editDateText: e.detail.value
    });
  },
  confirmEditDate() {
    const id = this.data.editBookId;
    const newDate = new Date(this.data.editDate);
    if (!isNaN(newDate.getTime())) {
      store.updateBook(id, { createdAt: newDate.getTime() });
      this.setData({ showEditDate: false });
      this.load();
      wx.showToast({ title: '已修改', icon: 'success' });
    } else {
      wx.showToast({ title: '日期格式错误', icon: 'none' });
    }
  },
  onBookAction(e) {
    const { id, name } = e.currentTarget.dataset;
    wx.showActionSheet({
      itemList: ['重命名', '修改日期', '🗑️ 删除礼簿'],
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
          const book = store.getBook(id);
          const currentDate = new Date(book.createdAt);
          const dateStr = currentDate.getFullYear() + '-' + String(currentDate.getMonth() + 1).padStart(2, '0') + '-' + String(currentDate.getDate()).padStart(2, '0');
          this.setData({
            showEditDate: true,
            editBookId: id,
            editDate: dateStr,
            editDateText: dateStr
          });
        } else if (res.tapIndex === 2) {
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
