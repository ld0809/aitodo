import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTapdStore } from '../store/tapdStore';
import { getProjects, getBugs } from '../api/tapd';
import type { TapdProject, TapdBug } from '../api/tapd';
import './BugQueryPage.css';

export function BugQueryPage() {
  const navigate = useNavigate();
  const { apiBaseUrl } = useTapdStore();
  const [projects, setProjects] = useState<TapdProject[]>([]);
  const [bugs, setBugs] = useState<TapdBug[]>([]);
  const [loading, setLoading] = useState(false);
  const [projectId, setProjectId] = useState('');
  const [version, setVersion] = useState('');
  const [title, setTitle] = useState('');

  useEffect(() => {
    if (!apiBaseUrl) {
      navigate('/tapd-config');
    }
  }, [apiBaseUrl, navigate]);

  useEffect(() => {
    if (projectId) {
      getProjects().then(setProjects);
    }
  }, [projectId]);

  const handleSearch = async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      const data = await getBugs({
        projectId,
        version: version || undefined,
        title: title || undefined,
      });
      setBugs(data);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="query-page">
      <h1>缺陷查询</h1>
      <div className="filters">
        <select value={projectId} onChange={(e) => setProjectId(e.target.value)}>
          <option value="">选择项目（必选）</option>
          {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <input placeholder="版本" value={version} onChange={(e) => setVersion(e.target.value)} />
        <input placeholder="标题特征" value={title} onChange={(e) => setTitle(e.target.value)} />
        <button onClick={handleSearch} disabled={!projectId || loading}>
          {loading ? '加载中...' : '查询'}
        </button>
      </div>
      <table>
        <thead>
          <tr><th>ID</th><th>标题</th><th>状态</th><th>严重程度</th><th>优先级</th><th>指派给</th></tr>
        </thead>
        <tbody>
          {bugs.map(b => (
            <tr key={b.id}>
              <td>{b.bug_id}</td>
              <td>{b.title}</td>
              <td>{b.status}</td>
              <td>{b.severity}</td>
              <td>{b.priority}</td>
              <td>{b.assignee}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
