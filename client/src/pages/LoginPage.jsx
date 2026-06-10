import React, { useState } from 'react';
import { Form, Input, Button, Card, Select, App as AntdApp, message } from 'antd';
import { UserOutlined, LockOutlined, SafetyOutlined } from '@ant-design/icons';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth, ROLE_LABELS } from '../context/AuthContext.jsx';

const QUICK_LOGINS = [
  { username: 'tenant1', role: 'TENANT', desc: '租客-张三 (无欠费，案例用)' },
  { username: 'tenant_overdue', role: 'TENANT', desc: '租客-王五 (欠费，Smoke场景1)' },
  { username: 'tenant3', role: 'TENANT', desc: '租客-赵六 (超阈值涨租场景)' },
  { username: 'housekeeper', role: 'HOUSEKEEPER', desc: '管家-小林 (全流程核心角色)' },
  { username: 'finance', role: 'FINANCE', desc: '财务-陈姐 (欠费核对、阈值)' },
  { username: 'legal', role: 'LEGAL', desc: '法务-刘律 (复核、签署)' },
  { username: 'signadmin', role: 'SIGN_ADMIN', desc: '签管-周总 (签署管理员)' }
];

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [loading, setLoading] = useState(false);
  const { message } = AntdApp.useApp();
  const [form] = Form.useForm();

  const from = location.state?.from?.pathname || '/dashboard';

  const onFinish = async (values) => {
    setLoading(true);
    try {
      await login(values.username, values.password);
      message.success('登录成功');
      navigate(from, { replace: true });
    } catch (e) {
      message.error(e.response?.data?.error || '登录失败');
    } finally {
      setLoading(false);
    }
  };

  const quickLogin = async (username) => {
    form.setFieldsValue({ username, password: '123456' });
    setLoading(true);
    try {
      await login(username, '123456');
      message.success(`以 ${username} 身份登录成功`);
      navigate(from, { replace: true });
    } catch (e) {
      message.error(e.response?.data?.error || '快捷登录失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-container">
      <div className="login-card">
        <div className="login-title">房屋租赁合同续签管理系统</div>
        <div className="login-subtitle">多角色协作 · 全流程管控 · 合规保障</div>

        <Form
          form={form}
          layout="vertical"
          onFinish={onFinish}
          autoComplete="off"
          size="large"
        >
          <Form.Item
            name="username"
            rules={[{ required: true, message: '请输入用户名' }]}
          >
            <Input prefix={<UserOutlined />} placeholder="用户名" allowClear />
          </Form.Item>
          <Form.Item
            name="password"
            rules={[{ required: true, message: '请输入密码' }]}
          >
            <Input.Password prefix={<LockOutlined />} placeholder="密码 (默认 123456)" />
          </Form.Item>

          <Form.Item style={{ marginBottom: 8 }}>
            <Button
              type="primary"
              htmlType="submit"
              block
              loading={loading}
              size="large"
              icon={<SafetyOutlined />}
              style={{ height: 44, fontSize: 16 }}
            >
              登录系统
            </Button>
          </Form.Item>
        </Form>

        <div style={{
          marginTop: 28,
          paddingTop: 20,
          borderTop: '1px dashed #e5e7eb'
        }}>
          <div style={{
            color: '#8c8c8c',
            fontSize: 12,
            marginBottom: 10,
            fontWeight: 500
          }}>
            🚀 测试账号一键登录 (密码均为 123456)
          </div>
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr',
            gap: 6
          }}>
            {QUICK_LOGINS.map((q, idx) => (
              <Button
                key={idx}
                onClick={() => quickLogin(q.username)}
                loading={loading}
                size="small"
                style={{
                  textAlign: 'left',
                  height: 'auto',
                  padding: '6px 12px',
                  lineHeight: 1.4
                }}
              >
                <span style={{
                  display: 'inline-block',
                  padding: '1px 6px',
                  fontSize: 11,
                  background: q.role === 'TENANT' ? '#e6f4ff'
                    : q.role === 'HOUSEKEEPER' ? '#f0f5ff'
                    : q.role === 'FINANCE' ? '#f6ffed'
                    : q.role === 'LEGAL' ? '#fff7e6'
                    : '#f9f0ff',
                  color: q.role === 'TENANT' ? '#1677ff'
                    : q.role === 'HOUSEKEEPER' ? '#2f54eb'
                    : q.role === 'FINANCE' ? '#52c41a'
                    : q.role === 'LEGAL' ? '#fa8c16'
                    : '#722ed1',
                  borderRadius: 4,
                  marginRight: 8,
                  fontWeight: 600
                }}>
                  {ROLE_LABELS[q.role]}
                </span>
                <span style={{ color: 'rgba(0,0,0,0.85)', fontWeight: 500 }}>
                  {q.username}
                </span>
                <span style={{ color: '#8c8c8c', fontSize: 11, marginLeft: 6 }}>
                  {q.desc}
                </span>
              </Button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
