// 数据存储层：支持多用户，数据按 openid 隔离存储
// 模拟服务端数据库的功能，实际数据存储在本地

// 获取当前用户的 openid
function getCurrentOpenid() {
  const app = getApp();
  return app.globalData.openid || wx.getStorageSync('lb_openid') || 'default_user';
}

// 生成用户专属的存储 key
function getUserKey(key) {
  const openid = getCurrentOpenid();
  return `lb_${openid}_${key}`;
}

const KEYS = {
  BOOKS: 'books',
  RECEIVES: 'receives',
  GIFTS: 'gifts',
  PASSWORD: 'password'
};

function read(key, def) {
  try {
    const userKey = getUserKey(key);
    const v = wx.getStorageSync(userKey);
    return v === '' || v === undefined || v === null ? def : v;
  } catch (e) {
    return def;
  }
}

function write(key, val) {
  const userKey = getUserKey(key);
  wx.setStorageSync(userKey, val);
}

function genId() {
  return 'id_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
}

function pad(n) { return n < 10 ? '0' + n : '' + n; }

function fmtDate(ts) {
  const d = new Date(ts);
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
}

function fmtTime(ts) {
  const d = new Date(ts);
  return fmtDate(ts) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
}

function fmtMoney(n) {
  const num = Number(n) || 0;
  const parts = num.toFixed(2).split('.');
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return parts.join('.');
}

// ---------------- 礼簿 ----------------
function getBooks() { 
  return read(KEYS.BOOKS, []); 
}

function saveBooks(list) { 
  write(KEYS.BOOKS, list); 
}

function getBook(id) { 
  return getBooks().find(b => b.id === id) || null; 
}

function addBook(name) {
  const list = getBooks();
  const book = { 
    id: genId(), 
    name, 
    createdAt: Date.now(),
    openid: getCurrentOpenid() // 记录创建者
  };
  list.unshift(book);
  saveBooks(list);
  return book;
}

function updateBook(id, patch) {
  saveBooks(getBooks().map(b => (b.id === id ? Object.assign({}, b, patch) : b)));
}

function deleteBook(id) {
  saveBooks(getBooks().filter(b => b.id !== id));
  saveReceives(getReceives().filter(r => r.bookId !== id));
}

// ---------------- 收礼 ----------------
function getReceives(bookId) {
  const all = read(KEYS.RECEIVES, []);
  const list = bookId ? all.filter(r => r.bookId === bookId) : all.slice();
  return list.sort((a, b) => b.time - a.time);
}

function saveReceives(list) { 
  write(KEYS.RECEIVES, list); 
}

function getReceive(id) { 
  return read(KEYS.RECEIVES, []).find(r => r.id === id) || null; 
}

function addReceive(data) {
  const all = read(KEYS.RECEIVES, []);
  const rec = Object.assign({ 
    id: genId(), 
    time: Date.now(),
    openid: getCurrentOpenid() // 记录创建者
  }, data);
  all.push(rec);
  write(KEYS.RECEIVES, all);
  return rec;
}

function updateReceive(id, patch) {
  write(KEYS.RECEIVES, read(KEYS.RECEIVES, []).map(r => 
    (r.id === id ? Object.assign({}, r, patch) : r)
  ));
}

function deleteReceive(id) {
  write(KEYS.RECEIVES, read(KEYS.RECEIVES, []).filter(r => r.id !== id));
}

// ---------------- 送礼 ----------------
function getGifts() {
  return read(KEYS.GIFTS, []).slice().sort((a, b) => 
    (b.date - a.date) || ((b.createdAt || 0) - (a.createdAt || 0))
  );
}

function getGift(id) { 
  return read(KEYS.GIFTS, []).find(g => g.id === id) || null; 
}

function addGift(data) {
  const all = read(KEYS.GIFTS, []);
  const g = Object.assign({ 
    id: genId(), 
    createdAt: Date.now(),
    openid: getCurrentOpenid() // 记录创建者
  }, data);
  all.push(g);
  write(KEYS.GIFTS, all);
  return g;
}

function updateGift(id, patch) {
  write(KEYS.GIFTS, read(KEYS.GIFTS, []).map(g => 
    (g.id === id ? Object.assign({}, g, patch) : g)
  ));
}

function deleteGift(id) {
  write(KEYS.GIFTS, read(KEYS.GIFTS, []).filter(g => g.id !== id));
}

