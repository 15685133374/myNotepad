# 本地调试指南（Docker Compose 方式）

用 Docker Compose 一键启动 MySQL + 后端服务，不花一分钱云端费用。

---

## 一、前置准备

| 软件 | 版本要求 | 检查命令 |
|------|----------|----------|
| Docker Desktop | 任意稳定版 | `docker --version` |
| Node.js | 16+ | `node --version` |

Docker Desktop 下载：https://www.docker.com/products/docker-desktop
安装后**启动它**（任务栏出现鲸鱼图标即运行中）。

---

## 二、一键启动（Docker Compose）

进入 `server/` 目录：

```powershell
cd c:\project\myNodepad\server
```

首次运行需安装依赖（仅一次）：

```powershell
npm install
```

启动所有服务：

```powershell
docker compose up -d --build
```

- `-d`：后台运行
- `--build`：首次或代码更新后重新构建镜像

看到以下输出即成功：

```
[DB] 数据表初始化完成
[Server] listening on :80
```

服务会自动建好 4 张表（books / receives / gifts / users）。

> 后端服务默认监听 **80 端口**（与云托管一致），MySQL 映射到 3306。
> 如需改端口，修改 `docker-compose.yml` 的 `ports` 配置。

---

## 三、验证接口

浏览器或 Postman 访问（本地调试用 `?openid=test` 模拟身份）：

### 健康检查

```
http://localhost/api/health
```

返回 `{"code":0,"msg":"ok"}` 即数据库连通。

### 登录（模拟）

```
http://localhost/api/login?openid=test_user_001
```

返回 `{"code":0,"data":{"openid":"test_user_001"}}`，同时 `users` 表会写入一条记录。

### 新建礼簿

```powershell
curl -X POST "http://localhost/api/books?openid=test_user_001" `
  -H "Content-Type: application/json" `
  -d '{"name":"张三婚礼","createdAt":1727000000000}'
```

### 查询礼簿

```
http://localhost/api/books?openid=test_user_001
```

完整接口列表见 `README.md` 第五节。

---

## 四、小程序端联调

小程序默认配置已支持本地调试，`utils/api.js` 里：

```js
const LOCAL_DEV = true;              // true=本地 Docker，false=云托管
const LOCAL_BASE = 'http://localhost'; // 本地服务地址（80 端口）
```

真机调试时需改成电脑局域网 IP：

```js
const LOCAL_BASE = 'http://192.168.x.x'; // 换成实际 IP
```

> 微信开发者工具需勾选「详情 → 本地设置 → 不校验合法域名」。

---

## 五、环境变量配置

身份认证模式等配置在 `docker-compose.yml` 的 `server.environment` 里：

```yaml
environment:
  AUTH_MODE: mock          # mock | code2session | face | pay
  WX_APPID: ""             # code2session 模式需要
  WX_SECRET: ""            # code2session 模式需要
```

改完后重启：

```powershell
docker compose up -d --build server
```

详见 `docs/AUTH.md`。

---

## 六、常用 Docker 命令

```powershell
# 查看运行中的容器
docker ps

# 查看后端日志
docker logs mynotepad-server --tail 30

# 实时查看日志
docker logs mynotepad-server -f

# 重启后端服务（代码更新后）
docker compose up -d --build server

# 停止所有服务（保留数据）
docker compose down

# 停止并删除数据（彻底重来）
docker compose down -v

# 进入 MySQL 命令行
docker exec -it mynotepad-mysql mysql -uroot -p123456 libook
```

---

## 七、常见问题

**1. `docker: command not found`**
Docker Desktop 没启动，或没装。启动任务栏的 Docker Desktop 即可。

**2. 端口 80 被占用**
本机已有 Web 服务占用 80 端口，改 `docker-compose.yml`：
```yaml
ports:
  - "3000:80"
```
对应 `utils/api.js` 的 `LOCAL_BASE` 改为 `http://localhost:3000`。

**3. 端口 3306 被占用**
本机已装 MySQL，改 `docker-compose.yml`：
```yaml
ports:
  - "3307:3306"
```

**4. `error load metadata for docker.io/library/node:18-alpine`**
Docker Hub 拉取镜像失败（网络问题），配置 Docker 镜像加速：
Docker Desktop → Settings → Docker Engine：
```json
{
  "registry-mirrors": ["https://docker.1ms.run", "https://docker.xuanyuan.me"]
}
```

**5. 表结构变了想重建**
```powershell
docker exec -it mynotepad-mysql mysql -uroot -p123456 -e "DROP DATABASE libook; CREATE DATABASE libook;"
docker compose restart server
```
服务重启后会自动重新建表。

---

## 八、停掉本地环境（不花钱）

```powershell
docker compose down
```

数据保留在 Docker 卷里，下次 `docker compose up -d` 就能继续用。
彻底删数据用 `docker compose down -v`。

本地调试全程**不产生任何云端费用**，放心折腾。
