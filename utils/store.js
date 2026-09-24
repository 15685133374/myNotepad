// 数据存储层：支持多用户，数据按 openid 隔离存储
// 模拟服务端数据库的功能，实际数据存储在本地

// 获取当前用户的 openid（安全版本，不依赖 getApp()）
function getCurrentOpenid() {
  // 优先从本地存储读取，避免在 App 实例未初始化时调用 getApp() 报错
  const saved = wx.getStorageSync('lb_openid');
  if (saved) return saved;
  try {
    const app = getApp();
    return app && app.globalData && app.globalData.openid ? app.globalData.openid : 'default_user';
  } catch (e) {
    return 'default_user';
  }
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

function addBook(name, date) {
  const list = getBooks();
  const book = {
    id: genId(),
    name,
    createdAt: date ? new Date(date).getTime() : Date.now(),
    openid: getCurrentOpenid() // 记录创建者
  };
  list.unshift(book);
  saveBooks(list);
  if (cloudOk()) silent(api().addBook(book), 'addBook', { type: 'books', id: book.id });
  return book;
}

function updateBook(id, patch) {
  saveBooks(getBooks().map(b => (b.id === id ? Object.assign({}, b, patch) : b)));
  if (cloudOk()) silent(api().updateBook(id, patch), 'updateBook', { type: 'books', id });
}

function deleteBook(id) {
  saveBooks(getBooks().filter(b => b.id !== id));
  saveReceives(getReceives().filter(r => r.bookId !== id));
  if (cloudOk()) {
    api().deleteBook(id).catch(err => {
      markDeleted('books', id);
      console.warn('[云同步失败] deleteBook:', err && err.message);
    });
  }
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
  if (cloudOk()) silent(api().addReceive(rec), 'addReceive', { type: 'receives', id: rec.id });
  return rec;
}

function updateReceive(id, patch) {
  write(KEYS.RECEIVES, read(KEYS.RECEIVES, []).map(r =>
    (r.id === id ? Object.assign({}, r, patch) : r)
  ));
  if (cloudOk()) silent(api().updateReceive(id, patch), 'updateReceive', { type: 'receives', id });
}

function deleteReceive(id) {
  write(KEYS.RECEIVES, read(KEYS.RECEIVES, []).filter(r => r.id !== id));
  if (cloudOk()) {
    api().deleteReceive(id).catch(() => markDeleted('receives', id));
  }
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
  if (cloudOk()) silent(api().addGift(g), 'addGift', { type: 'gifts', id: g.id });
  return g;
}

function updateGift(id, patch) {
  write(KEYS.GIFTS, read(KEYS.GIFTS, []).map(g =>
    (g.id === id ? Object.assign({}, g, patch) : g)
  ));
  if (cloudOk()) silent(api().updateGift(id, patch), 'updateGift', { type: 'gifts', id });
}

function deleteGift(id) {
  write(KEYS.GIFTS, read(KEYS.GIFTS, []).filter(g => g.id !== id));
  if (cloudOk()) {
    api().deleteGift(id).catch(() => markDeleted('gifts', id));
  }
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

// ---------------- 云端同步（静默，不影响本地读写） ----------------
// 策略：本地存储为主（页面无感、离线可用），云端为辅（异步备份）
// 所有云端调用失败时仅打日志，不阻塞用户操作

let _api = null;
function api() {
  if (!_api) {
    try { _api = require('./api'); } catch (e) { _api = null; }
  }
  return _api;
}

function cloudOk() {
  const a = api();
  return !!(a && a.CLOUD_ENABLED && wx.cloud && wx.cloud.callContainer);
}

// 静默调用云端，吞掉错误；成功则记入"已同步"，失败记入"待同步"脏集合
function silent(promise, tag, dirty) {
  if (!promise || !promise.catch) return;
  promise.then(() => {
    if (dirty) markClean(dirty.type, dirty.id);
  }).catch(err => {
    if (dirty) markDirty(dirty.type, dirty.id);
    console.warn(`[云同步失败] ${tag}:`, err && err.message ? err.message : err);
  });
}

// ---------------- 同步状态追踪（脏数据标记） ----------------
// 结构：{ books: {id:1}, receives: {id:1}, gifts: {id:1}, deleted: [{type,id}] }
// 新增/修改失败的进对应集合；删除失败的进 deleted（云端可能还留着，需要补删）
const DIRTY_KEY = 'lb_sync_dirty';

function getDirty() {
  try {
    const v = wx.getStorageSync(DIRTY_KEY);
    if (v && typeof v === 'object') {
      return Object.assign({ books: {}, receives: {}, gifts: {}, deleted: [] }, v);
    }
  } catch (e) {}
  return { books: {}, receives: {}, gifts: {}, deleted: [] };
}

function saveDirty(d) {
  wx.setStorageSync(DIRTY_KEY, d);
}

function markDirty(type, id) {
  const d = getDirty();
  if (d[type]) d[type][id] = Date.now();
  saveDirty(d);
}

function markClean(type, id) {
  const d = getDirty();
  if (d[type] && d[type][id]) {
    delete d[type][id];
    saveDirty(d);
  }
}

function markDeleted(type, id) {
  const d = getDirty();
  d.deleted.push({ type, id, at: Date.now() });
  // 同一条如果在 dirty 里，移除（已删除，不用再补新增）
  if (d[type] && d[type][id]) delete d[type][id];
  saveDirty(d);
}

// 待同步数量（供界面展示）
function getPendingCount() {
  const d = getDirty();
  return Object.keys(d.books).length +
         Object.keys(d.receives).length +
         Object.keys(d.gifts).length +
         d.deleted.length;
}

// 补同步：把所有脏数据重新推送，启动时/定时调用
function flushDirty() {
  if (!cloudOk()) return Promise.resolve(0);
  const d = getDirty();
  const tasks = [];

  // 补新增/修改
  Object.keys(d.books).forEach(id => {
    const b = getBook(id);
    if (b) tasks.push(api().addBook(b).then(() => markClean('books', id)).catch(() => {}));
  });
  Object.keys(d.receives).forEach(id => {
    const r = getReceive(id);
    if (r) tasks.push(api().addReceive(r).then(() => markClean('receives', id)).catch(() => {}));
  });
  Object.keys(d.gifts).forEach(id => {
    const g = getGift(id);
    if (g) tasks.push(api().addGift(g).then(() => markClean('gifts', id)).catch(() => {}));
  });
  // 补删除
  d.deleted.slice().forEach(item => {
    let p = null;
    if (item.type === 'books') p = api().deleteBook(item.id);
    else if (item.type === 'receives') p = api().deleteReceive(item.id);
    else if (item.type === 'gifts') p = api().deleteGift(item.id);
    if (p) tasks.push(p.then(() => {
      const dd = getDirty();
      dd.deleted = dd.deleted.filter(x => !(x.type === item.type && x.id === item.id));
      saveDirty(dd);
    }).catch(() => {}));
  });

  return Promise.all(tasks).then(() => {
    const left = getPendingCount();
    if (left === 0) console.log('[补同步] 全部完成');
    else console.log('[补同步] 剩余待同步：', left);
    return left;
  });
}

// 登录并获取云端 openid
// 若云端 openid 与本地不同（首次上云 / 换身份），自动把旧身份名下的本地数据迁移到新身份名下
function cloudLogin() {
  if (!cloudOk()) return Promise.resolve(null);
  return api().login().then(data => {
    if (data && data.openid) {
      const cur = wx.getStorageSync('lb_openid');
      if (cur !== data.openid) {
        migrateLocalData(cur, data.openid);
        wx.setStorageSync('lb_openid', data.openid);
        console.log('[云登录] openid 已更新并迁移数据：', cur, '->', data.openid);
      }
      return data.openid;
    }
    return null;
  }).catch(err => {
    console.warn('[云登录失败]', err && err.message);
    return null;
  });
}

// 把 oldOpenid 名下的本地存储数据迁移到 newOpenid 名下（仅在新身份无数据时执行，避免覆盖）
function migrateLocalData(oldOpenid, newOpenid) {
  if (!oldOpenid || !newOpenid || oldOpenid === newOpenid) return;
  Object.values(KEYS).forEach(key => {
    const oldKey = `lb_${oldOpenid}_${key}`;
    const newKey = `lb_${newOpenid}_${key}`;
    const newVal = wx.getStorageSync(newKey);
    // 新身份下已有数据则跳过（防止旧数据覆盖新数据）
    if (newVal !== '' && newVal !== undefined && newVal !== null) return;
    const oldVal = wx.getStorageSync(oldKey);
    if (oldVal !== '' && oldVal !== undefined && oldVal !== null) {
      wx.setStorageSync(newKey, oldVal);
    }
  });
}

// 从云端拉取全量数据，覆盖本地（首次进入有网时调用）
function pullFromCloud() {
  if (!cloudOk()) return Promise.resolve(false);
  return api().exportAll().then(data => {
    if (!data) return false;
    write(KEYS.BOOKS, data.books || []);
    write(KEYS.RECEIVES, data.receives || []);
    write(KEYS.GIFTS, data.gifts || []);
    console.log('[云端拉取] books:%d receives:%d gifts:%d',
      (data.books || []).length, (data.receives || []).length, (data.gifts || []).length);
    return true;
  }).catch(err => {
    console.warn('[云端拉取失败]', err && err.message);
    return false;
  });
}

// 把本地全量数据推送到云端（首次迁移 / 手动备份）
function pushToCloud() {
  if (!cloudOk()) return Promise.resolve(null);
  const data = {
    books: read(KEYS.BOOKS, []),
    receives: read(KEYS.RECEIVES, []),
    gifts: read(KEYS.GIFTS, [])
  };
  return api().syncAll(data).then(result => {
    console.log('[云端推送]', result);
    return result;
  }).catch(err => {
    console.warn('[云端推送失败]', err && err.message);
    return null;
  });
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
  getCurrentOpenid, getAllUsers, getUserKey,
  cloudLogin, pullFromCloud, pushToCloud, cloudOk,
  getPendingCount, flushDirty
};
