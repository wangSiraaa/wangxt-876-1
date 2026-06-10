const { sequelize, DataTypes } = require('../db');

const RENEWAL_STATUS = {
  DRAFT: 'DRAFT',
  PENDING_OVERDUE_CHECK: 'PENDING_OVERDUE_CHECK',
  OVERDUE_REJECTED: 'OVERDUE_REJECTED',
  OVERDUE_PASSED: 'OVERDUE_PASSED',
  RENT_PLAN_CREATED: 'RENT_PLAN_CREATED',
  NEGOTIATING: 'NEGOTIATING',
  LEGAL_REVIEW_PENDING: 'LEGAL_REVIEW_PENDING',
  LEGAL_REVIEW_REJECTED: 'LEGAL_REVIEW_REJECTED',
  LEGAL_REVIEW_PASSED: 'LEGAL_REVIEW_PASSED',
  CONTRACT_GENERATING: 'CONTRACT_GENERATING',
  CONTRACT_GENERATED: 'CONTRACT_GENERATED',
  SIGNING_PENDING: 'SIGNING_PENDING',
  SIGNED: 'SIGNED',
  ARCHIVED: 'ARCHIVED',
  CANCELLED: 'CANCELLED'
};

const RenewalApplication = sequelize.define('RenewalApplication', {
  id: {
    type: DataTypes.UUID,
    primaryKey: true,
    defaultValue: DataTypes.UUIDV4
  },
  appNo: {
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
  tenantName: DataTypes.STRING,
  propertyAddr: DataTypes.STRING,
  applicantId: DataTypes.UUID,
  applicantName: DataTypes.STRING,
  applyDate: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  },
  expectedStartDate: DataTypes.DATE,
  expectedLeaseTerm: {
    type: DataTypes.INTEGER,
    defaultValue: 12
  },
  status: {
    type: DataTypes.ENUM(...Object.values(RENEWAL_STATUS)),
    defaultValue: RENEWAL_STATUS.DRAFT
  },
  housekeeperId: DataTypes.UUID,
  housekeeperName: DataTypes.STRING,
  financeId: DataTypes.UUID,
  financeName: DataTypes.STRING,
  legalId: DataTypes.UUID,
  legalName: DataTypes.STRING,
  signAdminId: DataTypes.UUID,
  signAdminName: DataTypes.STRING,
  currentHandlerRole: {
    type: DataTypes.STRING
  },
  currentHandlerId: DataTypes.UUID,
  overdueCheckResult: DataTypes.TEXT,
  legalReviewComment: DataTypes.TEXT,
  legalReviewResult: {
    type: DataTypes.ENUM('PASSED', 'REJECTED', 'PENDING'),
    defaultValue: 'PENDING'
  },
  legalReviewedAt: DataTypes.DATE,
  legalReviewCount: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  lastLegalReviewResult: DataTypes.TEXT,
  reviewConclusion: DataTypes.TEXT,
  archiveDate: DataTypes.DATE,
  version: {
    type: DataTypes.INTEGER,
    defaultValue: 1
  }
});

module.exports = { RenewalApplication, RENEWAL_STATUS };
