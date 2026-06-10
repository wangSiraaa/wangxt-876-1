import React, { useEffect, useState, useCallback } from 'react';
import {
  Card, Row, Col, Tag, Button, Space, Divider, Typography, Timeline, List, Modal,
  Form, Input, InputNumber, Upload, Select, Table, Steps, Descriptions, Progress,
  App as AntdApp, Avatar
} from 'antd';
import {
  ArrowLeftOutlined, EditOutlined, UploadOutlined, FileTextOutlined,
  SaveOutlined, CheckCircleOutlined, CloseCircleOutlined, ThunderboltOutlined,
  SafetyCertificateOutlined, DeleteOutlined, UserOutlined, CalendarOutlined,
  ExclamationCircleOutlined, ClockCircleOutlined, TeamOutlined, SendOutlined,
  EyeOutlined, DownloadOutlined
} from '@ant-design/icons';
import { useNavigate, useParams } from 'react-router-dom';
import axios from '../utils/api';
import dayjs from 'dayjs';
import { useAuth, ROLE_LABELS } from '../context/AuthContext.jsx';
import {
  STATUS_LABELS, SIGN_STATUS_LABELS, SIGN_PARTY_LABELS, SIGN_STATE_LABELS,
  ATTACHMENT_TYPE_LABELS, NEGOTIATION_TYPE_LABELS
} from '../utils/constants.js';

const { Title, Text } = Typography;
const { TextArea } = Input;
const { Step } = Steps;

const WORKFLOW_STEPS = [
  { key: 'DRAFT', title: '发起', desc: '提交续签申请' },
  { key: 'OVERDUE_PASSED', title: '欠费校验', desc: '确认无欠费' },
  { key: 'RENT_PLAN_CREATED', title: '租金方案', desc: '确定租金涨幅' },
  { key: 'NEGOTIATING', title: '租金协商', desc: '双方达成一致' },
  { key: 'LEGAL_REVIEW_PENDING', title: '法务复核', desc: '超阈值审核' },
  { key: 'LEGAL_REVIEW_PASSED', title: '复核通过', desc: '法务同意' },
  { key: 'CONTRACT_GENERATED', title: '合同生成', desc: '生成正式合同' },
  { key: 'SIGNING_PENDING', title: '签署', desc: '三方签字盖章' },
  { key: 'SIGNED', title: '完成签署', desc: '全部签署完成' },
  { key: 'ARCHIVED', title: '归档', desc: '流程结束' }
];

const STATUS_STEP_MAP = {
  DRAFT: 0,
  PENDING_OVERDUE_CHECK: 0,
  OVERDUE_REJECTED: 0,
  OVERDUE_PASSED: 1,
  RENT_PLAN_CREATED: 2,
  NEGOTIATING: 3,
  LEGAL_REVIEW_PENDING: 4,
  LEGAL_REVIEW_REJECTED: 3,
  LEGAL_REVIEW_PASSED: 5,
  CONTRACT_GENERATED: 6,
  CONTRACT_GENERATING: 6,
  SIGNING_PENDING: 7,
  SIGNED: 8,
  ARCHIVED: 9,
  CANCELLED: -1
};

