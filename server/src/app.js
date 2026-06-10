const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const { sequelize, initSQLitePragmas } = require('./db');
const models = require('./models');

const authRoutes = require('./routes/auth');
const leaseRoutes = require('./routes/lease');
const renewalRoutes = require('./routes/renewal');
const attachmentRoutes = require('./routes/attachment');
const thresholdRoutes = require('./routes/threshold');

const app = express();
const PORT = process.env.PORT || 3005;

app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  credentials: true
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true }));

const dataDir = path.join(__dirname, '../data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
const uploadDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

app.use('/uploads', express.static(uploadDir));

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'lease-renewal-server',
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

app.use('/api/auth', authRoutes);
app.use('/api/leases', leaseRoutes);
app.use('/api/renewals', renewalRoutes);
app.use('/api/attachments', attachmentRoutes);
app.use('/api/thresholds', thresholdRoutes);

app.use((err, req, res, next) => {
  console.error('[Unhandled Error]', err);
  res.status(err.status || 500).json({
    error: err.message || '服务器内部错误',
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
  });
});

async function bootstrap() {
  try {
    models.setupAssociations();
    await sequelize.authenticate();
    await initSQLitePragmas();
    await sequelize.sync(); // 只创建不存在的表，不修改已有表结构（避免 SQLite 外键约束下 alter 丢数据）
    console.log('✅ 数据库连接与模型同步完成');

    app.listen(PORT, () => {
      console.log(`🚀 后端服务启动于 http://localhost:${PORT}`);
      console.log(`   健康检查: http://localhost:${PORT}/api/health`);
    });
  } catch (e) {
    console.error('❌ 启动失败:', e);
    process.exit(1);
  }
}

if (require.main === module) {
  bootstrap();
}

module.exports = { app, bootstrap };
