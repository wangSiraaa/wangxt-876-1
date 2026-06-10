import React, { useEffect, useState } from 'react';
import { Table, Tag, Button, Space, Modal, App as AntdApp } from 'antd';
import { HomeOutlined, ThunderboltOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import axios from '../utils/api';
import dayjs from 'dayjs';
import { useAuth } from '../context/AuthContext.jsx';

const LEASE_STATUS_LABELS = {
  ACTIVE: { text: '在租', color: 'success' },
  EXPIRING: { text: '即将到期', color: 'warning' },
  EXPIRED: { text: '已到期', color: 'error' },
  RENEWED: { text: '已续签', color: 'blue' },
  TERMINATED: { text: '已终止', color: 'default' }
};

export default function LeaseListPage() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { message, modal } = AntdApp.useApp();
  const { user } = useAuth();

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const resp = await axios.get('/leases');
      setData(resp.data);
    } catch (e) {
      message.error(e.response?.data?.error || '加载失败');
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateRenewal(lease) {
    modal.confirm({
      title: `为租约「${lease.leaseNo}」发起续签？`,
      content: (
        <div style={{ fontSize: 13 }}>
          <div><b>租客：</b>{lease.tenantName}</div>
          <div><b>物业：</b>{lease.propertyAddr}</div>
          <div><b>当前租金：</b>¥{lease.currentRent}/月</div>
          <div><b>到期日：</b>{dayjs(lease.endDate).format('YYYY-MM-DD')}（还剩 {lease.daysRemaining} 天）</div>
        </div>
      ),
      okText: '确认发起续签',
      cancelText: '取消',
      onOk: async () => {
        try {
          const resp = await axios.post('/renewals', {
            leaseId: lease.id,
            expectedLeaseTerm: 12
          });
          if (resp.status === 200) {
            message.success('续签申请已发起，欠费校验通过');
            navigate(`/renewals/${resp.data.id}`);
          }
        } catch (e) {
          if (e.response?.data?.rejected) {
            message.warning(e.response.data.error);
            if (e.response.data.application) {
              navigate(`/renewals/${e.response.data.application.id}`);
            }
          } else {
            message.error(e.response?.data?.error || '发起失败');
          }
        }
      }
    });
  }

  const columns = [
    {
      title: '租约编号',
      dataIndex: 'leaseNo',
      key: 'leaseNo',
      width: 180,
      render: (v, r) => (
        <Space>
          <HomeOutlined style={{ color: '#1677ff' }} />
          <a onClick={() => handleCreateRenewal(r)} style={{ fontWeight: 500 }}>{v}</a>
        </Space>
      )
    },
    { title: '租客', dataIndex: 'tenantName', width: 120 },
    {
      title: '物业地址',
      dataIndex: 'propertyAddr',
      ellipsis: true,
      render: (v) => <span title={v}>{v}</span>
    },
    {
      title: '面积(㎡)',
      dataIndex: 'area',
      width: 100,
      align: 'right'
    },
    {
      title: '当前租金',
      dataIndex: 'currentRent',
      width: 120,
      align: 'right',
      render: (v) => <b>¥{v}/月</b>
    },
    {
      title: '租期',
      width: 260,
      render: (_, r) => (
        <div>
          <div style={{ fontSize: 12 }}>{dayjs(r.startDate).format('YYYY-MM-DD')} 至 {dayjs(r.endDate).format('YYYY-MM-DD')}</div>
          <Tag
            color={r.daysRemaining <= 30 ? 'red' : r.daysRemaining <= 60 ? 'orange' : r.daysRemaining <= 90 ? 'blue' : 'green'}
            style={{ marginTop: 4 }}
          >
            剩余 {r.daysRemaining} 天
          </Tag>
        </div>
      )
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 110,
      render: (s) => {
        const l = LEASE_STATUS_LABELS[s] || { text: s, color: 'default' };
        return <Tag color={l.color}>{l.text}</Tag>;
      }
    },
    {
      title: '管家',
      dataIndex: 'housekeeperName',
      width: 100
    },
    {
      title: '操作',
      key: 'action',
      width: 180,
      fixed: 'right',
      render: (_, r) => (
        <Space>
          <Button
            type="primary"
            size="small"
            icon={<ThunderboltOutlined />}
            disabled={r.daysRemaining < 0 && r.status === 'EXPIRED'}
            onClick={() => handleCreateRenewal(r)}
          >
            发起续签
          </Button>
          <Button size="small" onClick={async () => {
            try {
              const resp = await axios.get(`/leases/${r.id}/overdue-bills`);
              if (resp.data.length === 0) {
                message.info('无欠费账单');
              } else {
                Modal.info({
                  title: `租约 ${r.leaseNo} 的欠费账单 (${resp.data.length}笔)`,
                  width: 600,
                  content: (
                    <Table
                      size="small"
                      pagination={false}
                      dataSource={resp.data}
                      rowKey="id"
                      columns={[
                        { title: '账期', dataIndex: 'period' },
                        { title: '应缴', dataIndex: 'totalAmount', render: v => `¥${v}` },
                        { title: '已缴', dataIndex: 'paidAmount', render: v => `¥${v}` },
                        { title: '欠费', dataIndex: 'overdueAmount', render: v => <b style={{ color: '#ff4d4f' }}>¥{v}</b> },
                        { title: '状态', dataIndex: 'status' }
                      ]}
                    />
                  )
                });
              }
            } catch (e) {
              message.error(e.response?.data?.error || '查询失败');
            }
          }}>
            欠费账单
          </Button>
        </Space>
      )
    }
  ];

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>
            <HomeOutlined style={{ marginRight: 8, color: '#1677ff' }} />
            租约管理
          </h2>
          <div style={{ color: '#8c8c8c', marginTop: 4, fontSize: 13 }}>
            共 {data.length} 条租约记录
          </div>
        </div>
        <Button onClick={loadData}>刷新</Button>
      </div>
      <div className="page-card">
        <Table
          rowKey="id"
          loading={loading}
          dataSource={data}
          columns={columns}
          scroll={{ x: 1200 }}
          pagination={{ pageSize: 10, showSizeChanger: true }}
        />
      </div>
    </div>
  );
}
