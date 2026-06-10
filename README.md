# 房屋租赁合同续签全栈管理系统

一套完整的房屋租赁合同续签 Web 应用，覆盖**角色入口、数据模型、状态流转、业务规则拦截、合同版本化、到期提醒、审计日志**等全链路能力。

---

## 一、技术架构

| 层级 | 技术栈 | 说明 |
|------|--------|------|
| **前端** | React 18 + Vite 5 + Ant Design 5 + React Router 6 + dayjs + axios | SPA 单页应用，Vite 代理 /api 到后端 |
| **后端** | Node.js + Express 4 + Sequelize ORM + SQLite3 + JWT + bcrypt + multer | 零配置启动，SQLite 免 DB 容器 |
| **部署** | Docker Compose 双容器（server:3000 / client:8080） | 一键 `docker-compose up` |
| **测试** | 原生 Node `http` 模块编写 smoke 脚本 | 无第三方依赖，CI 友好 |

```
┌──────────────────┐     /api      ┌──────────────────┐
│  Client (Vite)   │──────────────▶│  Server (Express)│
│  :5173 (dev)     │   反向代理    │  :3000           │
│  :8080 (docker)  │               │  SQLite 文件     │
└──────────────────┘               └────────┬─────────┘
                                            │
                                    ┌───────▼───────┐
                                    │  业务规则引擎 │
                                    │  (状态机+校验) │
                                    └───────────────┘
```

---

## 二、角色系统（5 种）

| 角色枚举 | 中文名 | 典型职责 |
|----------|--------|----------|
| `TENANT` | 租客 | 查看租约、发起续签、查看租金方案、合同签署（第一方） |
| `HOUSEKEEPER` | 管家 | 创建租金方案、发起协商、催办流程、上传附件 |
| `FINANCE` | 财务 | 确认欠费已缴清、复核租金金额 |
| `LEGAL` | 法务 | 超阈值涨租复核、合同条款审核、签署（第二方：公司法人） |
| `SIGN_ADMIN` | 签署管理员 | 最终签章、归档（第三方：签署管理员） |

---

## 三、核心数据实体（11 + 1 用户表）

| 实体 | 表名关键字段 | 说明 |
|------|-------------|------|
| **租约 Lease** | `leaseNo / currentRent / endDate / status` | 原始房屋租赁合同 |
| **续签申请 RenewalApplication** | `status / currentHandlerRole / version` | 核心流程载体，18 种状态 + 乐观锁 |
| **欠费账单 OverdueBill** | `billNo / overdueAmount / status` | OVERDUE / PARTIAL / PAID |
| **租金方案 RentPlan** | `newRent / increaseRate / exceedsThreshold / planVersion` | 涨幅超过 10% 自动标红进入法务复核 |
| **涨幅阈值 Threshold** | `maxIncreaseRate / isActive / legalReviewRequired` | 默认 10%，可配置 |
| **协商记录 Negotiation** | `type / content / counterRent` | 管家↔租客沟通留痕 |
| **附件 Attachment** | `fileName / filePath / category / isRequired` | 签署必备附件（身份证明、产权证明等） |
| **合同版本 ContractVersion** | `contractNo / versionNo / isEffective / content` | 同租约仅 1 个 `isEffective=true` 的版本 |
| **签署状态 SignState** | `signParty / signOrder / signedAt` | 三方顺序签署：TENANT → COMPANY_LEGAL → SIGN_ADMIN |
| **到期提醒 ExpiryReminder** | `level (90/60/30/15/7天) / status / remindDate` | 按种子日期稳定展示 |
| **审计日志 AuditLog** | `action / operatorRole / beforeValue / afterValue` | 全链路操作留痕 |
| **用户 User** | `username / role / passwordHash` | 上述 5 种角色账号 |

---

## 四、主流程（9 步状态机）

