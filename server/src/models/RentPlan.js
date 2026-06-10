const { sequelize, DataTypes } = require('../db');

const RENT_PLAN_STATUS = {
  DRAFT: 'DRAFT',
  PROPOSED: 'PROPOSED',
  UNDER_NEGOTIATION: 'UNDER_NEGOTIATION',
  AGREED: 'AGREED',
  SUPERSEDED: 'SUPERSEDED'
};

const RentPlan = sequelize.define('RentPlan', {
  id: {
    type: DataTypes.UUID,
    primaryKey: true,
    defaultValue: DataTypes.UUIDV4
  },
  planNo: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true
  },
  renewalId: {
    type: DataTypes.UUID,
    allowNull: false
  },
  leaseId: DataTypes.UUID,
  previousRent: {
    type: DataTypes.DECIMAL(12, 2),
    allowNull: false
  },
  proposedRent: {
    type: DataTypes.DECIMAL(12, 2),
    allowNull: false
  },
  increaseAmount: {
    type: DataTypes.DECIMAL(12, 2),
    allowNull: false
  },
  increaseRate: {
    type: DataTypes.DECIMAL(5, 4),
    allowNull: false
  },
  leaseTermMonths: {
    type: DataTypes.INTEGER,
    defaultValue: 12
  },
  paymentCycle: {
    type: DataTypes.ENUM('MONTHLY', 'QUARTERLY', 'YEARLY'),
    defaultValue: 'MONTHLY'
  },
  depositMonths: {
    type: DataTypes.INTEGER,
    defaultValue: 1
  },
  startDate: DataTypes.DATE,
  endDate: DataTypes.DATE,
  thresholdId: DataTypes.UUID,
  thresholdRate: DataTypes.DECIMAL(5, 4),
  exceedsThreshold: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  status: {
    type: DataTypes.ENUM(...Object.values(RENT_PLAN_STATUS)),
    defaultValue: RENT_PLAN_STATUS.DRAFT
  },
  creatorId: DataTypes.UUID,
  creatorName: DataTypes.STRING,
  planVersion: {
    type: DataTypes.INTEGER,
    defaultValue: 1
  },
  notes: DataTypes.TEXT,
  version: {
    type: DataTypes.INTEGER,
    defaultValue: 1
  }
});

module.exports = { RentPlan, RENT_PLAN_STATUS };
