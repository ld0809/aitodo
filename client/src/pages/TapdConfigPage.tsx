import { useState } from 'react';
import { useTapdStore } from '../store/tapdStore';
import './TapdConfigPage.css';

export function TapdConfigPage() {
  const { apiBaseUrl, setConfig } = useTapdStore();
  const [localUrl, setLocalUrl] = useState(apiBaseUrl);
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    setConfig({ apiBaseUrl: localUrl });
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
      <button onClick={handleSave}>保存配置</button>
      {saved && <span className="success">保存成功</span>}
    </div>
  );
}
