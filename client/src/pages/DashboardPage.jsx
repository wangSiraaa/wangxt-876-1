import React, { useEffect, useState } from 'react';
import { Card, Row, Col, Statistic, List, Tag, Button, Empty, App as AntdApp } from 'antd';
import {
  DashboardOutlined,
  FileTextOutlined,
  ExclamationCircleOutlined,
  ScheduleOutlined,
  HomeOutlined,
  WarningOutlined,
  ArrowRightOutlined,
  ThunderboltOutlined
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import axios from '../utils/api';
import dayjs from 'dayjs';
import { REMINDER_LEVEL_LABELS } from '../utils/constants.js';
import { useAuth } from '../context/AuthContext.jsx';

export default function DashboardPage() {
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);
  const [reminders, setReminders] = useState([]);
  const [renewals, setRenewals] = useState([]);
  const [leases, setLeases] = useState([]);
  const { user, roleLabel } = useAuth();
  const { message } = AntdApp.useApp();

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      const [s, r, rn, ls] = await Promise.all([
        axios.get('/leases/dashboard/stats'),
        axios.get('/leases/reminders/list?status=PENDING&status=SENT'),
        axios.get('/renewals'),
        axios.get('/leases/expiring/soon')
      ]);
      setStats(s.data);
      setReminders(r.data.slice(0, 6));
      setRenewals(rn.data.slice(0, 6));
      setLeases(ls.data.slice(0, 5));
    } catch (e) {
      message.error(e.response?.data?.error || '加载数据失败');
    }
  }

  const levelClass = (lvl) => lvl === 'URGENT' ? 'urgent' : lvl === 'WARNING' ? 'warning' : '';

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>
            <DashboardOutlined style={{ marginRight: 8, color: '#1677ff' }} />
            工作台
          </h2>
          <div style={{ color: '#8c8c8c', marginTop: 4, fontSize: 13 }}>
            欢迎使用房屋租赁合同续签管理系统 · 角色：{roleLabel} · {dayjs().format('YYYY年MM月DD日')}
          </div>
        </div>
        <Button
          type="primary"
          icon={<ThunderboltOutlined />}
          onClick={() => navigate('/renewals')}
        >
          前往续签申请
        </Button>
      </div>

      <div className="stats-grid">
        <div className={`stat-card ${stats?.expiringSoonCount ? 'warning' : ''}`}>
          <div className="label"><ScheduleOutlined /> 即将到期租约</div>
          <div className="value">{stats?.expiringSoonCount ?? 0}</div>
        </div>
        <div className="stat-card urgent">
          <div className="label"><WarningOutlined /> 欠费账单</div>
          <div className="value">{stats?.overdueBillCount ?? 0}</div>
        </div>
        <div className="stat-card info">
          <div className="label"><HomeOutlined /> 在管租约</div>
          <div className="value">{stats?.totalLeases ?? 0}</div>
        </div>
        <div className="stat-card success">
          <div className="label"><FileTextOutlined /> 续签申请</div>
          <div className="value">{renewals?.length ?? 0}</div>
        </div>
        <div className={`stat-card ${stats?.pendingReminders > 0 ? 'urgent' : ''}`}>
          <div className="label"><ExclamationCircleOutlined /> 待处理提醒</div>
          <div className="value">{stats?.pendingReminders ?? 0}</div>
        </div>
      </div>

      <Row gutter={16} style={{ marginTop: 8 }}>
        <Col xs={24} lg={12}>
          <div className="page-card" style={{ marginBottom: 16 }}>
            <div className="section-title">
              <span>到期提醒（最新）</span>
              <Button type="link" onClick={() => navigate('/reminders')}>
                全部 <ArrowRightOutlined />
              </Button>
            </div>
            {reminders.length === 0 ? (
              <Empty description="暂无提醒" style={{ padding: 24 }} />
            ) : (
              <List
                dataSource={reminders}
                renderItem={(item) => (
                  <div className={`reminder-list-item ${levelClass(item.level)}`}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ marginBottom: 4 }}>
                          <Tag color={REMINDER_LEVEL_LABELS[item.level]?.color}>
                            {REMINDER_LEVEL_LABELS[item.level]?.text}
                          </Tag>
                          <span style={{ fontWeight: 600 }}>{item.tenantName}</span>
                          <span style={{ color: '#8c8c8c', fontSize: 12, marginLeft: 8 }}>
                            {item.leaseNo}
                          </span>
                        </div>
                        <div style={{ color: 'rgba(0,0,0,0.65)', fontSize: 13, lineHeight: 1.5 }}>
                          {item.message}
                        </div>
                        <div style={{ color: '#8c8c8c', fontSize: 12, marginTop: 6 }}>
                          到期日: {dayjs(item.expiryDate).format('YYYY-MM-DD')}
                          （还剩 <b style={{ color: item.daysRemaining <= 30 ? '#ff4d4f' : 'inherit' }}>{item.daysRemaining}</b> 天）
                        </div>
                      </div>
                      <Button
                        type="text"
                        size="small"
                        onClick={() => navigate('/renewals')}
                      >
                        发起续签
                      </Button>
                    </div>
                  </div>
                )}
              />
            )}
          </div>
        </Col>

        <Col xs={24} lg={12}>
          <div className="page-card" style={{ marginBottom: 16 }}>
            <div className="section-title">
              <span>即将到期租约</span>
              <Button type="link" onClick={() => navigate('/leases')}>
                全部 <ArrowRightOutlined />
              </Button>
            </div>
            {leases.length === 0 ? (
              <Empty description="暂无到期租约" style={{ padding: 24 }} />
            ) : (
              <List
                dataSource={leases}
                renderItem={(item) => (
                  <List.Item
                    style={{ padding: '10px 0' }}
                    actions={[
                      <Button type="primary" size="small" onClick={() => navigate('/renewals')}>
                        发起续签
                      </Button>
                    ]}
                  >
                    <List.Item.Meta
                      title={
                        <span>
                          {item.tenantName}
                          <Tag style={{ marginLeft: 8 }} color={item.daysRemaining <= 30 ? 'red' : item.daysRemaining <= 60 ? 'orange' : 'blue'}>
                            {item.daysRemaining}天后到期
                          </Tag>
                        </span>
                      }
                      description={
                        <div>
                          <div>📍 {item.propertyAddr}</div>
                          <div>
                            💰 租金 ¥{item.currentRent}/月 · 📅 {dayjs(item.startDate).format('YYYY-MM-DD')} 至 {dayjs(item.endDate).format('YYYY-MM-DD')}
                          </div>
                        </div>
                      }
                    />
                  </List.Item>
                )}
              />
            )}
          </div>

          <div className="page-card">
            <div className="section-title">
              <span>续签申请动态</span>
              <Button type="link" onClick={() => navigate('/renewals')}>
                全部 <ArrowRightOutlined />
              </Button>
            </div>
            {renewals.length === 0 ? (
              <Empty description="暂无续签申请" style={{ padding: 24 }} />
            ) : (
              <List
                dataSource={renewals}
                renderItem={(item) => (
                  <List.Item
                    style={{ padding: '10px 0' }}
                    actions={[
                      <Button size="small" type="link" onClick={() => navigate(`/renewals/${item.id}`)}>
                        查看详情
                      </Button>
                    ]}
                  >
                    <List.Item.Meta
                      title={
                        <span>
                          {item.appNo}
                          <Tag style={{ marginLeft: 8 }}>{item.status}</Tag>
                        </span>
                      }
                      description={
                        <div>
                          <div>👤 {item.tenantName}</div>
                          <div>📅 申请日: {dayjs(item.applyDate).format('YYYY-MM-DD')}</div>
                        </div>
                      }
                    />
                  </List.Item>
                )}
              />
            )}
          </div>
        </Col>
      </Row>
    </div>
  );
}
