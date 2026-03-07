import { useState, useRef, useEffect } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import axios from 'axios';
import { authApi } from '../api/auth';
import './AuthPages.css';

export function VerifyPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const email = (location.state as { email?: string })?.email || '';
  
  const [code, setCode] = useState(['', '', '', '', '', '']);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    if (inputRefs.current[0]) {
      inputRefs.current[0].focus();
    }
  }, []);

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
    
    // Focus on the last filled input or next empty one
    const lastFilledIndex = pastedData.length - 1;
    if (lastFilledIndex < 5) {
      inputRefs.current[lastFilledIndex + 1]?.focus();
    } else {
      inputRefs.current[5]?.focus();
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const verificationCode = code.join('');
    if (verificationCode.length !== 6) {
      setError('请输入完整的6位验证码');
      return;
    }

    setLoading(true);
    try {
      await authApi.verifyEmail(email, verificationCode);
      navigate('/login');
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
      await authApi.sendEmailCode(email);
      setError('');
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

  if (!email) {
    return (
      <div className="auth-page">
        <div className="auth-box">
          <p>请先 <Link to="/register">注册</Link> 或 <Link to="/login">登录</Link></p>
        </div>
      </div>
    );
  }

  const setRef = (index: number) => (el: HTMLInputElement | null) => {
    inputRefs.current[index] = el;
  };

  return (
    <div className="auth-page">
      <div className="auth-box">
        <div className="logo">
          <div className="logo-icon">✓</div>
          <span>AI待办</span>
        </div>
        <h1>验证邮箱</h1>
        <p className="sub">我们已发送验证码到 {email}</p>
        
        {error && <div className="error-message">{error}</div>}
        
        <form onSubmit={handleSubmit}>
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
        </div>
      </div>
    </div>
  );
}
