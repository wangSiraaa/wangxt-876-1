import React, { useEffect, useState } from 'react';
import { Table, Tag, Button, Modal, Form, Input, InputNumber, Switch, Space, App as AntdApp } from 'antd';
import { SettingOutlined, PlusOutlined, CheckCircleOutlined } from '@ant-design/icons';
import axios from '../utils/api';
import dayjs from 'dayjs';
import { useAuth } from '../context/AuthContext.jsx';

export default function ThresholdPage() {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm();
  const { message } = AntdApp.useApp();
  const { user } = useAuth();
  const canEdit = user?.role === 'FINANCE' || user?.role === 'LEGAL';

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    try {
      const resp = await axios.get('/thresholds');
      setList(resp.data);
    } catch (e) {
      message.error(e.response?.data?.error || '加载失败');
    } finally {
      setLoading(false);
    }
  }

  async function submit() {
    try {
      const values = await form.validateFields();
      await axios.post('/thresholds', values);
      message.success('阈值创建成功，已自动激活');
      setOpen(false);
      form.resetFields();
      load();
    } catch (e) {
      message.error(e.response?.data?.error || '创建失败');
    }
  }

  async function activate(id) {
    try {
      await axios.post(`/thresholds/${id}/activate`);
      message.success('已激活');
      load();
    } catch (e) {
      message.error(e.response?.data?.error || '激活失败');
    }
  }

  const columns = [
    { title: '名称', dataIndex: 'name', render: (v, r) => <Space><b>{v}</b>{r.isActive && <Tag color="green"><CheckCircleOutlined /> 当前生效</Tag>}</Space> },
    {
      title: '涨幅范围',
      render: (_, r) => `${(r.minIncreaseRate * 100).toFixed(2)}% ~ ${(r.maxIncreaseRate * 100).toFixed(2)}%`
    },
    {
      title: '超过最大涨幅',
      dataIndex: 'legalReviewRequired',
      render: v => v ? <Tag color="red">需要法务复核</Tag> : <Tag>不强制复核</Tag>
    },
    { title: '生效日期', dataIndex: 'effectiveDate', render: v => dayjs(v).format('YYYY-MM-DD') },
    { title: '创建时间', dataIndex: 'createdAt', render: v => dayjs(v).format('YYYY-MM-DD HH:mm') },
    {
      title: '操作',
      key: 'op',
      render: (_, r) => !r.isActive && canEdit ? (
        <Button size="small" type="primary" onClick={() => activate(r.id)}>激活</Button>
      ) : r.isActive ? <Tag color="green">生效中</Tag> : null
    }
  ];

  return (
    <div>
      <div className="page-header">
        <div>
          <h2><SettingOutlined style={{ color: '#1677ff', marginRight: 8 }} />租金涨幅阈值配置</h2>
          <div style={{ color: '#8c8c8c', marginTop: 4, fontSize: 13 }}>配置租金涨幅阈值，超过阈值自动进入法务复核</div>
        </div>
        <Space>
          <Button onClick={load}>刷新</Button>
          {canEdit && (
            <Button type="primary" icon={<PlusOutlined />} onClick={() => { form.resetFields(); setOpen(true); }}>
              新建阈值
            </Button>
          )}
        </Space>
      </div>
      <div className="page-card">
        <Table
          rowKey="id"
          loading={loading}
          columns={columns}
          dataSource={list}
          pagination={{ pageSize: 10 }}
        />
      </div>

      <Modal
        title="新建租金涨幅阈值"
        open={open}
        onCancel={() => setOpen(false)}
        onOk={submit}
        okText="创建并激活"
        destroyOnClose
      >
        <Form form={form} layout="vertical" preserve={false}>
          <Form.Item
            name="name"
            label="阈值名称"
            rules={[{ required: true, message: '请输入名称' }]}
          >
            <Input placeholder="如：2024Q2 标准涨幅阈值" />
          </Form.Item>
          <Form.Item
            name="minIncreaseRate"
            label="最小涨幅（小数，如 0 表示 0%）"
            initialValue={0}
          >
            <InputNumber style={{ width: '100%' }} step={0.01} min={0} max={1} />
          </Form.Item>
          <Form.Item
            name="maxIncreaseRate"
            label="最大涨幅阈值（小数，如 0.10 表示 10%）"
            rules={[{ required: true, message: '请输入最大涨幅' }]}
            initialValue={0.10}
            extra="超过此值的租金方案将自动进入法务复核"
          >
            <InputNumber style={{ width: '100%' }} step={0.01} min={0} max={1} />
          </Form.Item>
          <Form.Item
            name="legalReviewRequired"
            label="超过阈值需要法务复核"
            initialValue={true}
            valuePropName="checked"
          >
            <Switch />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
