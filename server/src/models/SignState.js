const { sequelize, DataTypes } = require('../db');

const SIGN_PARTY = {
  TENANT: 'TENANT',
  COMPANY_LEGAL: 'COMPANY_LEGAL',
  SIGN_ADMIN: 'SIGN_ADMIN'
};

const SIGN_STATE_STATUS = {
  PENDING: 'PENDING',
  SIGNED: 'SIGNED',
  REJECTED: 'REJECTED'
};

const SignState = sequelize.define('SignState', {
  id: {
    type: DataTypes.UUID,
    primaryKey: true,
    defaultValue: DataTypes.UUIDV4
  },
  contractVersionId: {
    type: DataTypes.UUID,
    allowNull: false
  },
  renewalId: {
    type: DataTypes.UUID,
    allowNull: false
  },
  party: {
    type: DataTypes.ENUM(...Object.values(SIGN_PARTY)),
    allowNull: false
  },
  signerRole: {
    type: DataTypes.STRING,
    allowNull: false
  },
  signerId: DataTypes.UUID,
  signerName: DataTypes.STRING,
  status: {
    type: DataTypes.ENUM(...Object.values(SIGN_STATE_STATUS)),
    defaultValue: SIGN_STATE_STATUS.PENDING
  },
  signOrder: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  signedAt: DataTypes.DATE,
  signature: DataTypes.TEXT,
  comment: DataTypes.TEXT,
  version: {
    type: DataTypes.INTEGER,
    defaultValue: 1
  }
});

module.exports = { SignState, SIGN_PARTY, SIGN_STATE_STATUS };
