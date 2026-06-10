import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { Layout, Menu, Avatar, Dropdown, Button } from 'antd';
import {
  DashboardOutlined,
  FileTextOutlined,
  HomeOutlined,
  SettingOutlined,
  BellOutlined,
  UserOutlined,
  LogoutOutlined,
  ThunderboltOutlined,
  SafetyOutlined
} from '@ant-design/icons';
import { useNavigate, useLocation } from 'react-router-dom';

import LoginPage from './pages/LoginPage.jsx';
import DashboardPage from './pages/DashboardPage.jsx';
import LeaseListPage from './pages/LeaseListPage.jsx';
import RenewalListPage from './pages/RenewalListPage.jsx';
import RenewalDetailPage from './pages/RenewalDetailPage.jsx';
import ThresholdPage from './pages/ThresholdPage.jsx';
import RemindersPage from './pages/RemindersPage.jsx';
import LegalReviewPage from './pages/LegalReviewPage.jsx';

import { useAuth, ROLE_LABELS } from './context/AuthContext.jsx';

const { Header, Sider, Content } = Layout;

function ProtectedRoute({ children }) {
  const { isAuthenticated } = useAuth();
  const location = useLocation();
  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }
  return children;
}

function AppLayout() {
  const { user, logout, roleLabel } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const getMenuKey = () => {
    if (location.pathname.startsWith('/renewals/legal')) return 'legal-review';
    if (location.pathname.startsWith('/renewals/')) return 'renewals';
    if (location.pathname.startsWith('/renewals')) return 'renewals';
    if (location.pathname.startsWith('/leases')) return 'leases';
    if (location.pathname.startsWith('/reminders')) return 'reminders';
    if (location.pathname.startsWith('/thresholds')) return 'thresholds';
    if (location.pathname === '/' || location.pathname === '/dashboard') return 'dashboard';
    return 'dashboard';
  };

  const userMenu = {
    items: [
      {
        key: 'profile',
        icon: <UserOutlined />,
        label: `${user?.realName} (${roleLabel})`
      },
      { type: 'divider' },
      {
        key: 'logout',
        icon: <LogoutOutlined />,
        label: '退出登录',
        onClick: async () => {
          await logout();
          navigate('/login');
        }
      }
    ]
  };

  const menuItems = [
    {
      key: 'dashboard',
      icon: <DashboardOutlined />,
      label: '工作台',
      onClick: () => navigate('/dashboard')
    },
    {
      key: 'renewals',
      icon: <ThunderboltOutlined />,
      label: '续签申请',
      onClick: () => navigate('/renewals')
    },
    {
      key: 'leases',
      icon: <HomeOutlined />,
      label: '租约管理',
      onClick: () => navigate('/leases')
    },
    {
      key: 'reminders',
      icon: <BellOutlined />,
      label: '到期提醒',
      onClick: () => navigate('/reminders')
    },
    (user?.role === 'LEGAL') ? {
      key: 'legal-review',
      icon: <SafetyOutlined />,
      label: '法务复核',
      onClick: () => navigate('/renewals/legal')
    } : null,
    (user?.role === 'FINANCE' || user?.role === 'LEGAL') ? {
      key: 'thresholds',
      icon: <SettingOutlined />,
      label: '涨幅阈值',
      onClick: () => navigate('/thresholds')
    } : null
  ].filter(Boolean);

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider width={220} theme="dark" breakpoint="lg" collapsedWidth="0">
        <div style={{
          height: 64,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#fff',
          fontSize: 18,
          fontWeight: 700,
          borderBottom: '1px solid rgba(255,255,255,0.08)'
        }}>
          <FileTextOutlined style={{ marginRight: 8 }} />
          租约续签系统
        </div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[getMenuKey()]}
          items={menuItems}
          style={{ borderRight: 0, padding: '12px 0' }}
        />
      </Sider>
      <Layout>
        <Header style={{
          background: '#fff',
          padding: '0 24px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
          height: 64
        }}>
          <div style={{ fontSize: 16, fontWeight: 600, color: 'rgba(0,0,0,0.88)' }}>
            欢迎回来，{user?.realName}！
            <span style={{
              marginLeft: 12,
              fontSize: 12,
              background: '#e6f4ff',
              color: '#1677ff',
              padding: '2px 8px',
              borderRadius: 10
            }}>
              {roleLabel}
            </span>
          </div>
          <Dropdown menu={userMenu} placement="bottomRight">
            <Button type="text" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Avatar icon={<UserOutlined />} style={{ background: '#1677ff' }} />
              <span>{user?.realName}</span>
            </Button>
          </Dropdown>
        </Header>
        <Content className="app-main-content">
          <Routes>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/leases" element={<LeaseListPage />} />
            <Route path="/renewals" element={<RenewalListPage />} />
            <Route path="/renewals/:id" element={<RenewalDetailPage />} />
            <Route path="/renewals/legal" element={<LegalReviewPage />} />
            <Route path="/thresholds" element={<ThresholdPage />} />
            <Route path="/reminders" element={<RemindersPage />} />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </Content>
      </Layout>
    </Layout>
  );
}

export default function App() {
  const { isAuthenticated } = useAuth();
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/*"
        element={
          <ProtectedRoute>
            <AppLayout />
          </ProtectedRoute>
        }
      />
    </Routes>
  );
}
