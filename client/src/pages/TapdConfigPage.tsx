import { useState } from 'react';
import { useTapdStore } from '../store/tapdStore';
import './TapdConfigPage.css';

export function TapdConfigPage() {
  const { apiBaseUrl, apiToken, setConfig } = useTapdStore();
  const [localUrl, setLocalUrl] = useState(apiBaseUrl);
  const [localToken, setLocalToken] = useState(apiToken);
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    setConfig({ apiBaseUrl: localUrl, apiToken: localToken });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="tapd-config-page">
      <h1>TAPD 配置</h1>
      <div className="form-group">
        <label>API Base URL</label>
        <input
          type="text"
          value={localUrl}
          onChange={(e) => setLocalUrl(e.target.value)}
          placeholder="https://api.tapd.cn"
        />
      </div>
      <div className="form-group">
        <label>API Token</label>
        <input
          type="password"
          value={localToken}
          onChange={(e) => setLocalToken(e.target.value)}
          placeholder="输入 TAPD API Token"
        />
      </div>
      <button onClick={handleSave}>保存配置</button>
      {saved && <span className="success">保存成功</span>}
    </div>
  );
}
