# 本地存储 → 纯云端模式 迁移指南

> 目标：彻底废弃本地存储，所有读写走云端 API，本地不再保留业务数据。
> 适用时机：后端服务稳定运行、老用户数据已全部迁移上云、确认不再需要离线兜底。
> ⚠️ 这是破坏性变更，执行前务必备份，建议先小范围灰度。

---

## 一、两种模式对比

| 维度 | 当前（本地优先双写） | 目标（纯云端） |
|------|---------------------|---------------|
| 数据源 | 本地 `wx.Storage` 为主 | 云端 MySQL 为唯一来源 |
| 离线可用 | ✅ 可以 | ❌ 断网不可用 |
| 首屏速度 | 快（本地直读） | 慢（需网络请求） |
| 多设备同步 | 依赖手动/启动时同步 | 天然实时一致 |
| 数据安全 | 本地可导出 JSON | 依赖云端备份 |
| 代码复杂度 | 双写 + 迁移逻辑 | 单写，更简单 |

**切换前先想清楚**：纯云端意味着断网时小程序完全打不开数据。礼簿类应用用户常在农村/酒席等弱网环境使用，建议保留本地做**只读缓存**，而不是彻底删除。本文档给出"彻底纯云端"的完整步骤，你可按需裁剪。

---

## 二、迁移前置检查

切换到纯云端前，必须全部满足：

- [ ] 后端服务（`server/`）已部署且稳定运行 2 周以上
- [ ] MySQL 数据完整，抽查多个用户的 books/receives/gifts 与本地一致
- [ ] 所有老用户已完成首次迁移（`lb_cloud_migrated` 标记已写入）
- [ ] 已确认云托管实例的最小副本数 ≥ 1（避免冷启动影响体验）
- [ ] 已用 `server/README.md` 的 `/api/export` 接口做过一次全量数据备份
- [ ] 已通知用户"下次更新需联网使用"（如需）

---

## 三、需要改动的文件清单

按依赖顺序，共 6 个文件：

| 顺序 | 文件 | 改动量 | 说明 |
|------|------|--------|------|
| 1 | `utils/api.js` | 小 | 移除 `CLOUD_ENABLED` 开关（永远为 true） |
| 2 | `utils/store.js` | **大** | 重写：本地读写改为内存缓存 + 全量走 API |
| 3 | `app.js` | 中 | 启动必须先拉取云端数据，阻塞首屏直到完成 |
| 4 | `pages/backup/backup.js` | 小 | 移除本地导入导出，只留云端备份/恢复 |
| 5 | `pages/lock/lock.js` | 小 | 密码锁改为存云端（见第六节风险） |
| 6 | 所有页面 `.js` | 中 | `store.getXxx()` 同步调用全部改为 `async/await` |

---

## 四、分步改造详解

### 第 1 步：api.js —— 移除降级开关

```js
// 删除这行
const CLOUD_ENABLED = true;

// call() 里删除降级判断
// 删除 store.js 里的 cloudOk() 检查
```

### 第 2 步：store.js —— 核心重写（最大工作量）

当前所有函数是**同步**的（页面直接 `store.getBooks()` 拿到数组）。
纯云端后必须改为**异步**（等网络返回）。两种改造方案，选一：

**方案 A：启动时全量拉取到内存（推荐，改动小）**

启动时一次性把该用户所有数据拉到内存，之后页面仍用同步方式读内存，写操作同步改内存 + 异步推云端。

```js
// 新增：内存缓存
let _cache = { books: [], receives: [], gifts: [], loaded: false };

// 启动时调用（app.js 里 await）
function loadAll() {
  return api.exportAll().then(data => {
    _cache.books = data.books || [];
    _cache.receives = data.receives || [];
    _cache.gifts = data.gifts || [];
    _cache.loaded = true;
  });
}

// 读操作：从内存返回（页面代码几乎不用改）
function getBooks() { return _cache.books; }
function getReceives(bookId) {
  const list = bookId ? _cache.receives.filter(r => r.bookId === bookId) : _cache.receives;
  return list.slice().sort((a, b) => b.time - a.time);
}
// ... 其他读操作同理

// 写操作：先改内存，再异步推云端，失败回滚内存
function addBook(name, date) {
  const book = { id: genId(), name, createdAt: date ? new Date(date).getTime() : Date.now() };
  _cache.books.unshift(book);
  api.addBook(book).catch(err => {
    // 失败回滚
    _cache.books = _cache.books.filter(b => b.id !== book.id);
    wx.showToast({ title: '保存失败，请检查网络', icon: 'none' });
  });
  return book;
}
```

**方案 B：全部改 async/await（更规范，改动大）**

所有页面 `store.getBooks()` → `await store.getBooks()`，涉及 12 个页面逐一改。