// ---------------- 统计 ----------------
function calcStats(list) {
  const s = { 
    total: 0, 
    count: list.length, 
    cashTotal: 0, 
    cashCount: 0, 
    wechatTotal: 0, 
    wechatCount: 0 
  };
  list.forEach(r => {
    s.total += Number(r.amount) || 0;
    if (r.payType === 'wechat') { 
      s.wechatTotal += Number(r.amount) || 0; 
      s.wechatCount++; 
    } else { 
      s.cashTotal += Number(r.amount) || 0; 
      s.cashCount++; 
    }
  });
  return s;
}

function bookStats(bookId) { 
  return calcStats(getReceives(bookId)); 
}

function allReceiveStats() { 
  return calcStats(getReceives()); 
}

function giftStats() { 
  return calcStats(getGifts()); 
}

// ---------------- 人员 ----------------
function getAllNames() {
  const map = {};
  read(KEYS.RECEIVES, []).forEach(r => { 
    if (r.name) map[r.name] = 1; 
  });
  read(KEYS.GIFTS, []).forEach(g => { 
    if (g.name) map[g.name] = 1; 
  });
  return Object.keys(map);
}

function personRecords(name) {
  const receives = getReceives().filter(r => r.name === name);
  const gifts = getGifts().filter(g => g.name === name);
  let inTotal = 0, outTotal = 0;
  receives.forEach(r => { inTotal += Number(r.amount) || 0; });
  gifts.forEach(g => { outTotal += Number(g.amount) || 0; });
  return { receives, gifts, inTotal, outTotal, balance: inTotal - outTotal };
}

// ---------------- 时间范围 ----------------
function rangeStart(type) {
  const now = new Date();
  if (type === 'today') { 
    now.setHours(0, 0, 0, 0); 
    return now.getTime(); 
  }
  if (type === 'week') {
    const d = new Date(now);
    d.setHours(0, 0, 0, 0);
    const day = d.getDay() || 7;
    d.setDate(d.getDate() - day + 1);
    return d.getTime();
  }
  if (type === 'month') { 
    return new Date(now.getFullYear(), now.getMonth(), 1).getTime(); 
  }
  if (type === 'year') { 
    return new Date(now.getFullYear(), 0, 1).getTime(); 
  }
  return 0;
}

// ---------------- 全局检索 ----------------
function searchAll(kw) {
  const k = (kw || '').trim().toLowerCase();
  if (!k) return { books: [], receives: [], gifts: [] };
  const books = getBooks();
  const hit = (s) => (s || '').toLowerCase().indexOf(k) >= 0;
  const bookName = (id) => {
    const b = books.find(x => x.id === id);
    return b ? b.name : '';
  };
  return {
    books: books.filter(b => hit(b.name)),
    receives: getReceives().filter(r => 
      hit(r.name) || hit(r.note) || hit(bookName(r.bookId))
    ),
    gifts: getGifts().filter(g => 
      hit(g.name) || hit(g.event) || hit(g.note)
    )
  };
}

// ---------------- 清空当前用户数据 ----------------
function clearAll() {
  const openid = getCurrentOpenid();
  Object.values(KEYS).forEach(key => {
    wx.removeStorageSync(`lb_${openid}_${key}`);
  });
}

// ---------------- 获取用户列表（管理功能） ----------------
function getAllUsers() {
  const storage = wx.getStorageInfoSync();
  const userSet = new Set();
  
  storage.keys.forEach(key => {
    if (key.startsWith('lb_') && key.includes('_books')) {
      const openid = key.replace('lb_', '').replace('_books', '');
      userSet.add(openid);
    }
  });
  
  return Array.from(userSet).map(openid => {
    const userInfo = wx.getStorageSync(`lb_userinfo_${openid}`);
    return {
      openid,
      nickname: userInfo ? userInfo.nickName : '未授权用户',
      avatar: userInfo ? userInfo.avatarUrl : ''
    };
  });
}

module.exports = {
  KEYS,
  fmtDate, fmtTime, fmtMoney,
  getBooks, getBook, addBook, updateBook, deleteBook,
  getReceives, getReceive, addReceive, updateReceive, deleteReceive,
  getGifts, getGift, addGift, updateGift, deleteGift,
  bookStats, allReceiveStats, giftStats, calcStats,
  getAllNames, personRecords, rangeStart, searchAll, clearAll,
  getCurrentOpenid, getAllUsers
};
