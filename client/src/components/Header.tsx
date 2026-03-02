import { useState, useEffect, useRef } from 'react';
import type { User } from '../types';
import './Header.css';

interface HeaderProps {
  user: User | null;
  onLogout: () => void;
  onNewTodo: () => void;
  onNewCard: () => void;
  onOpenTags: () => void;
}

export function Header({ user, onLogout, onNewTodo, onNewCard, onOpenTags }: HeaderProps) {
  const [showUserMenu, setShowUserMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowUserMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const getInitial = () => {
    if (user?.nickname) return user.nickname[0];
    if (user?.email) return user.email[0].toUpperCase();
    return '?';
  };

  return (
    <header className="header">
      <div className="header-left">
        <div className="logo2">
          <div className="logo-icon-sm">✓</div>
          <span>AI待办</span>
        </div>
        <nav className="nav">
          <div className="nav-item active">看板</div>
          <div className="nav-item">日历</div>
          <div className="nav-item">统计</div>
        </nav>
      </div>
      <div className="header-right">
        <button className="btn-sm" onClick={onNewTodo}>+ 新建待办</button>
        <button className="btn-sm" onClick={onNewCard}>+ 新建卡片</button>
        <div className="user-dropdown" ref={menuRef}>
          <div
            className="avatar"
            onClick={() => setShowUserMenu(!showUserMenu)}
          >
            {getInitial()}
          </div>
          {showUserMenu && (
            <div className="user-menu">
              <div onClick={() => {}}>👤 个人中心</div>
              <div onClick={onOpenTags}>🏷️ 标签管理</div>
              <div className="danger" onClick={onLogout}>
                🚪 退出登录
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
