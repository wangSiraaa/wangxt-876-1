const { sequelize, DataTypes } = require('../db');

const NEGOTIATION_TYPE = {
  TENANT_OFFER: 'TENANT_OFFER',
  HOUSEEKEEPER_OFFER: 'HOUSEKEEPER_OFFER',
  AGREEMENT: 'AGREEMENT'
};

const Negotiation = sequelize.define('Negotiation', {
  id: {
    type: DataTypes.UUID,
    primaryKey: true,
    defaultValue: DataTypes.UUIDV4
  },
  renewalId: {
    type: DataTypes.UUID,
    allowNull: false
  },
  rentPlanId: DataTypes.UUID,
  negotiatorId: {
    type: DataTypes.UUID,
    allowNull: false
  },
  negotiatorName: DataTypes.STRING,
  negotiatorRole: {
    type: DataTypes.STRING,
    allowNull: false
  },
  type: {
    type: DataTypes.ENUM(...Object.values(NEGOTIATION_TYPE)),
    allowNull: false
  },
  offeredRent: {
    type: DataTypes.DECIMAL(12, 2),
    allowNull: false
  },
  offerRate: DataTypes.DECIMAL(5, 4),
  comment: DataTypes.TEXT,
  timestamp: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  },
  version: {
    type: DataTypes.INTEGER,
    defaultValue: 1
  }
});

module.exports = { Negotiation, NEGOTIATION_TYPE };
