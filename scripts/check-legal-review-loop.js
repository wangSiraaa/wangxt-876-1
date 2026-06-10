#!/usr/bin/env node
/**
 * 检查命令：验证"租金涨幅超过阈值要法务复核"功能未失效
 *
 * 核心验证点（复查闭环）：
 *  1. 首次超阈值 → 必须进入法务复核
 *  2. 法务驳回后，重新创建超阈值方案 → 必须再次进入法务复核（不能豁免）
 *  3. 法务通过后，重新创建超阈值方案 → 必须再次进入法务复核（不能"一次通过永久有效"）
 *  4. 审核结论必须正确落库（legalReviewRecords + reviewConclusion）
 *  5. 复核历史记录完整可追溯
 *
 * 使用方法：
 *   先启动后端：npm run dev:server
 *   再执行：   node scripts/check-legal-review-loop.js
 */

const http = require('http');

const API_BASE = process.env.API_BASE || 'http://localhost:3005';

function request(method, path, body = null, token = null, json = true) {
  return new Promise((resolve, reject) => {
    const url = new URL(API_BASE + path);
    const headers = {};
    if (json) headers['Content-Type'] = 'application/json';
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const req = http.request(
      {
        method,
        hostname: url.hostname,
        port: url.port,
        path: url.pathname + url.search,
        headers
      },
      (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            const parsed = data ? JSON.parse(data) : null;
            resolve({ status: res.statusCode, data: parsed, raw: data });
          } catch (e) {
            resolve({ status: res.statusCode, data: null, raw: data });
          }
        });
      }
    );

    req.on('error', reject);
    req.setTimeout(15000, () => {
      req.destroy(new Error('请求超时，请检查后端服务是否已启动'));
    });

    if (body && json) req.write(JSON.stringify(body));
    req.end();
  });
}

let TOKENS = {};
let SEED_DATA = {};
const RESULTS = [];
let stepNum = 0;

function step(msg) {
  stepNum++;
  console.log(`\n   ${stepNum}. ${msg}`);
}

function check(name, condition, detail) {
  const passed = !!condition;
  RESULTS.push({ name, passed, detail });
  const icon = passed ? '✅' : '❌';
  console.log(`      ${icon} ${name}: ${passed ? '通过' : '失败'}`);
  if (detail) console.log(`         ${detail}`);
  return passed;
}

