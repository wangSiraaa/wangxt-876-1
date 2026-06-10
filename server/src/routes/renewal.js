const express = require('express');
const { Op } = require('sequelize');
const {
  RenewalApplication, RENEWAL_STATUS,
  Lease,
  OverdueBill, BILL_STATUS,
  RentPlan, RENT_PLAN_STATUS,
  Negotiation, NEGOTIATION_TYPE,
  Attachment, ATTACHMENT_TYPE, ATTACHMENT_CATEGORY,
  ContractVersion, CONTRACT_STATUS,
  SignState, SIGN_PARTY, SIGN_STATE_STATUS,
  LegalReviewRecord, REVIEW_TYPE, REVIEW_RESULT,
  ROLES
} = require('../models');
const { authMiddleware, writeAudit } = require('../middleware/auth');
const { AUDIT_ACTION } = require('../models');
const {
  checkOverdue, checkIncreaseRate, checkHandlerPermission,
  hasEffectiveContract, getMaxContractVersionNo,
  checkRequiredAttachments, obsoleteExistingContracts,
  initializeSignStates, getNextSignerRole,
  checkOptimisticLock,
  isValidStatusTransition, HANDLER_BY_STATUS,
  REQUIRED_ATTACHMENT_TYPES
} = require('../services/businessRules');
const {
  genAppNo, genPlanNo, genContractNo, addMonths, daysFromNow
} = require('../utils/generators');
const { sequelize } = require('../db');
const { Threshold } = require('../models');

const router = express.Router();
router.use(authMiddleware);

