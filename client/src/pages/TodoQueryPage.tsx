import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTapdStore } from '../store/tapdStore';
import { getUsers, getTodos } from '../api/tapd';
import type { TapdUser, TapdTodo } from '../api/tapd';
import './TodoQueryPage.css';

export function TodoQueryPage() {
  const navigate = useNavigate();
  const { apiBaseUrl, apiToken } = useTapdStore();
  const [users, setUsers] = useState<TapdUser[]>([]);
  const [todos, setTodos] = useState<TapdTodo[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState('');

  useEffect(() => {
    if (!apiBaseUrl || !apiToken) {
      navigate('/tapd-config');
    }
  }, [apiBaseUrl, apiToken, navigate]);

  useEffect(() => {
    // 加载项目用户列表
    if (apiBaseUrl && apiToken) {
      getUsers('').then(setUsers).catch(() => setUsers([]));
    }
  }, [apiBaseUrl, apiToken]);

  const handleSearch = async () => {
    if (!selectedUserId) return;
    setLoading(true);
    try {
      const data = await getTodos(selectedUserId);
      setTodos(data);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="query-page">
      <h1>待办查询</h1>
      <div className="filters">
        <select value={selectedUserId} onChange={(e) => setSelectedUserId(e.target.value)}>
          <option value="">选择人员</option>
          {users.map(u => (
            <option key={u.id} value={u.id}>{u.name || u.nickname}</option>
          ))}
        </select>
        <button onClick={handleSearch} disabled={!selectedUserId || loading}>
          {loading ? '加载中...' : '查询'}
        </button>
      </div>
      <table>
        <thead>
          <tr><th>待办内容</th><th>状态</th><th>截止日期</th></tr>
        </thead>
        <tbody>
          {todos.map(t => (
            <tr key={t.id}>
              <td>{t.content}</td>
              <td>{t.status}</td>
              <td>{t.due_date}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
