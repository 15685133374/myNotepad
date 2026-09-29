// 身份认证模块：预留多模式架构
// 当前主体：个人小程序
// 模式切换：通过环境变量 AUTH_MODE 控制
//   - mock: 本地联调，直接放行（默认）
//   - code2session: 微信登录 code 换 openid 比对（个人主体可用）
//   - face: 人脸核身（预留，需企业主体 + 行业资质）
//   - pay: 微信支付密码验证（预留，需企业主体 + 商户号）

const AUTH_MODE = process.env.AUTH_MODE || 'mock';

// ---------------- code2Session 配置 ----------------
const WX_APPID = process.env.WX_APPID || '';
const WX_SECRET = process.env.WX_SECRET || '';

// ---------------- 人脸核身配置（预留） ----------------
// 申请条件：企业主体小程序，且属于金融、政务、医疗、教育等指定行业
// 文档：https://developers.weixin.qq.com/miniprogram/dev/framework/open-ability/face-verify.html
const FACE_VERIFY_APPID = process.env.FACE_VERIFY_APPID || '';
const FACE_VERIFY_SECRET = process.env.FACE_VERIFY_SECRET || '';

// ---------------- 微信支付密码配置（预留） ----------------
// 申请条件：企业主体小程序 + 微信支付商户号
// 文档：https://pay.weixin.qq.com/wiki/doc/apiv3/apis/chapter3_5_4.shtml
const WXPAY_MCHID = process.env.WXPAY_MCHID || '';
const WXPAY_APIV3_KEY = process.env.WXPAY_APIV3_KEY || '';

/**
 * 统一身份验证接口
 * @param {object} params
 * @param {string} params.mode 认证模式：mock | code2session | face | pay
 * @param {string} params.code 微信登录 code（code2session 模式必传）
 * @param {string} params.openid 当前用户 openid（用于比对）
 * @param {string} params.faceVerifyResult 人脸核身结果（face 模式必传）
 * @param {string} params.payAuthCode 微信支付授权码（pay 模式必传）
 * @returns {Promise<{pass: boolean, mode: string, msg?: string}>}
 */
async function verifyIdentity(params) {
  const { mode = AUTH_MODE, code, openid, faceVerifyResult, payAuthCode } = params;

  console.log(`[auth] 认证模式: ${mode}, openid: ${openid}`);

  switch (mode) {
    case 'mock':
      return verifyMock(params);
    case 'code2session':
      return verifyCode2Session(params);
    case 'face':
      return verifyFace(params);
    case 'pay':
      return verifyPay(params);
    default:
      return { pass: false, mode, msg: `unknown auth mode: ${mode}` };
  }
}

// ---------------- 模式实现 ----------------

/** mock：本地联调用，直接放行 */
async function verifyMock({ openid }) {
  console.log('[auth] mock 模式：直接放行');
  return { pass: true, mode: 'mock', mockPass: true };
}

/** code2session：微信登录 code 换真实 openid 比对 */
async function verifyCode2Session({ code, openid }) {
  if (!WX_APPID || !WX_SECRET) {
    console.log('[auth] code2session 模式：未配置 WX_APPID/WX_SECRET，降级为 mock');
    return verifyMock({ openid });
  }

  try {
    const url = `https://api.weixin.qq.com/sns/jscode2session?appid=${WX_APPID}&secret=${WX_SECRET}&js_code=${encodeURIComponent(code)}&grant_type=authorization_code`;
    const r = await fetch(url);
    const data = await r.json();

    if (data.errcode) {
      return { pass: false, mode: 'code2session', msg: `code2session failed: ${data.errcode} ${data.errmsg}` };
    }
    if (!data.openid) {
      return { pass: false, mode: 'code2session', msg: 'code2session no openid' };
    }

    const pass = data.openid === openid;
    console.log(`[auth] code2session 比对：${data.openid} vs ${openid} => ${pass ? '一致' : '不一致'}`);
    return { pass, mode: 'code2session', realOpenid: data.openid };
  } catch (e) {
    console.error(e);
    return { pass: false, mode: 'code2session', msg: 'verify failed' };
  }
}

/** face：人脸核身（预留，需企业主体） */
async function verifyFace({ openid, faceVerifyResult }) {
  // TODO: 接入微信人脸核身
  // 1. 前端调用 wx.startFaceVerify() 获取人脸核验结果
  // 2. 后端调微信人脸核身接口验证结果真实性
  // 3. 比对核验结果中的身份信息与当前用户
  console.log('[auth] face 模式：人脸核身尚未接入（需企业主体 + 行业资质）');
  return { pass: false, mode: 'face', msg: 'face verify not implemented, need enterprise subject' };
}

/** pay：微信支付密码验证（预留，需企业主体 + 商户号） */
async function verifyPay({ openid, payAuthCode }) {
  // TODO: 接入微信支付密码验证
  // 1. 前端调起微信支付（金额可设为 0.01 元）
  // 2. 用户输入支付密码完成支付
  // 3. 后端通过支付回调验证支付成功
  // 4. 支付成功即视为本人操作
  console.log('[auth] pay 模式：微信支付密码验证尚未接入（需企业主体 + 商户号）');
  return { pass: false, mode: 'pay', msg: 'pay verify not implemented, need enterprise subject + merchant' };
}

module.exports = {
  AUTH_MODE,
  verifyIdentity,
  // 导出配置供检查
  config: {
    hasCode2Session: !!(WX_APPID && WX_SECRET),
    hasFace: !!(FACE_VERIFY_APPID && FACE_VERIFY_SECRET),
    hasPay: !!(WXPAY_MCHID && WXPAY_APIV3_KEY)
  }
};