export default function RenewalDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { message, modal } = AntdApp.useApp();
  const { user, roleLabel } = useAuth();

  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');
  const [threshold, setThreshold] = useState(null);
  const [attachCheck, setAttachCheck] = useState(null);

  const loadDetail = useCallback(async () => {
    setLoading(true);
    try {
      const [d, t, a] = await Promise.all([
        axios.get(`/renewals/${id}`),
        axios.get('/thresholds/active').catch(() => ({ data: null })),
        axios.get(`/renewals/${id}/required-attachments-check`).catch(() => ({ data: null }))
      ]);
      setDetail(d.data);
      setThreshold(t.data);
      setAttachCheck(a.data);
    } catch (e) {
      message.error(e.response?.data?.error || '加载失败');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadDetail();
  }, [loadDetail]);

  if (!detail) return <div className="empty-state">加载中...</div>;

  const currentStep = STATUS_STEP_MAP[detail.status] ?? 0;
  const isLegalState = detail.status === 'LEGAL_REVIEW_PENDING';
  const hasEffectiveContract = (detail.contractVersions || []).some(c => c.isEffective);

  // === 动作函数 ===
  const doSubmitOverdueCheck = async () => {
    try {
      await axios.post(`/renewals/${id}/submit-for-overdue-check`);
      message.success('欠费校验完成');
      loadDetail();
    } catch (e) {
      if (e.response?.data?.rejected) {
        message.warning(e.response.data.error);
        loadDetail();
      } else {
        message.error(e.response?.data?.error || '操作失败');
      }
    }
  };

  const [rentPlanModal, setRentPlanModal] = useState(false);
  const [rentPlanForm] = Form.useForm();
  const showRentPlanModal = () => {
    const plan = (detail.rentPlans || [])[0];
    const prev = detail.lease?.currentRent || 0;
    rentPlanForm.setFieldsValue({
      proposedRent: plan?.proposedRent || prev,
      leaseTermMonths: plan?.leaseTermMonths || 12,
      notes: plan?.notes || ''
    });
    setRentPlanModal(true);
  };

  const doCreateRentPlan = async () => {
    try {
      const values = await rentPlanForm.validateFields();
      const resp = await axios.post(`/renewals/${id}/rent-plans`, values);
      setRentPlanModal(false);
      if (resp.data.rateCheck?.exceeds) {
        message.warning(`租金涨幅 ${resp.data.rateCheck.ratePercent}% 超过阈值 ${resp.data.rateCheck.thresholdPercent}%，已自动进入法务复核`);
      } else {
        message.success('租金方案创建成功');
      }
      loadDetail();
    } catch (e) {
      message.error(e.response?.data?.error || '创建失败');
    }
  };

  const [negotiationModal, setNegotiationModal] = useState(false);
  const [negForm] = Form.useForm();
  const showNegotiationModal = () => {
    negForm.resetFields();
    const prev = detail.lease?.currentRent || 0;
    negForm.setFieldsValue({ offeredRent: prev, type: user.role === 'TENANT' ? 'TENANT_OFFER' : 'HOUSEKEEPER_OFFER' });
    setNegotiationModal(true);
  };
  const doNegotiation = async () => {
    try {
      const values = await negForm.validateFields();
      const lastPlan = (detail.rentPlans || [])[0];
      await axios.post(`/renewals/${id}/negotiations`, {
        ...values,
        rentPlanId: lastPlan?.id || null
      });
      setNegotiationModal(false);
      message.success('协商记录已提交');
      loadDetail();
    } catch (e) {
      message.error(e.response?.data?.error || '提交失败');
    }
  };

  const doLegalReview = async (passed) => {
    modal.confirm({
      title: passed ? '法务复核通过' : '法务复核驳回',
      content: (
        <Form layout="vertical">
          <Form.Item name="comment" label={passed ? '通过意见' : '驳回理由'} rules={[{ required: !passed, message: '请填写理由' }]}>
            <TextArea rows={4} id="legal-comment" placeholder="请填写复核意见" />
          </Form.Item>
        </Form>
      ),
      onOk: async () => {
        const comment = document.getElementById('legal-comment')?.value || '';
        try {
          await axios.post(`/renewals/${id}/legal-review`, { passed, comment });
          message.success(passed ? '复核通过' : '已驳回');
          loadDetail();
        } catch (e) {
          message.error(e.response?.data?.error || '操作失败');
        }
      }
    });
  };

  const doGenerateContract = async () => {
    try {
      const resp = await axios.post(`/renewals/${id}/generate-contract`, {
        expectedVersion: detail.version + 1
      });
      message.success(`合同生成成功，版本 V${resp.data.contract.versionNo}`);
      loadDetail();
    } catch (e) {
      if (e.response?.status === 409) {
        message.warning(e.response.data.error);
        loadDetail();
      } else {
        message.error(e.response?.data?.error || '生成失败');
      }
    }
  };

  const doPrepareSigning = async () => {
    try {
      await axios.post(`/renewals/${id}/prepare-signing`);
      message.success('已进入签署阶段');
      loadDetail();
    } catch (e) {
      const err = e.response?.data;
      if (err?.missing) {
        modal.error({
          title: '缺少必要附件',
          content: (
            <div>
              <p>进入签署前必须上传以下附件：</p>
              <ul>
                {(err.requiredTypes || []).map(t => (
                  <li key={t}>
                    {ATTACHMENT_TYPE_LABELS[t] || t}
                    {err.missing.includes(t) && <Tag color="red" style={{ marginLeft: 8 }}>缺失</Tag>}
                    {!err.missing.includes(t) && <Tag color="green" style={{ marginLeft: 8 }}>已上传</Tag>}
                  </li>
                ))}
              </ul>
            </div>
          )
        });
      } else {
        message.error(err?.error || '操作失败');
      }
    }
  };

  const doSign = async (party, contract) => {
    try {
      await axios.post(`/renewals/${id}/sign/${contract.id}`, {
        party,
        comment: '系统自动签署标记',
        signature: `SIGNED_${party}_${Date.now()}`
      });
      message.success(`${SIGN_PARTY_LABELS[party]}签署完成`);
      loadDetail();
    } catch (e) {
      if (e.response?.status === 403) {
        message.error(e.response.data.error || '越权操作，非当前处理角色不得签署');
      } else {
        message.error(e.response?.data?.error || '签署失败');
      }
    }
  };

  const doArchive = async () => {
    modal.confirm({
      title: '确认归档？',
      content: '归档后流程正式结束，所有文件不可修改。',
      onOk: async () => {
        try {
          await axios.post(`/renewals/${id}/archive`);
          message.success('归档成功，流程结束');
          loadDetail();
        } catch (e) {
          message.error(e.response?.data?.error || '归档失败');
        }
      }
    });
  };

  const doCancel = async () => {
    modal.confirm({
      title: '取消续签申请？',
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await axios.post(`/renewals/${id}/cancel`);
          message.warning('续签已取消');
          loadDetail();
        } catch (e) {
          message.error(e.response?.data?.error || '取消失败');
        }
      }
    });
  };

  const handleUpload = async ({ file }) => {
    const type = file?.type || 'OTHER';
    const category = ['ID_CARD', 'RENT_CERT', 'CONTRACT_DRAFT'].includes(type)
      ? 'REQUIRED_FOR_SIGN' : 'REFERENCE';
    const formData = new FormData();
    formData.append('file', file);
    formData.append('type', type);
    formData.append('category', category);
    try {
      await axios.post(`/attachments/renewal/${id}`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      message.success('附件上传成功');
      loadDetail();
    } catch (e) {
      message.error(e.response?.data?.error || '上传失败');
    }
    return true;
  };

  const handleDeleteAttachment = async (att) => {
    modal.confirm({
      title: '删除附件？',
      onOk: async () => {
        try {
          await axios.delete(`/attachments/${att.id}`);
          message.success('已删除');
          loadDetail();
        } catch (e) {
          message.error(e.response?.data?.error || '删除失败');
        }
      }
    });
  };

  const statusInfo = STATUS_LABELS[detail.status] || { text: detail.status, color: 'default' };

  // 根据状态和角色确定可见的动作按钮
  function renderActions() {
    const actions = [];
    const s = detail.status;
    const role = user.role;
    const canTenant = role === 'TENANT' && detail.tenantId === user.id;
    const canHousekeeper = role === 'HOUSEKEEPER';
    const canFinance = role === 'FINANCE';
    const canLegal = role === 'LEGAL';
    const canSignAdmin = role === 'SIGN_ADMIN';

    if (s === 'DRAFT') {
      if (canTenant) actions.push({ label: '提交欠费校验', type: 'primary', onClick: doSubmitOverdueCheck, icon: <CheckCircleOutlined /> });
    }
    if (s === 'OVERDUE_PASSED' || s === 'RENT_PLAN_CREATED' || s === 'NEGOTIATING' || s === 'LEGAL_REVIEW_REJECTED') {
      if (canHousekeeper) {
        actions.push({ label: hasEffectiveContract ? '重新生成租金方案(将废弃旧合同)' : (detail.rentPlans?.length ? '更新租金方案' : '生成租金方案'), type: 'primary', onClick: showRentPlanModal, icon: <EditOutlined /> });
      }
      if (s === 'RENT_PLAN_CREATED' || s === 'NEGOTIATING') {
        if (canHousekeeper || canTenant) {
          actions.push({ label: '发起协商', onClick: showNegotiationModal, icon: <TeamOutlined /> });
        }
      }
      if (s === 'LEGAL_REVIEW_PASSED' || (s === 'RENT_PLAN_CREATED' && !detail.rentPlans?.[0]?.exceedsThreshold)) {
        if (canHousekeeper) {
          actions.push({ label: hasEffectiveContract ? '已有有效合同' : '生成合同', type: hasEffectiveContract ? 'default' : 'primary', onClick: doGenerateContract, icon: <FileTextOutlined />, disabled: hasEffectiveContract });
        }
      }
    }
    if (s === 'LEGAL_REVIEW_PENDING') {
      if (canLegal) {
        actions.push({ label: '法务复核通过', type: 'primary', onClick: () => doLegalReview(true), icon: <CheckCircleOutlined /> });
        actions.push({ label: '法务复核驳回', danger: true, onClick: () => doLegalReview(false), icon: <CloseCircleOutlined /> });
      }
    }
    if (s === 'CONTRACT_GENERATED') {
      if (canHousekeeper) {
        actions.push({ label: '进入签署阶段', type: 'primary', onClick: doPrepareSigning, icon: <SafetyCertificateOutlined /> });
        actions.push({ label: '生成租金方案(废弃当前合同)', onClick: showRentPlanModal, icon: <EditOutlined /> });
      }
    }
    if (s === 'SIGNING_PENDING') {
      const contract = (detail.contractVersions || []).find(c => c.isEffective);
      if (contract) {
        (contract.signStates || []).forEach(ss => {
          let canSignHere = false;
          if (ss.party === 'TENANT' && canTenant) canSignHere = true;
          if (ss.party === 'COMPANY_LEGAL' && canLegal) canSignHere = true;
          if (ss.party === 'SIGN_ADMIN' && canSignAdmin) canSignHere = true;
          if (canSignHere && ss.status !== 'SIGNED') {
            actions.push({
              label: `我来签 - ${SIGN_PARTY_LABELS[ss.party]}`,
              type: 'primary',
              icon: <SafetyCertificateOutlined />,
              onClick: () => doSign(ss.party, contract)
            });
          }
        });
      }
    }
    if (s === 'SIGNED') {
      if (canFinance) {
        actions.push({ label: '归档', type: 'primary', onClick: doArchive, icon: <SaveOutlined /> });
      }
    }
    if (!['ARCHIVED', 'CANCELLED', 'SIGNED'].includes(s)) {
      actions.push({ label: '取消申请', danger: true, onClick: doCancel, icon: <CloseCircleOutlined /> });
    }
    return actions;
  }

  const actions = renderActions();

  return (
    <div>
      <div className="page-header">
        <Space>
          <Button onClick={() => navigate('/renewals')} icon={<ArrowLeftOutlined />}>返回列表</Button>
          <Title level={3} style={{ margin: 0 }}>
            <ThunderboltOutlined style={{ color: '#1677ff', marginRight: 8 }} />
            {detail.appNo}
            <Tag color={statusInfo.color} style={{ marginLeft: 12 }}>{statusInfo.text}</Tag>
          </Title>
        </Space>
        <Space className="action-toolbar">
          <Button onClick={loadDetail}>刷新</Button>
          {actions.map((a, i) => (
            <Button key={i} type={a.type || 'default'} danger={a.danger} icon={a.icon} onClick={a.onClick} disabled={a.disabled}>
              {a.label}
            </Button>
          ))}
        </Space>
      </div>

      <div className="page-card" style={{ marginBottom: 16 }}>
        <Steps
          current={Math.max(0, currentStep)}
          status={currentStep < 0 ? 'error' : 'process'}
          size="small"
          style={{ marginBottom: 16 }}
          items={WORKFLOW_STEPS.map(s => ({ title: s.title, description: s.desc }))}
        />
        <Descriptions column={4} size="small" bordered>
          <Descriptions.Item label="申请编号">{detail.appNo}</Descriptions.Item>
          <Descriptions.Item label="租客">{detail.tenantName}</Descriptions.Item>
          <Descriptions.Item label="物业地址" span={2}>{detail.propertyAddr}</Descriptions.Item>
          <Descriptions.Item label="申请日期">{dayjs(detail.applyDate).format('YYYY-MM-DD')}</Descriptions.Item>
          <Descriptions.Item label="期望租期">{detail.expectedLeaseTerm}个月</Descriptions.Item>
          <Descriptions.Item label="当前处理角色">
            {detail.currentHandlerRole
              ? <Tag color="blue">{ROLE_LABELS[detail.currentHandlerRole] || detail.currentHandlerRole}</Tag>
              : <Tag>—</Tag>}
          </Descriptions.Item>
          <Descriptions.Item label="版本号">v{detail.version}</Descriptions.Item>
          <Descriptions.Item label="管家">{detail.housekeeperName || '—'}</Descriptions.Item>
          <Descriptions.Item label="财务">{detail.financeName || '—'}</Descriptions.Item>
          <Descriptions.Item label="法务">{detail.legalName || '—'}</Descriptions.Item>
          <Descriptions.Item label="签署管理员">{detail.signAdminName || '—'}</Descriptions.Item>
        </Descriptions>
      </div>

      <Row gutter={16}>
        <Col xs={24} lg={16}>
          <div className="page-card" style={{ marginBottom: 16 }}>
            <div className="section-title"><span>租约信息</span></div>
            {detail.lease && (
              <Descriptions column={3} size="small" bordered>
                <Descriptions.Item label="租约编号">{detail.lease.leaseNo}</Descriptions.Item>
                <Descriptions.Item label="面积">{detail.lease.area}㎡</Descriptions.Item>
                <Descriptions.Item label="当前租金"><b>¥{detail.lease.currentRent}/月</b></Descriptions.Item>
                <Descriptions.Item label="租期" span={3}>
                  {dayjs(detail.lease.startDate).format('YYYY-MM-DD')} 至 {dayjs(detail.lease.endDate).format('YYYY-MM-DD')}
                  （剩余 <b style={{ color: detail.lease.daysRemaining <= 30 ? '#ff4d4f' : 'inherit' }}>{detail.lease.daysRemaining}</b> 天）
                </Descriptions.Item>
                <Descriptions.Item label="欠费校验" span={3}>
                  {detail.overdueCheckResult
                    ? <Text type={detail.status === 'OVERDUE_REJECTED' ? 'danger' : 'success'}>{detail.overdueCheckResult}</Text>
                    : <Text type="secondary">未校验</Text>}
                </Descriptions.Item>
              </Descriptions>
            )}
          </div>

          <div className="page-card" style={{ marginBottom: 16 }}>
            <div className="section-title">
              <span>租金方案 / 协商记录</span>
              {threshold && (
                <span style={{ fontSize: 12, fontWeight: 'normal', color: '#8c8c8c' }}>
                  当前阈值：涨幅 ≤ <b style={{ color: '#1677ff' }}>{(threshold.maxIncreaseRate * 100).toFixed(2)}%</b>（超限需法务复核）
                </span>
              )}
            </div>
            {(detail.rentPlans || []).length === 0 ? (
              <div className="empty-state">暂无租金方案，管家可点击上方「生成租金方案」</div>
            ) : (
              (detail.rentPlans || []).map((plan, idx) => {
                const ratePct = (plan.increaseRate * 100).toFixed(2);
                const exceed = plan.exceedsThreshold;
                return (
                  <Card
                    key={plan.id}
                    size="small"
                    style={{ marginBottom: 12, borderColor: exceed ? '#ff7875' : '#d9d9d9', background: exceed ? '#fff1f0' : '#fff' }}
                    title={
                      <Space>
                        <b>{plan.planNo}</b>
                        <Tag color="blue">V{plan.planVersion}</Tag>
                        <Tag color={plan.status === 'AGREED' ? 'green' : plan.status === 'SUPERSEDED' ? 'default' : 'orange'}>
                          {({ DRAFT: '草稿', PROPOSED: '已提议', UNDER_NEGOTIATION: '协商中', AGREED: '已确认', SUPERSEDED: '已被替代' })[plan.status] || plan.status}
                        </Tag>
                        {exceed && <Tag color="red"><ExclamationCircleOutlined /> 超阈值</Tag>}
                      </Space>
                    }
                  >
                    <Row gutter={16}>
                      <Col span={8}><div className="detail-grid"><div className="item"><span className="label">上期租金</span><span className="value">¥{plan.previousRent}/月</span></div></div></Col>
                      <Col span={8}><div className="detail-grid"><div className="item"><span className="label">提议租金</span><span className="value" style={{ color: exceed ? '#ff4d4f' : '#1677ff' }}>¥{plan.proposedRent}/月</span></div></div></Col>
                      <Col span={8}><div className="detail-grid"><div className="item"><span className="label">涨幅</span><span className="value" style={{ color: exceed ? '#ff4d4f' : '#52c41a' }}>{ratePct}%</span></div></div></Col>
                      <Col span={8}><div className="detail-grid"><div className="item"><span className="label">涨幅金额</span><span className="value">¥{plan.increaseAmount}/月</span></div></div></Col>
                      <Col span={8}><div className="detail-grid"><div className="item"><span className="label">租期</span><span className="value">{plan.leaseTermMonths}个月</span></div></div></Col>
                      <Col span={8}><div className="detail-grid"><div className="item"><span className="label">首付月数</span><span className="value">{plan.paymentCycle === 'MONTHLY' ? '月付' : plan.paymentCycle === 'QUARTERLY' ? '季付' : '年付'}</span></div></div></Col>
                    </Row>
                    {plan.notes && <div style={{ marginTop: 8, color: '#8c8c8c', fontSize: 12 }}>备注：{plan.notes}</div>}
                  </Card>
                );
              })
            )}

            <Divider orientation="left" style={{ marginTop: 24 }}>协商时间线</Divider>
            {(detail.negotiations || []).length === 0 ? (
              <div style={{ color: '#8c8c8c', textAlign: 'center', padding: 16, fontSize: 12 }}>暂无协商记录</div>
            ) : (
              <Timeline
                mode="left"
                items={(detail.negotiations || []).map(n => ({
                  color: n.type === 'AGREEMENT' ? 'green' : n.type === 'TENANT_OFFER' ? 'blue' : 'orange',
                  label: dayjs(n.timestamp).format('YYYY-MM-DD HH:mm'),
                  children: (
                    <div>
                      <Space>
                        <Tag color={n.type === 'AGREEMENT' ? 'green' : n.type === 'TENANT_OFFER' ? 'blue' : 'orange'}>
                          {NEGOTIATION_TYPE_LABELS[n.type]}
                        </Tag>
                        <b>{n.negotiatorName}</b>
                        <Tag>{ROLE_LABELS[n.negotiatorRole] || n.negotiatorRole}</Tag>
                        <Text strong style={{ color: '#1677ff', fontSize: 16 }}>¥{n.offeredRent}/月</Text>
                        {n.offerRate != null && <Text type={n.offerRate > 0.1 ? 'danger' : 'success'}>涨幅 {(n.offerRate * 100).toFixed(2)}%</Text>}
                      </Space>
                      {n.comment && <div style={{ color: '#8c8c8c', fontSize: 12, marginTop: 4 }}>{n.comment}</div>}
                    </div>
                  )
                }))}
              />
            )}
          </div>

          <div className="page-card" style={{ marginBottom: 16 }}>
            <div className="section-title">
              <span>合同版本与签署状态</span>
              <Tag color={hasEffectiveContract ? 'green' : 'default'}>
                {hasEffectiveContract ? '有有效合同' : '无有效合同'}
              </Tag>
            </div>
            {(detail.contractVersions || []).length === 0 ? (
              <div className="empty-state">暂无合同，法务复核通过后可生成</div>
            ) : (
              <List
                dataSource={detail.contractVersions}
                renderItem={(c) => {
                  const cStatus = SIGN_STATUS_LABELS[c.status] || { text: c.status, color: 'default' };
                  return (
                    <Card
                      size="small"
                      style={{ marginBottom: 12, border: c.isEffective ? '1px solid #1677ff' : undefined, background: c.isEffective ? '#e6f4ff' : '#fff' }}
                      title={
                        <Space>
                          <FileTextOutlined />
                          <b>{c.contractNo}</b>
                          <Tag color="purple">版本 V{c.versionNo}</Tag>
                          {c.isEffective
                            ? <Tag color="green"><CheckCircleOutlined /> 有效版本</Tag>
                            : <Tag color="default"><CloseCircleOutlined /> 已废弃</Tag>}
                          <Tag color={cStatus.color}>{cStatus.text}</Tag>
                        </Space>
                      }
                      extra={
                        <Space>
                          {c.contentFileId && <Button size="small" icon={<DownloadOutlined />}>下载</Button>}
                          <Button size="small" icon={<EyeOutlined />} onClick={() => {
                            Modal.info({
                              title: `合同内容预览 - ${c.contractNo} V${c.versionNo}`,
                              width: 760,
                              content: <pre style={{ whiteSpace: 'pre-wrap', background: '#f5f5f5', padding: 16, borderRadius: 4, fontSize: 13, maxHeight: 480, overflow: 'auto' }}>{c.contentText || '无预览内容'}</pre>
                            });
                          }}>预览</Button>
                        </Space>
                      }
                    >
                      <Row gutter={16}>
                        <Col span={8}><div className="detail-grid"><div className="item"><span className="label">租金</span><span className="value"><b>¥{c.rentAmount}/月</b></span></div></div></Col>
                        <Col span={8}><div className="detail-grid"><div className="item"><span className="label">涨幅</span><span className="value">{(c.increaseRate * 100).toFixed(2)}%</span></div></div></Col>
                        <Col span={8}><div className="detail-grid"><div className="item"><span className="label">生成人</span><span className="value">{c.generatedByName}</span></div></div></Col>
                        <Col span={24}><div className="detail-grid"><div className="item"><span className="label">租期</span><span className="value">{dayjs(c.startDate).format('YYYY-MM-DD')} 至 {dayjs(c.endDate).format('YYYY-MM-DD')}</span></div></div></Col>
                      </Row>
                      <Divider orientation="left" style={{ margin: '12px 0' }}>三方签署进度</Divider>
                      <Steps
                        size="small"
                        direction="horizontal"
                        current={
                          (c.signStates || []).filter(s => s.status === 'SIGNED').length
                        }
                        items={(c.signStates || []).map(ss => {
                          const sl = SIGN_STATE_LABELS[ss.status] || {};
                          return {
                            title: SIGN_PARTY_LABELS[ss.party],
                            subTitle: ss.signerName ? (
                              <span>
                                {ss.signerName}
                                <br />
                                <span style={{ fontSize: 10, color: '#8c8c8c' }}>{ss.signedAt ? dayjs(ss.signedAt).format('MM-DD HH:mm') : ''}</span>
                              </span>
                            ) : <Tag color={sl.color} style={{ fontSize: 11 }}>{sl.text}</Tag>,
                            status: ss.status === 'SIGNED' ? 'finish' : ss.status === 'REJECTED' ? 'error' : 'wait'
                          };
                        })}
                      />
                      {c.obsoletedReason && (
                        <div style={{ marginTop: 12, padding: 8, background: '#fff2e8', color: '#d46b08', borderRadius: 4, fontSize: 12 }}>
                          废弃原因：{c.obsoletedReason}
                        </div>
                      )}
                    </Card>
                  );
                }}
              />
            )}
          </div>

          <div className="page-card">
            <div className="section-title"><span>附件管理</span></div>
            {attachCheck && (
              <div className="upload-required-hint">
                进入签署前必要附件：
                {(attachCheck.requiredTypes || []).map(t => {
                  const missing = (attachCheck.missing || []).includes(t);
                  return (
                    <span key={t} style={{ marginRight: 16 }}>
                      {missing
                        ? <span className="missing">❌ {ATTACHMENT_TYPE_LABELS[t] || t}</span>
                        : <span className="ok">✅ {ATTACHMENT_TYPE_LABELS[t] || t}</span>}
                    </span>
                  );
                })}
                {attachCheck.missing?.length > 0 && <span style={{ color: '#ff4d4f' }}>（缺失 {attachCheck.missing.length} 项）</span>}
              </div>
            )}
            <Upload
              name="file"
              customRequest={handleUpload}
              multiple
              showUploadList={false}
              accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
              style={{ marginBottom: 16, display: 'block' }}
            >
              <Button icon={<UploadOutlined />} type="dashed" block style={{ padding: '16px 0', height: 'auto' }}>
                点击或拖拽文件上传（身份证件/租房证明/合同草稿为签署必备）
              </Button>
            </Upload>
            {(detail.attachments || []).length === 0 ? (
              <div style={{ color: '#8c8c8c', textAlign: 'center', padding: 16, fontSize: 12 }}>暂无附件</div>
            ) : (
              <List
                grid={{ gutter: 12, xs: 1, sm: 2, md: 2, lg: 3, xl: 4 }}
                dataSource={detail.attachments}
                renderItem={(att) => (
                  <List.Item>
                    <Card
                      size="small"
                      hoverable
                      style={{ borderColor: att.isRequired ? '#1677ff' : undefined }}
                      actions={[
                        <Button size="small" type="text" icon={<EyeOutlined />} onClick={() => window.open(`/uploads/${att.filePath}`)} />,
                        <Button size="small" type="text" danger icon={<DeleteOutlined />} onClick={() => handleDeleteAttachment(att)} />
                      ]}
                    >
                      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                        <FileTextOutlined style={{ color: '#1677ff', fontSize: 20, marginTop: 2 }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={att.fileName}>
                            {att.fileName}
                          </div>
                          <div style={{ marginTop: 4, fontSize: 11, color: '#8c8c8c' }}>
                            <Tag color={att.type === 'ID_CARD' || att.type === 'RENT_CERT' || att.type === 'CONTRACT_DRAFT' ? 'blue' : 'default'} style={{ fontSize: 11 }}>
                              {ATTACHMENT_TYPE_LABELS[att.type] || att.type}
                            </Tag>
                            {att.isRequired && <Tag color="green" style={{ fontSize: 11 }}>签署必备</Tag>}
                          </div>
                          <div style={{ marginTop: 4, fontSize: 11, color: '#8c8c8c' }}>
                            {att.uploadedByName} · {dayjs(att.uploadedAt).format('MM-DD HH:mm')}
                          </div>
                        </div>
                      </div>
                    </Card>
                  </List.Item>
                )}
              />
            )}
          </div>
        </Col>

        <Col xs={24} lg={8}>
          <div className="page-card" style={{ marginBottom: 16 }}>
            <div className="section-title"><span>流程时间线</span></div>
            <Timeline
              items={[
                {
                  color: 'blue',
                  label: dayjs(detail.applyDate).format('YYYY-MM-DD HH:mm'),
                  children: (
                    <div>
                      <b>申请创建</b>
                      <div style={{ fontSize: 12, color: '#8c8c8c' }}>
                        {detail.applicantName} 发起续签申请
                      </div>
                    </div>
                  )
                },
                ...(detail.overdueCheckResult ? [{
                  color: detail.status === 'OVERDUE_REJECTED' ? 'red' : 'green',
                  label: dayjs(detail.applyDate).add(1, 'minute').format('YYYY-MM-DD HH:mm'),
                  children: (
                    <div>
                      <b>欠费校验</b>
                      <div style={{ fontSize: 12, color: detail.status === 'OVERDUE_REJECTED' ? '#ff4d4f' : '#8c8c8c' }}>
                        {detail.overdueCheckResult}
                      </div>
                    </div>
                  )
                }] : []),
                ...(detail.rentPlans || []).map(p => ({
                  color: p.exceedsThreshold ? 'red' : 'blue',
                  label: dayjs(p.createdAt || detail.applyDate).format('YYYY-MM-DD HH:mm'),
                  children: (
                    <div>
                      <b>租金方案 V{p.planVersion}</b>
                      <div style={{ fontSize: 12 }}>
                        租金 ¥{p.proposedRent}/月，涨幅 <b style={{ color: p.exceedsThreshold ? '#ff4d4f' : '#52c41a' }}>{(p.increaseRate * 100).toFixed(2)}%</b>
                        {p.exceedsThreshold && <span style={{ color: '#ff4d4f' }}>（超阈值，进入法务复核）</span>}
                      </div>
                    </div>
                  )
                })),
                ...(detail.legalReviewComment ? [{
                  color: detail.status === 'LEGAL_REVIEW_REJECTED' ? 'red' : 'purple',
                  label: dayjs(detail.applyDate).add(2, 'minute').format('YYYY-MM-DD HH:mm'),
                  children: (
                    <div>
                      <b>法务复核</b>
                      <div style={{ fontSize: 12, color: detail.status === 'LEGAL_REVIEW_REJECTED' ? '#ff4d4f' : '#8c8c8c' }}>
                        {detail.legalName || '法务'}：{detail.legalReviewComment}
                      </div>
                    </div>
                  )
                }] : []),
                ...(detail.contractVersions || []).map(c => ({
                  color: c.isEffective ? 'green' : 'default',
                  label: dayjs(c.generatedAt).format('YYYY-MM-DD HH:mm'),
                  children: (
                    <div>
                      <b>合同{c.isEffective ? '生成' : '（废弃）'} V{c.versionNo}</b>
                      <div style={{ fontSize: 12, color: '#8c8c8c' }}>
                        {c.contractNo} · ¥{c.rentAmount}/月 · {SIGN_STATUS_LABELS[c.status]?.text}
                      </div>
                    </div>
                  )
                })),
                ...(detail.archiveDate ? [{
                  color: '#52c41a',
                  label: dayjs(detail.archiveDate).format('YYYY-MM-DD HH:mm'),
                  children: (
                    <div>
                      <b>📦 流程归档</b>
                      <div style={{ fontSize: 12, color: '#8c8c8c' }}>已完成全部流程</div>
                    </div>
                  )
                }] : [])
              ].sort((a, b) => new Date(a.label) - new Date(b.label))}
            />
          </div>

          <div className="page-card">
            <div className="section-title"><span>参与角色</span></div>
            <List
              size="small"
              dataSource={[
                { name: detail.tenantName, role: 'TENANT', desc: '租客（发起人）' },
                { name: detail.housekeeperName, role: 'HOUSEKEEPER', desc: '管家（租金方案+协商）' },
                { name: detail.financeName, role: 'FINANCE', desc: '财务（欠费+归档）' },
                { name: detail.legalName, role: 'LEGAL', desc: '法务（复核+签署）' },
                { name: detail.signAdminName, role: 'SIGN_ADMIN', desc: '签署管理员（最后签章）' }
              ].filter(r => r.name)}
              renderItem={(item) => (
                <List.Item>
                  <List.Item.Meta
                    avatar={<Avatar style={{ background: ({ TENANT: '#1677ff', HOUSEKEEPER: '#2f54eb', FINANCE: '#52c41a', LEGAL: '#fa8c16', SIGN_ADMIN: '#722ed1' })[item.role] || '#1677ff' }} icon={<UserOutlined />} />}
                    title={
                      <Space>
                        <b>{item.name}</b>
                        <Tag>{ROLE_LABELS[item.role]}</Tag>
                        {detail.currentHandlerRole === item.role && <Tag color="red">当前处理</Tag>}
                      </Space>
                    }
                    description={<span style={{ fontSize: 12, color: '#8c8c8c' }}>{item.desc}</span>}
                  />
                </List.Item>
              )}
            />
          </div>
        </Col>
      </Row>

      {/* 模态框 */}
      <Modal
        title={detail.rentPlans?.length ? '更新租金方案（旧合同将自动废弃）' : '生成租金方案'}
        open={rentPlanModal}
        onOk={doCreateRentPlan}
        onCancel={() => setRentPlanModal(false)}
        okText="确认提交"
        width={600}
        destroyOnClose
      >
        <Form form={rentPlanForm} layout="vertical" preserve={false}>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item label="上期租金 (元/月)">
                <Input value={detail.lease?.currentRent || 0} disabled prefix="¥" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="proposedRent"
                label="提议租金 (元/月)"
                rules={[{ required: true, message: '请输入租金' }]}
              >
                <InputNumber style={{ width: '100%' }} min={0} prefix="¥" step={100} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="leaseTermMonths"
                label="租期(月)"
                rules={[{ required: true, message: '请输入租期' }]}
              >
                <InputNumber style={{ width: '100%' }} min={1} max={120} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="当前阈值">
                <Input value={threshold ? `涨幅 ≤ ${(threshold.maxIncreaseRate * 100).toFixed(2)}%` : '未配置'} disabled />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="notes" label="备注">
            <TextArea rows={3} placeholder="方案说明、特殊条款等" />
          </Form.Item>
          <div style={{ background: '#fffbe6', padding: 12, borderRadius: 6, color: '#d46b08', fontSize: 12 }}>
            <ExclamationCircleOutlined /> 注意：如果已生成正式合同，提交新租金方案将<strong>自动废弃当前有效合同版本</strong>，需重新签署。
          </div>
        </Form>
      </Modal>

      <Modal
        title="发起租金协商"
        open={negotiationModal}
        onOk={doNegotiation}
        onCancel={() => setNegotiationModal(false)}
        okText="提交报价"
        destroyOnClose
      >
        <Form form={negForm} layout="vertical" preserve={false}>
          <Form.Item
            name="type"
            label="协商类型"
            rules={[{ required: true }]}
          >
            <Select options={[
              { value: 'TENANT_OFFER', label: '租客报价' },
              { value: 'HOUSEKEEPER_OFFER', label: '管家报价' },
              { value: 'AGREEMENT', label: '双方确认' }
            ]} />
          </Form.Item>
          <Form.Item
            name="offeredRent"
            label="报价租金 (元/月)"
            rules={[{ required: true, message: '请输入报价' }]}
          >
            <InputNumber style={{ width: '100%' }} min={0} prefix="¥" step={100} />
          </Form.Item>
          <Form.Item name="comment" label="协商说明">
            <TextArea rows={3} placeholder="说明协商背景、条件等" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
