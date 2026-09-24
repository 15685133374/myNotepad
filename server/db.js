// 数据库连接池 + 建表初始化
const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: process.env.MYSQL_HOST || '127.0.0.1',
  port: Number(process.env.MYSQL_PORT) || 3306,
  user: process.env.MYSQL_USERNAME || 'root',
  password: process.env.MYSQL_PASSWORD || '',
  database: process.env.MYSQL_DATABASE || 'libook',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  charset: 'utf8mb4'
});

// 建表 SQL（id 用字符串，兼容前端现有 id 格式）
const DDL = `
CREATE TABLE IF NOT EXISTS books (
  id VARCHAR(64) PRIMARY KEY,
  openid VARCHAR(64) NOT NULL,
  name VARCHAR(128) NOT NULL,
  created_at BIGINT NOT NULL,
  INDEX idx_openid (openid)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS receives (
  id VARCHAR(64) PRIMARY KEY,
  openid VARCHAR(64) NOT NULL,
  book_id VARCHAR(64) NOT NULL,
  name VARCHAR(128) NOT NULL DEFAULT '',
  amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  pay_type VARCHAR(16) NOT NULL DEFAULT 'cash',
  note VARCHAR(512) DEFAULT '',
  time BIGINT NOT NULL,
  INDEX idx_openid (openid),
  INDEX idx_book (openid, book_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS gifts (
  id VARCHAR(64) PRIMARY KEY,
  openid VARCHAR(64) NOT NULL,
  name VARCHAR(128) NOT NULL DEFAULT '',
  event VARCHAR(128) DEFAULT '',
  amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  pay_type VARCHAR(16) NOT NULL DEFAULT 'cash',
  date BIGINT NOT NULL DEFAULT 0,
  note VARCHAR(512) DEFAULT '',
  created_at BIGINT NOT NULL,
  INDEX idx_openid (openid)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS users (
  openid VARCHAR(64) PRIMARY KEY,
  nickname VARCHAR(128) DEFAULT '',
  avatar VARCHAR(512) DEFAULT '',
  created_at BIGINT NOT NULL,
  last_login_at BIGINT NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
`;

async function initDB() {
  const conn = await pool.getConnection();
  try {
    const statements = DDL.split(';').map(s => s.trim()).filter(Boolean);
    for (const sql of statements) {
      await conn.query(sql);
    }
    console.log('[DB] 数据表初始化完成');
  } finally {
    conn.release();
  }
}

module.exports = { pool, initDB };
