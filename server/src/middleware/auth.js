const jwt = require('jsonwebtoken');
const { User, ROLES } = require('../models');
const { AuditLog, AUDIT_ACTION } = require('../models');

const JWT_SECRET = process.env.JWT_SECRET || 'lease-renewal-jwt-secret-2024';

function signToken(user) {
  return jwt.sign(
    {
      id: user.id,
      username: user.username,
      role: user.role,
      realName: user.realName
    },
    JWT_SECRET,
    { expiresIn: '24h' }
  );
}

function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (e) {
    return null;
  }
}

async function authMiddleware(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: '未登录或Token已过期' });
  }

  const payload = verifyToken(token);
  if (!payload) {
    return res.status(401).json({ error: 'Token无效或已过期' });
  }

  const user = await User.findByPk(payload.id);
  if (!user) {
    return res.status(401).json({ error: '用户不存在' });
  }

  req.user = {
    id: user.id,
    username: user.username,
    role: user.role,
    realName: user.realName
  };
  req.tokenPayload = payload;
  next();
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({
        error: `权限不足，需要角色: ${roles.join(', ')}，当前角色: ${req.user ? req.user.role : '未知'}`
      });
    }
    next();
  };
}

function requireAnyRole(rolesArray) {
  return (req, res, next) => {
    if (!req.user || !rolesArray.includes(req.user.role)) {
      return res.status(403).json({
        error: '权限不足'
      });
    }
    next();
  };
}

async function writeAudit(req, action, entityType, entityId, entityNo, detail, oldValue, newValue) {
  try {
    await AuditLog.create({
      userId: req.user ? req.user.id : null,
      username: req.user ? req.user.username : null,
      userRole: req.user ? req.user.role : null,
      action,
      entityType,
      entityId,
      entityNo,
      oldValue: oldValue ? JSON.stringify(oldValue) : null,
      newValue: newValue ? JSON.stringify(newValue) : null,
      detail: detail || null,
      ipAddress: req.ip || null,
      userAgent: req.headers['user-agent'] || null
    });
  } catch (e) {
    console.error('Audit log error:', e.message);
  }
}

module.exports = {
  signToken,
  verifyToken,
  authMiddleware,
  requireRole,
  requireAnyRole,
  writeAudit,
  JWT_SECRET
};
