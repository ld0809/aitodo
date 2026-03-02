import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTapdStore } from '../store/tapdStore';
import { getProjects, getIterations, getRequirements } from '../api/tapd';
import type { TapdProject, TapdIteration, TapdRequirement } from '../api/tapd';
import './RequirementQueryPage.css';

export function RequirementQueryPage() {
  const navigate = useNavigate();
  const { apiBaseUrl, apiToken } = useTapdStore();
  const [projects, setProjects] = useState<TapdProject[]>([]);
  const [iterations, setIterations] = useState<TapdIteration[]>([]);
  const [requirements, setRequirements] = useState<TapdRequirement[]>([]);
  const [loading, setLoading] = useState(false);
  const [projectId, setProjectId] = useState('');
  const [iterationId, setIterationId] = useState('');

  useEffect(() => {
    if (!apiBaseUrl || !apiToken) {
      navigate('/tapd-config');
    }
  }, [apiBaseUrl, apiToken, navigate]);

  useEffect(() => {
    if (projectId) {
      getIterations(projectId).then(setIterations);
      getProjects().then(setProjects);
    }
  }, [projectId]);

  const handleSearch = async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      const data = await getRequirements({
        projectId,
        iterationId: iterationId || undefined,
      });
      setRequirements(data);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="query-page">
      <h1>需求查询</h1>
      <div className="filters">
        <select value={projectId} onChange={(e) => setProjectId(e.target.value)}>
          <option value="">选择项目（必选）</option>
          {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select value={iterationId} onChange={(e) => setIterationId(e.target.value)}>
          <option value="">选择迭代</option>
          {iterations.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
        </select>
        <button onClick={handleSearch} disabled={!projectId || loading}>
          {loading ? '加载中...' : '查询'}
        </button>
      </div>
      <table>
        <thead>
          <tr><th>ID</th><th>名称</th><th>状态</th><th>负责人</th><th>迭代</th></tr>
        </thead>
        <tbody>
          {requirements.map(r => (
            <tr key={r.id}>
              <td>{r.story_id}</td>
              <td>{r.name}</td>
              <td>{r.status}</td>
              <td>{r.owner}</td>
              <td>{r.iteration_name}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
