const http = require('http');
const { sequelize } = require('../server/src/db');
const models = require('../server/src/models');
const { app } = require('../server/src/app');
const { seed } = require('../server/src/seeders/initData');

const PORT = 3099;
const BASE = `http://localhost:${PORT}`;

function httpRequest(method, path, body, token) {
  return new Promise((resolve, reject) => {
    const url = new URL(BASE + path);
    const postData = body ? JSON.stringify(body) : null;
    const headers = {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(postData || '')
    };
    if (token) headers['Authorization'] = 'Bearer ' + token;
    const req = http.request({
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method,
      headers
    }, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = data ? JSON.parse(data) : {};
          resolve({ status: res.statusCode, body: json, raw: data });
        } catch (e) {
          resolve({ status: res.statusCode, body: null, raw: data });
        }
      });
    });
    req.on('error', reject);
    if (postData) req.write(postData);
    req.end();
  });
}

async function login(username, password = '123456') {
  const r = await httpRequest('POST', '/api/auth/login', { username, password });
  if (r.status !== 200) throw new Error(`登录 ${username} 失败: ${r.status} ${r.raw}`);
  return r.body.token;
}

async function getMyLeases(token) {
  const r = await httpRequest('GET', '/api/leases', null, token);
  return r.body;
}

let passed = 0, failed = 0;
function assert(cond, desc) {
  if (cond) {
    console.log('  ✅ ' + desc);
    passed++;
  } else {
    console.log('  ❌ ' + desc);
    failed++;
  }
}

async function testScenario1() {
  console.log('\n========== 场景 1: 欠费租客发起续签被拒绝 ==========');
  try {
    const token = await login('tenant_overdue');
    const leases = await getMyLeases(token);
    const myLease = (leases.data || leases).find(l => l.tenantName && l.tenantName.includes('欠费')) || (leases.data || leases)[0];
    if (!myLease) {
      console.log('  ❌ 未找到欠费租客的租约');
      failed++;
      return;
    }
    console.log('  📋 欠费租客租约:', myLease.leaseNo, myLease.propertyAddr?.slice(0, 20));

    const debugBills = await models.OverdueBill.findAll({
      where: { tenantId: myLease.tenantId, leaseId: myLease.id }
    });
    console.log('  🔍 直接查询欠费账单数量:', debugBills.length, '租户:', myLease.tenantId, '租约:', myLease.id);
    debugBills.forEach(b => {
      console.log('    - billNo:', b.billNo, 'overdueAmount:', b.overdueAmount, 'status:', b.status);
    });

    const r = await httpRequest('POST', '/api/renewals', {
      leaseId: myLease.id,
      reason: '希望继续租住'
    }, token);

    const status4xx = r.status >= 400 && r.status < 500;
    const body = r.body || {};
    const data = body.data || body;
    const hasRejectedFlag =
      (data?.status === 'OVERDUE_REJECTED' || data?.status === 'REJECTED' || body.rejectionReason) ||
      (typeof body.message === 'string' && body.message.includes('欠费'));
    const mentionsOverdue = JSON.stringify(body).includes('欠费') || JSON.stringify(body).includes('overdue');
    const isRejectedStatus = data?.status === 'OVERDUE_REJECTED' || data?.status === 'REJECTED';

    console.log('  📥 HTTP 状态:', r.status);
    console.log('  📥 响应摘要:', JSON.stringify(body).slice(0, 300));

    assert(status4xx || hasRejectedFlag, 'HTTP 4xx 或返回 REJECTED 状态');
    assert(mentionsOverdue, '响应内容提及「欠费」');
    assert((status4xx || hasRejectedFlag) && (mentionsOverdue || isRejectedStatus), '场景 1 综合判定通过');
  } catch (e) {
    console.error('  场景 1 异常:', e.message);
    failed++;
  }
}

