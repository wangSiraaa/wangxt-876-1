import React, { useEffect, useState, useCallback } from 'react';
import {
  Card, Row, Col, Tag, Button, Space, Typography, List, Statistic,
  Tabs, Descriptions, Empty, App as AntdApp, Avatar
} from 'antd';
import {
  SafetyCertificateOutlined, ClockCircleOutlined, CheckCircleOutlined,
  CloseCircleOutlined, FileTextOutlined, UserOutlined, ArrowRightOutlined
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import axios from '../utils/api';
import dayjs from 'dayjs';
import { useAuth, ROLE_LABELS } from '../context/AuthContext.jsx';
import { STATUS_LABELS, REVIEW_RESULT_LABELS } from '../utils/constants.js';

const { Title, Text } = Typography;

export default function LegalReviewPage() {
  const navigate = useNavigate();
  const { message } = AntdApp.useApp();
  const { user } = useAuth();

  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const resp = await axios.get('/renewals/legal/pending');
      setData(resp.data);
    } catch (e) {
      message.error(e.response?.data?.error || '加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  if (!data) return <div className="empty-state">加载中...</div>;

  const renderPendingItem = (item) => {
    const plan = (item.rentPlans || [])[0];
    const ratePct = plan ? (plan.increaseRate * 100).toFixed(2) : '0.00';
    const exceed = plan?.exceedsThreshold;

    return (
      <List.Item
        key={item.id}
        actions={[
          <Button
            type="primary"
            icon={<ArrowRightOutlined />}
            onClick={() => navigate(`/renewals/${item.id}`)}
          >
            去复核
          </Button>
        ]}
      >
        <List.Item.Meta
          avatar={
            <Avatar style={{ background: exceed ? '#ff4d4f' : '#faad14' }} icon={<SafetyCertificateOutlined />} />
          }
          title={
            <Space>
              <b>{item.appNo}</b>
              <Tag color={exceed ? 'red' : 'orange'}>{exceed ? '超阈值' : '待复核'}</Tag>
              <Tag color="blue">{ROLE_LABELS[item.currentHandlerRole]}</Tag>
            </Space>
          }
          description={
            <div>
              <div style={{ marginBottom: 4 }}>
                <Text type="secondary">租客：</Text>{item.lease?.tenantName}
                <Text type="secondary" style={{ marginLeft: 16 }}>物业：</Text>{item.lease?.propertyAddr?.slice(0, 20)}
              </div>
              {plan && (
                <div style={{ marginBottom: 4 }}>
                  <Text type="secondary">租金：</Text>
                  ¥{plan.previousRent} → <b style={{ color: exceed ? '#ff4d4f' : '#1677ff' }}>¥{plan.proposedRent}</b>
                  <Text type="secondary" style={{ marginLeft: 8 }}>涨幅：</Text>
                  <b style={{ color: exceed ? '#ff4d4f' : '#52c41a' }}>{ratePct}%</b>
                  {exceed && <Tag color="red" style={{ marginLeft: 8 }}>阈值 {(plan.thresholdRate * 100).toFixed(2)}%</Tag>}
                </div>
              )}
              <div style={{ fontSize: 12, color: '#8c8c8c' }}>
                申请时间：{dayjs(item.applyDate).format('YYYY-MM-DD HH:mm')}
              </div>
            </div>
          }
        />
      </List.Item>
    );
  };

  const renderReviewedItem = (item) => {
    const resultInfo = REVIEW_RESULT_LABELS[item.legalReviewResult] || {};
    return (
      <List.Item
        key={item.id}
        actions={[
          <Button
            size="small"
            icon={<FileTextOutlined />}
            onClick={() => navigate(`/renewals/${item.id}`)}
          >
            查看详情
          </Button>
        ]}
      >
        <List.Item.Meta
          avatar={
            <Avatar
              style={{ background: item.legalReviewResult === 'PASSED' ? '#52c41a' : '#ff4d4f' }}
              icon={item.legalReviewResult === 'PASSED' ? <CheckCircleOutlined /> : <CloseCircleOutlined />}
            />
          }
          title={
            <Space>
              <b>{item.appNo}</b>
              <Tag color={resultInfo.color}>{resultInfo.text}</Tag>
            </Space>
          }
          description={
            <div>
              <div style={{ marginBottom: 4 }}>
                <Text type="secondary">租客：</Text>{item.lease?.tenantName}
                <Text type="secondary" style={{ marginLeft: 16 }}>物业：</Text>{item.lease?.propertyAddr?.slice(0, 20)}
              </div>
              <div style={{ marginBottom: 4 }}>
                <Text type="secondary">当前状态：</Text>
                <Tag color={STATUS_LABELS[item.status]?.color}>{STATUS_LABELS[item.status]?.text}</Tag>
              </div>
              <div style={{ fontSize: 12, color: '#8c8c8c' }}>
                复核时间：{item.legalReviewedAt ? dayjs(item.legalReviewedAt).format('YYYY-MM-DD HH:mm') : '-'}
              </div>
            </div>
          }
        />
      </List.Item>
    );
  };

  const tabItems = [
    {
      key: 'pending',
      label: (
        <span>
          <ClockCircleOutlined /> 待我复核
          <Tag color="red" style={{ marginLeft: 8 }}>{data.stats?.pendingCount || 0}</Tag>
        </span>
      ),
      children: data.pending?.length > 0 ? (
        <List
          loading={loading}
          dataSource={data.pending}
          renderItem={renderPendingItem}
        />
      ) : (
        <Empty description="暂无待复核的续签申请" />
      )
    },
    {
      key: 'reviewed',
      label: (
        <span>
          <CheckCircleOutlined /> 我已复核
          <Tag style={{ marginLeft: 8 }}>{data.stats?.reviewedCount || 0}</Tag>
        </span>
      ),
      children: data.reviewed?.length > 0 ? (
        <List
          loading={loading}
          dataSource={data.reviewed}
          renderItem={renderReviewedItem}
        />
      ) : (
        <Empty description="暂无复核记录" />
      )
    }
  ];

  return (
    <div>
      <div className="page-header">
        <Space>
          <Title level={3} style={{ margin: 0 }}>
            <SafetyCertificateOutlined style={{ color: '#722ed1', marginRight: 8 }} />
            法务复核工作台
          </Title>
          <Tag color="purple">当前用户：{user.realName} ({ROLE_LABELS[user.role]})</Tag>
        </Space>
        <Space>
          <Button onClick={loadData}>刷新</Button>
          <Button type="primary" onClick={() => navigate('/renewals')}>返回续签列表</Button>
        </Space>
      </div>

      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col xs={12} md={6}>
          <Card>
            <Statistic
              title="待我复核"
              value={data.stats?.pendingCount || 0}
              valueStyle={{ color: '#ff4d4f' }}
              prefix={<ClockCircleOutlined />}
            />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card>
            <Statistic
              title="我已复核"
              value={data.stats?.reviewedCount || 0}
              valueStyle={{ color: '#52c41a' }}
              prefix={<CheckCircleOutlined />}
            />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card>
            <Statistic
              title="复核通过"
              value={data.reviewed?.filter(r => r.legalReviewResult === 'PASSED').length || 0}
              valueStyle={{ color: '#52c41a' }}
              prefix={<CheckCircleOutlined />}
            />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card>
            <Statistic
              title="复核驳回"
              value={data.reviewed?.filter(r => r.legalReviewResult === 'REJECTED').length || 0}
              valueStyle={{ color: '#ff4d4f' }}
              prefix={<CloseCircleOutlined />}
            />
          </Card>
        </Col>
      </Row>

      <div className="page-card">
        <Tabs defaultActiveKey="pending" items={tabItems} />
      </div>
    </div>
  );
}