**建议选方案 A**：页面层改动最小，风险可控。

### 第 3 步：app.js —— 启动流程改为阻塞式加载

```js
onLaunch() {
  if (wx.cloud) {
    wx.cloud.init({ env: 'prod-d5gu9xtoxaabb6a55', traceUser: true });
  }
  this.initApp();
},

async initApp() {
  const store = require('./utils/store');
  // 显示全局 loading，阻塞直到云端数据就绪
  wx.showLoading({ title: '数据加载中...', mask: true });
  try {
    const openid = await store.cloudLogin();
    if (!openid) throw new Error('登录失败');
    await store.loadAll();          // 拉取全量数据到内存
    this.globalData.openid = openid;
    this.globalData.isLoggedIn = true;
  } catch (e) {
    wx.hideLoading();
    wx.showModal({
      title: '加载失败',
      content: '请检查网络后重启小程序',
      showCancel: false
    });
    return;
  }
  wx.hideLoading();
  this.checkLock();
},
```

### 第 4 步：backup 页 —— 只保留云端操作

- 删除"导出数据 / 导入数据"（本地 JSON 已无意义）
- 保留"备份到云端 / 从云端恢复"（此时恢复=重新拉取覆盖内存）

### 第 5 步：密码锁 —— 迁移到云端

当前密码存在本地 `lb_xxx_password`，纯云端模式下：

- 方案一：密码也存后端（`users` 表加 `password` 字段，存加密后的值）
- 方案二：改用微信原生生物认证（指纹/面容），不存密码
- ⚠️ 切换期间要处理老用户本地已有密码的迁移

### 第 6 步：清理本地残留

所有功能验证通过后，加一段一次性清理代码：

```js
// 在 loadAll 成功后执行，只跑一次
function clearLocalLegacy() {
  const done = wx.getStorageSync('lb_local_cleared');
  if (done) return;
  const info = wx.getStorageInfoSync();
  info.keys.forEach(key => {
    if (key.startsWith('lb_') &&
        !['lb_openid', 'lb_userinfo', 'lb_local_cleared'].includes(key)) {
      wx.removeStorageSync(key);
    }
  });
  wx.setStorageSync('lb_local_cleared', Date.now());
}
```

保留 `lb_openid` 和 `lb_userinfo`（登录态还要用），其余业务 key 全删。

---

## 五、上线检查清单

按顺序逐项验证：

- [ ] 断网启动：提示"加载失败，请检查网络"（符合预期，不崩溃）
- [ ] 联网启动：loading 后正常显示所有数据
- [ ] 新增礼簿/收礼/送礼：内存立即更新，MySQL 里有记录
- [ ] 断网时新增：提示失败，内存数据回滚（不出现"假保存"）
- [ ] 删除操作：MySQL 同步删除
- [ ] 换手机登录：数据完整呈现
- [ ] 密码锁：老用户密码不丢，新用户可正常设置
- [ ] 本地存储：`wx.getStorageInfoSync` 里业务 key 已清空
- [ ] 性能：数据量 1000+ 条时启动加载时间可接受（否则加分页）

---

## 六、风险与应对

| 风险 | 影响 | 应对 |
|------|------|------|
| 弱网环境无法使用 | 用户流失 | 保留内存只读缓存，启动失败后允许查看上次数据（只读） |
| 云端响应慢，首屏白屏久 | 体验差 | loading 优化 + 骨架屏；数据量大时按礼簿分页拉取 |
| 写操作失败回滚导致数据不一致 | 账目错误 | 关键操作（收礼）改为同步 await，失败不释放页面 |
| 老用户本地数据没来得及上云 | 数据丢失 | 上线前强制跑一次 `pushToCloud`，后端保留 30 天兼容期 |
| MySQL 误删 | 全量丢失 | 开启云托管 MySQL 自动备份 + 每日 `/api/export` 异地备份 |

---

## 七、回滚方案

上线后若出现严重问题需要回退到本地模式：

1. 小程序版本回滚到上一版（微信后台操作）
2. 本地模式代码里 `CLOUD_ENABLED` 改回 `true` 即可恢复双写
3. 已上云的数据不会丢，用户切回旧版后通过"从云端恢复"拉回本地

**建议**：切换版本和上一版本**并行保留 30 天**，确认稳定后再下架旧版。

---

## 八、工作量预估

| 阶段 | 预估 |
|------|------|
| store.js 重写（方案 A） | 0.5 天 |
| app.js + 页面适配 | 0.5 天 |
| 密码锁迁移 | 0.5 天 |
| 全量测试 + 灰度 | 1 天 |
| **合计** | **约 2~3 天** |

> 注：选择方案 B（全 async）则页面适配需再加 1~2 天。
