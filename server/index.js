// 阿秀礼簿后端服务 - 微信云托管版
// openid 来源：云托管环境下微信自动注入请求头 X-WX-OPENID（免鉴权）
const express = require('express');
const { pool, initDB } = require('./db');

const app = express();
app.use(express.json({ limit: '5mb' }));

// ---------------- 工具 ----------------
function genId() {
  return 'id_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
}

// 获取 openid：优先微信注入头，本地调试用查询参数兜底
function getOpenid(req) {
  const openid = req.headers['x-wx-openid'] || req.query.openid || '';
  return String(openid).trim();
}

// openid 校验中间件（登录接口除外）
function auth(req, res, next) {
  const openid = getOpenid(req);
  if (!openid) {
    return res.status(401).json({ code: 401, msg: 'missing openid' });
  }
  req.openid = openid;
  next();
}

// 行数据 -> 前端字段格式（下划线转 camel，amount 转 number）
function toBook(row) {
  return { id: row.id, name: row.name, createdAt: Number(row.created_at), openid: row.openid };
}
function toReceive(row) {
  return {
    id: row.id, bookId: row.book_id, name: row.name,
    amount: Number(row.amount), payType: row.pay_type,
    note: row.note || '', time: Number(row.time), openid: row.openid
  };
}
function toGift(row) {
  return {
    id: row.id, name: row.name, event: row.event || '',
    amount: Number(row.amount), payType: row.pay_type,
    date: Number(row.date), note: row.note || '',
    createdAt: Number(row.created_at), openid: row.openid
  };
}

// 简易参数清洗
function str(v, max = 512) { return String(v === undefined || v === null ? '' : v).slice(0, max); }
function num(v) { const n = Number(v); return isNaN(n) ? 0 : n; }
function ts(v, def = Date.now()) { const n = Number(v); return isNaN(n) || n <= 0 ? def : n; }

// ---------------- 登录 / 用户 ----------------
// 小程序进入时调用：返回 openid（云托管免鉴权），并登记用户
app.all('/api/login', async (req, res) => {
  const openid = getOpenid(req);
  if (!openid) return res.status(401).json({ code: 401, msg: 'missing openid' });
  try {
    const now = Date.now();
    await pool.query(
      `INSERT INTO users (openid, nickname, avatar, created_at, last_login_at)
       VALUES (?, '', '', ?, ?)
       ON DUPLICATE KEY UPDATE last_login_at = ?`,
      [openid, now, now, now]
    );
    res.json({ code: 0, data: { openid } });
  } catch (e) {
    console.error(e);
    res.status(500).json({ code: 500, msg: 'login failed' });
  }
});

// 更新用户资料（昵称头像）
app.post('/api/user/profile', auth, async (req, res) => {
  const { nickname, avatar } = req.body || {};
  try {
    await pool.query(
      'UPDATE users SET nickname = ?, avatar = ? WHERE openid = ?',
      [str(nickname, 128), str(avatar, 512), req.openid]
    );
    res.json({ code: 0 });
  } catch (e) {
    res.status(500).json({ code: 500, msg: 'update failed' });
  }
});

// ---------------- 礼簿 ----------------
app.get('/api/books', auth, async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT * FROM books WHERE openid = ? ORDER BY created_at DESC',
      [req.openid]
    );
    res.json({ code: 0, data: rows.map(toBook) });
  } catch (e) {
    res.status(500).json({ code: 500, msg: 'query failed' });
  }
});

app.post('/api/books', auth, async (req, res) => {
  const { name, createdAt, id } = req.body || {};
  if (!name || !str(name).trim()) {
    return res.status(400).json({ code: 400, msg: 'name required' });
  }
  const bookId = id ? str(id, 64) : genId();
  try {
    await pool.query(
      'INSERT INTO books (id, openid, name, created_at) VALUES (?, ?, ?, ?)',
      [bookId, req.openid, str(name, 128), ts(createdAt)]
    );
    res.json({ code: 0, data: { id: bookId, name: str(name, 128), createdAt: ts(createdAt), openid: req.openid } });
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ code: 409, msg: 'id exists' });
    }
    res.status(500).json({ code: 500, msg: 'create failed' });
  }
});

app.put('/api/books/:id', auth, async (req, res) => {
  const { name } = req.body || {};
  try {
    const [r] = await pool.query(
      'UPDATE books SET name = ? WHERE id = ? AND openid = ?',
      [str(name, 128), req.params.id, req.openid]
    );
    if (r.affectedRows === 0) return res.status(404).json({ code: 404, msg: 'not found' });
    res.json({ code: 0 });
  } catch (e) {
    res.status(500).json({ code: 500, msg: 'update failed' });
  }
});

