const { sequelize, DataTypes } = require('../db');

const ATTACHMENT_TYPE = {
  ID_CARD: 'ID_CARD',
  BUSINESS_LICENSE: 'BUSINESS_LICENSE',
  RENT_CERT: 'RENT_CERT',
  PROOF_OF_PAYMENT: 'PROOF_OF_PAYMENT',
  CONTRACT_DRAFT: 'CONTRACT_DRAFT',
  CONTRACT_SIGNED: 'CONTRACT_SIGNED',
  LEGAL_OPINION: 'LEGAL_OPINION',
  OTHER: 'OTHER'
};

const ATTACHMENT_CATEGORY = {
  REQUIRED_FOR_SIGN: 'REQUIRED_FOR_SIGN',
  REFERENCE: 'REFERENCE'
};

const Attachment = sequelize.define('Attachment', {
  id: {
    type: DataTypes.UUID,
    primaryKey: true,
    defaultValue: DataTypes.UUIDV4
  },
  renewalId: {
    type: DataTypes.UUID,
    allowNull: false
  },
  contractVersionId: DataTypes.UUID,
  fileName: {
    type: DataTypes.STRING,
    allowNull: false
  },
  filePath: {
    type: DataTypes.STRING,
    allowNull: false
  },
  fileSize: DataTypes.INTEGER,
  mimeType: DataTypes.STRING,
  type: {
    type: DataTypes.ENUM(...Object.values(ATTACHMENT_TYPE)),
    defaultValue: ATTACHMENT_TYPE.OTHER
  },
  category: {
    type: DataTypes.ENUM(...Object.values(ATTACHMENT_CATEGORY)),
    defaultValue: ATTACHMENT_CATEGORY.REFERENCE
  },
  uploadedBy: DataTypes.UUID,
  uploadedByName: DataTypes.STRING,
  uploadedAt: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  },
  isRequired: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  version: {
    type: DataTypes.INTEGER,
    defaultValue: 1
  }
});

module.exports = { Attachment, ATTACHMENT_TYPE, ATTACHMENT_CATEGORY };
