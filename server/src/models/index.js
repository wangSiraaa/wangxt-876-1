const { User, ROLES } = require('./User');
const { Lease, LEASE_STATUS } = require('./Lease');
const { OverdueBill, BILL_STATUS } = require('./OverdueBill');
const { Threshold } = require('./Threshold');
const { RenewalApplication, RENEWAL_STATUS } = require('./RenewalApplication');
const { RentPlan, RENT_PLAN_STATUS } = require('./RentPlan');
const { Negotiation, NEGOTIATION_TYPE } = require('./Negotiation');
const { Attachment, ATTACHMENT_TYPE, ATTACHMENT_CATEGORY } = require('./Attachment');
const { ContractVersion, CONTRACT_STATUS } = require('./ContractVersion');
const { SignState, SIGN_PARTY, SIGN_STATE_STATUS } = require('./SignState');
const { ExpiryReminder, REMINDER_STATUS, REMINDER_LEVEL } = require('./ExpiryReminder');
const { AuditLog, AUDIT_ACTION } = require('./AuditLog');

function setupAssociations() {
  Lease.belongsTo(User, { as: 'tenant', foreignKey: 'tenantId', constraints: false });
  Lease.belongsTo(User, { as: 'housekeeper', foreignKey: 'housekeeperId', constraints: false });
  Lease.hasMany(OverdueBill, { foreignKey: 'leaseId', as: 'overdueBills' });
  Lease.hasMany(RenewalApplication, { foreignKey: 'leaseId', as: 'renewals' });
  Lease.hasMany(ExpiryReminder, { foreignKey: 'leaseId', as: 'reminders' });

  OverdueBill.belongsTo(Lease, { foreignKey: 'leaseId', as: 'lease' });
  OverdueBill.belongsTo(User, { as: 'tenantUser', foreignKey: 'tenantId', constraints: false });

  RenewalApplication.belongsTo(Lease, { foreignKey: 'leaseId', as: 'lease' });
  RenewalApplication.belongsTo(User, { as: 'tenant', foreignKey: 'tenantId', constraints: false });
  RenewalApplication.belongsTo(User, { as: 'applicant', foreignKey: 'applicantId', constraints: false });
  RenewalApplication.hasMany(RentPlan, { foreignKey: 'renewalId', as: 'rentPlans' });
  RenewalApplication.hasMany(Negotiation, { foreignKey: 'renewalId', as: 'negotiations' });
  RenewalApplication.hasMany(Attachment, { foreignKey: 'renewalId', as: 'attachments' });
  RenewalApplication.hasMany(ContractVersion, { foreignKey: 'renewalId', as: 'contractVersions' });
  RenewalApplication.hasMany(SignState, { foreignKey: 'renewalId', as: 'signStates' });

  RentPlan.belongsTo(RenewalApplication, { foreignKey: 'renewalId', as: 'renewal' });
  RentPlan.belongsTo(Threshold, { foreignKey: 'thresholdId', as: 'threshold', constraints: false });

  Negotiation.belongsTo(RenewalApplication, { foreignKey: 'renewalId', as: 'renewal' });
  Negotiation.belongsTo(RentPlan, { foreignKey: 'rentPlanId', as: 'rentPlan', constraints: false });

  Attachment.belongsTo(RenewalApplication, { foreignKey: 'renewalId', as: 'renewal' });
  Attachment.belongsTo(ContractVersion, { foreignKey: 'contractVersionId', as: 'contract', constraints: false });

  ContractVersion.belongsTo(RenewalApplication, { foreignKey: 'renewalId', as: 'renewal' });
  ContractVersion.belongsTo(RentPlan, { foreignKey: 'rentPlanId', as: 'rentPlan', constraints: false });
  ContractVersion.hasMany(SignState, { foreignKey: 'contractVersionId', as: 'signStates' });

  SignState.belongsTo(ContractVersion, { foreignKey: 'contractVersionId', as: 'contract' });
  SignState.belongsTo(RenewalApplication, { foreignKey: 'renewalId', as: 'renewal' });

  ExpiryReminder.belongsTo(Lease, { foreignKey: 'leaseId', as: 'lease' });
  ExpiryReminder.belongsTo(RenewalApplication, { foreignKey: 'linkedRenewalId', as: 'renewal', constraints: false });
}

module.exports = {
  User, ROLES,
  Lease, LEASE_STATUS,
  OverdueBill, BILL_STATUS,
  Threshold,
  RenewalApplication, RENEWAL_STATUS,
  RentPlan, RENT_PLAN_STATUS,
  Negotiation, NEGOTIATION_TYPE,
  Attachment, ATTACHMENT_TYPE, ATTACHMENT_CATEGORY,
  ContractVersion, CONTRACT_STATUS,
  SignState, SIGN_PARTY, SIGN_STATE_STATUS,
  ExpiryReminder, REMINDER_STATUS, REMINDER_LEVEL,
  AuditLog, AUDIT_ACTION,
  setupAssociations
};
