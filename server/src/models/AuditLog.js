const { sequelize, DataTypes } = require('../db');

const AUDIT_ACTION = {
  CREATE: 'CREATE',
  UPDATE: 'UPDATE',
  DELETE: 'DELETE',
  STATUS_CHANGE: 'STATUS_CHANGE',
  APPROVE: 'APPROVE',
  REJECT: 'REJECT',
  SIGN: 'SIGN',
  GENERATE: 'GENERATE',
  ARCHIVE: 'ARCHIVE',
  LOGIN: 'LOGIN',
  LOGOUT: 'LOGOUT',
  DOWNLOAD: 'DOWNLOAD',
  UPLOAD: 'UPLOAD'
};

const AuditLog = sequelize.define('AuditLog', {
  id: {
    type: DataTypes.UUID,
    primaryKey: true,
    defaultValue: DataTypes.UUIDV4
  },
  timestamp: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  },
  userId: DataTypes.UUID,
  username: DataTypes.STRING,
  userRole: DataTypes.STRING,
  action: {
    type: DataTypes.ENUM(...Object.values(AUDIT_ACTION)),
    allowNull: false
  },
  entityType: {
    type: DataTypes.STRING,
    allowNull: false
  },
  entityId: DataTypes.UUID,
  entityNo: DataTypes.STRING,
  oldValue: DataTypes.TEXT,
  newValue: DataTypes.TEXT,
  detail: DataTypes.TEXT,
  ipAddress: DataTypes.STRING,
  userAgent: DataTypes.STRING
});

module.exports = { AuditLog, AUDIT_ACTION };
