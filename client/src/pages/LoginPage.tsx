import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import axios from 'axios';
import { authApi } from '../api/auth';
import { useAuthStore } from '../store/authStore';
import './AuthPages.css';

function shouldRedirectToVerify(err: unknown) {
  if (!axios.isAxiosError(err)) {
    return false;
  }

  const payload = err.response?.data as { message?: string | string[] } | undefined;
  const rawMessage = payload?.message;
  const message = Array.isArray(rawMessage) ? rawMessage.join(' ') : rawMessage ?? '';
  return err.response?.status === 403 && message.includes('email not verified');
}

export function LoginPage() {
  const navigate = useNavigate();
  const setAuth = useAuthStore((state) => state.setAuth);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await authApi.login(email, password);
      setAuth(response.data.user, response.data.accessToken);
      navigate('/dashboard');
    } catch (err: unknown) {
      if (shouldRedirectToVerify(err)) {
        let autoSent = false;
        let debugCode: string | undefined;
        try {
          const resendResponse = await authApi.sendEmailCode(email);
          autoSent = true;
          debugCode = resendResponse.data.debugCode;
        } catch {
          autoSent = false;
        }

        navigate('/verify', {
          state: {
            email,
            from: 'login',
            autoSent,
            debugCode,
          },
        });
        return;
      }

      if (axios.isAxiosError(err)) {
        setError((err.response?.data as { message?: string } | undefined)?.message || '登录失败，请检查邮箱和密码');
      } else {
        setError('登录失败，请检查邮箱和密码');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-box">
        <div className="logo">
          <div className="logo-icon">✓</div>
          <span>AI待办</span>
        </div>
        <h1>登录账号</h1>
        <p className="sub">欢迎回来，继续您的待办管理</p>
        
        {error && <div className="error-message">{error}</div>}
        
        <form onSubmit={handleSubmit}>
          <div className="mb">
            <label>邮箱地址</label>
            <input
              type="email"
              placeholder="your@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="mb">
            <label>密码</label>
            <input
              type="password"
              placeholder="输入密码"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          <button type="submit" className="btn btn-primary" disabled={loading}>
            {loading ? '登录中...' : '登录'}
          </button>
        </form>
        <div className="footer">
          没有账号？<Link to="/register">立即注册</Link>
        </div>
      </div>
    </div>
  );
}