router.get('/', async (req, res) => {
  try {
    const { status, leaseId } = req.query;
    const where = {};

    if (req.user.role === ROLES.TENANT) {
      where.tenantId = req.user.id;
    } else if (req.user.role === ROLES.HOUSEKEEPER) {
      where.housekeeperId = req.user.id;
    } else if (req.user.role === ROLES.FINANCE) {
      where.financeId = req.user.id;
    } else if (req.user.role === ROLES.LEGAL) {
      where.legalId = req.user.id;
    } else if (req.user.role === ROLES.SIGN_ADMIN) {
      where.signAdminId = req.user.id;
    }

    if (status) where.status = status;
    if (leaseId) where.leaseId = leaseId;

    const renewals = await RenewalApplication.findAll({
      where,
      include: [
        { association: 'lease', attributes: ['leaseNo', 'currentRent', 'endDate', 'daysRemaining'] }
      ],
      order: [['applyDate', 'DESC']]
    });

    res.json(renewals);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const { leaseId, expectedLeaseTerm = 12 } = req.body;

    if (!leaseId) return res.status(400).json({ error: '请选择租约' });

    const lease = await Lease.findByPk(leaseId);
    if (!lease) return res.status(404).json({ error: '租约不存在' });

    if (req.user.role === ROLES.TENANT && lease.tenantId !== req.user.id) {
      return res.status(403).json({ error: '无权为该租约发起续签' });
    }

    const tenantId = lease.tenantId;
    const overdue = await checkOverdue(tenantId, leaseId);

    const t = await sequelize.transaction();
    try {
      if (overdue.hasOverdue) {
        const app = await RenewalApplication.create({
          appNo: genAppNo(),
          leaseId,
          tenantId,
          tenantName: lease.tenantName,
          propertyAddr: lease.propertyAddr,
          applicantId: req.user.id,
          applicantName: req.user.realName,
          expectedLeaseTerm,
          status: RENEWAL_STATUS.OVERDUE_REJECTED,
          currentHandlerRole: ROLES.FINANCE,
          housekeeperId: lease.housekeeperId,
          housekeeperName: lease.housekeeperName,
          overdueCheckResult: overdue.message,
          version: 1
        }, { transaction: t });

        await t.commit();
        writeAudit(req, AUDIT_ACTION.CREATE, 'RenewalApplication', app.id, app.appNo,
          `发起续签被拒：${overdue.message}`, null, { status: RENEWAL_STATUS.OVERDUE_REJECTED });

        return res.status(400).json({
          error: overdue.message,
          rejected: true,
          application: app
        });
      }

      const app = await RenewalApplication.create({
        appNo: genAppNo(),
        leaseId,
        tenantId,
        tenantName: lease.tenantName,
        propertyAddr: lease.propertyAddr,
        applicantId: req.user.id,
        applicantName: req.user.realName,
        expectedStartDate: lease.endDate,
        expectedLeaseTerm,
        status: RENEWAL_STATUS.OVERDUE_PASSED,
        currentHandlerRole: ROLES.HOUSEKEEPER,
        housekeeperId: lease.housekeeperId,
        housekeeperName: lease.housekeeperName,
        overdueCheckResult: overdue.message,
        version: 1
      }, { transaction: t });

      await t.commit();
      writeAudit(req, AUDIT_ACTION.CREATE, 'RenewalApplication', app.id, app.appNo,
        '发起续签申请，欠费校验通过', null, { status: RENEWAL_STATUS.OVERDUE_PASSED });

      res.json(app);
    } catch (txErr) {
      try { try { await t.rollback(); } catch (_) {} } catch (_) {}
      throw txErr;
    }
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const app = await RenewalApplication.findByPk(req.params.id, {
    include: [
      { association: 'lease' },
      { association: 'rentPlans', order: [['planVersion', 'DESC']] },
      { association: 'negotiations', order: [['timestamp', 'DESC']] },
      { association: 'attachments', order: [['uploadedAt', 'DESC']] },
      {
        association: 'contractVersions',
        order: [['versionNo', 'DESC']],
        include: [{ association: 'signStates', order: [['signOrder', 'ASC']] }]
      },
      { association: 'legalReviewRecords', order: [['reviewedAt', 'DESC']] }
    ]
  });
    if (!app) return res.status(404).json({ error: '续签申请不存在' });

    if (req.user.role === ROLES.TENANT && app.tenantId !== req.user.id) {
      return res.status(403).json({ error: '无权查看该续签申请' });
    }

    res.json(app);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/:id/submit-for-overdue-check', async (req, res) => {
  try {
    const app = await RenewalApplication.findByPk(req.params.id);
    if (!app) return res.status(404).json({ error: '续签申请不存在' });

    if (req.user.role === ROLES.TENANT && app.tenantId !== req.user.id) {
      return res.status(403).json({ error: '无权操作' });
    }

    const overdue = await checkOverdue(app.tenantId, app.leaseId);

    if (overdue.hasOverdue) {
      app.status = RENEWAL_STATUS.OVERDUE_REJECTED;
      app.overdueCheckResult = overdue.message;
      app.currentHandlerRole = ROLES.FINANCE;
      app.version = (app.version || 0) + 1;
      await app.save();

      writeAudit(req, AUDIT_ACTION.STATUS_CHANGE, 'RenewalApplication', app.id, app.appNo,
        `欠费校验失败：${overdue.message}`, null, { status: app.status });

      return res.status(400).json({
        error: overdue.message,
        rejected: true,
        application: app
      });
    }

    app.status = RENEWAL_STATUS.OVERDUE_PASSED;
    app.overdueCheckResult = overdue.message;
    app.currentHandlerRole = ROLES.HOUSEKEEPER;
    app.version = (app.version || 0) + 1;
    await app.save();

    writeAudit(req, AUDIT_ACTION.STATUS_CHANGE, 'RenewalApplication', app.id, app.appNo,
      '欠费校验通过', null, { status: app.status });

    res.json(app);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/:id/rent-plans', async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const app = await RenewalApplication.findByPk(req.params.id);
    if (!app) return res.status(404).json({ error: '续签申请不存在' });

    const allowedCreateRentPlanStatuses = [
      RENEWAL_STATUS.OVERDUE_PASSED,
      RENEWAL_STATUS.NEGOTIATING,
      RENEWAL_STATUS.LEGAL_REVIEW_REJECTED,
      RENEWAL_STATUS.LEGAL_REVIEW_PASSED
    ];

    if (!allowedCreateRentPlanStatuses.includes(app.status) &&
        !isValidStatusTransition(app.status, RENEWAL_STATUS.RENT_PLAN_CREATED)) {
      return res.status(400).json({ error: `当前状态（${app.status}）不允许创建租金方案` });
    }

    const lease = await Lease.findByPk(app.leaseId);
    if (!lease) return res.status(404).json({ error: '租约不存在' });

    const { proposedRent, leaseTermMonths = 12, notes } = req.body;
    if (!proposedRent) return res.status(400).json({ error: '请输入提议租金' });

    const rateCheck = await checkIncreaseRate(proposedRent, lease.currentRent);

    const planVersion = (await RentPlan.max('planVersion', { where: { renewalId: app.id } })) || 0;

    const obsoletedCount = await obsoleteExistingContracts(
      app.id, req.user.id,
      `租金方案更新（版本 ${planVersion + 1}），旧合同版本废弃`,
      t
    );

    const prevPlans = await RentPlan.findAll({
      where: { renewalId: app.id, status: { [Op.ne]: RENT_PLAN_STATUS.SUPERSEDED } }
    });
    for (const p of prevPlans) {
      p.status = RENT_PLAN_STATUS.SUPERSEDED;
      p.version = (p.version || 0) + 1;
      await p.save({ transaction: t });
    }

    const plan = await RentPlan.create({
      planNo: genPlanNo(),
      renewalId: app.id,
      leaseId: app.leaseId,
      previousRent: lease.currentRent,
      proposedRent,
      increaseAmount: rateCheck.rate * lease.currentRent,
      increaseRate: rateCheck.rate,
      leaseTermMonths,
      startDate: lease.endDate,
      endDate: addMonths(lease.endDate, leaseTermMonths),
      thresholdId: rateCheck.thresholdId,
      thresholdRate: rateCheck.thresholdRate,
      exceedsThreshold: rateCheck.exceeds,
      status: RENT_PLAN_STATUS.PROPOSED,
      creatorId: req.user.id,
      creatorName: req.user.realName,
      planVersion: planVersion + 1,
      notes,
      version: 1
    }, { transaction: t });

    if (rateCheck.exceeds) {
      app.status = RENEWAL_STATUS.LEGAL_REVIEW_PENDING;
      app.currentHandlerRole = ROLES.LEGAL;
      app.legalReviewResult = 'PENDING';
      app.legalReviewComment = null;
      app.legalReviewedAt = null;
      app.lastLegalReviewResult = null;
      app.reviewConclusion = null;
    } else {
      app.status = RENEWAL_STATUS.RENT_PLAN_CREATED;
      app.currentHandlerRole = ROLES.HOUSEKEEPER;
    }
    app.version = (app.version || 0) + 1;
    await app.save({ transaction: t });

    await t.commit();

    const actionMsg = rateCheck.exceeds
      ? `租金方案已创建（涨幅 ${rateCheck.ratePercent}% 超过阈值 ${rateCheck.thresholdPercent}%，进入法务复核）`
      : `租金方案已创建（涨幅 ${rateCheck.ratePercent}%，在阈值 ${rateCheck.thresholdPercent}% 范围内）`;

    writeAudit(req, AUDIT_ACTION.CREATE, 'RentPlan', plan.id, plan.planNo, actionMsg, null, plan.toJSON());

    res.json({
      application: app,
      rentPlan: plan,
      rateCheck: {
        rate: rateCheck.rate,
        ratePercent: rateCheck.ratePercent,
        thresholdRate: rateCheck.thresholdRate,
        thresholdPercent: rateCheck.thresholdPercent,
        exceeds: rateCheck.exceeds,
        needsLegalReview: rateCheck.needsLegalReview
      },
      obsoletedContractCount: obsoletedCount
    });
  } catch (e) {
    try { await t.rollback(); } catch (_) {}
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

router.post('/:id/negotiations', async (req, res) => {
  try {
    const app = await RenewalApplication.findByPk(req.params.id);
    if (!app) return res.status(404).json({ error: '续签申请不存在' });

    const { rentPlanId, type, offeredRent, comment } = req.body;
    if (!offeredRent) return res.status(400).json({ error: '请输入报价租金' });

    const allowedStatuses = [
      RENEWAL_STATUS.RENT_PLAN_CREATED, RENEWAL_STATUS.NEGOTIATING,
      RENEWAL_STATUS.LEGAL_REVIEW_REJECTED
    ];
    if (!allowedStatuses.includes(app.status)) {
      return res.status(400).json({ error: `当前状态（${app.status}）不允许进行协商` });
    }

    const lease = await Lease.findByPk(app.leaseId);
    const offerRate = (parseFloat(offeredRent) - parseFloat(lease.currentRent)) / parseFloat(lease.currentRent);

    const neg = await Negotiation.create({
      renewalId: app.id,
      rentPlanId,
      negotiatorId: req.user.id,
      negotiatorName: req.user.realName,
      negotiatorRole: req.user.role,
      type: type || (req.user.role === ROLES.TENANT ? NEGOTIATION_TYPE.TENANT_OFFER : NEGOTIATION_TYPE.HOUSEKEEPER_OFFER),
      offeredRent,
      offerRate,
      comment
    });

    app.status = RENEWAL_STATUS.NEGOTIATING;
    app.currentHandlerRole = ROLES.HOUSEKEEPER;
    app.version = (app.version || 0) + 1;
    await app.save();

    writeAudit(req, AUDIT_ACTION.CREATE, 'Negotiation', neg.id, app.appNo,
      `协商报价: ${offeredRent} 元 (${(offerRate*100).toFixed(2)}%)`, null, neg.toJSON());

    res.json({ negotiation: neg, application: app });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/:id/legal-review', async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const app = await RenewalApplication.findByPk(req.params.id, { transaction: t });
    if (!app) return res.status(404).json({ error: '续签申请不存在' });

    if (app.status !== RENEWAL_STATUS.LEGAL_REVIEW_PENDING) {
      return res.status(400).json({ error: '当前状态不处于法务复核待处理' });
    }

    if (req.user.role !== ROLES.LEGAL) {
      return res.status(403).json({ error: '仅法务角色可执行复核' });
    }

    if (app.currentHandlerRole && app.currentHandlerRole !== ROLES.LEGAL) {
      return res.status(403).json({ error: '越权操作：当前处理角色不是法务' });
    }

    const { passed, comment, conclusion, reviewConclusion } = req.body;
    const rentPlan = await RentPlan.findOne({
      where: { renewalId: app.id, status: { [Op.ne]: RENT_PLAN_STATUS.SUPERSEDED } },
      order: [['planVersion', 'DESC']],
      transaction: t
    });

    const reviewResult = passed ? REVIEW_RESULT.PASSED : REVIEW_RESULT.REJECTED;
    const finalReviewConclusion = reviewConclusion || conclusion || (passed
      ? `租金涨幅 ${((rentPlan?.increaseRate || 0) * 100).toFixed(2)}%，在可接受范围内，同意通过。`
      : `租金涨幅过高，建议重新协商。具体意见：${comment || '涨幅超出合理范围'}`);

    await LegalReviewRecord.create({
      renewalId: app.id,
      rentPlanId: rentPlan?.id,
      reviewType: app.legalReviewCount > 0 ? REVIEW_TYPE.REVISION : REVIEW_TYPE.INITIAL,
      reviewerId: req.user.id,
      reviewerName: req.user.realName,
      reviewResult,
      reviewComment: comment || '',
      previousRent: rentPlan?.previousRent,
      proposedRent: rentPlan?.proposedRent,
      increaseRate: rentPlan?.increaseRate,
      thresholdRate: rentPlan?.thresholdRate,
      exceedsThreshold: rentPlan?.exceedsThreshold,
      reviewConclusion: finalReviewConclusion,
      version: 1
    }, { transaction: t });

    app.legalId = req.user.id;
    app.legalName = req.user.realName;
    app.legalReviewComment = comment || (passed ? '法务复核通过' : '法务复核驳回');
    app.legalReviewResult = reviewResult;
    app.legalReviewedAt = new Date();
    app.legalReviewCount = (app.legalReviewCount || 0) + 1;
    app.lastLegalReviewResult = reviewResult;
    app.reviewConclusion = finalReviewConclusion;
    app.version = (app.version || 0) + 1;

    if (passed) {
      app.status = RENEWAL_STATUS.LEGAL_REVIEW_PASSED;
      app.currentHandlerRole = ROLES.HOUSEKEEPER;
      writeAudit(req, AUDIT_ACTION.APPROVE, 'RenewalApplication', app.id, app.appNo,
        `法务复核通过：${comment || ''}`, null, { status: app.status, reviewConclusion: finalReviewConclusion });
    } else {
      app.status = RENEWAL_STATUS.LEGAL_REVIEW_REJECTED;
      app.currentHandlerRole = ROLES.HOUSEKEEPER;
      writeAudit(req, AUDIT_ACTION.REJECT, 'RenewalApplication', app.id, app.appNo,
        `法务复核驳回：${comment || ''}`, null, { status: app.status, reviewConclusion: finalReviewConclusion });
    }

    await app.save({ transaction: t });
    await t.commit();

    const reviewRecords = await LegalReviewRecord.findAll({
      where: { renewalId: app.id },
      order: [['reviewedAt', 'DESC']]
    });

    res.json({
      ...app.toJSON(),
      legalReviewRecords: reviewRecords
    });
  } catch (e) {
    try { await t.rollback(); } catch (_) {}
    res.status(500).json({ error: e.message });
  }
});

router.post('/:id/generate-contract', async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const app = await RenewalApplication.findByPk(req.params.id, { transaction: t });
    if (!app) return res.status(404).json({ error: '续签申请不存在' });

    const prevVersion = req.body.expectedVersion || app.version;
    try {
      await checkOptimisticLock(RenewalApplication, app, prevVersion, '续签申请');
    } catch (lockErr) {
      try { await t.rollback(); } catch (_) {}
      return res.status(409).json({
        error: lockErr.message,
        code: 'OPTIMISTIC_LOCK'
      });
    }

    const allowed = [RENEWAL_STATUS.LEGAL_REVIEW_PASSED, RENEWAL_STATUS.NEGOTIATING, RENEWAL_STATUS.RENT_PLAN_CREATED];
    if (!allowed.includes(app.status)) {
      return res.status(400).json({ error: `当前状态（${app.status}）不允许生成合同` });
    }

    const effectiveExists = await hasEffectiveContract(app.id);
    if (effectiveExists) {
      const latestEffective = await ContractVersion.findOne({
        where: { renewalId: app.id, isEffective: true },
        order: [['versionNo', 'DESC']],
        transaction: t
      });
      writeAudit(req, AUDIT_ACTION.GENERATE, 'ContractVersion', null, app.appNo,
        `检测到已有有效合同 ${latestEffective ? latestEffective.contractNo : ''}，拒绝重复生成`, null, null);
      return res.status(409).json({
        error: '已有有效合同版本，禁止重复生成。如需更新，请先修改租金方案，旧合同将自动废弃。',
        existingContract: latestEffective
      });
    }

    const rentPlan = await RentPlan.findOne({
      where: { renewalId: app.id, status: { [Op.ne]: RENT_PLAN_STATUS.SUPERSEDED } },
      order: [['planVersion', 'DESC']],
      transaction: t
    });
    if (!rentPlan) return res.status(400).json({ error: '请先创建或确认租金方案' });

    const lease = await Lease.findByPk(app.leaseId, { transaction: t });

    const newVersionNo = (await getMaxContractVersionNo(app.id)) + 1;
    const contractNo = genContractNo();

    const contentTemplate = `房屋租赁合同（续签版）
合同编号: ${contractNo}
版本: V${newVersionNo}
甲方(出租方): XX物业管理有限公司
乙方(承租方): ${lease.tenantName}
物业地址: ${lease.propertyAddr}
面积: ${lease.area} 平方米
租金: ${rentPlan.proposedRent} 元/月 (较上期 ${rentPlan.previousRent} 元，涨幅 ${(rentPlan.increaseRate * 100).toFixed(2)}%)
租赁期: ${new Date(rentPlan.startDate).toLocaleDateString()} 至 ${new Date(rentPlan.endDate).toLocaleDateString()}
付款方式: ${rentPlan.paymentCycle === 'MONTHLY' ? '月付' : rentPlan.paymentCycle === 'QUARTERLY' ? '季付' : '年付'}
押金: ${rentPlan.depositMonths} 个月租金 (${(rentPlan.proposedRent * rentPlan.depositMonths).toFixed(2)} 元)
合同生效条件: 三方签字盖章后生效
签署方: 1) 租客 2) 公司法务 3) 签署管理员`;

    const contract = await ContractVersion.create({
      contractNo,
      renewalId: app.id,
      rentPlanId: rentPlan.id,
      leaseId: app.leaseId,
      versionNo: newVersionNo,
      isEffective: true,
      status: CONTRACT_STATUS.PENDING_SIGN,
      contentText: contentTemplate,
      rentAmount: rentPlan.proposedRent,
      increaseRate: rentPlan.increaseRate,
      startDate: rentPlan.startDate,
      endDate: rentPlan.endDate,
      generatedBy: req.user.id,
      generatedByName: req.user.realName,
      version: 1
    }, { transaction: t });

    const legalUser = app.legalId || null;
    await initializeSignStates(contract.id, app.id, app.tenantId, legalUser, app.signAdminId, t);

    rentPlan.status = RENT_PLAN_STATUS.AGREED;
    rentPlan.version = (rentPlan.version || 0) + 1;
    await rentPlan.save({ transaction: t });

    app.status = RENEWAL_STATUS.CONTRACT_GENERATED;
    app.currentHandlerRole = ROLES.HOUSEKEEPER;
    app.version = (app.version || 0) + 1;
    await app.save({ transaction: t });

    await t.commit();

    writeAudit(req, AUDIT_ACTION.GENERATE, 'ContractVersion', contract.id, contractNo,
      `合同生成成功 V${newVersionNo}，租金 ${rentPlan.proposedRent} 元/月`, null, contract.toJSON());

    res.json({
      application: app,
      contract,
      rentPlan
    });
  } catch (e) {
    try { await t.rollback(); } catch (_) {}
    if (e.message && e.message.includes('乐观锁')) {
      return res.status(409).json({ error: e.message });
    }
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

router.get('/:id/required-attachments-check', async (req, res) => {
  try {
    const app = await RenewalApplication.findByPk(req.params.id);
    if (!app) return res.status(404).json({ error: '续签申请不存在' });
    const check = await checkRequiredAttachments(req.params.id);
    res.json(check);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/:id/prepare-signing', async (req, res) => {
  try {
    const app = await RenewalApplication.findByPk(req.params.id);
    if (!app) return res.status(404).json({ error: '续签申请不存在' });

    if (app.status !== RENEWAL_STATUS.CONTRACT_GENERATED) {
      return res.status(400).json({ error: '合同尚未生成，无法进入签署阶段' });
    }

    const check = await checkRequiredAttachments(req.params.id);
    if (!check.complete) {
      return res.status(400).json({
        error: '缺少必要附件，无法进入签署',
        missing: check.missing,
        requiredTypes: REQUIRED_ATTACHMENT_TYPES
      });
    }

    app.status = RENEWAL_STATUS.SIGNING_PENDING;
    app.currentHandlerRole = ROLES.TENANT;
    app.version = (app.version || 0) + 1;
    await app.save();

    writeAudit(req, AUDIT_ACTION.STATUS_CHANGE, 'RenewalApplication', app.id, app.appNo,
      '进入签署阶段，附件校验通过', null, { status: app.status });

    res.json(app);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/:id/sign/:contractVersionId', async (req, res) => {
  try {
    const { party, signature, comment } = req.body;
    const app = await RenewalApplication.findByPk(req.params.id);
    if (!app) return res.status(404).json({ error: '续签申请不存在' });

    if (app.status !== RENEWAL_STATUS.SIGNING_PENDING) {
      return res.status(400).json({ error: '当前状态不允许签署' });
    }

    const contract = await ContractVersion.findByPk(req.params.contractVersionId);
    if (!contract) return res.status(404).json({ error: '合同版本不存在' });
    if (!contract.isEffective) return res.status(400).json({ error: '合同版本已失效' });

    let partyRole = null;
    if (party === SIGN_PARTY.TENANT) {
      partyRole = ROLES.TENANT;
      if (req.user.role !== ROLES.TENANT || app.tenantId !== req.user.id) {
        return res.status(403).json({ error: '仅对应租客可签署此栏位' });
      }
    } else if (party === SIGN_PARTY.COMPANY_LEGAL) {
      partyRole = ROLES.LEGAL;
      if (req.user.role !== ROLES.LEGAL) {
        return res.status(403).json({ error: '仅法务可签署此栏位' });
      }
    } else if (party === SIGN_PARTY.SIGN_ADMIN) {
      partyRole = ROLES.SIGN_ADMIN;
      if (req.user.role !== ROLES.SIGN_ADMIN) {
        return res.status(403).json({ error: '仅签署管理员可签署此栏位' });
      }
    } else {
      return res.status(400).json({ error: '无效的签署方' });
    }

    if (partyRole !== app.currentHandlerRole) {
      return res.status(403).json({
        error: `越权签署：当前处理角色为 ${app.currentHandlerRole}，按签署顺序应由 ${app.currentHandlerRole} 先签署`
      });
    }

    const signStateCheck = await SignState.findOne({
      where: {
        contractVersionId: contract.id,
        party,
        renewalId: app.id
      }
    });
    if (!signStateCheck) return res.status(404).json({ error: '签署状态记录不存在' });
    if (signStateCheck.status === SIGN_STATE_STATUS.SIGNED) {
      return res.status(400).json({ error: '该方已签署，请勿重复签署' });
    }

    const t = await sequelize.transaction();
    try {
      const appLocked = await RenewalApplication.findByPk(req.params.id, {
        lock: true,
        transaction: t
      });
      const contractLocked = await ContractVersion.findByPk(req.params.contractVersionId, {
        lock: true,
        transaction: t
      });
      const signState = await SignState.findOne({
        where: {
          contractVersionId: contractLocked.id,
          party,
          renewalId: appLocked.id
        },
        lock: true,
        transaction: t
      });

      signState.status = SIGN_STATE_STATUS.SIGNED;
      signState.signerId = req.user.id;
      signState.signerName = req.user.realName;
      signState.signedAt = new Date();
      signState.signature = signature || `SIGNATURE_${party}_${Date.now()}`;
      signState.comment = comment || null;
      signState.version = (signState.version || 0) + 1;
      await signState.save({ transaction: t });

      if (party === SIGN_PARTY.TENANT) {
        contractLocked.signedByTenantAt = new Date();
        contractLocked.signedByTenantId = req.user.id;
      }
      if (party === SIGN_PARTY.SIGN_ADMIN) {
        contractLocked.signedByCompanyAt = new Date();
        contractLocked.signedByCompanyId = req.user.id;
      }

      const allSignStates = await SignState.findAll({
        where: { contractVersionId: contractLocked.id },
        order: [['signOrder', 'ASC']],
        transaction: t
      });
      const allSigned = allSignStates.every(s => s.status === SIGN_STATE_STATUS.SIGNED);
      const anySigned = allSignStates.some(s => s.status === SIGN_STATE_STATUS.SIGNED);

      if (allSigned) {
        contractLocked.status = CONTRACT_STATUS.FULLY_SIGNED;
        appLocked.status = RENEWAL_STATUS.SIGNED;
        appLocked.currentHandlerRole = ROLES.FINANCE;
      } else if (anySigned) {
        contractLocked.status = CONTRACT_STATUS.PARTIALLY_SIGNED;
        const next = await getNextSignerRole(contractLocked.id, t);
        if (next) {
          appLocked.currentHandlerRole = next.role;
        }
      }
      contractLocked.version = (contractLocked.version || 0) + 1;
      await contractLocked.save({ transaction: t });

      appLocked.version = (appLocked.version || 0) + 1;
      await appLocked.save({ transaction: t });

      await t.commit();

      writeAudit(req, AUDIT_ACTION.SIGN, 'ContractVersion', contractLocked.id, contractLocked.contractNo,
        `${party} 签署完成 (${req.user.realName})`, null, { party, status: signState.status });

      res.json({
        application: appLocked,
        contract: contractLocked,
        signState,
        allSigned
      });
    } catch (innerE) {
      try { await t.rollback(); } catch (_) {}
      throw innerE;
    }
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

router.post('/:id/archive', async (req, res) => {
  try {
    const app = await RenewalApplication.findByPk(req.params.id);
    if (!app) return res.status(404).json({ error: '续签申请不存在' });

    if (app.status !== RENEWAL_STATUS.SIGNED) {
      return res.status(400).json({ error: '合同尚未完成签署，不可归档' });
    }

    const contracts = await ContractVersion.findAll({
      where: { renewalId: app.id, isEffective: true }
    });
    for (const c of contracts) {
      if (c.status === CONTRACT_STATUS.FULLY_SIGNED) {
        c.status = CONTRACT_STATUS.ARCHIVED;
        c.version = (c.version || 0) + 1;
        await c.save();
      }
    }

    app.status = RENEWAL_STATUS.ARCHIVED;
    app.archiveDate = new Date();
    app.currentHandlerRole = null;
    app.version = (app.version || 0) + 1;
    await app.save();

    writeAudit(req, AUDIT_ACTION.ARCHIVE, 'RenewalApplication', app.id, app.appNo,
      '续签流程完成，合同已归档', null, { status: app.status });

    res.json(app);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/:id/cancel', async (req, res) => {
  try {
    const app = await RenewalApplication.findByPk(req.params.id);
    if (!app) return res.status(404).json({ error: '续签申请不存在' });

    if ([RENEWAL_STATUS.ARCHIVED, RENEWAL_STATUS.CANCELLED, RENEWAL_STATUS.SIGNED].includes(app.status)) {
      return res.status(400).json({ error: '当前状态不可取消' });
    }

    app.status = RENEWAL_STATUS.CANCELLED;
    app.currentHandlerRole = null;
    app.version = (app.version || 0) + 1;
    await app.save();

    writeAudit(req, AUDIT_ACTION.UPDATE, 'RenewalApplication', app.id, app.appNo,
      '续签申请被取消', null, { status: app.status });

    res.json(app);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/:id/audit-logs', async (req, res) => {
  try {
    const { AuditLog } = require('../models');
    const app = await RenewalApplication.findByPk(req.params.id);
    if (!app) return res.status(404).json({ error: '续签申请不存在' });

    const logs = await AuditLog.findAll({
      where: {
        [Op.or]: [
          { entityId: app.id },
          { entityType: 'RentPlan' },
          { entityType: 'ContractVersion' },
          { entityType: 'Negotiation' }
        ]
      },
      order: [['timestamp', 'DESC']],
      limit: 100
    });

    res.json(logs);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/:id/legal-review-records', async (req, res) => {
  try {
    const app = await RenewalApplication.findByPk(req.params.id);
    if (!app) return res.status(404).json({ error: '续签申请不存在' });

    const records = await LegalReviewRecord.findAll({
      where: { renewalId: req.params.id },
      order: [['reviewedAt', 'DESC']]
    });

    res.json(records);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/legal/pending', async (req, res) => {
  try {
    if (req.user.role !== ROLES.LEGAL) {
      return res.status(403).json({ error: '仅法务角色可查询' });
    }

    const pendingReviews = await RenewalApplication.findAll({
      where: {
        status: RENEWAL_STATUS.LEGAL_REVIEW_PENDING,
        currentHandlerRole: ROLES.LEGAL
      },
      include: [
        { association: 'lease', attributes: ['leaseNo', 'currentRent', 'propertyAddr', 'tenantName'] },
        { association: 'rentPlans', limit: 1, order: [['planVersion', 'DESC']] }
      ],
      order: [['applyDate', 'DESC']]
    });

    const myReviewed = await RenewalApplication.findAll({
      where: {
        legalId: req.user.id,
        status: {
          [Op.in]: [RENEWAL_STATUS.LEGAL_REVIEW_PASSED, RENEWAL_STATUS.LEGAL_REVIEW_REJECTED]
        }
      },
      include: [
        { association: 'lease', attributes: ['leaseNo', 'currentRent', 'propertyAddr', 'tenantName'] }
      ],
      order: [['legalReviewedAt', 'DESC']],
      limit: 20
    });

    res.json({
      pending: pendingReviews,
      reviewed: myReviewed,
      stats: {
        pendingCount: pendingReviews.length,
        reviewedCount: myReviewed.length
      }
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
