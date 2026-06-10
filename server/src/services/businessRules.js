const { Op } = require('sequelize');
const {
  OverdueBill, BILL_STATUS,
  Threshold,
  RenewalApplication, RENEWAL_STATUS,
  RentPlan, RENT_PLAN_STATUS,
  ContractVersion, CONTRACT_STATUS,
  Attachment, ATTACHMENT_CATEGORY,
  SignState, SIGN_PARTY, SIGN_STATE_STATUS,
  ROLES
} = require('../models');

const REQUIRED_ATTACHMENT_TYPES = ['ID_CARD', 'RENT_CERT', 'CONTRACT_DRAFT'];

async function checkOverdue(tenantId, leaseId) {
  const bills = await OverdueBill.findAll({
    where: {
      tenantId,
      leaseId,
      status: [BILL_STATUS.OVERDUE, BILL_STATUS.PARTIAL]
    }
  });

  const totalOverdue = bills.reduce((sum, b) => sum + parseFloat(b.overdueAmount || 0), 0);
  return {
    hasOverdue: bills.length > 0 && totalOverdue > 0,
    bills,
    totalOverdue: totalOverdue.toFixed(2),
    message: bills.length > 0 && totalOverdue > 0
      ? `存在 ${bills.length} 笔欠费账单，累计欠费 ${totalOverdue.toFixed(2)} 元，不可发起续签。请先结清欠费再申请续签。`
      : '无欠费记录，校验通过。'
  };
}

async function getActiveThreshold() {
  return await Threshold.findOne({
    where: { isActive: true },
    order: [['createdAt', 'DESC']]
  });
}

async function checkIncreaseRate(proposedRent, previousRent) {
  const p = parseFloat(proposedRent);
  const prev = parseFloat(previousRent);
  if (prev <= 0) return { exceeds: false, rate: 0, threshold: null, thresholdRate: 0 };

  const rate = (p - prev) / prev;
  const threshold = await getActiveThreshold();
  const thresholdRate = threshold ? parseFloat(threshold.maxIncreaseRate) : 0.10;

  return {
    exceeds: rate > thresholdRate,
    rate,
    threshold,
    thresholdRate,
    ratePercent: (rate * 100).toFixed(2),
    thresholdPercent: (thresholdRate * 100).toFixed(2),
    thresholdId: threshold ? threshold.id : null,
    needsLegalReview: rate > thresholdRate
  };
}

async function checkHandlerPermission(renewal, userRole, userId) {
  const { status, currentHandlerRole, currentHandlerId, tenantId, housekeeperId, financeId, legalId, signAdminId } = renewal;

  const roleMap = {
    [ROLES.TENANT]: { field: 'tenantId', value: tenantId },
    [ROLES.HOUSEKEEPER]: { field: 'housekeeperId', value: housekeeperId },
    [ROLES.FINANCE]: { field: 'financeId', value: financeId },
    [ROLES.LEGAL]: { field: 'legalId', value: legalId },
    [ROLES.SIGN_ADMIN]: { field: 'signAdminId', value: signAdminId }
  };

  const handlerInfo = roleMap[userRole];
  if (!handlerInfo) return { allowed: false, reason: '未知角色' };

  if (currentHandlerRole && currentHandlerRole !== userRole) {
    return { allowed: false, reason: `当前处理角色为 ${currentHandlerRole}，您的角色 ${userRole} 无权操作` };
  }

  if (handlerInfo.value && handlerInfo.value !== userId) {
    return { allowed: false, reason: '当前单据分配给其他处理人，您无权操作' };
  }

  return { allowed: true };
}

async function hasEffectiveContract(renewalId) {
  const count = await ContractVersion.count({
    where: {
      renewalId,
      isEffective: true,
      status: [CONTRACT_STATUS.PENDING_SIGN, CONTRACT_STATUS.PARTIALLY_SIGNED, CONTRACT_STATUS.FULLY_SIGNED, CONTRACT_STATUS.ARCHIVED]
    }
  });
  return count > 0;
}

