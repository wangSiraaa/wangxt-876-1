export const STATUS_LABELS = {
  DRAFT: { text: '草稿', color: 'default' },
  PENDING_OVERDUE_CHECK: { text: '待欠费校验', color: 'processing' },
  OVERDUE_REJECTED: { text: '欠费被拒', color: 'error' },
  OVERDUE_PASSED: { text: '欠费校验通过', color: 'success' },
  RENT_PLAN_CREATED: { text: '租金方案已生成', color: 'blue' },
  NEGOTIATING: { text: '租金协商中', color: 'orange' },
  LEGAL_REVIEW_PENDING: { text: '待法务复核', color: 'purple' },
  LEGAL_REVIEW_REJECTED: { text: '法务复核驳回', color: 'error' },
  LEGAL_REVIEW_PASSED: { text: '法务复核通过', color: 'success' },
  CONTRACT_GENERATING: { text: '合同生成中', color: 'processing' },
  CONTRACT_GENERATED: { text: '合同已生成', color: 'cyan' },
  SIGNING_PENDING: { text: '待签署', color: 'gold' },
  SIGNED: { text: '已签署', color: 'success' },
  ARCHIVED: { text: '已归档', color: 'default' },
  CANCELLED: { text: '已取消', color: 'default' }
};

export const SIGN_STATUS_LABELS = {
  DRAFT: { text: '草稿', color: 'default' },
  OBSOLETE: { text: '已废弃', color: 'default' },
  PENDING_SIGN: { text: '待签署', color: 'warning' },
  PARTIALLY_SIGNED: { text: '部分签署', color: 'processing' },
  FULLY_SIGNED: { text: '全部签署', color: 'success' },
  ARCHIVED: { text: '已归档', color: 'default' }
};

export const SIGN_PARTY_LABELS = {
  TENANT: '租客',
  COMPANY_LEGAL: '公司法务',
  SIGN_ADMIN: '签署管理员'
};

export const SIGN_STATE_LABELS = {
  PENDING: { text: '待签', color: 'default' },
  SIGNED: { text: '已签', color: 'success' },
  REJECTED: { text: '拒签', color: 'error' }
};

export const ATTACHMENT_TYPE_LABELS = {
  ID_CARD: '身份证件',
  BUSINESS_LICENSE: '营业执照',
  RENT_CERT: '租房完税证明',
  PROOF_OF_PAYMENT: '付款凭证',
  CONTRACT_DRAFT: '合同草稿',
  CONTRACT_SIGNED: '已签合同',
  LEGAL_OPINION: '法律意见书',
  OTHER: '其他'
};

export const REMINDER_LEVEL_LABELS = {
  INFO: { text: '通知', color: 'blue' },
  WARNING: { text: '警告', color: 'orange' },
  URGENT: { text: '紧急', color: 'red' }
};

export const NEGOTIATION_TYPE_LABELS = {
  TENANT_OFFER: '租客报价',
  HOUSEKEEPER_OFFER: '管家报价',
  AGREEMENT: '双方确认'
};
