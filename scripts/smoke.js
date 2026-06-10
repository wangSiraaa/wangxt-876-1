#!/usr/bin/env node
/**
 * 房屋租赁合同续签系统 - Smoke 测试脚本
 *
 * 核心验证场景：
 *  1. 欠费租客发起续签被拒绝
 *  2. 租金涨幅超过阈值 → 必须先进入法务复核
 *  3. 重复点击生成合同 → 只有一个有效合同版本
 *
 * 使用方法：
 *   先启动后端：npm run dev:server  (或 docker-compose up)
 *   再执行：   node scripts/smoke.js
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

const TESTS = [];
const RESULTS = [];
let TOKENS = {};
let SEED_CACHE = {};

function addTest(name, fn) {
  TESTS.push({ name, fn });
}

async function run() {
  console.log('='.repeat(70));
  console.log('🏠 房屋租赁合同续签系统 - SMOKE 测试');
  console.log('='.repeat(70));
  console.log(`后端地址: ${API_BASE}`);
  console.log(`开始时间: ${new Date().toLocaleString()}`);
  console.log();

  // === 0. 健康检查 ===
  console.log('0️⃣  [健康检查] 验证后端服务已启动...');
  try {
    const r = await request('GET', '/api/health');
    if (r.status === 200 && r.data?.status === 'ok') {
      console.log('   ✅ 后端服务正常，版本:', r.data.service);
      RESULTS.push({ name: '后端健康检查', passed: true });
    } else {
      console.error('   ❌ 健康检查失败');
      process.exit(1);
    }
  } catch (e) {
    console.error('   ❌ 无法连接后端，请先启动服务（npm run dev:server）');
    console.error('   错误信息:', e.message);
    process.exit(1);
  }

  // === 1. 登录所有角色 ===
  console.log('\n1️⃣  [登录] 获取各角色 Token...');
  const accounts = [
    { role: 'TENANT', username: 'tenant1', password: '123456', label: '租客(张三)' },
    { role: 'TENANT', username: 'tenant_overdue', password: '123456', label: '欠费租客(王五)' },
    { role: 'TENANT', username: 'tenant3', password: '123456', label: '租客(赵六,用于超阈值测试)' },
    { role: 'HOUSEKEEPER', username: 'housekeeper', password: '123456', label: '管家' },
    { role: 'FINANCE', username: 'finance', password: '123456', label: '财务' },
    { role: 'LEGAL', username: 'legal', password: '123456', label: '法务' },
    { role: 'SIGN_ADMIN', username: 'signadmin', password: '123456', label: '签署管理员' }
  ];

  for (const acc of accounts) {
    const r = await request('POST', '/api/auth/login', acc);
    if (r.status === 200 && r.data?.token) {
      TOKENS[acc.username] = r.data.token;
      SEED_CACHE[`user_${acc.username}`] = r.data.user;
      console.log(`   ✅ ${acc.label} (${acc.username}) 登录成功`);
    } else {
      console.error(`   ❌ ${acc.label} 登录失败:`, r.data?.error || r.raw);
      process.exit(1);
    }
  }

  // === 2. 获取租约列表 ===
  console.log('\n2️⃣  [数据准备] 查询租约与阈值...');
  const leaseResp = await request('GET', '/api/leases', null, TOKENS.housekeeper);
  const leases = leaseResp.data || [];
  console.log(`   📋 获取租约: ${leases.length} 条`);
  const findLease = (tenantName) => leases.find(l => l.tenantName.includes(tenantName));

  const overdueLease = findLease('王五');
  const tenant3Lease = findLease('赵六');
  const tenant1Lease = findLease('张三');

  if (overdueLease) console.log(`   📍 欠费租客租约: ${overdueLease.leaseNo}`);
  if (tenant3Lease) console.log(`   📍 场景2租约: ${tenant3Lease.leaseNo} (当前租金: ¥${tenant3Lease.currentRent})`);
  if (tenant1Lease) console.log(`   📍 场景3租约: ${tenant1Lease.leaseNo} (当前租金: ¥${tenant1Lease.currentRent})`);

  const thrResp = await request('GET', '/api/thresholds/active', null, TOKENS.finance);
  const threshold = thrResp.data;
  const maxRate = threshold ? threshold.maxIncreaseRate : 0.10;
  console.log(`   📊 当前租金涨幅阈值: ${(maxRate * 100).toFixed(2)}%`);
  SEED_CACHE.thresholdRate = maxRate;

  // ====== 场景 1：欠费租客发起续签被拒 ======
  addTest('场景1：欠费租客发起续签 → 应被拒绝', async () => {
    if (!overdueLease) return { passed: false, detail: '未找到欠费租约' };

    const beforeOverdueResp = await request('GET', `/api/leases/${overdueLease.id}/overdue-bills`, null, TOKENS.tenant_overdue);
    const bills = beforeOverdueResp.data || [];
    const totalOverdue = bills.reduce((s, b) => s + Number(b.overdueAmount || 0), 0);
    console.log(`      💰 欠费账单 ${bills.length} 笔，累计 ¥${totalOverdue.toFixed(2)}`);

    if (bills.length === 0 || totalOverdue <= 0) {
      return { passed: false, detail: `欠费数据异常：账单 ${bills.length} 笔，欠费 ¥${totalOverdue}` };
    }

    const r = await request('POST', '/api/renewals', {
      leaseId: overdueLease.id,
      expectedLeaseTerm: 12
    }, TOKENS.tenant_overdue);

    const status4xx = r.status === 400 || r.status === 403;
    const hasRejectedFlag = r.data?.rejected === true;
    const errorMsg = (r.data?.error || r.raw || '').toString();
    const mentionsOverdue = /欠费|overdue/i.test(errorMsg);
    const createdApp = r.data?.application;

    if (createdApp?.id) {
      const appStatus = createdApp.status;
      const isRejectedStatus = appStatus === 'OVERDUE_REJECTED';
      console.log(`      📝 创建了拒绝记录 appNo=${createdApp.appNo} status=${appStatus}`);

      const passed = (status4xx && hasRejectedFlag && mentionsOverdue && isRejectedStatus);
      return {
        passed,
        detail: passed
          ? `✅ 欠费 ¥${totalOverdue.toFixed(2)} 被正确拦截，状态=${appStatus}`
          : `HTTP ${r.status} rejected=${hasRejectedFlag} 消息=${errorMsg.slice(0, 60)} status=${appStatus}`
      };
    }

    return {
      passed: false,
      detail: `HTTP ${r.status} body=${JSON.stringify(r.data).slice(0, 100)}`
    };
  });

  // ====== 场景 2：超阈值涨租进入法务复核 ======
  addTest('场景2：超阈值涨租 → 必须先进入法务复核', async () => {
    if (!tenant3Lease) return { passed: false, detail: '未找到赵六租约' };

    console.log('      ① 先以赵六租客身份发起续签...');
    const r1 = await request('POST', '/api/renewals', {
      leaseId: tenant3Lease.id,
      expectedLeaseTerm: 12
    }, TOKENS.tenant3);

    let appId = null;
    if (r1.status === 200 && r1.data?.id) {
      appId = r1.data.id;
      console.log(`      ✅ 续签创建成功: ${r1.data.appNo} status=${r1.data.status}`);
    } else if (r1.data?.application?.id) {
      appId = r1.data.application.id;
    } else {
      return { passed: false, detail: '创建续签失败: HTTP ' + r1.status };
    }

    const prevRent = Number(tenant3Lease.currentRent);
    const exceedRate = maxRate + 0.01;
    const exceedRent = Math.ceil(prevRent * (1 + exceedRate));
    const normalRent = Math.ceil(prevRent * (1 + maxRate * 0.9));

    console.log(`      ② 管家创建租金方案 (超阈值: ¥${prevRent} → ¥${exceedRent}, 涨幅 ${(exceedRate * 100).toFixed(2)}% > ${(maxRate * 100).toFixed(2)}%)...`);
    const r2 = await request('POST', `/api/renewals/${appId}/rent-plans`, {
      proposedRent: exceedRent,
      leaseTermMonths: 12,
      notes: 'smoke test: exceeds threshold'
    }, TOKENS.housekeeper);

    const statusOK = r2.status === 200;
    const rateCheck = r2.data?.rateCheck || {};
    const exceedCheck = rateCheck.exceeds === true;
    const nextStatus = r2.data?.application?.status;
    const isLegalStatus = nextStatus === 'LEGAL_REVIEW_PENDING';

    console.log(`      rateCheck.exceeds=${rateCheck.exceeds} rate=${rateCheck.ratePercent}% threshold=${rateCheck.thresholdPercent}% status=${nextStatus}`);

    if (!(statusOK && exceedCheck && isLegalStatus)) {
      return {
        passed: false,
        detail: `超阈值未进入法务: HTTP=${r2.status} exceeds=${exceedCheck} status=${nextStatus}`
      };
    }

    console.log('      ③ 尝试越权操作：管家直接在法务复核态生成合同 → 应失败或状态不允许...');
    const r3 = await request('POST', `/api/renewals/${appId}/generate-contract`, {}, TOKENS.housekeeper);
    const illegalGenBlocked = r3.status !== 200;
    console.log(`      状态非复核通过时生成合同 HTTP=${r3.status} ${illegalGenBlocked ? '✅被拦住' : '❌未拦住'}`);

    console.log('      ④ 尝试越权：财务来做法务复核 → 应被拦住(非当前处理角色)...');
    const r4 = await request('POST', `/api/renewals/${appId}/legal-review`, { passed: true, comment: '越权测试' }, TOKENS.finance);
    const roleBlocked = r4.status === 403;
    console.log(`      财务越权复核 HTTP=${r4.status} ${roleBlocked ? '✅被拦住' : '⚠️ 未按角色拦'}`);

    console.log('      ⑤ 法务来复核通过...');
    const r5 = await request('POST', `/api/renewals/${appId}/legal-review`, { passed: true, comment: 'Smoke测试:法务复核通过(涨幅合理)' }, TOKENS.legal);
    const legalPassed = r5.status === 200 && r5.data?.status === 'LEGAL_REVIEW_PASSED';
    console.log(`      法务复核通过 HTTP=${r5.status} status=${r5.data?.status}`);

    const finalOK = statusOK && exceedCheck && isLegalStatus && legalPassed;
    return {
      passed: finalOK,
      detail: finalOK
        ? `超阈值 (${rateCheck.ratePercent}% > ${rateCheck.thresholdPercent}%) 成功路由至法务复核`
        : `状态链异常: exceeds=${exceedCheck} legalStatus=${isLegalStatus} legalPassed=${legalPassed}`
    };
  });

  // ====== 场景 3：重复生成合同只有1个有效版本 ======
  addTest('场景3：重复点击生成合同 → 只有1个有效版本', async () => {
    if (!tenant1Lease) return { passed: false, detail: '未找到张三租约' };

    console.log('      ① 先准备：以张三发起、管家做租金方案(不超阈值)...');
    const r1 = await request('POST', '/api/renewals', { leaseId: tenant1Lease.id, expectedLeaseTerm: 12 }, TOKENS.tenant1);
    let appId = r1.data?.id || r1.data?.application?.id;
    if (!appId) return { passed: false, detail: '创建续签失败' };

    const prevRent = Number(tenant1Lease.currentRent);
    const safeRent = Math.ceil(prevRent * (1 + maxRate * 0.5)); // 不超阈值
    await request('POST', `/api/renewals/${appId}/rent-plans`, {
      proposedRent: safeRent,
      leaseTermMonths: 12,
      notes: 'smoke test: no exceed'
    }, TOKENS.housekeeper);

    console.log('      ② 连续并发调用3次 /generate-contract ...');
    const promises = [1, 2, 3].map(i =>
      request('POST', `/api/renewals/${appId}/generate-contract`, { expectedVersion: 99 }, TOKENS.housekeeper)
        .then(r => ({ idx: i, status: r.status, data: r.data }))
        .catch(err => ({ idx: i, status: -1, error: err.message }))
    );
    const outcomes = await Promise.all(promises);

    for (const o of outcomes) {
      console.log(`      调用${o.idx} → HTTP ${o.status} ${o.status === 200 ? '成功' : o.status === 409 ? '冲突(被拦)' : '其他'} 消息=${(o.data?.error || o.data?.contract?.contractNo || '').toString().slice(0, 80)}`);
    }

    const successCount = outcomes.filter(o => o.status === 200).length;
    const blockedCount = outcomes.filter(o => o.status === 409).length;
    console.log(`      成功: ${successCount} 次 | 被409拦截: ${blockedCount} 次`);

    console.log('      ③ 查询该续签下所有合同版本，验证 isEffective=true 的数量...');
    const detailResp = await request('GET', `/api/renewals/${appId}`, null, TOKENS.housekeeper);
    const versions = detailResp.data?.contractVersions || [];
    const effective = versions.filter(v => v.isEffective);
    const nonEffective = versions.filter(v => !v.isEffective);

    console.log(`      总合同版本: ${versions.length}`);
    versions.forEach(v => {
      console.log(`        - ${v.contractNo} V${v.versionNo} isEffective=${v.isEffective} status=${v.status} 废弃原因=${(v.obsoletedReason || '').slice(0, 20)}`);
    });
    console.log(`      ✅ 有效版本数量: ${effective.length} / ${versions.length}`);

    const onlyOneEffective = effective.length === 1;
    const noZeroEffective = effective.length > 0;
    const blockedSomething = successCount === 1 && (blockedCount >= 1 || versions.length === successCount);

    const passed = onlyOneEffective && noZeroEffective;
    return {
      passed,
      detail: passed
        ? `有效版本 ${effective.length} 个 (唯一有效V${effective[0]?.versionNo})，成功生成 ${successCount} 次，重复被拦截 ${blockedCount} 次`
        : `有效版本数异常：共 ${versions.length} 个版本，其中 isEffective=${effective.length} 个 (应为1)`
    };
  });

  // 执行全部测试
  console.log('\n' + '='.repeat(70));
  console.log('🎯 开始执行 3 个核心验证场景');
  console.log('='.repeat(70));

  for (const t of TESTS) {
    console.log('\n' + '─'.repeat(60));
    console.log(`▶ ${t.name}`);
    let result;
    const t0 = Date.now();
    try {
      result = await t.fn();
    } catch (e) {
      result = { passed: false, detail: `异常: ${e.message}\n${e.stack?.split('\n').slice(0, 3).join('\n')}` };
    }
    const duration = Date.now() - t0;
    const icon = result.passed ? '✅' : '❌';
    console.log(`   ${icon}  结果: ${result.passed ? 'PASS' : 'FAIL'}`);
    console.log(`      说明: ${result.detail}`);
    console.log(`      耗时: ${duration}ms`);
    RESULTS.push({
      name: t.name,
      passed: result.passed,
      detail: result.detail,
      duration
    });
  }

  // 汇总
  console.log('\n' + '='.repeat(70));
  console.log('📊 SMOKE 测试结果汇总');
  console.log('='.repeat(70));

  const passed = RESULTS.filter(r => r.passed).length;
  const failed = RESULTS.length - passed;

  RESULTS.forEach((r, i) => {
    const icon = r.passed ? '✅' : '❌';
    console.log(`  ${icon}  ${i + 1}. ${r.name}`);
    if (!r.passed) console.log(`     ❗  ${r.detail}`);
  });

  console.log();
  console.log(`通过: ${passed}/${RESULTS.length}   失败: ${failed}/${RESULTS.length}`);
  console.log();

  if (failed === 0) {
    console.log('🎉🎉🎉 全部场景通过！系统可以正常使用。');
    process.exit(0);
  } else {
    console.log('⚠️  部分场景未通过，请检查后端日志或种子数据是否完整。');
    console.log('   建议：先执行 npm run seed 初始化种子数据，再 npm run dev:server 启动后端。');
    process.exit(1);
  }
}

run().catch(e => {
  console.error('Fatal:', e);
  process.exit(2);
});