async function getMaxContractVersionNo(renewalId) {
  const max = await ContractVersion.max('versionNo', {
    where: { renewalId }
  });
  return max || 0;
}

async function checkRequiredAttachments(renewalId) {
  const required = await Attachment.findAll({
    where: {
      renewalId,
      [Op.or]: [
        { isRequired: true },
        { category: ATTACHMENT_CATEGORY.REQUIRED_FOR_SIGN }
      ]
    }
  });

  const missing = REQUIRED_ATTACHMENT_TYPES.filter(type =>
    !required.some(att => att.type === type)
  );

  return {
    complete: missing.length === 0,
    missing,
    attachedCount: required.length,
    requiredTypes: REQUIRED_ATTACHMENT_TYPES
  };
}

async function obsoleteExistingContracts(renewalId, obsoletedBy, reason, transaction) {
  const existing = await ContractVersion.findAll({
    where: {
      renewalId,
      isEffective: true,
      status: [CONTRACT_STATUS.DRAFT, CONTRACT_STATUS.PENDING_SIGN, CONTRACT_STATUS.PARTIALLY_SIGNED]
    },
    transaction
  });

  for (const contract of existing) {
    contract.isEffective = false;
    contract.status = CONTRACT_STATUS.OBSOLETE;
    contract.obsoletedAt = new Date();
    contract.obsoletedBy = obsoletedBy;
    contract.obsoletedReason = reason || '租金方案变更，旧合同版本已废弃';
    contract.version = (contract.version || 0) + 1;
    await contract.save({ transaction });
  }

  return existing.length;
}

async function initializeSignStates(contractVersionId, renewalId, tenantId, legalId, signAdminId, transaction) {
  const states = [
    {
      contractVersionId,
      renewalId,
      party: SIGN_PARTY.TENANT,
      signerRole: ROLES.TENANT,
      signerId: tenantId,
      signOrder: 1,
      status: SIGN_STATE_STATUS.PENDING
    },
    {
      contractVersionId,
      renewalId,
      party: SIGN_PARTY.COMPANY_LEGAL,
      signerRole: ROLES.LEGAL,
      signerId: legalId,
      signOrder: 2,
      status: SIGN_STATE_STATUS.PENDING
    },
    {
      contractVersionId,
      renewalId,
      party: SIGN_PARTY.SIGN_ADMIN,
      signerRole: ROLES.SIGN_ADMIN,
      signerId: signAdminId,
      signOrder: 3,
      status: SIGN_STATE_STATUS.PENDING
    }
  ];

  return await SignState.bulkCreate(states, { transaction });
}

async function getNextSignerRole(contractVersionId, transaction) {
  const states = await SignState.findAll({
    where: { contractVersionId },
    order: [['signOrder', 'ASC']],
    transaction
  });

  for (const s of states) {
    if (s.status === SIGN_STATE_STATUS.PENDING) {
      return {
        role: s.signerRole,
        party: s.party,
        signOrder: s.signOrder
      };
    }
  }
  return null;
}

async function checkOptimisticLock(model, entity, expectedVersion, entityName) {
  if (!entity) {
    throw new Error(`${entityName}不存在`);
  }
  const dbEntity = await model.findByPk(entity.id);
  if (!dbEntity) {
    throw new Error(`${entityName}不存在`);
  }
  const dbVersion = dbEntity.version || 0;
  const exp = expectedVersion || 0;
  if (dbVersion > exp) {
    throw new Error(`${entityName}已被其他操作修改，请刷新后重试（当前版本:${dbVersion}，您的版本:${exp}）`);
  }
  return dbVersion;
}

