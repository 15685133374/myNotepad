// 云托管 API 封装
// 云托管调用方式：wx.cloud.callContainer，免域名备案、自动注入 openid
// 需要在微信开发者工具中关联云托管环境

// 云托管环境 ID 和服务名（发布时改成你自己的）
const ENV = 'prod-d5gu9xtoxaabb6a55';
const SERVICE = 'express-3p5x';

// 是否启用云端（关掉则全部走本地存储，便于开发期切换）
// true = 连接后台服务（本地 Docker 或云托管），支持同步
// false = 纯本地缓存模式，不显示同步功能
const CLOUD_ENABLED = true;

// 本地开发模式：true=调用本地 Docker 服务，false=调用微信云托管
const LOCAL_DEV = true;
const LOCAL_BASE = 'http://localhost';

/**
 * 调用云托管接口
 * @param {string} path 接口路径，如 /api/books
 * @param {string} method GET/POST/PUT/DELETE
 * @param {object} data 请求体（GET 时会拼到 query）
 */
function call(path, method = 'GET', data = {}) {
  return new Promise((resolve, reject) => {
    if (!CLOUD_ENABLED) {
      return reject(new Error('cloud disabled'));
    }

    // 本地开发模式：用 wx.request 调用本地 Docker 服务
    if (LOCAL_DEV) {
      const openid = wx.getStorageSync('lb_openid') || '';
      // GET 请求把 data 拼到 query
      let url = LOCAL_BASE + path;
      if (method === 'GET' && data && Object.keys(data).length > 0) {
        const qs = Object.keys(data).map(k => `${k}=${encodeURIComponent(data[k])}`).join('&');
        url += (path.includes('?') ? '&' : '?') + qs;
      }
      wx.request({
        url,
        method,
        data: method === 'GET' ? {} : data,
        header: {
          'content-type': 'application/json',
          'X-WX-OPENID': openid  // 模拟云托管注入的 openid
        },
        success: (res) => {
          const body = res.data || {};
          if (body.code === 0) {
            resolve(body.data);
          } else {
            reject(new Error(body.msg || `code ${body.code}`));
          }
        },
        fail: reject
      });
      return;
    }

    // 云托管模式
    if (!wx.cloud || !wx.cloud.callContainer) {
      return reject(new Error('基础库过低，不支持 wx.cloud.callContainer（需 2.23.0+）'));
    }
    wx.cloud.callContainer({
      config: { env: ENV },
      path,
      header: {
        'X-WX-SERVICE': SERVICE,
        'content-type': 'application/json'
      },
      method,
      data,
      success: (res) => {
        const body = res.data || {};
        if (body.code === 0) {
          resolve(body.data);
        } else {
          reject(new Error(body.msg || `code ${body.code}`));
        }
      },
      fail: reject
    });
  });
}

// ---------------- 登录 ----------------
function login() {
  return call('/api/login', 'GET');
}

// 忘记密码身份校验：统一入口，支持多模式
function verifyAuth(params) {
  return call('/api/auth/verify', 'POST', params);
}

// 查询当前认证模式及可用配置
function getAuthMode() {
  return call('/api/auth/mode', 'GET');
}

function saveProfile(nickname, avatar) {
  return call('/api/user/profile', 'POST', { nickname, avatar });
}

// ---------------- 礼簿 ----------------
function getBooks() { return call('/api/books'); }
function addBook(book) { return call('/api/books', 'POST', book); }
function updateBook(id, patch) { return call(`/api/books/${id}`, 'PUT', patch); }
function deleteBook(id) { return call(`/api/books/${id}`, 'DELETE'); }

// ---------------- 收礼 ----------------
function getReceives(bookId) {
  return call(bookId ? `/api/receives?bookId=${bookId}` : '/api/receives');
}
function addReceive(rec) { return call('/api/receives', 'POST', rec); }
function updateReceive(id, patch) { return call(`/api/receives/${id}`, 'PUT', patch); }
function deleteReceive(id) { return call(`/api/receives/${id}`, 'DELETE'); }

// ---------------- 送礼 ----------------
function getGifts() { return call('/api/gifts'); }
function addGift(gift) { return call('/api/gifts', 'POST', gift); }
function updateGift(id, patch) { return call(`/api/gifts/${id}`, 'PUT', patch); }
function deleteGift(id) { return call(`/api/gifts/${id}`, 'DELETE'); }

// ---------------- 同步 / 导出 / 清空 ----------------
function syncAll(data) { return call('/api/sync', 'POST', data); }
function exportAll() { return call('/api/export'); }
function clearAll() { return call('/api/clear', 'DELETE'); }

module.exports = {
  ENV, SERVICE, CLOUD_ENABLED,
  call, login, saveProfile, verifyAuth, getAuthMode,
  getBooks, addBook, updateBook, deleteBook,
  getReceives, addReceive, updateReceive, deleteReceive,
  getGifts, addGift, updateGift, deleteGift,
  syncAll, exportAll, clearAll
};
