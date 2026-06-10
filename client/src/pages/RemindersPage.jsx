import React, { useEffect, useState } from 'react';
import { Table, Tag, Button, Space, App as AntdApp } from 'antd';
import { BellOutlined, CheckCircleOutlined, FileTextOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import axios from '../utils/api';
import dayjs from 'dayjs';
import { REMINDER_LEVEL_LABELS } from '../utils/constants.js';

const STATUS_LABELS = {
  PENDING: { text: '待处理', color: 'warning' },
  SENT: { text: '已通知', color: 'processing' },
  ACKNOWLEDGED: { text: '已确认', color: 'success' },
  RESOLVED: { text: '已解决', color: 'default' }
};

export default function RemindersPage() {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { message } = AntdApp.useApp();

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    try {
      const resp = await axios.get('/leases/reminders/list');
      setList(resp.data);
    } catch (e) {
      message.error(e.response?.data?.error || '加载失败');
    } finally {
      setLoading(false);
    }
  }

  async function ack(id) {
    try {
      await axios.post(`/leases/reminders/${id}/acknowledge`);
      message.success('已确认');
      load();
    } catch (e) {
      message.error(e.response?.data?.error || '操作失败');
    }
  }

  const columns = [
    {
      title: '级别',
      dataIndex: 'level',
      width: 90,
      render: l => {
        const m = REMINDER_LEVEL_LABELS[l] || { text: l, color: 'default' };
        return <Tag color={m.color}><BellOutlined /> {m.text}</Tag>;
      }
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 100,
      render: s => {
        const m = STATUS_LABELS[s] || { text: s, color: 'default' };
        return <Tag color={m.color}>{m.text}</Tag>;
      }
    },
    { title: '租约编号', dataIndex: 'leaseNo', width: 160 },
    { title: '租客', dataIndex: 'tenantName', width: 100 },
    {
      title: '到期日 / 剩余',
      width: 200,
      render: (_, r) => (
        <div>
          <div>{dayjs(r.expiryDate).format('YYYY-MM-DD')}</div>
          <Tag color={r.daysRemaining <= 30 ? 'red' : r.daysRemaining <= 60 ? 'orange' : 'blue'} style={{ marginTop: 4 }}>
            {r.daysRemaining > 0 ? `剩余 ${r.daysRemaining} 天` : `已过期 ${-r.daysRemaining} 天`}
          </Tag>
        </div>
      )
    },
    {
      title: '接收人',
      width: 140,
      render: (_, r) => (
        <Space>
          <Tag>{({ TENANT: '租客', HOUSEKEEPER: '管家', FINANCE: '财务', LEGAL: '法务', SIGN_ADMIN: '签管' })[r.recipientRole] || r.recipientRole}</Tag>
          <span>{r.recipientName}</span>
        </Space>
      )
    },
    {
      title: '提醒内容',
      dataIndex: 'message',
      ellipsis: true,
      render: v => <span title={v}>{v}</span>
    },
    {
      title: '提醒日期',
      dataIndex: 'reminderDate',
      width: 120,
      render: v => dayjs(v).format('YYYY-MM-DD')
    },
    {
      title: '操作',
      key: 'op',
      width: 200,
      fixed: 'right',
      render: (_, r) => (
        <Space>
          <Button size="small" type="primary" icon={<FileTextOutlined />} onClick={() => navigate('/renewals')}>
            发起续签
          </Button>
          {(r.status === 'PENDING' || r.status === 'SENT') && (
            <Button size="small" icon={<CheckCircleOutlined />} onClick={() => ack(r.id)}>确认</Button>
          )}
        </Space>
      )
    }
  ];

  return (
    <div>
      <div className="page-header">
        <div>
          <h2><BellOutlined style={{ color: '#1677ff', marginRight: 8 }} />到期提醒中心</h2>
          <div style={{ color: '#8c8c8c', marginTop: 4, fontSize: 13 }}>
            共 {list.length} 条提醒 · 稳定显示种子数据，便于测试和演示
          </div>
        </div>
        <Button onClick={load}>刷新</Button>
      </div>
      <div className="page-card">
        <Table
          rowKey="id"
          loading={loading}
          columns={columns}
          dataSource={list}
          pagination={{ pageSize: 15, showSizeChanger: true }}
          scroll={{ x: 1300 }}
        />
      </div>
    </div>
  );
}