```
 ┌─────────────┐   ┌─────────────┐   ┌─────────────┐   ┌─────────────┐   ┌──────────────┐
 │  DRAFT      │──▶│  OVERDUE    │──▶│  RENT_PLAN  │──▶│ NEGOTIATION │──▶│ LEGAL_REVIEW │
 │  (草稿)     │   │  CHECKED    │   │  PROPOSED   │   │  IN_PROGRESS│   │   PENDING    │
 └─────────────┘   └─────────────┘   └──────┬──────┘   └─────────────┘   └──────┬───────┘
           │欠费校验通过             涨租≤阈值 │                                    │涨租>阈值
           │                                  ▼                                    ▼
           │                           ┌──────────────┐                     ┌──────────────┐
           │                           │CONTRACT_GEN  │◀────────────────────│ LEGAL_REVIEW │
           │                           │  PENDING     │   法务通过           │   APPROVED   │
           │                           └──────┬──────┘                     └──────────────┘
           │                                  │
           ▼                                  ▼
    ┌─────────────┐                   ┌──────────────┐    ┌──────────────┐    ┌──────────┐
    │ REJECTED    │                   │  SIGNING     │───▶│  SIGNED_ALL  │───▶│ ARCHIVED │
    │ (欠费拒绝)  │                   │  三方签署中   │    │  全部签署    │    │  已归档  │
    └─────────────┘                   └──────────────┘    └──────────────┘    └──────────┘
```

**关键分支：**
- 流程第 2 步欠费校验不通过 → 直接跳到 `REJECTED`（场景 1）
- 租金方案涨幅 > 阈值（默认 10%）→ 必须经过 `LEGAL_REVIEW_PENDING → LEGAL_REVIEW_APPROVED`（场景 2）
- `CONTRACT_GEN_PENDING` 之后修改租金方案 → 自动废弃旧合同版本（`isEffective=false`）

---

## 五、5 大业务规则拦截

| 编号 | 规则 | 拦截位置 | 错误码/表现 |
|------|------|----------|------------|
| 1 | **欠费租客不能发起续签** | `POST /renewals` 创建时 `checkOverdue()` | HTTP 400，status=REJECTED |
| 2 | **涨租超阈值必走法务复核** | `POST /:id/rent-plans` 自动变 `LEGAL_REVIEW_PENDING` | 非法务角色点击「复核通过」返回 403 |
| 3 | **已生成合同后改方案→废弃旧版本** | 新建租金方案时 `obsoleteExistingContracts()` | 旧版本 `isEffective=false`，新版本号+1 |
| 4 | **缺必要附件不能签署** | `POST /:id/prepare-signing` `checkRequiredAttachments()` | 返回 `missingAttachments` 列表 |
| 5 | **非当前角色越权拦截** | 每步操作前 `checkHandlerPermission()` | HTTP 403 Forbidden |

**额外保障：**
- **重复生成合同拦截**：`POST /:id/generate-contract` 时 `hasEffectiveContract()` 检查，存在则返回 409 Conflict；同时数据库层面版本号乐观锁。
- **三方顺序签署**：签署状态机按 `signOrder` 检查，前一方未签完后面不能签。

---

## 六、启动方式

### 方式 A：本地开发（推荐调试）

```bash
# 1. 安装依赖（前后端一起装）
npm run install:all

# 2. 初始化种子数据（会 force: true 重建表 + 插入用户/租约/提醒）
npm run seed

# 3. 启动后端 (端口 3000)
npm run dev:server

# 4. 【新开终端】启动前端 (端口 5173，自动代理 /api -> :3000)
npm run dev:client

# 5. 【第三终端】执行 smoke 测试（验证 3 大场景）
npm run smoke
```

### 方式 B：Docker Compose 一键启动

```bash
# 构建并启动（server :3000 / client :8080）
npm run docker:up
# 或 docker-compose up -d

# 停止容器
npm run docker:down
```

启动后访问：
- 前端：`http://localhost:5173`（开发模式）或 `http://localhost:8080`（Docker 模式）
- 后端 API：`http://localhost:3000/api`
- 健康检查：`curl http://localhost:3000/api/auth/roles`

---

## 七、测试账号清单（密码统一 `123456`）

> 登录页顶部有 **7 个一键登录快捷按钮**，点击即可切换角色体验。

| 用户名 | 角色 | 姓名 | 典型场景 |
|--------|------|------|----------|
| `tenant1` | 租客 | 张三 | 正常租约，30 天内到期，可发起续签 |
| `tenant2` | 租客 | 李四 | 60 天到期 |
| **`tenant_overdue`** | 租客 | **王五(欠费)** | **¥20,000 欠费，发起续签会被拒绝（场景 1）** |
| `tenant3` | 租客 | 赵六 | 90 天到期 |
| `housekeeper` | 管家 | 管家小林 | 创建租金方案、发起协商 |
| `finance` | 财务 | 财务陈姐 | 确认欠费清理、金额复核 |
| `legal` | 法务 | 法务刘律 | **超阈值涨租复核（场景 2）** |
| `signadmin` | 签署管理员 | 签管周总 | 最终签署签章 + 归档 |

