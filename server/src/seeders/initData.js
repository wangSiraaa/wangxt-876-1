const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');
const { sequelize } = require('../db');
const models = require('../models');
const {
  User, ROLES,
  Lease, LEASE_STATUS,
  OverdueBill, BILL_STATUS,
  Threshold,
  RenewalApplication, RENEWAL_STATUS,
  RentPlan, RENT_PLAN_STATUS,
  ExpiryReminder, REMINDER_LEVEL, REMINDER_STATUS,
  Attachment, ATTACHMENT_TYPE, ATTACHMENT_CATEGORY
} = models;

const { genLeaseNo, genBillNo, addMonths, daysFromNow } = require('../utils/generators');

function formatDate(d) {
  return d.toISOString().split('T')[0];
}

function addDays(base, days) {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d;
}

async function seed() {
  console.log('🚀 开始初始化种子数据...');

  models.setupAssociations();
  await sequelize.sync({ force: true });
  console.log('✅ 数据库模型重建完成');

  const now = new Date();
  const users = [
    {
      username: 'tenant1', password: '123456', realName: '张三', role: ROLES.TENANT,
      phone: '13800000001', email: 'zhangsan@example.com'
    },
    {
      username: 'tenant2', password: '123456', realName: '李四', role: ROLES.TENANT,
      phone: '13800000002', email: 'lisi@example.com'
    },
    {
      username: 'tenant_overdue', password: '123456', realName: '王五(欠费)', role: ROLES.TENANT,
      phone: '13800000003', email: 'wangwu@example.com'
    },
    {
      username: 'tenant3', password: '123456', realName: '赵六', role: ROLES.TENANT,
      phone: '13800000004', email: 'zhaoliu@example.com'
    },
    {
      username: 'housekeeper', password: '123456', realName: '管家小林', role: ROLES.HOUSEKEEPER,
      phone: '13900000001', email: 'xiaolin@example.com'
    },
    {
      username: 'finance', password: '123456', realName: '财务陈姐', role: ROLES.FINANCE,
      phone: '13900000002', email: 'chenjie@example.com'
    },
    {
      username: 'legal', password: '123456', realName: '法务刘律', role: ROLES.LEGAL,
      phone: '13900000003', email: 'liulv@example.com'
    },
    {
      username: 'signadmin', password: '123456', realName: '签管周总', role: ROLES.SIGN_ADMIN,
      phone: '13900000004', email: 'zhouzong@example.com'
    }
  ];

  const createdUsers = [];
  for (const u of users) {
    const hash = await bcrypt.hash(u.password, 10);
    const user = await User.create({
      username: u.username,
      passwordHash: hash,
      realName: u.realName,
      role: u.role,
      phone: u.phone,
      email: u.email
    });
    createdUsers.push(user);
    console.log(`👤 创建用户: ${u.username} (${u.role}) - ${u.realName}`);
  }

  const userMap = {};
  createdUsers.forEach(u => { userMap[u.username] = u; });

  const threshold = await Threshold.create({
    name: '2024年标准租金涨幅阈值',
    minIncreaseRate: 0,
    maxIncreaseRate: 0.10,
    legalReviewRequired: true,
    effectiveDate: now,
    isActive: true,
    createdBy: userMap.legal.id,
    version: 1
  });
  console.log(`📊 创建租金涨幅阈值: 最大 ${(threshold.maxIncreaseRate * 100).toFixed(2)}%`);

  const leaseData = [
    {
      tenant: userMap.tenant1,
      propertyAddr: '北京市朝阳区望京SOHO T1-1201',
      area: 98.5,
      originalRent: 8000, currentRent: 8000,
      startDate: addDays(now, -730),
      endDate: addDays(now, 30),
      status: LEASE_STATUS.EXPIRING,
      description: '30天内到期（加急案例）'
    },
    {
      tenant: userMap.tenant2,
      propertyAddr: '北京市海淀区中关村软件园二期 5号楼302',
      area: 75.0,
      originalRent: 6000, currentRent: 6200,
      startDate: addDays(now, -365),
      endDate: addDays(now, 60),
      status: LEASE_STATUS.EXPIRING,
      description: '60天到期（常规到期提醒）'
    },
    {
      tenant: userMap.tenant_overdue,
      propertyAddr: '北京市西城区金融街 丰侨公寓 A-2305',
      area: 120.0,
      originalRent: 12000, currentRent: 12500,
      startDate: addDays(now, -500),
      endDate: addDays(now, 45),
      status: LEASE_STATUS.EXPIRING,
      description: '欠费用户案例（smoke场景1）'
    },
    {
      tenant: userMap.tenant3,
      propertyAddr: '北京市东城区东方新天地 写字楼 B-1508',
      area: 150.0,
      originalRent: 15000, currentRent: 15000,
      startDate: addDays(now, -600),
      endDate: addDays(now, 89),
      status: LEASE_STATUS.ACTIVE,
      description: '90天内到期（阈值边界案例，smoke场景2用）'
    },
    {
      tenant: userMap.tenant1,
      propertyAddr: '上海市浦东新区陆家嘴 环球金融中心 28-03',
      area: 200.0,
      originalRent: 25000, currentRent: 25000,
      startDate: addDays(now, -180),
      endDate: addDays(now, 180),
      status: LEASE_STATUS.ACTIVE,
      description: '长期租约（参考案例）'
    }
  ];

  const createdLeases = [];
  for (const ld of leaseData) {
    const lease = await Lease.create({
      leaseNo: genLeaseNo(),
      tenantId: ld.tenant.id,
      tenantName: ld.tenant.realName,
      propertyAddr: ld.propertyAddr,
      area: ld.area,
      originalRent: ld.originalRent,
      currentRent: ld.currentRent,
      startDate: ld.startDate,
      endDate: ld.endDate,
      paymentCycle: 'MONTHLY',
      housekeeperId: userMap.housekeeper.id,
      housekeeperName: userMap.housekeeper.realName,
      status: ld.status,
      version: 1
    });
    createdLeases.push(lease);
    console.log(`🏠 创建租约 ${lease.leaseNo}: ${ld.propertyAddr.slice(0, 20)}... - ${ld.description}`);
  }

  const overdueLease = createdLeases[2];
  const overdueBills = [
    {
      period: '2026-04', totalAmount: 12500, paidAmount: 0, overdueAmount: 12500,
      dueDate: addDays(now, -70), status: BILL_STATUS.OVERDUE
    },
    {
      period: '2026-05', totalAmount: 12500, paidAmount: 5000, overdueAmount: 7500,
      dueDate: addDays(now, -40), status: BILL_STATUS.PARTIAL
    }
  ];
  for (const ob of overdueBills) {
    await OverdueBill.create({
      billNo: genBillNo(),
      leaseId: overdueLease.id,
      tenantId: userMap.tenant_overdue.id,
      period: ob.period,
      totalAmount: ob.totalAmount,
      paidAmount: ob.paidAmount,
      overdueAmount: ob.overdueAmount,
      dueDate: ob.dueDate,
      status: ob.status,
      version: 1
    });
    console.log(`💸 欠费账单: ${ob.period} 欠 ${ob.overdueAmount}元`);
  }

  const reminders = [];
  for (let i = 0; i < createdLeases.length; i++) {
    const lease = createdLeases[i];
    const daysRemain = daysFromNow(lease.endDate);
    let level = REMINDER_LEVEL.INFO;
    if (daysRemain <= 30) level = REMINDER_LEVEL.URGENT;
    else if (daysRemain <= 60) level = REMINDER_LEVEL.WARNING;

    const levels = [
      { offset: 90, level: REMINDER_LEVEL.INFO, message: `租约将在90天内到期，请提前安排续签评估。物业: ${lease.propertyAddr.slice(0, 15)}...` },
      { offset: 60, level: REMINDER_LEVEL.WARNING, message: `租约60天内到期！管家请联系租客 ${lease.tenantName} 讨论续签意向。物业: ${lease.propertyAddr.slice(0, 15)}...` },
      { offset: 30, level: REMINDER_LEVEL.URGENT, message: `⚠️ 紧急！租约30天内到期，请立即启动续签流程。租客: ${lease.tenantName}，物业: ${lease.propertyAddr.slice(0, 15)}...` },
      { offset: 15, level: REMINDER_LEVEL.URGENT, message: `🔥 极紧急！租约15天内到期！如不续签将自动退租清场。` },
      { offset: 7, level: REMINDER_LEVEL.URGENT, message: `🚨 最后一周！租约7天内到期，租客未发起续签，请管家主动介入。` }
    ];

    for (const l of levels) {
      if (daysRemain <= l.offset && daysRemain > 0) {
        const reminder = await ExpiryReminder.create({
          leaseId: lease.id,
          leaseNo: lease.leaseNo,
          tenantId: lease.tenantId,
          tenantName: lease.tenantName,
          propertyAddr: lease.propertyAddr,
          expiryDate: lease.endDate,
          daysRemaining: daysRemain,
          level: l.level,
          status: REMINDER_STATUS.PENDING,
          recipientRole: l.level === REMINDER_LEVEL.URGENT ? ROLES.HOUSEKEEPER : ROLES.HOUSEKEEPER,
          recipientId: userMap.housekeeper.id,
          recipientName: userMap.housekeeper.realName,
          reminderDate: addDays(now, daysRemain - l.offset < 0 ? daysRemain - l.offset : -(l.offset - daysRemain)),
          message: l.message,
          version: 1
        });
        reminders.push(reminder);

        await ExpiryReminder.create({
          leaseId: lease.id,
          leaseNo: lease.leaseNo,
          tenantId: lease.tenantId,
          tenantName: lease.tenantName,
          propertyAddr: lease.propertyAddr,
          expiryDate: lease.endDate,
          daysRemaining: daysRemain,
          level: l.level,
          status: l.offset === 7 ? REMINDER_STATUS.PENDING : REMINDER_STATUS.PENDING,
          recipientRole: ROLES.TENANT,
          recipientId: lease.tenantId,
          recipientName: lease.tenantName,
          reminderDate: new Date(),
          message: `【租客端提醒】尊敬的${lease.tenantName}，您的租约将于${daysRemain}天后（${formatDate(lease.endDate)}）到期，如需续签请尽快在线申请。物业: ${lease.propertyAddr.slice(0, 15)}...`,
          version: 1
        });
      }
    }
  }
  console.log(`🔔 创建到期提醒: ${reminders.length * 2} 条（含租客端+管家端）`);

  const sampleAttachRenewalId = null;
  const sampleAttachments = [
    { type: ATTACHMENT_TYPE.ID_CARD, name: '身份证正面模板.pdf', category: ATTACHMENT_CATEGORY.REQUIRED_FOR_SIGN, required: true },
    { type: ATTACHMENT_TYPE.RENT_CERT, name: '租房完税证明模板.pdf', category: ATTACHMENT_CATEGORY.REQUIRED_FOR_SIGN, required: true }
  ];
  for (const sa of sampleAttachments) {
    const uploadsDir = path.join(__dirname, '../../uploads');
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }
    const fakeFile = `sample_${sa.type}_${Date.now()}.pdf`;
    const fakePath = path.join(uploadsDir, fakeFile);
    if (!fs.existsSync(fakePath)) {
      fs.writeFileSync(fakePath, `Sample attachment: ${sa.name}\nCreated by seed data.`);
    }
  }
  console.log('📎 示例附件模板已创建');

  console.log('\n========== 📝 测试账号汇总 ==========');
  console.log('角色\t\t用户名\t密码\t姓名');
  console.log('────────────────────────────────────────');
  for (const u of users) {
    const pad = u.role.length < 6 ? '\t\t' : '\t';
    console.log(`${u.role}${pad}${u.username}\t${u.password}\t${u.realName}`);
  }
  console.log('\n========== 🎯 Smoke 场景数据就绪 ==========');
  console.log('场景1 欠费租客发起续签被拒:');
  console.log(`  用户名: tenant_overdue / 123456 (${userMap.tenant_overdue.realName})`);
  console.log(`  欠费金额: 12500 + 7500 = 20000元，对应租约 ${overdueLease.leaseNo}`);
  console.log('场景2 超阈值涨租进入法务复核:');
  console.log(`  用户名: housekeeper / 123456，租约当前租金: 15000元/月`);
  console.log(`  阈值: ${(threshold.maxIncreaseRate * 100).toFixed(2)}%`);
  console.log(`  请提议租金: ${Math.ceil(15000 * (1 + threshold.maxIncreaseRate + 0.01))} 元以上（超阈值）`);
  console.log('场景3 重复生成合同只有一个有效版本:');
  console.log('  使用租户 tenant1 / 123456 先完成欠费校验、协商通过后，');
  console.log('  连续多次调用 /api/renewals/:id/generate-contract 只会有1个isEffective=true');
  console.log('\n========== 初始化完成 ✅ ==========');
}

module.exports = { seed };

if (require.main === module) {
  seed().catch(e => {
    console.error('❌ 初始化失败:', e);
    process.exit(1);
  });
}