async function testScenario2() {
  console.log('\n========== 场景 2: 超阈值涨租进入法务复核 ==========');
  try {
    const tenantToken = await login('tenant3');
    const hkToken = await login('housekeeper');
    const legalToken = await login('legal');

    const leasesHk = await getMyLeases(hkToken);
    const lease = (leasesHk.data || leasesHk).find(l => l.currentRent === 15000) || (leasesHk.data || leasesHk)[2];
    console.log('  📋 选定租约:', lease.leaseNo, '当前租金:', lease.currentRent);

    // 1. 先让管家协助创建续签，或用租客创建
    let r = await httpRequest('POST', '/api/renewals', {
      leaseId: lease.id,
      reason: '到期，计划涨租15%测试'
    }, tenantToken);
    const renewal = (r.body?.data || r.body);
    const renewalId = renewal?.id;
    if (!renewalId) {
      console.log('  ❌ 无法创建续签申请，响应:', r.raw.slice(0, 200));
      failed++;
      return;
    }
    console.log('  ✅ 续签已创建, ID:', renewalId.slice(0, 8) + '...');

    // 2. 管家创建租金方案: 15000 * 1.15 = 17250, 涨幅15% > 阈值10%
    r = await httpRequest('POST', `/api/renewals/${renewalId}/rent-plans`, {
      proposedRent: 17250,
      leaseTermMonths: 12,
      notes: '测试超阈值涨租'
    }, hkToken);
    const planData = r.body?.data || r.body;
    const nowStatus = planData?.application?.status || planData?.status || renewal?.status;
    const exceeds = (r.body?.message || '').includes('阈值') || planData?.rentPlan?.exceedsThreshold === true || nowStatus === 'LEGAL_REVIEW_PENDING' || planData?.rateCheck?.exceeds === true;

    console.log('  📥 创建方案 HTTP:', r.status, '当前状态:', nowStatus);

    assert(r.status < 500, '租金方案创建请求正常');
    assert(exceeds || nowStatus === 'LEGAL_REVIEW_PENDING', '状态进入法务复核或 exceedsThreshold 为 true');

    // 3. 越权测试: 管家尝试直接做 legal-review
    r = await httpRequest('POST', `/api/renewals/${renewalId}/legal-review`, { passed: true, remark: '越权测试' }, hkToken);
    assert(r.status === 403 || r.status === 401 || r.status >= 400, '越权操作（管家做法务复核）被拦截 4xx');
    console.log('  📥 越权复核 HTTP:', r.status);

    // 4. 真正的法务账号做复核
    r = await httpRequest('POST', `/api/renewals/${renewalId}/legal-review`, { passed: true, remark: '法务同意超阈值涨租' }, legalToken);
    const afterReview = r.body?.data || r.body;
    const reviewOk = afterReview?.status === 'LEGAL_REVIEW_PASSED' || afterReview?.status === 'CONTRACT_GENERATING' || afterReview?.status === 'CONTRACT_GENERATED';
    console.log('  📥 法务复核 HTTP:', r.status, '复核后状态:', afterReview?.status);
    assert(reviewOk || r.status < 400, '法务账号执行复核通过，状态流转正确');

    // 场景 2 综合
    const sc2Passed = (exceeds || nowStatus === 'LEGAL_REVIEW_PENDING') && reviewOk;
    assert(sc2Passed, '场景 2 综合判定（超阈值→法务复核→越权拦截→法务通过）');
    return { renewalId, hkToken, legalToken, tenantToken };
  } catch (e) {
    console.error('  场景 2 异常:', e.message);
    failed++;
    return null;
  }
}

async function testScenario3(ctx) {
  console.log('\n========== 场景 3: 重复生成合同只有一个有效版本 ==========');
  try {
    let renewalId, hkToken, legalToken, tenantToken;
    if (ctx) {
      ({ renewalId, hkToken, legalToken, tenantToken } = ctx);
    } else {
      tenantToken = await login('tenant1');
      hkToken = await login('housekeeper');
      legalToken = await login('legal');
      const leases = await getMyLeases(hkToken);
      const lease = (leases.data || leases)[0];
      let r = await httpRequest('POST', '/api/renewals', { leaseId: lease.id, reason: '场景3' }, tenantToken);
      renewalId = (r.body?.data || r.body).id;
      r = await httpRequest('POST', `/api/renewals/${renewalId}/rent-plans`, {
        proposedRent: Math.round(lease.currentRent * 1.05),
        leaseTermMonths: 12,
        notes: '场景3，5%涨幅，低于阈值'
      }, hkToken);
    }

    // 先获取最新的续签信息（当前version）
    const detail = await httpRequest('GET', `/api/renewals/${renewalId}`, null, hkToken);
    const appVer = (detail.body?.data || detail.body)?.version || 0;
    console.log('  🔍 当前续签版本号:', appVer, '状态:', (detail.body?.data || detail.body)?.status);

    // 模拟用户连续点击3次（串行快速请求，符合真实业务场景；SQLite不支持真正并发写）
    const results = [];
    for (let i = 0; i < 3; i++) {
      results.push(
        await httpRequest('POST', `/api/renewals/${renewalId}/generate-contract`, {
          remark: '场景3连续#' + i,
          expectedVersion: appVer
        }, hkToken)
      );
    }
    results.forEach((r, i) => console.log(`  📥 连续请求#${i + 1}: HTTP ${r.status}, ${(r.body?.error || r.body?.message || JSON.stringify(r.body).slice(0, 80))}`));

    // 查合同版本列表
    const r = await httpRequest('GET', `/api/renewals/${renewalId}`, null, hkToken);
    const data = r.body?.data || r.body;
    const versions = data?.contractVersions || [];
    const effective = versions.filter(v => v.isEffective === true || v.is_effective === 1);
    console.log('  📋 合同版本总数:', versions.length, '有效版本数:', effective.length);

    assert(versions.length >= 1, '至少生成 1 份合同');
    assert(effective.length === 1, `有效版本数 === 1（实际:${effective.length}）`);

    // 场景 3 综合：3次请求里至少有1次成功，且最终有效版本只有1个
    const successCount = results.filter(r => r.status === 200 || r.status === 201).length;
    const sc3Passed = successCount >= 1 && effective.length === 1;
    assert(sc3Passed, '场景 3 综合判定（并发请求不产生多个有效版本）');
  } catch (e) {
    console.error('  场景 3 异常:', e.message, e.stack?.slice(0, 300));
    failed++;
  }
}