const STATUS_TRANSITIONS = {
  [RENEWAL_STATUS.DRAFT]: [
    RENEWAL_STATUS.PENDING_OVERDUE_CHECK,
    RENEWAL_STATUS.CANCELLED
  ],
  [RENEWAL_STATUS.PENDING_OVERDUE_CHECK]: [
    RENEWAL_STATUS.OVERDUE_REJECTED,
    RENEWAL_STATUS.OVERDUE_PASSED
  ],
  [RENEWAL_STATUS.OVERDUE_REJECTED]: [
    RENEWAL_STATUS.CANCELLED
  ],
  [RENEWAL_STATUS.OVERDUE_PASSED]: [
    RENEWAL_STATUS.RENT_PLAN_CREATED
  ],
  [RENEWAL_STATUS.RENT_PLAN_CREATED]: [
    RENEWAL_STATUS.NEGOTIATING,
    RENEWAL_STATUS.LEGAL_REVIEW_PENDING,
    RENEWAL_STATUS.LEGAL_REVIEW_PASSED
  ],
  [RENEWAL_STATUS.NEGOTIATING]: [
    RENEWAL_STATUS.RENT_PLAN_CREATED,
    RENEWAL_STATUS.LEGAL_REVIEW_PENDING,
    RENEWAL_STATUS.LEGAL_REVIEW_PASSED
  ],
  [RENEWAL_STATUS.LEGAL_REVIEW_PENDING]: [
    RENEWAL_STATUS.LEGAL_REVIEW_PASSED,
    RENEWAL_STATUS.LEGAL_REVIEW_REJECTED,
    RENEWAL_STATUS.NEGOTIATING
  ],
  [RENEWAL_STATUS.LEGAL_REVIEW_REJECTED]: [
    RENEWAL_STATUS.NEGOTIATING,
    RENEWAL_STATUS.CANCELLED
  ],
  [RENEWAL_STATUS.LEGAL_REVIEW_PASSED]: [
    RENEWAL_STATUS.CONTRACT_GENERATED,
    RENEWAL_STATUS.NEGOTIATING
  ],
  [RENEWAL_STATUS.CONTRACT_GENERATED]: [
    RENEWAL_STATUS.SIGNING_PENDING
  ],
  [RENEWAL_STATUS.SIGNING_PENDING]: [
    RENEWAL_STATUS.SIGNED,
    RENEWAL_STATUS.NEGOTIATING
  ],
  [RENEWAL_STATUS.SIGNED]: [
    RENEWAL_STATUS.ARCHIVED
  ],
  [RENEWAL_STATUS.ARCHIVED]: [],
  [RENEWAL_STATUS.CANCELLED]: []
};

function isValidStatusTransition(from, to) {
  const allowed = STATUS_TRANSITIONS[from] || [];
  return allowed.includes(to);
}

const HANDLER_BY_STATUS = {
  [RENEWAL_STATUS.DRAFT]: ROLES.TENANT,
  [RENEWAL_STATUS.PENDING_OVERDUE_CHECK]: ROLES.FINANCE,
  [RENEWAL_STATUS.OVERDUE_PASSED]: ROLES.HOUSEKEEPER,
  [RENEWAL_STATUS.RENT_PLAN_CREATED]: ROLES.HOUSEKEEPER,
  [RENEWAL_STATUS.NEGOTIATING]: ROLES.HOUSEKEEPER,
  [RENEWAL_STATUS.LEGAL_REVIEW_PENDING]: ROLES.LEGAL,
  [RENEWAL_STATUS.LEGAL_REVIEW_PASSED]: ROLES.HOUSEKEEPER,
  [RENEWAL_STATUS.CONTRACT_GENERATED]: ROLES.HOUSEKEEPER,
  [RENEWAL_STATUS.SIGNING_PENDING]: ROLES.SIGN_ADMIN,
  [RENEWAL_STATUS.SIGNED]: ROLES.FINANCE,
  [RENEWAL_STATUS.ARCHIVED]: null
};

module.exports = {
  checkOverdue,
  getActiveThreshold,
  checkIncreaseRate,
  checkHandlerPermission,
  hasEffectiveContract,
  getMaxContractVersionNo,
  checkRequiredAttachments,
  obsoleteExistingContracts,
  initializeSignStates,
  getNextSignerRole,
  checkOptimisticLock,
  isValidStatusTransition,
  HANDLER_BY_STATUS,
  REQUIRED_ATTACHMENT_TYPES
};
