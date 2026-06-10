const { sequelize, DataTypes } = require('../db');

const BILL_STATUS = {
  OVERDUE: 'OVERDUE',
  PARTIAL: 'PARTIAL',
  PAID: 'PAID'
};

const OverdueBill = sequelize.define('OverdueBill', {
  id: {
    type: DataTypes.UUID,
    primaryKey: true,
    defaultValue: DataTypes.UUIDV4
  },
  billNo: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true
  },
  leaseId: {
    type: DataTypes.UUID,
    allowNull: false
  },
  tenantId: {
    type: DataTypes.UUID,
    allowNull: false
  },
  period: {
    type: DataTypes.STRING,
    allowNull: false
  },
  totalAmount: {
    type: DataTypes.DECIMAL(12, 2),
    allowNull: false
  },
  paidAmount: {
    type: DataTypes.DECIMAL(12, 2),
    defaultValue: 0
  },
  overdueAmount: {
    type: DataTypes.DECIMAL(12, 2),
    allowNull: false
  },
  dueDate: {
    type: DataTypes.DATE,
    allowNull: false
  },
  status: {
    type: DataTypes.ENUM(...Object.values(BILL_STATUS)),
    defaultValue: BILL_STATUS.OVERDUE
  },
  version: {
    type: DataTypes.INTEGER,
    defaultValue: 1
  }
});

module.exports = { OverdueBill, BILL_STATUS };
