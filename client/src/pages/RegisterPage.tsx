import { useState, useRef, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import axios from 'axios';
import { authApi } from '../api/auth';
import { useAuthStore } from '../store/authStore';
import './AuthPages.css';

export function RegisterPage() {
  const navigate = useNavigate();
  const setAuth = useAuthStore((state) => state.setAuth);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  
  // 步骤状态: 'register' | 'verify'
  const [step, setStep] = useState<'register' | 'verify'>('register');
  
  // 验证码输入
  const [code, setCode] = useState(['', '', '', '', '', '']);
  const [resending, setResending] = useState(false);
  const [debugCode, setDebugCode] = useState<string | null>(null);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // 开发环境标志
  const isDev = import.meta.env.DEV;

  useEffect(() => {
    if (step === 'verify' && inputRefs.current[0]) {
      inputRefs.current[0].focus();
    }
  }, [step]);

  const handleInput = (index: number, value: string) => {
    if (value.length === 1 && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
    
    const newCode = [...code];
    newCode[index] = value;
    setCode(newCode);
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !code[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData('text').slice(0, 6);
    const newCode = [...code];
    for (let i = 0; i < pastedData.length; i++) {
      newCode[i] = pastedData[i];
    }
    setCode(newCode);
    
    const lastFilledIndex = pastedData.length - 1;
    if (lastFilledIndex < 5) {
      inputRefs.current[lastFilledIndex + 1]?.focus();
    } else {
      inputRefs.current[5]?.focus();
    }
  };

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // Email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      setError('请输入有效的邮箱地址');
      return;
    }

    if (password !== confirmPassword) {
      setError('两次输入的密码不一致');
      return;
    }

    if (password.length < 8) {
      setError('密码至少8位，包含字母和数字');
      return;
    }

    setLoading(true);
    try {
      // Register first
      const registerResponse = await authApi.register(email, password);
      
      // Check for debug code in development environment
      const responseData = registerResponse.data;
      if (isDev && responseData.debugVerificationCode) {
        const debug = responseData.debugVerificationCode;
        setDebugCode(debug);
        console.log('[开发环境] 验证码:', debug);
      }
      
      // Send verification code
      await authApi.sendEmailCode(email);
      
      // Switch to verification step
      setStep('verify');
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) {
        setError((err.response?.data as { message?: string } | undefined)?.message || '注册失败，请重试');
      } else {
        setError('注册失败，请重试');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleVerifySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const verificationCode = code.join('');
    if (verificationCode.length !== 6) {
      setError('请输入完整的6位验证码');
      return;
    }

    setLoading(true);
    try {
      await authApi.verifyEmail(email, verificationCode);
      const loginResponse = await authApi.login(email, password);
      setAuth(loginResponse.data.user, loginResponse.data.accessToken);
      navigate('/dashboard');
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) {
        setError((err.response?.data as { message?: string } | undefined)?.message || '验证失败，请重试');
      } else {
        setError('验证失败，请重试');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setResending(true);
    try {
      const resendResponse = await authApi.sendEmailCode(email);
      setError('');
      if (isDev && resendResponse.data.debugCode) {
        setDebugCode(resendResponse.data.debugCode);
      }
      alert('验证码已重新发送');
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) {
        setError((err.response?.data as { message?: string } | undefined)?.message || '发送失败，请重试');
      } else {
        setError('发送失败，请重试');
      }
    } finally {
      setResending(false);
    }
  };

  const handleBackToRegister = () => {
    setStep('register');
    setCode(['', '', '', '', '', '']);
    setError('');
    setDebugCode(null);
  };

  const setRef = (index: number) => (el: HTMLInputElement | null) => {
    inputRefs.current[index] = el;
  };

  // 验证步骤的UI
  if (step === 'verify') {
    return (
      <div className="auth-page">
        <div className="auth-box">
          <div className="logo">
            <div className="logo-icon">✓</div>
            <span>AI待办</span>
          </div>
          <h1>验证邮箱</h1>
          <p className="sub">验证码已发送至 {email}</p>
          
          {/* 开发环境提示 */}
          {isDev && debugCode && (
            <div className="debug-hint" style={{
              background: '#fef3c7',
              color: '#92400e',
              padding: '12px',
              borderRadius: '6px',
              marginBottom: '20px',
              fontSize: '14px',
              textAlign: 'center'
            }}>
              🔧 开发环境提示：验证码为 <strong>{debugCode}</strong>
            </div>
          )}
          
          {error && <div className="error-message">{error}</div>}
          
          <form onSubmit={handleVerifySubmit}>
            <div className="mb">
              <label>验证码</label>
              <div className="vcode" onPaste={handlePaste}>
                {code.map((digit, index) => (
                  <input
                    key={index}
                    ref={setRef(index)}
                    type="text"
                    maxLength={1}
                    value={digit}
                    onChange={(e) => handleInput(index, e.target.value)}
                    onKeyDown={(e) => handleKeyDown(index, e)}
                  />
                ))}
              </div>
            </div>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? '验证中...' : '验证'}
            </button>
          </form>
          <div className="footer">
            <button className="link-button" onClick={handleResend} disabled={resending}>
              {resending ? '发送中...' : '重新发送验证码'}
            </button>
            <div style={{ marginTop: '12px' }}>
              <button className="link-button" onClick={handleBackToRegister}>
                ← 返回重新填写
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // 注册步骤的UI
  return (
    <div className="auth-page">
      <div className="auth-box">
        <div className="logo">
          <div className="logo-icon">✓</div>
          <span>AI待办</span>
        </div>
        <h1>注册账号</h1>
        <p className="sub">创建您的账号，开始高效管理待办</p>
        
        {error && <div className="error-message">{error}</div>}
        
        <form onSubmit={handleRegisterSubmit}>
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
              placeholder="至少8位，包含字母和数字"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          <div className="mb">
            <label>确认密码</label>
            <input
              type="password"
              placeholder="再次输入密码"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
            />
          </div>
          <button type="submit" className="btn btn-primary" disabled={loading}>
            {loading ? '注册中...' : '注册'}
          </button>
        </form>
        <div className="footer">
          已有账号？<Link to="/login">立即登录</Link>
        </div>
      </div>
    </div>
  );
}