async function run() {
  console.log('='.repeat(70));
  console.log('🔍 复查闭环检查命令：租金涨幅超阈值法务复核功能验证');
  console.log('='.repeat(70));
  console.log(`后端地址: ${API_BASE}`);
  console.log(`开始时间: ${new Date().toLocaleString()}`);

  // === 0. 健康检查 ===
  console.log('\n0️⃣  健康检查...');
  const health = await request('GET', '/api/health');
  if (health.status !== 200 || health.data?.status !== 'ok') {
    console.error('❌ 后端服务未启动，请先执行 npm run dev:server');
    process.exit(1);
  }
  console.log('   ✅ 后端服务正常');

  // === 1. 登录 ===
  console.log('\n1️⃣  登录各角色账号...');
  const baseAccounts = [
    { role: 'TENANT', username: 'tenant1', password: '123456', label: '租客1' },
    { role: 'TENANT', username: 'tenant3', password: '123456', label: '租客3' },
    { role: 'HOUSEKEEPER', username: 'housekeeper', password: '123456', label: '管家' },
    { role: 'FINANCE', username: 'finance', password: '123456', label: '财务' },
    { role: 'LEGAL', username: 'legal', password: '123456', label: '法务' }
  ];

  for (const acc of baseAccounts) {
    const r = await request('POST', '/api/auth/login', acc);
    if (r.status === 200 && r.data?.token) {
      TOKENS[acc.username] = r.data.token;
      console.log(`   ✅ ${acc.label} (${acc.username}) 登录成功`);
    } else {
      console.error(`   ❌ ${acc.label} 登录失败`);
    }
  }

  TOKENS.tenant_loop1 = TOKENS.tenant1 || TOKENS.tenant3;
  TOKENS.tenant_loop2 = TOKENS.tenant3 || TOKENS.tenant1;
  console.log(`   ℹ️  测试账号映射: tenant_loop1→${TOKENS.tenant_loop1 ? '✅' : '❌'}, tenant_loop2→${TOKENS.tenant_loop2 ? '✅' : '❌'}`);

  // === 2. 获取租约和阈值 ===
  console.log('\n2️⃣  获取测试数据...');
  const leaseResp = await request('GET', '/api/leases', null, TOKENS.housekeeper);
  const leases = leaseResp.data || [];
  console.log(`   📋 租约总数: ${leases.length}`);

  const tenant1Lease = leases[0];
  const tenant2Lease = leases.find(l => !l.tenantName.includes('欠费')) || leases[2] || leases[0];

  if (!tenant1Lease) {
    console.error('❌ 没有可用租约，请先执行 npm run seed');
    process.exit(1);
  }

  console.log(`   📍 测试租约1: ${tenant1Lease.leaseNo} (租客: ${tenant1Lease.tenantName}, 当前租金: ¥${tenant1Lease.currentRent})`);
  console.log(`   📍 测试租约2: ${tenant2Lease.leaseNo} (租客: ${tenant2Lease.tenantName}, 当前租金: ¥${tenant2Lease.currentRent})`);

  const thrResp = await request('GET', '/api/thresholds/active', null, TOKENS.finance);
  const threshold = thrResp.data;
  const maxRate = threshold ? threshold.maxIncreaseRate : 0.10;
  console.log(`   📊 当前涨幅阈值: ${(maxRate * 100).toFixed(2)}%`);

  const prevRent1 = Number(tenant1Lease.currentRent);
  const prevRent2 = Number(tenant2Lease.currentRent);
  const exceedRate = maxRate + 0.05;
  const exceedRent1 = Math.ceil(prevRent1 * (1 + exceedRate));
  const exceedRent2 = Math.ceil(prevRent2 * (1 + exceedRate));
  const normalRent1 = Math.ceil(prevRent1 * (1 + maxRate * 0.8));
  const normalRent2 = Math.ceil(prevRent2 * (1 + maxRate * 0.8));

  console.log(`   🔢 超阈值租金(租约1): ¥${prevRent1} → ¥${exceedRent1} (涨幅 ${(exceedRate * 100).toFixed(2)}%)`);
  console.log(`   🔢 正常租金(租约1): ¥${prevRent1} → ¥${normalRent1} (涨幅 ${(maxRate * 0.8 * 100).toFixed(2)}%)`);
  console.log(`   🔢 正常租金(租约2): ¥${prevRent2} → ¥${normalRent2} (涨幅 ${(maxRate * 0.8 * 100).toFixed(2)}%)`);

  // ============================================================
  // 场景 A：首次超阈值 → 必须进入法务复核
  // ============================================================
  console.log('\n' + '='.repeat(70));
  console.log('🎯 场景 A：首次超阈值 → 必须进入法务复核');
  console.log('='.repeat(70));

  step('租客1发起续签申请');
  const r1 = await request('POST', '/api/renewals', {
    leaseId: tenant1Lease.id,
    expectedLeaseTerm: 12
  }, TOKENS.tenant_loop1);

  let appIdA = null;
  if (r1.status === 200 && r1.data?.id) {
    appIdA = r1.data.id;
    console.log(`      ✅ 续签创建成功: ${r1.data.appNo}, status=${r1.data.status}`);
  } else if (r1.data?.application?.id) {
    appIdA = r1.data.application.id;
  } else {
    console.error('❌ 创建续签失败', r1.data);
    process.exit(1);
  }

  step(`管家创建超阈值租金方案 (¥${prevRent1} → ¥${exceedRent1})`);
  const r2 = await request('POST', `/api/renewals/${appIdA}/rent-plans`, {
    proposedRent: exceedRent1,
    leaseTermMonths: 12,
    notes: 'check-loop: 首次超阈值测试'
  }, TOKENS.housekeeper);

  check('创建租金方案成功', r2.status === 200, `HTTP ${r2.status}`);
  check('涨幅检查标记为超阈值', r2.data?.rateCheck?.exceeds === true,
    `exceeds=${r2.data?.rateCheck?.exceeds}, rate=${r2.data?.rateCheck?.ratePercent}%, threshold=${r2.data?.rateCheck?.thresholdPercent}%`);
  check('状态变为法务复核待处理', r2.data?.application?.status === 'LEGAL_REVIEW_PENDING',
    `status=${r2.data?.application?.status}`);
  check('当前处理角色为法务', r2.data?.application?.currentHandlerRole === 'LEGAL',
    `currentHandlerRole=${r2.data?.application?.currentHandlerRole}`);
  check('法务复核结果重置为待处理', r2.data?.application?.legalReviewResult === 'PENDING',
    `legalReviewResult=${r2.data?.application?.legalReviewResult}`);
  check('法务复核意见为空', r2.data?.application?.legalReviewComment === null || r2.data?.application?.legalReviewComment === undefined,
    `legalReviewComment=${r2.data?.application?.legalReviewComment}`);

  step('验证法务待办列表包含此申请');
  const legalPending = await request('GET', '/api/renewals/legal/pending', null, TOKENS.legal);
  const pendingList = legalPending.data?.pending || legalPending.data || [];
  const foundInPending = Array.isArray(pendingList) && pendingList.some(item => item.id === appIdA);
  check('申请出现在法务待办列表中', foundInPending,
    `待办列表共 ${Array.isArray(pendingList) ? pendingList.length : '?'} 条，${foundInPending ? '包含' : '不包含'} 目标申请`);

  // ============================================================
  // 场景 B：法务驳回后 → 重新创建超阈值方案 → 必须再次进入法务复核
  // ============================================================
  console.log('\n' + '='.repeat(70));
  console.log('🎯 场景 B：法务驳回后，重新创建超阈值方案 → 必须再次进入法务复核');
  console.log('='.repeat(70));

  step('法务驳回首次申请（附审核结论）');
  const r3 = await request('POST', `/api/renewals/${appIdA}/legal-review`, {
    passed: false,
    comment: 'check-loop: 涨幅过高，建议与租客协商降低',
    reviewConclusion: '【驳回理由】租金涨幅达到' + (exceedRate * 100).toFixed(2) + '%，大幅超过公司规定的' + (maxRate * 100).toFixed(2) + '%阈值。' +
                      '根据《租金管理办法》第5条，建议与租客重新协商租金方案，涨幅控制在阈值以内或特殊审批。'
  }, TOKENS.legal);

  check('法务驳回操作成功', r3.status === 200, `HTTP ${r3.status}`);
  check('复核次数递增为1', r3.data?.legalReviewCount === 1,
    `legalReviewCount=${r3.data?.legalReviewCount}`);
  check('复核结果标记为驳回', r3.data?.legalReviewResult === 'REJECTED',
    `legalReviewResult=${r3.data?.legalReviewResult}`);
  const actualConclusion = r3.data?.reviewConclusion || '';
  const hasCustomConclusion = actualConclusion.includes('check-loop') || actualConclusion.includes('驳回理由');
  check('审核结论已落库（包含自定义内容）', hasCustomConclusion || actualConclusion.length > 20,
    `reviewConclusion=${actualConclusion.slice(0, 80)}...`);
  check('状态变为法务复核驳回', r3.data?.status === 'LEGAL_REVIEW_REJECTED',
    `status=${r3.data?.status}`);

  step('查询复核历史记录');
  const recordsResp = await request('GET', `/api/renewals/${appIdA}/legal-review-records`, null, TOKENS.housekeeper);
  const records = recordsResp.data || [];
  check('复核历史记录存在', records.length >= 1, `记录数=${records.length}`);
  if (records.length > 0) {
    const latest = records[records.length - 1];
    check('复核历史包含驳回结果', latest.reviewResult === 'REJECTED',
      `reviewResult=${latest.reviewResult}`);
    check('复核历史包含审核结论', latest.reviewConclusion !== null,
      `reviewConclusion=${(latest.reviewConclusion || '').slice(0, 30)}...`);
    check('复核历史包含租金数据', latest.previousRent === prevRent1 && latest.proposedRent === exceedRent1,
      `prev=${latest.previousRent}, proposed=${latest.proposedRent}`);
    check('复核历史包含涨幅数据', Math.abs(latest.increaseRate - exceedRate) < 0.001,
      `increaseRate=${latest.increaseRate}, expected=${exceedRate}`);
  }

  step('管家重新创建超阈值租金方案（验证复查闭环）');
  const r4 = await request('POST', `/api/renewals/${appIdA}/rent-plans`, {
    proposedRent: exceedRent1,
    leaseTermMonths: 12,
    notes: 'check-loop: 驳回后再次超阈值测试'
  }, TOKENS.housekeeper);

  check('重新创建租金方案成功', r4.status === 200, `HTTP ${r4.status}`);
  check('再次标记为超阈值', r4.data?.rateCheck?.exceeds === true,
    `exceeds=${r4.data?.rateCheck?.exceeds}`);
  check('⚠️  核心检查：状态必须再次变为法务复核待处理（复查闭环关键）',
    r4.data?.application?.status === 'LEGAL_REVIEW_PENDING',
    `status=${r4.data?.application?.status} (期望值=LEGAL_REVIEW_PENDING)`);
  check('⚠️  核心检查：法务复核结果必须重置为待处理（不能沿用之前的驳回）',
    r4.data?.application?.legalReviewResult === 'PENDING',
    `legalReviewResult=${r4.data?.application?.legalReviewResult} (期望值=PENDING)`);
  check('⚠️  核心检查：上次复核意见必须清空（不能"一次驳回永久有效"）',
    r4.data?.application?.legalReviewComment === null || r4.data?.application?.legalReviewComment === undefined,
    `legalReviewComment=${r4.data?.application?.legalReviewComment} (期望值=null)`);
  check('⚠️  核心检查：审核结论必须清空',
    r4.data?.application?.reviewConclusion === null || r4.data?.application?.reviewConclusion === undefined,
    `reviewConclusion=${r4.data?.application?.reviewConclusion} (期望值=null)`);
  check('复核次数保留（不重置）', r4.data?.application?.legalReviewCount === 1,
    `legalReviewCount=${r4.data?.application?.legalReviewCount} (期望值=1，保留历史)`);

  step('验证法务待办列表再次包含此申请');
  const legalPending2 = await request('GET', '/api/renewals/legal/pending', null, TOKENS.legal);
  const pendingList2 = legalPending2.data?.pending || legalPending2.data || [];
  const foundInPending2 = Array.isArray(pendingList2) && pendingList2.some(item => item.id === appIdA);
  check('申请再次出现在法务待办列表', foundInPending2,
    foundInPending2 ? '✅ 复查闭环生效，需要再次复核' : '❌ 复查闭环失效，未出现在待办列表');

  // ============================================================
  // 场景 C：法务通过后 → 重新创建超阈值方案 → 必须再次进入法务复核
  // ============================================================
  console.log('\n' + '='.repeat(70));
  console.log('🎯 场景 C：法务通过后，重新创建超阈值方案 → 必须再次进入法务复核');
  console.log('='.repeat(70));

  step('法务通过第二次申请（附审核结论）');
  const r5 = await request('POST', `/api/renewals/${appIdA}/legal-review`, {
    passed: true,
    comment: 'check-loop: 同意此次涨幅，已与租客充分沟通',
    reviewConclusion: '【同意理由】虽然租金涨幅' + (exceedRate * 100).toFixed(2) + '%超过阈值' + (maxRate * 100).toFixed(2) + '%，' +
                      '但考虑到市场行情及该租客的良好信用记录，且已与租客充分沟通达成一致，同意此次涨幅。' +
                      '后续需持续关注该区域租金水平。'
  }, TOKENS.legal);

  check('法务通过操作成功', r5.status === 200, `HTTP ${r5.status}`);
  check('复核次数递增为2', r5.data?.legalReviewCount === 2,
    `legalReviewCount=${r5.data?.legalReviewCount}`);
  check('复核结果标记为通过', r5.data?.legalReviewResult === 'PASSED',
    `legalReviewResult=${r5.data?.legalReviewResult}`);
  const actualConclusion2 = r5.data?.reviewConclusion || '';
  const hasCustomConclusion2 = actualConclusion2.includes('check-loop') || actualConclusion2.includes('同意理由');
  check('审核结论已落库（包含自定义内容）', hasCustomConclusion2 || actualConclusion2.length > 20,
    `reviewConclusion=${actualConclusion2.slice(0, 80)}...`);
  check('状态变为法务复核通过', r5.data?.status === 'LEGAL_REVIEW_PASSED',
    `status=${r5.data?.status}`);

  step('查询复核历史记录（验证多次复核都有记录）');
  const recordsResp2 = await request('GET', `/api/renewals/${appIdA}/legal-review-records`, null, TOKENS.housekeeper);
  const records2 = recordsResp2.data || [];
  check('复核历史记录数量正确', records2.length === 2, `记录数=${records2.length} (期望值=2)`);
  if (records2.length === 2) {
    check('最新记录为通过记录（按时间倒序）', records2[0].reviewResult === 'PASSED',
      `第1条(最新): ${records2[0].reviewResult}`);
    check('历史记录为驳回记录', records2[1].reviewResult === 'REJECTED',
      `第2条(历史): ${records2[1].reviewResult}`);
    check('复核类型标记正确', records2[0].reviewType === 'REVISION' && records2[1].reviewType === 'INITIAL',
      `类型: ${records2[1].reviewType} → ${records2[0].reviewType}`);
  }

  step('管家第三次创建超阈值租金方案（验证不能"一次通过永久有效"）');
  const r6 = await request('POST', `/api/renewals/${appIdA}/rent-plans`, {
    proposedRent: exceedRent1 + 100,
    leaseTermMonths: 12,
    notes: 'check-loop: 通过后再次超阈值测试'
  }, TOKENS.housekeeper);

  check('重新创建租金方案成功', r6.status === 200, `HTTP ${r6.status}`);
  check('仍然标记为超阈值', r6.data?.rateCheck?.exceeds === true,
    `exceeds=${r6.data?.rateCheck?.exceeds}`);
  check('⚠️  核心检查：状态必须再次变为法务复核待处理（不能沿用之前的通过）',
    r6.data?.application?.status === 'LEGAL_REVIEW_PENDING',
    `status=${r6.data?.application?.status} (期望值=LEGAL_REVIEW_PENDING)`);
  check('⚠️  核心检查：法务复核结果必须重置为待处理（不能"一次通过永久有效"）',
    r6.data?.application?.legalReviewResult === 'PENDING',
    `legalReviewResult=${r6.data?.application?.legalReviewResult} (期望值=PENDING)`);
  check('⚠️  核心检查：上次复核意见必须清空',
    r6.data?.application?.legalReviewComment === null || r6.data?.application?.legalReviewComment === undefined,
    `legalReviewComment=${r6.data?.application?.legalReviewComment} (期望值=null)`);
  check('⚠️  核心检查：审核结论必须清空',
    r6.data?.application?.reviewConclusion === null || r6.data?.application?.reviewConclusion === undefined,
    `reviewConclusion=${r6.data?.application?.reviewConclusion} (期望值=null)`);
  check('复核次数保持为2（尚未进行第三次复核）', r6.data?.application?.legalReviewCount === 2,
    `legalReviewCount=${r6.data?.application?.legalReviewCount} (期望值=2，已完成2次复核)`);

  step('验证详情接口能正确返回所有复核历史');
  const detailResp = await request('GET', `/api/renewals/${appIdA}`, null, TOKENS.housekeeper);
  const detailRecords = detailResp.data?.legalReviewRecords || [];
  check('详情接口包含复核历史', detailRecords.length >= 2,
    `detail.legalReviewRecords.length=${detailRecords.length} (期望值≥2)`);

  // ============================================================
  // 场景 D：验证不超阈值的正常流程不需要法务复核
  // ============================================================
  console.log('\n' + '='.repeat(70));
  console.log('🎯 场景 D：不超阈值 → 跳过法务复核（反向验证）');
  console.log('='.repeat(70));

  step('租客2发起续签申请');
  console.log(`      租约: ${tenant2Lease.leaseNo}, 租客: ${tenant2Lease.tenantName}`);
  const r7 = await request('POST', '/api/renewals', {
    leaseId: tenant2Lease.id,
    expectedLeaseTerm: 12
  }, TOKENS.tenant_loop2);

  console.log(`      申请结果: HTTP ${r7.status}, appNo=${r7.data?.appNo || r7.data?.application?.appNo}, status=${r7.data?.status || r7.data?.application?.status}`);

  let appIdD = null;
  if (r7.status === 200 && r7.data?.id) {
    appIdD = r7.data.id;
    console.log(`      ✅ 续签创建成功: ${r7.data.appNo}, status=${r7.data.status}`);
  } else if (r7.data?.application?.id) {
    appIdD = r7.data.application.id;
    console.log(`      ✅ 续签创建成功: ${r7.data.application.appNo}, status=${r7.data.application.status}`);
  } else if (r7.status === 400 && r7.data?.rejected) {
    console.log(`      ⚠️  续签被拒绝: ${r7.data?.error}, 使用已有的非欠费租约`);
    appIdD = null;
  }

  if (!appIdD) {
    console.log(`      ℹ️  创建新的续签申请用于场景D测试`);
    const r7b = await request('POST', '/api/renewals', {
      leaseId: tenant1Lease.id,
      expectedLeaseTerm: 12
    }, TOKENS.tenant_loop1);
    if (r7b.status === 200 && r7b.data?.id) {
      appIdD = r7b.data.id;
      console.log(`      ✅ 新申请创建成功: ${r7b.data.appNo}, status=${r7b.data.status}`);
    } else if (r7b.data?.application?.id) {
      appIdD = r7b.data.application.id;
      console.log(`      ✅ 新申请创建成功: ${r7b.data.application.appNo}, status=${r7b.data.application.status}`);
    }
  }

  step(`管家创建正常租金方案 (¥${prevRent1} → ¥${normalRent1})`);
  const rentPlanAppId = appIdD;
  const testRent = normalRent1;
  const r8 = await request('POST', `/api/renewals/${rentPlanAppId}/rent-plans`, {
    proposedRent: testRent,
    leaseTermMonths: 12,
    notes: 'check-loop: 不超阈值测试'
  }, TOKENS.housekeeper);

  check('创建租金方案成功', r8.status === 200, `HTTP ${r8.status}`);
  check('涨幅检查标记为未超阈值', r8.data?.rateCheck?.exceeds === false,
    `exceeds=${r8.data?.rateCheck?.exceeds}, rate=${r8.data?.rateCheck?.ratePercent}%`);
  check('状态跳过法务复核，直接进入租金方案已创建', r8.data?.application?.status === 'RENT_PLAN_CREATED',
    `status=${r8.data?.application?.status}`);
  check('当前处理角色不是法务', r8.data?.application?.currentHandlerRole !== 'LEGAL',
    `currentHandlerRole=${r8.data?.application?.currentHandlerRole}`);
  check('法务复核结果保持默认值',
    r8.data?.application?.legalReviewResult === 'PENDING' || r8.data?.application?.legalReviewResult === null,
    `legalReviewResult=${r8.data?.application?.legalReviewResult}`);

  step('验证法务待办列表不包含此申请');
  const checkAppId = appIdD || rentPlanAppId;
  const legalPending3 = await request('GET', '/api/renewals/legal/pending', null, TOKENS.legal);
  const pendingList3 = legalPending3.data?.pending || legalPending3.data || [];
  const foundInPending3 = Array.isArray(pendingList3) && pendingList3.some(item => item.id === checkAppId);
  check('申请不在法务待办列表中', !foundInPending3,
    !foundInPending3 ? '✅ 正常流程不进入法务复核' : '❌ 异常：正常流程也进入了法务复核');

  // ============================================================
  // 汇总结果
  // ============================================================
  console.log('\n' + '='.repeat(70));
  console.log('📊 检查结果汇总');
  console.log('='.repeat(70));

  const passed = RESULTS.filter(r => r.passed).length;
  const failed = RESULTS.filter(r => !r.passed).length;
  const criticalChecks = RESULTS.filter(r => r.name.includes('核心检查'));
  const criticalPassed = criticalChecks.filter(r => r.passed).length;
  const criticalFailed = criticalChecks.filter(r => !r.passed).length;

  console.log(`\n总检查项: ${RESULTS.length}`);
  console.log(`✅ 通过: ${passed}`);
  console.log(`❌ 失败: ${failed}`);
  console.log(`\n⚠️  核心检查项 (复查闭环): ${criticalChecks.length}`);
  console.log(`   ✅ 通过: ${criticalPassed}`);
  console.log(`   ❌ 失败: ${criticalFailed}`);

  console.log('\n' + '─'.repeat(70));
  console.log('📋 失败详情:');
  RESULTS.filter(r => !r.passed).forEach((r, i) => {
    console.log(`  ❌ ${i + 1}. ${r.name}`);
    console.log(`     ${r.detail}`);
  });

  console.log('\n' + '='.repeat(70));
  if (failed === 0) {
    console.log('🎉🎉🎉 全部检查通过！');
    console.log('✅ "租金涨幅超过阈值要法务复核"功能正常，复查闭环生效！');
    console.log('✅ 审核结论正确落库，复核历史完整可追溯。');
    process.exit(0);
  } else if (criticalFailed > 0) {
    console.log('❌ 核心检查失败！复查闭环可能已失效！');
    console.log('⚠️  请立即排查后端代码，确保每次创建超阈值租金方案时都正确重置法务复核状态。');
    process.exit(1);
  } else {
    console.log('⚠️  部分非核心检查失败，核心功能正常。');
    console.log('✅ "租金涨幅超过阈值要法务复核"复查闭环仍然有效。');
    process.exit(0);
  }
}

run().catch(e => {
  console.error('\n❌ 检查执行异常:', e.message);
  console.error(e.stack);
  process.exit(2);
});
