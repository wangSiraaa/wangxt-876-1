const express = require('express');
const {
  Threshold,
  ROLES
} = require('../models');
const { authMiddleware, requireRole, writeAudit } = require('../middleware/auth');
const { AUDIT_ACTION } = require('../models');

const router = express.Router();
router.use(authMiddleware);

router.get('/', async (req, res) => {
  try {
    const thresholds = await Threshold.findAll({
      order: [['createdAt', 'DESC']]
    });
    res.json(thresholds);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/active', async (req, res) => {
  try {
    const { getActiveThreshold } = require('../services/businessRules');
    const t = await getActiveThreshold();
    res.json(t || { message: '暂无激活的涨幅阈值' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/', requireRole(ROLES.FINANCE, ROLES.LEGAL), async (req, res) => {
  try {
    const { name, minIncreaseRate = 0, maxIncreaseRate, legalReviewRequired = true, effectiveDate } = req.body;
    if (!name || maxIncreaseRate === undefined || maxIncreaseRate === null) {
      return res.status(400).json({ error: '请填写阈值名称和最大涨幅' });
    }

    await Threshold.update(
      { isActive: false, version: Threshold.sequelize.literal('version + 1') },
      { where: { isActive: true } }
    );

    const t = await Threshold.create({
      name,
      minIncreaseRate,
      maxIncreaseRate,
      legalReviewRequired,
      effectiveDate: effectiveDate || new Date(),
      isActive: true,
      createdBy: req.user.id,
      version: 1
    });

    writeAudit(req, AUDIT_ACTION.CREATE, 'Threshold', t.id, t.name,
      `创建租金涨幅阈值：${(maxIncreaseRate * 100).toFixed(2)}%`, null, t.toJSON());

    res.json(t);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.put('/:id', requireRole(ROLES.FINANCE, ROLES.LEGAL), async (req, res) => {
  try {
    const t = await Threshold.findByPk(req.params.id);
    if (!t) return res.status(404).json({ error: '阈值不存在' });

    const old = t.toJSON();
    Object.assign(t, req.body);
    t.version = (t.version || 0) + 1;
    await t.save();

    writeAudit(req, AUDIT_ACTION.UPDATE, 'Threshold', t.id, t.name,
      '更新租金涨幅阈值配置', old, t.toJSON());

    res.json(t);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/:id/activate', requireRole(ROLES.FINANCE, ROLES.LEGAL), async (req, res) => {
  try {
    await Threshold.update(
      { isActive: false, version: Threshold.sequelize.literal('version + 1') },
      { where: { isActive: true } }
    );

    const t = await Threshold.findByPk(req.params.id);
    if (!t) return res.status(404).json({ error: '阈值不存在' });

    t.isActive = true;
    t.version = (t.version || 0) + 1;
    await t.save();

    writeAudit(req, AUDIT_ACTION.UPDATE, 'Threshold', t.id, t.name,
      '激活阈值', null, { isActive: true });

    res.json(t);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