app.delete('/api/books/:id', auth, async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [r] = await conn.query(
      'DELETE FROM books WHERE id = ? AND openid = ?',
      [req.params.id, req.openid]
    );
    if (r.affectedRows === 0) {
      await conn.rollback();
      return res.status(404).json({ code: 404, msg: 'not found' });
    }
    // 级联删除该礼簿下的收礼记录
    await conn.query(
      'DELETE FROM receives WHERE book_id = ? AND openid = ?',
      [req.params.id, req.openid]
    );
    await conn.commit();
    res.json({ code: 0 });
  } catch (e) {
    await conn.rollback();
    res.status(500).json({ code: 500, msg: 'delete failed' });
  } finally {
    conn.release();
  }
});

// ---------------- 收礼 ----------------
app.get('/api/receives', auth, async (req, res) => {
  const { bookId } = req.query;
  try {
    let sql = 'SELECT * FROM receives WHERE openid = ?';
    const params = [req.openid];
    if (bookId) {
      sql += ' AND book_id = ?';
      params.push(String(bookId));
    }
    sql += ' ORDER BY time DESC';
    const [rows] = await pool.query(sql, params);
    res.json({ code: 0, data: rows.map(toReceive) });
  } catch (e) {
    res.status(500).json({ code: 500, msg: 'query failed' });
  }
});

app.post('/api/receives', auth, async (req, res) => {
  const b = req.body || {};
  if (!b.bookId) return res.status(400).json({ code: 400, msg: 'bookId required' });
  const id = b.id ? str(b.id, 64) : genId();
  try {
    await pool.query(
      `INSERT INTO receives (id, openid, book_id, name, amount, pay_type, note, time)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, req.openid, str(b.bookId, 64), str(b.name, 128), num(b.amount),
       str(b.payType, 16) || 'cash', str(b.note), ts(b.time)]
    );
    res.json({ code: 0, data: { id } });
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') return res.status(409).json({ code: 409, msg: 'id exists' });
    res.status(500).json({ code: 500, msg: 'create failed' });
  }
});

app.put('/api/receives/:id', auth, async (req, res) => {
  const b = req.body || {};
  try {
    const [r] = await pool.query(
      `UPDATE receives SET name = ?, amount = ?, pay_type = ?, note = ?, time = ?
       WHERE id = ? AND openid = ?`,
      [str(b.name, 128), num(b.amount), str(b.payType, 16) || 'cash',
       str(b.note), ts(b.time), req.params.id, req.openid]
    );
    if (r.affectedRows === 0) return res.status(404).json({ code: 404, msg: 'not found' });
    res.json({ code: 0 });
  } catch (e) {
    res.status(500).json({ code: 500, msg: 'update failed' });
  }
});

app.delete('/api/receives/:id', auth, async (req, res) => {
  try {
    const [r] = await pool.query(
      'DELETE FROM receives WHERE id = ? AND openid = ?',
      [req.params.id, req.openid]
    );
    if (r.affectedRows === 0) return res.status(404).json({ code: 404, msg: 'not found' });
    res.json({ code: 0 });
  } catch (e) {
    res.status(500).json({ code: 500, msg: 'delete failed' });
  }
});

// ---------------- 送礼 ----------------
app.get('/api/gifts', auth, async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT * FROM gifts WHERE openid = ? ORDER BY date DESC, created_at DESC',
      [req.openid]
    );
    res.json({ code: 0, data: rows.map(toGift) });
  } catch (e) {
    res.status(500).json({ code: 500, msg: 'query failed' });
  }
});

app.post('/api/gifts', auth, async (req, res) => {
  const b = req.body || {};
  const id = b.id ? str(b.id, 64) : genId();
  try {
    await pool.query(
      `INSERT INTO gifts (id, openid, name, event, amount, pay_type, date, note, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, req.openid, str(b.name, 128), str(b.event, 128), num(b.amount),
       str(b.payType, 16) || 'cash', ts(b.date, 0), str(b.note), ts(b.createdAt)]
    );
    res.json({ code: 0, data: { id } });
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') return res.status(409).json({ code: 409, msg: 'id exists' });
    res.status(500).json({ code: 500, msg: 'create failed' });
  }
});

