# 阿秀礼簿后端服务部署指南

Express + MySQL，部署在微信云托管，小程序通过 `wx.cloud.callContainer` 免鉴权调用。

## 一、开通 MySQL

1. 云托管控制台 → 左侧 **MySQL** → 开通实例（选最小规格）
2. 创建数据库：`libook`
3. 记录连接信息（内网地址、账号、密码）

## 二、配置环境变量

控制台 → 服务 `express-3p5x` → **服务设置 → 环境变量**，添加：

| 变量 | 值 |
|------|-----|
| `MYSQL_HOST` | MySQL 内网地址 |
| `MYSQL_PORT` | `3306` |
| `MYSQL_USERNAME` | 数据库账号 |
| `MYSQL_PASSWORD` | 数据库密码 |
| `MYSQL_DATABASE` | `libook` |

## 三、部署服务

方式任选：

**方式 A：控制台上传代码**
1. 把 `server/` 目录打成 zip
2. 服务列表 → `express-3p5x` → **发布** → 上传代码包 → 全量发布

**方式 B：本地 CLI（需装 Docker）**
```bash
cd server
npm install
# 本地测试：设好环境变量后 node index.js
```

服务启动时会自动建表（books / receives / gifts / users），无需手动执行 SQL。

## 四、小程序端配置

1. `app.js` 中 `wx.cloud.init({ env: '你的环境ID' })`
2. `utils/api.js` 中确认 `ENV`（环境 ID）和 `SERVICE`（服务名 `express-3p5x`）
3. 微信开发者工具 → 右上角 **详情 → 本地设置**，基础库需 **2.23.0+**

## 五、接口一览

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/login` | 获取 openid（免鉴权），自动建档 |
| GET/POST | `/api/books` | 礼簿列表 / 新建 |
| PUT/DELETE | `/api/books/:id` | 改名 / 删除（级联删收礼） |
| GET/POST | `/api/receives?bookId=` | 收礼列表 / 新增 |
| PUT/DELETE | `/api/receives/:id` | 修改 / 删除 |
| GET/POST | `/api/gifts` | 送礼列表 / 新增 |
| PUT/DELETE | `/api/gifts/:id` | 修改 / 删除 |
| POST | `/api/sync` | 全量上传合并（迁移/备份） |
| GET | `/api/export` | 全量导出 |
| GET | `/api/health` | 健康检查 |

统一返回：`{ code: 0, data: ... }`，非 0 为错误（`{ code, msg }`）。

## 六、数据流说明

- **写入**：小程序先写本地存储（页面无感、离线可用），同时异步推送到云端
- **新设备**：启动时检测本地无数据 → 自动从云端拉取
- **老用户迁移**：启动时检测本地有数据且未迁移 → 自动推送到云端（只执行一次）
- **手动备份**：备份页可手动触发上传/恢复

## 七、本地联调（可选）

```bash
cd server
set MYSQL_HOST=127.0.0.1
set MYSQL_PASSWORD=你的密码
node index.js
```

小程序端暂时把 `utils/api.js` 的 `call` 换成 `wx.request` 指向 `http://localhost`，或直接用 `?openid=test` 查询参数模拟身份。
