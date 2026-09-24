# 本地调试指南（Docker 方式）

在本地用 Docker 起 MySQL，跑通后端服务，不花一分钱云端费用。

---

## 一、前置准备

| 软件 | 版本要求 | 检查命令 |
|------|----------|----------|
| Docker Desktop | 任意稳定版 | `docker --version` |
| Node.js | 16+ | `node --version` |

Docker Desktop 下载：https://www.docker.com/products/docker-desktop
安装后**启动它**（任务栏出现鲸鱼图标即运行中）。

---

## 二、启动 MySQL 容器

打开 PowerShell，执行：

```powershell
docker run -d `
  --name libook-mysql `
  -e MYSQL_ROOT_PASSWORD=123456 `
  -e MYSQL_DATABASE=libook `
  -p 3306:3306 `
  mysql:8
```

参数说明：
- `--name libook-mysql`：容器名，后续操作用
- `MYSQL_ROOT_PASSWORD=123456`：root 密码（本地随意，别用于线上）
- `MYSQL_DATABASE=libook`：自动创建数据库
- `-p 3306:3306`：映射到本机 3306 端口

首次运行会下载镜像（约 500MB，一次性）。

### 验证 MySQL 是否启动成功

```powershell
docker ps
```

看到 `libook-mysql` 状态为 `Up` 即成功。或直连测试：

```powershell
docker exec -it libook-mysql mysql -uroot -p123456 -e "SHOW DATABASES;"
```

能看到 `libook` 库即正常。

---

## 三、启动后端服务

进入 `server/` 目录：

```powershell
cd c:\project\myNodepad\server
npm install
```

### 配置环境变量（PowerShell）

```powershell
$env:MYSQL_HOST="127.0.0.1"
$env:MYSQL_PORT="3306"
$env:MYSQL_USERNAME="root"
$env:MYSQL_PASSWORD="123456"
$env:MYSQL_DATABASE="libook"
$env:PORT=3000
```

> 本地端口用 3000，避免和其他服务冲突。云端默认 80。

### 启动

```powershell
node index.js
```

看到以下输出即成功：

```
[DB] 数据表初始化完成
[Server] listening on :3000
```

服务会自动建好 4 张表（books / receives / gifts / users）。

---

## 四、验证接口

浏览器或 Postman 访问（本地调试用 `?openid=test` 模拟身份）：

### 健康检查

```
http://localhost:3000/api/health
```

返回 `{"code":0,"msg":"ok"}` 即数据库连通。

### 登录（模拟）

```
http://localhost:3000/api/login?openid=test_user_001
```

返回 `{"code":0,"data":{"openid":"test_user_001"}}`，同时 `users` 表会写入一条记录。

### 新建礼簿

```powershell
curl -X POST "http://localhost:3000/api/books?openid=test_user_001" `
  -H "Content-Type: application/json" `
  -d '{"name":"张三婚礼","createdAt":1727000000000}'
```

### 查询礼簿

```
http://localhost:3000/api/books?openid=test_user_001
```

完整接口列表见 `README.md` 第五节。

---

## 五、小程序端联调（可选）

小程序默认走云托管，要连本地需临时改 `utils/api.js`：

```js
// 把 call() 里的 wx.cloud.callContainer 换成 wx.request
function call(path, method = 'GET', data = {}) {
  return new Promise((resolve, reject) => {
    wx.request({
      url: 'http://localhost:3000' + path + (path.includes('?') ? '&' : '?') + 'openid=test_user_001',
      method,
      data,
      success: (res) => {
        const body = res.data || {};
        body.code === 0 ? resolve(body.data) : reject(new Error(body.msg));
      },
      fail: reject
    });
  });
}
```

> 微信开发者工具需勾选「详情 → 本地设置 → 不校验合法域名」。
> 调试完记得改回来，别提交到仓库。

---

## 六、常用 Docker 命令

```powershell
# 查看运行中的容器
docker ps

# 停止 MySQL
docker stop libook-mysql

# 重新启动（数据保留）
docker start libook-mysql

# 查看日志
docker logs libook-mysql

# 进入 MySQL 命令行
docker exec -it libook-mysql mysql -uroot -p123456 libook

# 删除容器（数据丢失，重来用）
docker rm -f libook-mysql
```

---

## 七、常见问题

**1. `docker: command not found`**
Docker Desktop 没启动，或没装。启动任务栏的 Docker Desktop 即可。

**2. 端口 3306 被占用**
本机已装 MySQL 或服务冲突，改映射端口：
```powershell
docker run -d --name libook-mysql -e MYSQL_ROOT_PASSWORD=123456 -e MYSQL_DATABASE=libook -p 3307:3306 mysql:8
```
对应环境变量 `$env:MYSQL_PORT="3307"`。

**3. `node index.js` 报 `connect ECONNREFUSED`**
MySQL 容器没起来，`docker ps` 检查；或环境变量没生效（PowerShell 重开窗口后要重新 `$env:` 设置）。

**4. 表结构变了想重建**
```powershell
docker exec -it libook-mysql mysql -uroot -p123456 -e "DROP DATABASE libook; CREATE DATABASE libook;"
```
然后重启 `node index.js`，会自动重新建表。

---

## 八、停掉本地环境（不花钱）

调试完想彻底停掉：

```powershell
docker stop libook-mysql
```

数据还在容器里，下次 `docker start libook-mysql` 就能继续用。彻底删数据用 `docker rm -f libook-mysql`。

本地调试全程**不产生任何云端费用**，放心折腾。
