const { sequelize, DataTypes } = require('../db');

const REVIEW_TYPE = {
  INITIAL: 'INITIAL',
  REVISION: 'REVISION',
  REOPEN: 'REOPEN'
};

const REVIEW_RESULT = {
  PASSED: 'PASSED',
  REJECTED: 'REJECTED'
};

const LegalReviewRecord = sequelize.define('LegalReviewRecord', {
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
  reviewType: {
    type: DataTypes.ENUM(...Object.values(REVIEW_TYPE)),
    defaultValue: REVIEW_TYPE.INITIAL
  },
  reviewerId: DataTypes.UUID,
  reviewerName: DataTypes.STRING,
  reviewResult: {
    type: DataTypes.ENUM(...Object.values(REVIEW_RESULT)),
    allowNull: false
  },
  reviewComment: DataTypes.TEXT,
  previousRent: DataTypes.DECIMAL(12, 2),
  proposedRent: DataTypes.DECIMAL(12, 2),
  increaseRate: DataTypes.DECIMAL(5, 4),
  thresholdRate: DataTypes.DECIMAL(5, 4),
  exceedsThreshold: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  reviewConclusion: DataTypes.TEXT,
  reviewedAt: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  },
  version: {
    type: DataTypes.INTEGER,
    defaultValue: 1
  }
});

module.exports = { LegalReviewRecord, REVIEW_TYPE, REVIEW_RESULT };
