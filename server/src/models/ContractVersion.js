const { sequelize, DataTypes } = require('../db');

const CONTRACT_STATUS = {
  DRAFT: 'DRAFT',
  OBSOLETE: 'OBSOLETE',
  PENDING_SIGN: 'PENDING_SIGN',
  PARTIALLY_SIGNED: 'PARTIALLY_SIGNED',
  FULLY_SIGNED: 'FULLY_SIGNED',
  ARCHIVED: 'ARCHIVED'
};

const ContractVersion = sequelize.define('ContractVersion', {
  id: {
    type: DataTypes.UUID,
    primaryKey: true,
    defaultValue: DataTypes.UUIDV4
  },
  contractNo: {
    type: DataTypes.STRING,
    allowNull: false
  },
  renewalId: {
    type: DataTypes.UUID,
    allowNull: false
  },
  rentPlanId: DataTypes.UUID,
  leaseId: DataTypes.UUID,
  versionNo: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  isEffective: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  status: {
    type: DataTypes.ENUM(...Object.values(CONTRACT_STATUS)),
    defaultValue: CONTRACT_STATUS.DRAFT
  },
  contentText: DataTypes.TEXT,
  contentFileId: DataTypes.UUID,
  rentAmount: {
    type: DataTypes.DECIMAL(12, 2),
    allowNull: false
  },
  increaseRate: DataTypes.DECIMAL(5, 4),
  startDate: DataTypes.DATE,
  endDate: DataTypes.DATE,
  generatedBy: DataTypes.UUID,
  generatedByName: DataTypes.STRING,
  generatedAt: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  },
  signedByTenantAt: DataTypes.DATE,
  signedByTenantId: DataTypes.UUID,
  signedByCompanyAt: DataTypes.DATE,
  signedByCompanyId: DataTypes.UUID,
  obsoletedAt: DataTypes.DATE,
  obsoletedBy: DataTypes.UUID,
  obsoletedReason: DataTypes.TEXT,
  version: {
    type: DataTypes.INTEGER,
    defaultValue: 1
  }
}, {
  indexes: [
    {
      unique: true,
      fields: ['contract_no', 'version_no']
    }
  ]
});

module.exports = { ContractVersion, CONTRACT_STATUS };