---

## 八、Smoke 测试说明

脚本：`scripts/smoke.js`（纯 Node 原生 `http`，无第三方依赖）

```bash
npm run smoke
```

**3 个核心断言场景：**

| 场景 | 测试步骤 | 核心断言 |
|------|----------|----------|
| **场景 1：欠费租客发起续签被拒绝** | `tenant_overdue` 登录 → `POST /api/renewals` 选自己的欠费租约 | HTTP 4xx 且 `status=REJECTED` 且 `rejectionReason` 包含「欠费」 |
| **场景 2：超阈值涨租进入法务复核** | 管家创建租金方案（涨 15% > 阈值 10%）→ `HOUSEKEEPER` 点复核被 403 → `LEGAL` 复核通过 | 状态正确变为 `LEGAL_REVIEW_PENDING` → `LEGAL_REVIEW_APPROVED`，越权返回 403 |
| **场景 3：重复生成合同只有一个有效版本** | 对同一条续签**并发** `POST /generate-contract` 3 次 | 最终 `isEffective=true` 的记录数 `=== 1`，其他被自动废弃或 409 Conflict |

控制台输出 PASS/FAIL，失败时打印 HTTP 响应原文便于调试。

---

## 九、前端页面一览

| 页面路径 | 功能 | 亮点 |
|----------|------|------|
| `/login` | 登录页 | 渐变背景 + 7 个角色快捷登录 |
| `/dashboard` | 仪表盘 | 5 个统计卡片 + 到期提醒列表 + 续签动态时间线 |
| `/leases` | 租约列表 | 「发起续签」按钮 + 欠费账单模态框查看 |
| `/renewals` | 续签列表 | 状态筛选 + 角色视图（租客只看自己的） |
| `/renewals/:id` | **续签详情页（核心）** | 10 步 Steps 流程条 + 租金方案卡片（超阈值红边框）+ 协商时间线 + 合同版本列表（有效版蓝边框、签署进度）+ 附件区（缺失高亮）+ 动态动作按钮栏（越权按钮不显示） |
| `/thresholds` | 涨幅阈值配置 | 激活阈值切换，版本化管理 |
| `/reminders` | 到期提醒全表 | 90/60/30/15/7 天多等级展示，基于种子日期稳定不漂移 |

---

## 十、目录结构

```
876/
├── package.json              # 根 package，统一脚本入口
├── docker-compose.yml        # 双容器编排
├── Dockerfile                # 后端镜像（启动时自动 seed）
├── Dockerfile.client         # 前端镜像（两阶段构建 + serve）
├── README.md                 # 本文档
├── scripts/
│   └── smoke.js              # 核心 3 场景 smoke 测试
├── server/
│   ├── package.json
│   └── src/
│       ├── app.js            # Express 入口
│       ├── db/index.js       # Sequelize SQLite 连接
│       ├── models/           # 12 个数据模型 + index.js 关联配置
│       ├── middleware/auth.js# JWT + requireRole + 审计日志
│       ├── services/businessRules.js  # ⭐ 核心规则引擎（8 大校验函数）
│       ├── routes/           # auth / lease / renewal / attachment / threshold
│       ├── utils/generators.js
│       └── seeders/initData.js
└── client/
    ├── package.json
    ├── vite.config.js
    └── src/
        ├── main.jsx / App.jsx
        ├── index.css
        ├── context/AuthContext.jsx
        ├── utils/{api.js, constants.js}
        └── pages/            # Login / Dashboard / LeaseList / RenewalList + Detail / Threshold / Reminders
```

---

## 十一、常见问题

**Q1: SQLite 数据库文件在哪？**
A: `server/lease_renewal.sqlite`，删除后重新 `npm run seed` 即可重置。

**Q2: 修改了种子数据后如何生效？**
A: 重新执行 `npm run seed`（`sequelize.sync({ force: true })` 会清空重建）。

**Q3: Docker 启动后前端访问不到？**
A: 确认 server 健康检查通过（`docker-compose ps`），访问 `http://localhost:8080`。

**Q4: 想调整租金阈值？**
A: 法账号登录后进入「涨幅阈值配置」页，新建阈值并激活即可（旧的自动变 inactive）。

**Q5: 怎么模拟并发点击生成合同？**
A: 直接跑 smoke 场景 3，脚本里用 `Promise.all([req1, req2, req3])` 并发请求。
