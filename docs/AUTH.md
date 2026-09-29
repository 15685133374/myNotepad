# 忘记密码 - 身份认证架构文档

## 概述

忘记密码功能采用**多模式预留架构**，通过环境变量 `AUTH_MODE` 切换认证方式。当前主体为**个人小程序**，默认走 `mock` 或 `code2session` 模式。

## 模式说明

| 模式 | 说明 | 主体要求 | 当前状态 |
|------|------|---------|---------|
| `mock` | 本地联调，直接放行 | 无 | 默认，已可用 |
| `code2session` | 微信登录 code 换 openid 比对 | 个人主体 | 已可用 |
| `security` | 安全问题验证（本地降级） | 无 | 已可用 |
| `face` | 人脸核身 | 企业主体 + 行业资质 | 预留，未接入 |
| `pay` | 微信支付密码验证 | 企业主体 + 商户号 | 预留，未接入 |

> **降级策略**：忘记密码时优先走服务端校验（`code2session`/`face`/`pay`），服务端不可用时自动降级到本地安全问题验证。用户不会被锁死。

## 模式切换

### 服务端环境变量

在启动服务前设置：

```bash
# 本地联调（默认，无需设置）
export AUTH_MODE=mock

# code2session 模式（个人主体可用）
export AUTH_MODE=code2session
export WX_APPID=你的小程序AppID
export WX_SECRET=你的小程序AppSecret

# 人脸核身（预留，需企业主体）
export AUTH_MODE=face
export FACE_VERIFY_APPID=xxx
export FACE_VERIFY_SECRET=xxx

# 微信支付密码验证（预留，需企业主体）
export AUTH_MODE=pay
export WXPAY_MCHID=xxx
export WXPAY_APIV3_KEY=xxx
```

Windows PowerShell：

```powershell
$env:AUTH_MODE="code2session"
$env:WX_APPID="你的AppID"
$env:WX_SECRET="你的AppSecret"
```

### Docker Compose

修改 `server/docker-compose.yml` 的 `server` 服务：

```yaml
environment:
  AUTH_MODE: code2session
  WX_APPID: 你的AppID
  WX_SECRET: 你的AppSecret
```

然后重启：

```powershell
docker compose up -d --build server
```

## 各模式详细说明

### 1. mock（本地联调）

- **用途**：本地开发、真机调试时测试完整流程
- **行为**：不校验真实身份，直接返回 `pass: true`
- **触发条件**：`AUTH_MODE=mock`（默认）或未配置 `WX_APPID/WX_SECRET`

### 2. security（本地安全问题，无需服务器）

- **用途**：纯本地缓存、无服务器场景下的忘记密码降级方案
- **原理**：
  1. 设置密码时选择一个安全问题并填写答案（答案 hash 后存储）
  2. 忘记密码时回答问题，答案匹配即可关闭密码锁
- **安全性**：仅验证"知道答案的人"，安全性较低，但能防止用户被锁死
- **触发条件**：服务端不可用，且本地已存安全问题

### 3. code2session（个人主体可用）

- **原理**：
  1. 小程序 `wx.login` 获取临时 code
  2. 后端用 `AppID + AppSecret + code` 调微信 `jscode2session` 换真实 openid
  3. 比对真实 openid 与当前用户 openid 是否一致
- **安全性**：验证"拿手机的人"和"数据主人"是同一个微信账号
- **限制**：无法防止"知道密码的人借用主人手机"的场景

### 4. face（人脸核身，预留）

- **申请条件**：
  - 企业主体小程序
  - 属于金融、政务、医疗、教育等指定行业
  - 微信官方审核通过
- **流程**：
  1. 前端调用 `wx.startFaceVerify()` 调起人脸识别
  2. 用户完成人脸识别
  3. 后端调微信人脸核身接口验证结果
- **状态**：代码已预留，待企业主体申请后接入

### 5. pay（微信支付密码验证，预留）

- **申请条件**：
  - 企业主体小程序
  - 已开通微信支付商户号
- **流程**：
  1. 前端调起微信支付（可设 0.01 元）
  2. 用户输入支付密码完成支付
  3. 后端验证支付成功回调
  4. 支付成功即视为本人操作
- **状态**：代码已预留，待企业主体申请后接入

## 接口说明

### POST /api/auth/verify

统一身份验证入口，支持多模式。

**请求体**：

```json
{
  "mode": "code2session",
  "code": "wx.login 获取的临时 code",
  "faceVerifyResult": "人脸核身结果（face 模式）",
  "payAuthCode": "支付授权码（pay 模式）"
}
```

**响应**：

```json
{
  "code": 0,
  "data": {
    "pass": true,
    "mode": "code2session",
    "mockPass": true,
    "msg": ""
  }
}
```

### GET /api/auth/mode

查询当前认证模式及可用配置。

**响应**：

```json
{
  "code": 0,
  "data": {
    "currentMode": "mock",
    "available": {
      "hasCode2Session": false,
      "hasFace": false,
      "hasPay": false
    }
  }
}
```

## 迁移路径

1. **当前（个人主体，纯本地）**：`security`（安全问题）+ `mock`/`code2session`（有服务器时）
2. **换企业主体后**：
   - 申请人脸核身 / 微信支付商户号
   - 配置对应环境变量
   - 切换 `AUTH_MODE` 为 `face` 或 `pay`
   - 无需改代码结构，直接生效

## 安全建议

- `mock` 模式仅用于开发调试，**严禁上线**
- `code2session` 适合"手机还在手里"的场景，无法防止借用
- 商业化后建议升级到 `face` 或 `pay`，验证更强
- 所有模式都记录操作日志，便于审计
