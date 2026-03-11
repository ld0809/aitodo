import { Link } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import './LandingPage.css';

const FEATURE_ITEMS = [
  {
    title: 'TAPD 同步',
    description: '通过卡片配置直接同步 TAPD 需求、缺陷和待办，避免多系统来回切换。',
  },
  {
    title: 'AI 报告',
    description: '基于待办进度自动生成周报、月报和自定义时间段总结，减少重复整理时间。',
  },
  {
    title: '多用户协作',
    description: '共享卡片 + @成员待办流转，让团队分工和反馈在同一块看板内闭环。',
  },
];

export function LandingPage() {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  return (
    <div className="landing-page">
      <header className="landing-topbar">
        <div className="landing-brand">
          <span className="landing-logo">AI TODO</span>
          <span className="landing-slogan">简单快捷的任务中枢</span>
        </div>
        <div className="landing-actions">
          {isAuthenticated ? (
            <Link className="landing-btn landing-btn-primary" to="/dashboard">
              进入看板
            </Link>
          ) : (
            <>
              <Link className="landing-btn landing-btn-ghost" to="/login">
                登录
              </Link>
              <Link className="landing-btn landing-btn-primary" to="/register">
                注册
              </Link>
            </>
          )}
        </div>
      </header>

      <main className="landing-main">
        <section className="landing-hero">
          <div className="landing-badge">AI Todo · Phase 5</div>
          <h1>一个页面，掌握你的任务方向和执行节奏</h1>
          <p>
            聚合来自 TAPD 和团队协作场景的待办，结合 AI 报告与共享卡片，让任务管理回归简单、直接、高效。
          </p>
          <div className="landing-hero-actions">
            <Link className="landing-btn landing-btn-primary" to={isAuthenticated ? '/dashboard' : '/register'}>
              {isAuthenticated ? '打开工作台' : '立即开始'}
            </Link>
            {!isAuthenticated && (
              <Link className="landing-btn landing-btn-ghost" to="/login">
                已有账号，去登录
              </Link>
            )}
          </div>
        </section>

        <section className="landing-features" aria-label="功能特色">
          {FEATURE_ITEMS.map((feature) => (
            <article className="feature-card" key={feature.title}>
              <h2>{feature.title}</h2>
              <p>{feature.description}</p>
            </article>
          ))}
        </section>
      </main>
    </div>
  );
}
