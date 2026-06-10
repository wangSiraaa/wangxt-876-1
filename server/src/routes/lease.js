const express = require('express');
const { Op } = require('sequelize');
const {
  Lease, LEASE_STATUS,
  OverdueBill, BILL_STATUS,
  ExpiryReminder, REMINDER_LEVEL, REMINDER_STATUS,
  ROLES
} = require('../models');
const { authMiddleware, requireAnyRole, writeAudit } = require('../middleware/auth');
const { AUDIT_ACTION } = require('../models');
const { daysFromNow } = require('../utils/generators');

const router = express.Router();
router.use(authMiddleware);

router.get('/', async (req, res) => {
  try {
    const { status, tenantId } = req.query;
    const where = {};

    if (req.user.role === ROLES.TENANT) {
      where.tenantId = req.user.id;
    }
    if (status) where.status = status;
    if (tenantId) where.tenantId = tenantId;

    const leases = await Lease.findAll({
      where,
      order: [['endDate', 'ASC']]
    });

    res.json(leases.map(l => {
      const remaining = daysFromNow(l.endDate);
      return {
        ...l.toJSON(),
        daysRemaining: remaining,
        isExpiringSoon: remaining <= 90 && remaining > 0,
        isExpired: remaining <= 0
      };
    }));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const lease = await Lease.findByPk(req.params.id, {
      include: [
        { association: 'overdueBills' },
        { association: 'reminders' }
      ]
    });
    if (!lease) return res.status(404).json({ error: '租约不存在' });

    if (req.user.role === ROLES.TENANT && lease.tenantId !== req.user.id) {
      return res.status(403).json({ error: '无权查看该租约' });
    }

    const remaining = daysFromNow(lease.endDate);
    res.json({
      ...lease.toJSON(),
      daysRemaining: remaining
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/expiring/soon', async (req, res) => {
  try {
    const now = new Date();
    const soon = new Date();
    soon.setDate(soon.getDate() + 90);

    const where = {
      status: [LEASE_STATUS.ACTIVE, LEASE_STATUS.EXPIRING],
      endDate: { [Op.between]: [now, soon] }
    };

    if (req.user.role === ROLES.TENANT) {
      where.tenantId = req.user.id;
    }

    const leases = await Lease.findAll({
      where,
      order: [['endDate', 'ASC']]
    });

    res.json(leases.map(l => ({
      ...l.toJSON(),
      daysRemaining: daysFromNow(l.endDate)
    })));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/:id/overdue-bills', async (req, res) => {
  try {
    const lease = await Lease.findByPk(req.params.id);
    if (!lease) return res.status(404).json({ error: '租约不存在' });

    if (req.user.role === ROLES.TENANT && lease.tenantId !== req.user.id) {
      return res.status(403).json({ error: '无权查看' });
    }

    const bills = await OverdueBill.findAll({
      where: { leaseId: req.params.id },
      order: [['dueDate', 'DESC']]
    });
    res.json(bills);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/reminders/list', async (req, res) => {
  try {
    const where = {};
    if (req.user.role === ROLES.TENANT) {
      where.tenantId = req.user.id;
    } else if (req.user.role === ROLES.HOUSEKEEPER) {
      where.recipientRole = [ROLES.HOUSEKEEPER, ROLES.TENANT];
    }
    if (req.query.status) where.status = req.query.status;

    const reminders = await ExpiryReminder.findAll({
      where,
      order: [['level', 'DESC'], ['reminderDate', 'DESC']],
      limit: 200
    });
    res.json(reminders);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/reminders/:id/acknowledge', async (req, res) => {
  try {
    const rem = await ExpiryReminder.findByPk(req.params.id);
    if (!rem) return res.status(404).json({ error: '提醒不存在' });

    if (req.user.role === ROLES.TENANT && rem.tenantId !== req.user.id) {
      return res.status(403).json({ error: '无权操作' });
    }

    rem.status = REMINDER_STATUS.ACKNOWLEDGED;
    rem.acknowledgedAt = new Date();
    rem.version = (rem.version || 0) + 1;
    await rem.save();

    writeAudit(req, AUDIT_ACTION.UPDATE, 'ExpiryReminder', rem.id, rem.id, '确认到期提醒', null, { status: rem.status });
    res.json(rem);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/dashboard/stats', async (req, res) => {
  try {
    const leaseWhere = {};
    if (req.user.role === ROLES.TENANT) leaseWhere.tenantId = req.user.id;

    const totalLeases = await Lease.count({ where: leaseWhere });

    const expiringSoonCount = await Lease.count({
      where: {
        ...leaseWhere,
        endDate: { [Op.lte]: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000) },
        status: [LEASE_STATUS.ACTIVE, LEASE_STATUS.EXPIRING]
      }
    });

    const expiredCount = await Lease.count({
      where: {
        ...leaseWhere,
        endDate: { [Op.lt]: new Date() },
        status: LEASE_STATUS.EXPIRED
      }
    });

    const overdueWhere = {};
    if (req.user.role === ROLES.TENANT) overdueWhere.tenantId = req.user.id;
    const overdueBillCount = await OverdueBill.count({
      where: {
        ...overdueWhere,
        status: [BILL_STATUS.OVERDUE, BILL_STATUS.PARTIAL]
      }
    });

    const reminderWhere = {};
    if (req.user.role === ROLES.TENANT) reminderWhere.tenantId = req.user.id;
    const pendingReminders = await ExpiryReminder.count({
      where: {
        ...reminderWhere,
        status: [REMINDER_STATUS.PENDING, REMINDER_STATUS.SENT]
      }
    });

    res.json({
      totalLeases,
      expiringSoonCount,
      expiredCount,
      overdueBillCount,
      pendingReminders
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
