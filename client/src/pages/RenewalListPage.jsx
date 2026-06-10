import React, { useEffect, useState } from 'react';
import { Table, Tag, Button, Space, Select, Input, App as AntdApp, Modal } from 'antd';
import { ThunderboltOutlined, PlusOutlined, SearchOutlined, EyeOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import axios from '../utils/api';
import dayjs from 'dayjs';
import { STATUS_LABELS } from '../utils/constants.js';
import { useAuth } from '../context/AuthContext.jsx';

export default function RenewalListPage() {
  const [data, setData] = useState([]);
  const [leases, setLeases] = useState([]);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState();
  const [keyword, setKeyword] = useState('');
  const navigate = useNavigate();
  const { message, modal } = AntdApp.useApp();
  const { user } = useAuth();

  useEffect(() => {
    loadAll();
  }, []);

  async function loadAll() {
    setLoading(true);
    try {
      const [r, l] = await Promise.all([
        axios.get('/renewals'),
        axios.get('/leases/expiring/soon')
      ]);
      setData(r.data);
      setLeases(l.data);
    } catch (e) {
      message.error(e.response?.data?.error || '加载失败');
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateRenewal(lease) {
    try {
      const resp = await axios.post('/renewals', {
        leaseId: lease.id,
        expectedLeaseTerm: 12
      });
      message.success('续签申请已发起');
      navigate(`/renewals/${resp.data.id}`);
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

  const columns = [
    {
      title: '申请编号',
      dataIndex: 'appNo',
      width: 180,
      render: (v, r) => (
        <a onClick={() => navigate(`/renewals/${r.id}`)} style={{ fontWeight: 500 }}>
          <ThunderboltOutlined style={{ color: '#1677ff', marginRight: 6 }} />{v}
        </a>
      )
    },
    { title: '租客', dataIndex: 'tenantName', width: 100 },
    {
      title: '物业地址',
      dataIndex: 'propertyAddr',
      ellipsis: true,
      render: v => <span title={v}>{v}</span>
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 140,
      render: (s) => {
        const l = STATUS_LABELS[s] || { text: s, color: 'default' };
        return <Tag color={l.color} style={{ fontSize: 12 }}>{l.text}</Tag>;
      }
    },
    {
      title: '当前处理角色',
      dataIndex: 'currentHandlerRole',
      width: 110,
      render: (v) => v ? (
        <Tag color="blue">{({
          TENANT: '租客', HOUSEKEEPER: '管家', FINANCE: '财务', LEGAL: '法务', SIGN_ADMIN: '签署管理员'
        })[v] || v}</Tag>
      ) : <Tag>—</Tag>
    },
    {
      title: '申请日期',
      dataIndex: 'applyDate',
      width: 130,
      render: v => dayjs(v).format('YYYY-MM-DD')
    },
    {
      title: '期望租期',
      width: 100,
      render: (_, r) => `${r.expectedLeaseTerm || 12}个月`
    },
    {
      title: '操作',
      key: 'action',
      width: 140,
      fixed: 'right',
      render: (_, r) => (
        <Space>
          <Button size="small" type="primary" icon={<EyeOutlined />} onClick={() => navigate(`/renewals/${r.id}`)}>
            详情
          </Button>
        </Space>
      )
    }
  ];

  const filteredData = data.filter(r => {
    if (statusFilter && r.status !== statusFilter) return false;
    if (keyword) {
      const kw = keyword.toLowerCase();
      return (
        (r.appNo || '').toLowerCase().includes(kw) ||
        (r.tenantName || '').toLowerCase().includes(kw) ||
        (r.propertyAddr || '').toLowerCase().includes(kw)
      );
    }
    return true;
  });

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>
            <ThunderboltOutlined style={{ marginRight: 8, color: '#1677ff' }} />
            续签申请
          </h2>
          <div style={{ color: '#8c8c8c', marginTop: 4, fontSize: 13 }}>
            共 {data.length} 条续签申请记录
          </div>
        </div>
        <Space>
          <Button onClick={loadAll}>刷新</Button>
          {user?.role !== 'LEGAL' && user?.role !== 'FINANCE' && leases.length > 0 && (
            <DropdownMenu
              leases={leases}
              onSelect={(lease) => handleCreateRenewal(lease)}
            />
          )}
        </Space>
      </div>

      <div className="page-card" style={{ marginBottom: 16 }}>
        <Space wrap>
          <Input
            placeholder="搜索申请编号/租客/地址"
            prefix={<SearchOutlined />}
            value={keyword}
            onChange={e => setKeyword(e.target.value)}
            style={{ width: 280 }}
            allowClear
          />
          <Select
            placeholder="状态筛选"
            value={statusFilter}
            onChange={setStatusFilter}
            style={{ width: 200 }}
            allowClear
            options={Object.entries(STATUS_LABELS).map(([k, v]) => ({ label: v.text, value: k }))}
          />
        </Space>
      </div>

      <div className="page-card">
        <Table
          rowKey="id"
          loading={loading}
          dataSource={filteredData}
          columns={columns}
          scroll={{ x: 1200 }}
          pagination={{ pageSize: 10, showSizeChanger: true }}
        />
      </div>
    </div>
  );
}

function DropdownMenu({ leases, onSelect }) {
  const [open, setOpen] = useState(false);
  const items = leases.slice(0, 10).map(l => ({
    key: l.id,
    label: (
      <div>
        <div style={{ fontWeight: 500 }}>{l.tenantName} - {l.leaseNo}</div>
        <div style={{ fontSize: 12, color: '#8c8c8c' }}>
          {l.propertyAddr.slice(0, 24)} · ¥{l.currentRent}/月 · 剩{l.daysRemaining}天
        </div>
      </div>
    )
  }));
  return (
    <Modal
      title="选择租约发起续签"
      open={open}
      onCancel={() => setOpen(false)}
      footer={null}
      width={600}
    >
      <div style={{ maxHeight: 480, overflow: 'auto' }}>
        {leases.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#8c8c8c' }}>暂无即将到期的租约</div>
        ) : (
          leases.map(l => (
            <div
              key={l.id}
              style={{
                padding: 12,
                border: '1px solid #f0f0f0',
                borderRadius: 6,
                marginBottom: 8,
                cursor: 'pointer',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}
              onClick={() => { setOpen(false); onSelect(l); }}
              onMouseEnter={(e) => e.currentTarget.style.borderColor = '#1677ff'}
              onMouseLeave={(e) => e.currentTarget.style.borderColor = '#f0f0f0'}
            >
              <div>
                <div style={{ fontWeight: 500 }}>{l.tenantName} - {l.leaseNo}</div>
                <div style={{ fontSize: 12, color: '#8c8c8c', marginTop: 4 }}>
                  {l.propertyAddr}
                </div>
                <div style={{ fontSize: 12, marginTop: 4 }}>
                  租金 <b>¥{l.currentRent}</b>/月 · 到期 <Tag color={l.daysRemaining <= 30 ? 'red' : 'orange'}>{l.daysRemaining}天后</Tag>
                </div>
              </div>
              <Button type="primary" size="small" icon={<PlusOutlined />}>发起</Button>
            </div>
          ))
        )}
      </div>
    </Modal>
  );
}
