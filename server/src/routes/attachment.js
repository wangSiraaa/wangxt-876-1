const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const {
  Attachment, ATTACHMENT_TYPE, ATTACHMENT_CATEGORY,
  RenewalApplication, RENEWAL_STATUS, ROLES
} = require('../models');
const { authMiddleware, writeAudit } = require('../middleware/auth');
const { AUDIT_ACTION } = require('../models');
const { REQUIRED_ATTACHMENT_TYPES } = require('../services/businessRules');

const router = express.Router();
router.use(authMiddleware);

const uploadDir = path.join(__dirname, '../../uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${uuidv4()}${ext}`);
  }
});
const upload = multer({ storage, limits: { fileSize: 20 * 1024 * 1024 } });

router.get('/renewal/:renewalId', async (req, res) => {
  try {
    const app = await RenewalApplication.findByPk(req.params.renewalId);
    if (!app) return res.status(404).json({ error: '续签申请不存在' });

    if (req.user.role === ROLES.TENANT && app.tenantId !== req.user.id) {
      return res.status(403).json({ error: '无权查看' });
    }

    const atts = await Attachment.findAll({
      where: { renewalId: req.params.renewalId },
      order: [['uploadedAt', 'DESC']]
    });
    res.json(atts);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/renewal/:renewalId', upload.single('file'), async (req, res) => {
  try {
    const app = await RenewalApplication.findByPk(req.params.renewalId);
    if (!app) return res.status(404).json({ error: '续签申请不存在' });

    if ([RENEWAL_STATUS.SIGNED, RENEWAL_STATUS.ARCHIVED, RENEWAL_STATUS.CANCELLED].includes(app.status)) {
      return res.status(400).json({ error: '当前状态不可上传附件' });
    }

    if (!req.file) return res.status(400).json({ error: '请选择文件' });

    const { type = ATTACHMENT_TYPE.OTHER, category = ATTACHMENT_CATEGORY.REFERENCE, isRequired } = req.body;
    const isReq = isRequired === 'true' || REQUIRED_ATTACHMENT_TYPES.includes(type);

    const att = await Attachment.create({
      renewalId: app.id,
      fileName: req.file.originalname,
      filePath: req.file.filename,
      fileSize: req.file.size,
      mimeType: req.file.mimetype,
      type,
      category: isReq ? ATTACHMENT_CATEGORY.REQUIRED_FOR_SIGN : category,
      uploadedBy: req.user.id,
      uploadedByName: req.user.realName,
      isRequired: isReq
    });

    writeAudit(req, AUDIT_ACTION.UPLOAD, 'Attachment', att.id, app.appNo,
      `上传附件：${att.fileName} (${type})`, null, att.toJSON());

    res.json(att);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const att = await Attachment.findByPk(req.params.id);
    if (!att) return res.status(404).json({ error: '附件不存在' });

    if (req.user.role === ROLES.TENANT && att.uploadedBy !== req.user.id) {
      return res.status(403).json({ error: '无权删除他人上传的附件' });
    }

    try {
      const fullPath = path.join(uploadDir, att.filePath);
      if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
    } catch (_) { /* ignore */ }

    await att.destroy();
    writeAudit(req, AUDIT_ACTION.DELETE, 'Attachment', att.id, att.id,
      `删除附件：${att.fileName}`, null, null);

    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/types', (req, res) => {
  res.json({
    types: Object.values(ATTACHMENT_TYPE).map(t => ({ key: t, label: t })),
    requiredTypes: REQUIRED_ATTACHMENT_TYPES
  });
});

module.exports = router;
