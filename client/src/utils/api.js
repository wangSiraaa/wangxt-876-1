import axios from 'axios';

const instance = axios.create({
  baseURL: '/api',
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json'
  }
});

instance.interceptors.response.use(
  response => response,
  error => {
    if (error.response?.status === 401) {
      try {
        localStorage.removeItem('lr_auth');
      } catch (_) {}
      if (!window.location.hash?.includes('login') &&
          !window.location.pathname?.includes('login')) {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

export default instance;
