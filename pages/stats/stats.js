const store = require('../../utils/store');

const BAR_COLORS = ['#0C3B2E', '#2d6a4f', '#52b788', '#b7791f', '#d8a94e'];
const PIE_COLORS = ['#0C3B2E', '#2d6a4f', '#52b788', '#95d5b2', '#b7791f', '#d8a94e', '#8a978f'];

Page({
  data: {
    receiveTotal: '0.00',
    giftTotal: '0.00',
    cashTotal: '0.00',
    cashCount: 0,
    wechatTotal: '0.00',
    wechatCount: 0,
    balance: '0.00',
    months: [],
    monthMax: 1,
    pieGroups: []
  },
  onShow() {
    this.load();
  },
  load() {
    const rs = store.allReceiveStats();
    const gs = store.giftStats();
    const cashTotal = rs.cashTotal + gs.cashTotal;
    const cashCount = rs.cashCount + gs.cashCount;
    const wechatTotal = rs.wechatTotal + gs.wechatTotal;
    const wechatCount = rs.wechatCount + gs.wechatCount;

    // 条形图：最近6个月 收礼 vs 送礼
    const now = new Date();
    const months = [];
    const monthMap = {};
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = d.getFullYear() + '-' + (d.getMonth() + 1);
      months.push({ label: (d.getMonth() + 1) + '月', key, receive: 0, gift: 0 });
      monthMap[key] = months[months.length - 1];
    }
    store.getReceives().forEach(r => {
      const d = new Date(r.time);
      const m = monthMap[d.getFullYear() + '-' + (d.getMonth() + 1)];
      if (m) m.receive += Number(r.amount) || 0;
    });
    store.getGifts().forEach(g => {
      const d = new Date(g.date);
      const m = monthMap[d.getFullYear() + '-' + (d.getMonth() + 1)];
      if (m) m.gift += Number(g.amount) || 0;
    });
    let monthMax = 1;
    months.forEach(m => { monthMax = Math.max(monthMax, m.receive, m.gift); });

    // 扇形图：送礼事由分类（无事由归入收礼簿礼金）
    const groups = {};
    store.getGifts().forEach(g => {
      const k = g.event || '其他';
      groups[k] = (groups[k] || 0) + (Number(g.amount) || 0);
    });
    store.getBooks().forEach(b => {
      const s = store.bookStats(b.id);
      if (s.total > 0) groups['收礼·' + b.name] = (groups['收礼·' + b.name] || 0) + s.total;
    });

    this.setData({
      receiveTotal: store.fmtMoney(rs.total),
      giftTotal: store.fmtMoney(gs.total),
      cashTotal: store.fmtMoney(cashTotal),
      cashCount,
      wechatTotal: store.fmtMoney(wechatTotal),
      wechatCount,
      balance: store.fmtMoney(rs.total - gs.total),
      months,
      monthMax,
      pieGroups: Object.keys(groups)
        .map((name, i) => ({ name, value: store.fmtMoney(groups[name]), color: PIE_COLORS[i % PIE_COLORS.length] }))
        .sort((a, b) => b.value - a.value)
    });
    this.drawPie();
  },
  drawPie() {
    const query = wx.createSelectorQuery().in(this);
    query.select('#pieCanvas').fields({ node: true, size: true }).exec((res) => {
      if (!res || !res[0] || !res[0].node) return;
      const canvas = res[0].node;
      const ctx = canvas.getContext('2d');
      const dpr = (wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()).pixelRatio || 2;
      const w = res[0].width;
      const h = res[0].height;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, w, h);

      const cx = w / 2, cy = h / 2, r = Math.min(w, h) / 2 - 8;
      const groups = this.data.pieGroups;
      const total = groups.reduce((s, g) => s + g.value, 0);
      if (!total) {
        ctx.fillStyle = '#8a978f';
        ctx.font = '13px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('暂无数据', cx, cy);
        return;
      }
      let angle = -Math.PI / 2;
      groups.forEach((g, i) => {
        const sweep = (g.value / total) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.arc(cx, cy, r, angle, angle + sweep);
        ctx.closePath();
        ctx.fillStyle = PIE_COLORS[i % PIE_COLORS.length];
        ctx.fill();
        angle += sweep;
      });
      // 中心留白成环形
      ctx.beginPath();
      ctx.arc(cx, cy, r * 0.55, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.fillStyle = '#16281f';
      ctx.font = 'bold 13px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('总额', cx, cy - 8);
      ctx.font = 'bold 12px sans-serif';
      ctx.fillText('¥' + store.fmtMoney(total), cx, cy + 12);
    });
  }
});