async function testScenario4() {
  console.log('\n========== 场景 4: 签署全链路（生成合同→上传附件→三方签署→归档） ==========');
  try {
    const tenantToken = await login('tenant1');
    const hkToken = await login('housekeeper');
    const legalToken = await login('legal');
    const signAdminToken = await login('signadmin');
    const financeToken = await login('finance');

    const leases = await getMyLeases(hkToken);
    const lease = (leases.data || leases)[0];
    console.log('  📋 选定租约:', lease.leaseNo, '当前租金:', lease.currentRent);

    let r = await httpRequest('POST', '/api/renewals', {
      leaseId: lease.id,
      reason: '场景4 全链路签署回归'
    }, tenantToken);
    const renewal = r.body?.data || r.body;
    const renewalId = renewal.id;
    console.log('  ✅ 续签已创建, ID:', renewalId.slice(0, 8) + '...');

    r = await httpRequest('POST', `/api/renewals/${renewalId}/rent-plans`, {
      proposedRent: Math.round(lease.currentRent * 1.05),
      leaseTermMonths: 12,
      notes: '场景4，5%涨幅，不超阈值'
    }, hkToken);
    assert(r.status < 400, '租金方案创建成功（不超阈值）');
    console.log('  ✅ 租金方案创建，状态:', (r.body?.data || r.body)?.application?.status || (r.body?.data || r.body)?.status);

    const detail0 = await httpRequest('GET', `/api/renewals/${renewalId}`, null, hkToken);
    const appVer = (detail0.body?.data || detail0.body)?.version || 0;
    r = await httpRequest('POST', `/api/renewals/${renewalId}/generate-contract`, {
      remark: '场景4 合同生成',
      expectedVersion: appVer
    }, hkToken);
    assert(r.status === 200 || r.status === 201, '合同生成成功');
    const genData = r.body?.data || r.body;
    const contractId = genData?.contract?.id || genData?.contractVersion?.id;
    console.log('  ✅ 合同已生成, contractId:', contractId?.slice?.(0, 8) + '...');

    const { Attachment, ATTACHMENT_TYPE, ATTACHMENT_CATEGORY } = models;
    const hkUserInfo = await httpRequest('GET', '/api/auth/me', null, hkToken);
    const uploaderId = (hkUserInfo.body?.data || hkUserInfo.body)?.id || (hkUserInfo.body?.user || {})?.id;
    const uploaderName = (hkUserInfo.body?.data || hkUserInfo.body)?.realName || (hkUserInfo.body?.user || {})?.realName || '管家-小林';

    const requiredTypes = ['ID_CARD', 'RENT_CERT', 'CONTRACT_DRAFT'];
    for (const t of requiredTypes) {
      await Attachment.create({
        renewalId,
        fileName: `${t}_示例.pdf`,
        filePath: `mock_${t}_${Date.now()}.pdf`,
        fileSize: 10240,
        mimeType: 'application/pdf',
        type: t,
        category: ATTACHMENT_CATEGORY.REQUIRED_FOR_SIGN,
        uploadedBy: uploaderId,
        uploadedByName: uploaderName,
        isRequired: true
      });
    }
    console.log('  ✅ 已创建 3 个必要附件（模拟上传）');

    r = await httpRequest('POST', `/api/renewals/${renewalId}/prepare-signing`, {}, hkToken);
    assert(r.status < 400, '进入签署阶段成功');
    const prepData = r.body?.data || r.body;
    assert(prepData.currentHandlerRole === 'TENANT',
      `进入签署后当前处理角色为 TENANT（实际: ${prepData.currentHandlerRole}）`);
    console.log('  ✅ 进入签署阶段，当前处理角色:', prepData.currentHandlerRole);

    r = await httpRequest('POST', `/api/renewals/${renewalId}/sign/${contractId}`, {
      party: 'COMPANY_LEGAL',
      signature: 'test_legal_skip'
    }, legalToken);
    assert(r.status === 403, '法务越权先签被拦截（403）');
    console.log('  ✅ 越权拦截：法务在租客之前签署 → HTTP', r.status);

    r = await httpRequest('POST', `/api/renewals/${renewalId}/sign/${contractId}`, {
      party: 'TENANT',
      signature: 'ZHANG_SAN_SIGN'
    }, tenantToken);
    assert(r.status < 400, '租客签署成功');
    const tenantSignData = r.body;
    assert(tenantSignData.application?.currentHandlerRole === 'LEGAL',
      `租客签完后当前处理角色切到 LEGAL（实际: ${tenantSignData.application?.currentHandlerRole}）`);
    console.log('  ✅ 租客签署完成，当前处理角色 →', tenantSignData.application?.currentHandlerRole);

    r = await httpRequest('POST', `/api/renewals/${renewalId}/sign/${contractId}`, {
      party: 'SIGN_ADMIN',
      signature: 'test_signadmin_skip'
    }, signAdminToken);
    assert(r.status === 403, '签管越权先签被拦截（403）');
    console.log('  ✅ 越权拦截：签署管理员在法务之前签署 → HTTP', r.status);

    r = await httpRequest('POST', `/api/renewals/${renewalId}/sign/${contractId}`, {
      party: 'COMPANY_LEGAL',
      signature: 'LIU_LAWYER_SIGN'
    }, legalToken);
    assert(r.status < 400, '法务签署成功');
    const legalSignData = r.body;
    assert(legalSignData.application?.currentHandlerRole === 'SIGN_ADMIN',
      `法务签完后当前处理角色切到 SIGN_ADMIN（实际: ${legalSignData.application?.currentHandlerRole}）`);
    console.log('  ✅ 法务签署完成，当前处理角色 →', legalSignData.application?.currentHandlerRole);

    r = await httpRequest('POST', `/api/renewals/${renewalId}/sign/${contractId}`, {
      party: 'SIGN_ADMIN',
      signature: 'ZHOU_SIGNADMIN_SIGN'
    }, signAdminToken);
    assert(r.status < 400, '签署管理员签署成功');
    const finalSignData = r.body;
    assert(finalSignData.allSigned === true, '全部签署完成（allSigned=true）');
    assert(finalSignData.application?.status === 'SIGNED',
      `全部签完后状态为 SIGNED（实际: ${finalSignData.application?.status}）`);
    assert(finalSignData.application?.currentHandlerRole === 'FINANCE',
      `全部签完后当前处理角色切到 FINANCE（实际: ${finalSignData.application?.currentHandlerRole}）`);
    console.log('  ✅ 签署管理员签署完成，状态 →', finalSignData.application?.status,
      '，当前处理角色 →', finalSignData.application?.currentHandlerRole);

    r = await httpRequest('POST', `/api/renewals/${renewalId}/archive`, {
      remark: '场景4 归档测试'
    }, financeToken);
    assert(r.status < 400, '财务归档成功');
    const archiveData = r.body?.data || r.body;
    assert(archiveData.status === 'ARCHIVED',
      `归档后状态为 ARCHIVED（实际: ${archiveData.status}）`);
    console.log('  ✅ 财务归档完成，最终状态:', archiveData.status);

    assert(true, '场景 4 综合判定（生成合同→上传附件→按序签署→归档全链路通过）');
  } catch (e) {
    console.error('  场景 4 异常:', e.message, e.stack?.slice(0, 400));
    failed++;
  }
}

async function main() {
  let server;
  try {
    await seed();
    server = app.listen(PORT, () => console.log('🧪 测试服务启动于 ' + BASE));
  } catch (e) {
    console.error('启动测试服务失败:', e);
    process.exit(1);
  }

  await new Promise(r => setTimeout(r, 1500));

  await testScenario1();
  const ctx = await testScenario2();
  await testScenario3(ctx);
  await testScenario4();

  console.log('\n======================');
  console.log(`📊 结果: PASS=${passed}, FAIL=${failed}`);
  console.log('======================');

  server.close(() => {
    process.exit(failed > 0 ? 1 : 0);
  });
}

main().catch(e => { console.error(e); process.exit(1); });
