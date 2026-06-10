const express = require('express');
const bcrypt = require('bcryptjs');
const { User, ROLES } = require('../models');
const { signToken, authMiddleware, writeAudit } = require('../middleware/auth');
const { AUDIT_ACTION } = require('../models');

const router = express.Router();

router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: '请输入用户名和密码' });
    }

    const user = await User.findOne({ where: { username } });
    if (!user) {
      return res.status(401).json({ error: '用户不存在' });
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      writeAudit(req, AUDIT_ACTION.LOGIN, 'User', user.id, username, `登录失败：密码错误`, null, null);
      return res.status(401).json({ error: '密码错误' });
    }

    const token = signToken(user);
    writeAudit(req, AUDIT_ACTION.LOGIN, 'User', user.id, username, '登录成功', null, null);

    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        realName: user.realName,
        role: user.role,
        phone: user.phone,
        email: user.email
      }
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: '登录失败: ' + e.message });
  }
});

router.post('/logout', authMiddleware, async (req, res) => {
  writeAudit(req, AUDIT_ACTION.LOGOUT, 'User', req.user.id, req.user.username, '退出登录', null, null);
  res.json({ ok: true });
});

router.get('/me', authMiddleware, async (req, res) => {
  const user = await User.findByPk(req.user.id);
  if (!user) return res.status(404).json({ error: '用户不存在' });
  res.json({
    id: user.id,
    username: user.username,
    realName: user.realName,
    role: user.role,
    phone: user.phone,
    email: user.email
  });
});

router.get('/roles', authMiddleware, (req, res) => {
  res.json({
    roles: Object.values(ROLES).map(r => ({
      key: r,
      label: ({
        [ROLES.TENANT]: '租客',
        [ROLES.HOUSEKEEPER]: '管家',
        [ROLES.FINANCE]: '财务',
        [ROLES.LEGAL]: '法务',
        [ROLES.SIGN_ADMIN]: '签署管理员'
      })[r] || r
    }))
  });
});

router.get('/users', authMiddleware, async (req, res) => {
  const { role } = req.query;
  const where = {};
  if (role) where.role = role;
  const users = await User.findAll({ where });
  res.json(users.map(u => ({
    id: u.id,
    username: u.username,
    realName: u.realName,
    role: u.role,
    phone: u.phone,
    email: u.email
  })));
});

module.exports = router;
