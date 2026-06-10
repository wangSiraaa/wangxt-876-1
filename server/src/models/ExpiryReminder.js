const { sequelize, DataTypes } = require('../db');

const REMINDER_STATUS = {
  PENDING: 'PENDING',
  SENT: 'SENT',
  ACKNOWLEDGED: 'ACKNOWLEDGED',
  RESOLVED: 'RESOLVED'
};

const REMINDER_LEVEL = {
  INFO: 'INFO',
  WARNING: 'WARNING',
  URGENT: 'URGENT'
};

const ExpiryReminder = sequelize.define('ExpiryReminder', {
  id: {
    type: DataTypes.UUID,
    primaryKey: true,
    defaultValue: DataTypes.UUIDV4
  },
  leaseId: {
    type: DataTypes.UUID,
    allowNull: false
  },
  leaseNo: DataTypes.STRING,
  tenantId: DataTypes.UUID,
  tenantName: DataTypes.STRING,
  propertyAddr: DataTypes.STRING,
  expiryDate: {
    type: DataTypes.DATE,
    allowNull: false
  },
  daysRemaining: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  level: {
    type: DataTypes.ENUM(...Object.values(REMINDER_LEVEL)),
    defaultValue: REMINDER_LEVEL.INFO
  },
  status: {
    type: DataTypes.ENUM(...Object.values(REMINDER_STATUS)),
    defaultValue: REMINDER_STATUS.PENDING
  },
  recipientRole: DataTypes.STRING,
  recipientId: DataTypes.UUID,
  recipientName: DataTypes.STRING,
  reminderDate: {
    type: DataTypes.DATE,
    allowNull: false
  },
  message: DataTypes.TEXT,
  acknowledgedAt: DataTypes.DATE,
  resolvedAt: DataTypes.DATE,
  linkedRenewalId: DataTypes.UUID,
  version: {
    type: DataTypes.INTEGER,
    defaultValue: 1
  }
});

module.exports = { ExpiryReminder, REMINDER_STATUS, REMINDER_LEVEL };