app.put('/api/gifts/:id', auth, async (req, res) => {
  const b = req.body || {};
  try {
    const [r] = await pool.query(
      `UPDATE gifts SET name = ?, event = ?, amount = ?, pay_type = ?, date = ?, note = ?
       WHERE id = ? AND openid = ?`,
      [str(b.name, 128), str(b.event, 128), num(b.amount), str(b.payType, 16) || 'cash',
       ts(b.date, 0), str(b.note), req.params.id, req.openid]
    );
    if (r.affectedRows === 0) return res.status(404).json({ code: 404, msg: 'not found' });
    res.json({ code: 0 });
  } catch (e) {
    res.status(500).json({ code: 500, msg: 'update failed' });
  }
});

app.delete('/api/gifts/:id', auth, async (req, res) => {
  try {
    const [r] = await pool.query(
      'DELETE FROM gifts WHERE id = ? AND openid = ?',
      [req.params.id, req.openid]
    );
    if (r.affectedRows === 0) return res.status(404).json({ code: 404, msg: 'not found' });
    res.json({ code: 0 });
  } catch (e) {
    res.status(500).json({ code: 500, msg: 'delete failed' });
  }
});

// ---------------- 全量同步（本地 -> 云端） ----------------
// 用途：老用户首次迁移 / 定期备份。策略：按 id 覆盖（INSERT ... ON DUPLICATE KEY UPDATE）
app.post('/api/sync', auth, async (req, res) => {
  const { books = [], receives = [], gifts = [] } = req.body || {};
  const conn = await pool.getConnection();
  const result = { books: 0, receives: 0, gifts: 0 };
  try {
    await conn.beginTransaction();

    for (const b of books) {
      if (!b || !b.id) continue;
      await conn.query(
        `INSERT INTO books (id, openid, name, created_at) VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE name = VALUES(name), created_at = VALUES(created_at)`,
        [str(b.id, 64), req.openid, str(b.name, 128), ts(b.createdAt)]
      );
      result.books++;
    }

    for (const r of receives) {
      if (!r || !r.id || !r.bookId) continue;
      await conn.query(
        `INSERT INTO receives (id, openid, book_id, name, amount, pay_type, note, time)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE name = VALUES(name), amount = VALUES(amount),
           pay_type = VALUES(pay_type), note = VALUES(note), time = VALUES(time)`,
        [str(r.id, 64), req.openid, str(r.bookId, 64), str(r.name, 128), num(r.amount),
         str(r.payType, 16) || 'cash', str(r.note), ts(r.time)]
      );
      result.receives++;
    }

    for (const g of gifts) {
      if (!g || !g.id) continue;
      await conn.query(
        `INSERT INTO gifts (id, openid, name, event, amount, pay_type, date, note, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE name = VALUES(name), event = VALUES(event),
           amount = VALUES(amount), pay_type = VALUES(pay_type), date = VALUES(date),
           note = VALUES(note)`,
        [str(g.id, 64), req.openid, str(g.name, 128), str(g.event, 128), num(g.amount),
         str(g.payType, 16) || 'cash', ts(g.date, 0), str(g.note), ts(g.createdAt)]
      );
      result.gifts++;
    }

    await conn.commit();
    res.json({ code: 0, data: result });
  } catch (e) {
    await conn.rollback();
    console.error(e);
    res.status(500).json({ code: 500, msg: 'sync failed' });
  } finally {
    conn.release();
  }
});

// ---------------- 全量导出（云端 -> 本地备份） ----------------
app.get('/api/export', auth, async (req, res) => {
  try {
    const [books] = await pool.query('SELECT * FROM books WHERE openid = ?', [req.openid]);
    const [receives] = await pool.query('SELECT * FROM receives WHERE openid = ?', [req.openid]);
    const [gifts] = await pool.query('SELECT * FROM gifts WHERE openid = ?', [req.openid]);
    res.json({
      code: 0,
      data: {
        books: books.map(toBook),
        receives: receives.map(toReceive),
        gifts: gifts.map(toGift)
      }
    });
  } catch (e) {
    res.status(500).json({ code: 500, msg: 'export failed' });
  }
});

// ---------------- 健康检查 ----------------
app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ code: 0, msg: 'ok' });
  } catch (e) {
    res.status(500).json({ code: 500, msg: 'db error' });
  }
});

app.get('/', (req, res) => {
  res.send('libook-server running');
});

// ---------------- 启动 ----------------
const PORT = process.env.PORT || 80;
initDB()
  .then(() => {
    app.listen(PORT, () => console.log(`[Server] listening on :${PORT}`));
  })
  .catch(err => {
    console.error('[DB] 初始化失败：', err);
    process.exit(1);
  });
