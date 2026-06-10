const { sequelize, DataTypes } = require('../db');

const LEASE_STATUS = {
  ACTIVE: 'ACTIVE',
  EXPIRING: 'EXPIRING',
  EXPIRED: 'EXPIRED',
  RENEWED: 'RENEWED',
  TERMINATED: 'TERMINATED'
};

const Lease = sequelize.define('Lease', {
  id: {
    type: DataTypes.UUID,
    primaryKey: true,
    defaultValue: DataTypes.UUIDV4
  },
  leaseNo: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true
  },
  tenantId: {
    type: DataTypes.UUID,
    allowNull: false
  },
  tenantName: {
    type: DataTypes.STRING,
    allowNull: false
  },
  propertyAddr: {
    type: DataTypes.STRING,
    allowNull: false
  },
  area: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false
  },
  originalRent: {
    type: DataTypes.DECIMAL(12, 2),
    allowNull: false
  },
  currentRent: {
    type: DataTypes.DECIMAL(12, 2),
    allowNull: false
  },
  startDate: {
    type: DataTypes.DATE,
    allowNull: false
  },
  endDate: {
    type: DataTypes.DATE,
    allowNull: false
  },
  paymentCycle: {
    type: DataTypes.ENUM('MONTHLY', 'QUARTERLY', 'YEARLY'),
    defaultValue: 'MONTHLY'
  },
  housekeeperId: {
    type: DataTypes.UUID
  },
  housekeeperName: DataTypes.STRING,
  status: {
    type: DataTypes.ENUM(...Object.values(LEASE_STATUS)),
    defaultValue: LEASE_STATUS.ACTIVE
  },
  version: {
    type: DataTypes.INTEGER,
    defaultValue: 1
  }
});

module.exports = { Lease, LEASE_STATUS };
