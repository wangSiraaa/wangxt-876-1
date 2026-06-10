const { sequelize, DataTypes } = require('../db');

const Threshold = sequelize.define('Threshold', {
  id: {
    type: DataTypes.UUID,
    primaryKey: true,
    defaultValue: DataTypes.UUIDV4
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false
  },
  minIncreaseRate: {
    type: DataTypes.DECIMAL(5, 4),
    defaultValue: 0
  },
  maxIncreaseRate: {
    type: DataTypes.DECIMAL(5, 4),
    allowNull: false
  },
  legalReviewRequired: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  effectiveDate: {
    type: DataTypes.DATE
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  createdBy: DataTypes.UUID,
  version: {
    type: DataTypes.INTEGER,
    defaultValue: 1
  }
});

module.exports = { Threshold };
