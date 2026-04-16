import { useEffect, useMemo, useState } from 'react';
import { NavLink, Navigate, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { usersApi } from '../api/users';
import { openClawApi } from '../api/openclaw';
import { useAuthStore } from '../store/authStore';
import type { OpenClawBinding } from '../types';
import './SettingsPage.css';

type SettingsSection = 'profile' | 'openclaw';

const SETTINGS_NAV_ITEMS: Array<{
  id: SettingsSection;
  label: string;
  description: string;
}> = [
  {
    id: 'profile',
    label: '个人信息',
    description: '昵称与账号资料',
  },
  {
    id: 'openclaw',
    label: 'OpenClaw 绑定',
    description: '本地连接与自动分发',
  },
];

function formatDateTime(value?: string | null) {
  if (!value) {
    return '暂无';
  }
  return new Date(value).toLocaleString('zh-CN');
}

export function SettingsPage() {
  const navigate = useNavigate();
  const { section } = useParams<{ section?: string }>();
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);
  const updateUser = useAuthStore((state) => state.updateUser);

  const activeSection = useMemo<SettingsSection | null>(() => {
    if (section === 'profile' || section === 'openclaw') {
      return section;
    }
    if (section === undefined) {
      return 'profile';
    }
    return null;
  }, [section]);

  const userScope = user?.id ?? 'anonymous';
  const [nicknameDraft, setNicknameDraft] = useState('');
  const [profileFormDirty, setProfileFormDirty] = useState(false);
  const [openClawDeviceLabel, setOpenClawDeviceLabel] = useState('');
  const [openClawTimeoutSeconds, setOpenClawTimeoutSeconds] = useState('900');
  const [openClawEnabled, setOpenClawEnabled] = useState(true);
  const [openClawFormDirty, setOpenClawFormDirty] = useState(false);

  const getErrorMessage = (error: unknown, fallback: string) => {
    if (axios.isAxiosError(error)) {
      const message = (error.response?.data as { message?: string } | undefined)?.message;
      if (message) {
        return message;
      }
    }
    return fallback;
  };

  const copyText = async (text: string, successMessage: string) => {
    try {
      if (navigator.clipboard?.writeText && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.setAttribute('readonly', 'true');
        textarea.style.position = 'fixed';
        textarea.style.top = '-9999px';
        textarea.style.left = '-9999px';
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        const copied = document.execCommand('copy');
        document.body.removeChild(textarea);
        if (!copied) {
          throw new Error('copy command failed');
        }
      }
      alert(successMessage);
    } catch {
      alert('复制失败，请手动复制。');
    }
  };

  const { data: meProfile } = useQuery({
    queryKey: ['me', userScope],
    enabled: !!user,
    queryFn: () => usersApi.getMe().then((res) => res.data),
  });

  const { data: openClawBinding } = useQuery({
    queryKey: ['openclaw-me', userScope],
    enabled: !!user,
    queryFn: () => openClawApi.getMe().then((res) => res.data),
  });

  useEffect(() => {
    if (meProfile) {
      updateUser(meProfile);
    }
  }, [meProfile, updateUser]);

  useEffect(() => {
    if (profileFormDirty) {
      return;
    }
    setNicknameDraft(meProfile?.nickname ?? '');
  }, [meProfile?.nickname, profileFormDirty]);

  const handleHydrateOpenClawForm = (binding?: OpenClawBinding | null) => {
    setOpenClawDeviceLabel(binding?.deviceLabel ?? binding?.suggestedDeviceLabel ?? '');
    setOpenClawTimeoutSeconds(String(binding?.timeoutSeconds ?? 900));
    setOpenClawEnabled(binding?.connectToken ? binding.enabled : false);
    setOpenClawFormDirty(false);
  };

  useEffect(() => {
    if (openClawFormDirty) {
      return;
    }
    handleHydrateOpenClawForm(openClawBinding);
  }, [
    openClawFormDirty,
    openClawBinding?.connectToken,
    openClawBinding?.deviceLabel,
    openClawBinding?.timeoutSeconds,
    openClawBinding?.enabled,
    openClawBinding?.connectionStatus,
    openClawBinding?.suggestedDeviceLabel,
  ]);

  const updateProfileMutation = useMutation({
    mutationFn: (data: { nickname?: string }) => usersApi.updateMe(data),
    onSuccess: (res) => {
      updateUser(res.data);
      queryClient.invalidateQueries({ queryKey: ['me', userScope] });
    },
  });

  const updateOpenClawMutation = useMutation({
    mutationFn: (data: {
      deviceLabel?: string;
      enabled?: boolean;
      timeoutSeconds?: number;
      rotateToken?: boolean;
    }) => openClawApi.updateMe(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['openclaw-me', userScope] });
    },
  });

  const provisionOpenClawMutation = useMutation({
    mutationFn: () => openClawApi.provisionMe(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['openclaw-me', userScope] });
    },
  });

  const deleteOpenClawMutation = useMutation({
    mutationFn: () => openClawApi.deleteMe(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['openclaw-me', userScope] });
    },
  });

  const handleSaveProfile = async () => {
    const nextNickname = nicknameDraft.trim().slice(0, 100);
    try {
      await updateProfileMutation.mutateAsync({ nickname: nextNickname });
      setProfileFormDirty(false);
      alert('个人信息已保存');
    } catch (error) {
      alert(getErrorMessage(error, '保存个人信息失败'));
    }
  };

  const handleSaveOpenClaw = async () => {
    if (!openClawBinding?.connectToken) {
      return;
    }
    const trimmedDeviceLabel = openClawDeviceLabel.trim();
    const parsedTimeoutSeconds = Number.parseInt(openClawTimeoutSeconds, 10);
    const timeoutSeconds = Number.isFinite(parsedTimeoutSeconds)
      ? Math.min(3600, Math.max(30, parsedTimeoutSeconds))
      : 900;

    try {
      const response = await updateOpenClawMutation.mutateAsync({
        deviceLabel: trimmedDeviceLabel || undefined,
        enabled: openClawEnabled,
        timeoutSeconds,
      });
      handleHydrateOpenClawForm(response.data);
      alert('OpenClaw 设置已保存');
    } catch (error) {
      alert(getErrorMessage(error, '保存 OpenClaw 设置失败'));
    }
  };

  const handleProvisionOpenClaw = async () => {
    try {
      const response = await provisionOpenClawMutation.mutateAsync();
      handleHydrateOpenClawForm(response.data);
      alert('已生成连接信息，请继续执行下一步。');
    } catch (error) {
      alert(getErrorMessage(error, '生成连接信息失败'));
    }
  };

  const handleRotateOpenClawToken = async () => {
    if (!openClawBinding?.connectToken) {
      return;
    }
    if (!confirm('重置连接令牌后，当前本地连接会断开，需要重新使用新令牌连接。是否继续？')) {
      return;
    }
    try {
      const response = await updateOpenClawMutation.mutateAsync({
        rotateToken: true,
      });
      handleHydrateOpenClawForm(response.data);
      alert('连接令牌已重置，请更新本地配置后重新连接。');
    } catch (error) {
      alert(getErrorMessage(error, '重置连接令牌失败'));
    }
  };

  const handleDeleteOpenClaw = async () => {
    if (!openClawBinding?.connectToken) {
      return;
    }
    if (!confirm('确定解除当前 OpenClaw 绑定吗？')) {
      return;
    }
    try {
      await deleteOpenClawMutation.mutateAsync();
      handleHydrateOpenClawForm(null);
      alert('OpenClaw 绑定已解除');
    } catch (error) {
      alert(getErrorMessage(error, '解除 OpenClaw 绑定失败'));
    }
  };

  if (activeSection === null) {
    return <Navigate to="/settings/profile" replace />;
  }

  const openClawPluginInstallCommand = openClawBinding?.pluginInstallCommand ?? null;
  const openClawPluginEnableCommand = openClawBinding?.pluginEnableCommand ?? null;
  const openClawPluginConfigSnippet = openClawBinding?.pluginConfigSnippet ?? null;
  const openClawPluginPackageName = openClawBinding?.pluginPackageName?.trim() || 'openclaw-channel-aitodo';
  const openClawTokenReady = !!openClawBinding?.connectToken;
  const openClawConnectionReady = openClawBinding?.connected ?? false;
  const openClawRuntimeReady = openClawDeviceLabel.trim().length > 0;
  const openClawAutoDispatchReady = openClawEnabled;
  const openClawMutating =
    provisionOpenClawMutation.isPending ||
    updateOpenClawMutation.isPending ||
    deleteOpenClawMutation.isPending;
  const openClawConnectionStatusLabel = (() => {
    const status = openClawBinding?.connectionStatus;
    if (status === 'connected') return '已连接';
    if (status === 'disconnected') return '连接已断开';
    if (status === 'revoked') return '已撤销';
    if (status === 'pending') return '待连接';
    return '未配置';
  })();

  const profileTitle = activeSection === 'profile' ? '个人信息' : 'OpenClaw 绑定';
  const profileDescription = activeSection === 'profile'
    ? '管理昵称和对外展示信息。'
    : '配置本地 OpenClaw 连接、插件启用和自动分发。';

  return (
    <div className="settings-page">
      <header className="settings-topbar">
        <div>
          <div className="settings-topbar-kicker">设置中心</div>
          <h1>{profileTitle}</h1>
          <p>{profileDescription}</p>
        </div>
        <button type="button" className="settings-btn settings-btn-secondary" onClick={() => navigate('/dashboard')}>
          返回看板
        </button>
      </header>

      <div className="settings-shell">
        <aside className="settings-sidebar">
          <div className="settings-sidebar-user">
            <div className="settings-sidebar-avatar">
              {(user?.nickname || user?.email || '?').slice(0, 1).toUpperCase()}
            </div>
            <div className="settings-sidebar-user-copy">
              <strong>{user?.nickname?.trim() || user?.email || '未登录用户'}</strong>
              <span>{user?.email || '暂无邮箱'}</span>
            </div>
          </div>

          <nav className="settings-nav">
            {SETTINGS_NAV_ITEMS.map((item) => (
              <NavLink
                key={item.id}
                to={`/settings/${item.id}`}
                className={({ isActive }) => `settings-nav-item${isActive ? ' active' : ''}`}
              >
                <strong>{item.label}</strong>
                <span>{item.description}</span>
              </NavLink>
            ))}
          </nav>
        </aside>

        <main className="settings-content">
          {activeSection === 'profile' && (
            <section className="settings-panel">
              <div className="settings-panel-header">
                <div>
                  <h2>账号资料</h2>
                  <p>共享卡片里的创建人和 @ 提示，都会优先使用昵称展示。</p>
                </div>
              </div>

              <div className="settings-info-grid">
                <div className="settings-info-card">
                  <span className="settings-info-label">登录邮箱</span>
                  <strong>{user?.email || '暂无'}</strong>
                </div>
                <div className="settings-info-card">
                  <span className="settings-info-label">当前展示名</span>
                  <strong>{meProfile?.nickname?.trim() || user?.email || '暂无'}</strong>
                </div>
              </div>

              <div className="settings-form-section">
                <label className="settings-field-label" htmlFor="settings-nickname-input">昵称（最多 100 字）</label>
                <input
                  id="settings-nickname-input"
                  className="settings-input settings-input-single"
                  maxLength={100}
                  placeholder="用于共享卡片 @ 提及展示"
                  value={nicknameDraft}
                  onChange={(e) => {
                    setProfileFormDirty(true);
                    setNicknameDraft(e.target.value);
                  }}
                />
                <div className="settings-field-meta">
                  <span>留空后保存将恢复为邮箱展示。</span>
                  <span>{nicknameDraft.length}/100</span>
                </div>
              </div>

              <div className="settings-action-row">
                <button
                  type="button"
                  className="settings-btn settings-btn-secondary"
                  onClick={() => {
                    setProfileFormDirty(false);
                    setNicknameDraft(meProfile?.nickname ?? '');
                  }}
                  disabled={updateProfileMutation.isPending}
                >
                  重置
                </button>
                <button
                  type="button"
                  className="settings-btn settings-btn-primary"
                  onClick={handleSaveProfile}
                  disabled={updateProfileMutation.isPending}
                >
                  {updateProfileMutation.isPending ? '保存中...' : '保存个人信息'}
                </button>
              </div>
            </section>
          )}

          {activeSection === 'openclaw' && (
            <section className="settings-panel">
              <div className="settings-panel-header">
                <div>
                  <h2>OpenClaw 绑定向导</h2>
                  <p>不需要公网 IP。让你本地 OpenClaw 主动连到 AITodo 后端，再决定是否打开自动分发。</p>
                </div>
                <div className={`settings-status-badge ${openClawConnectionReady ? 'ready' : 'pending'}`}>
                  {openClawConnectionStatusLabel}
                </div>
              </div>

              <div className="settings-openclaw-step-list">
                <section className="settings-openclaw-step-card">
                  <div className="settings-openclaw-step-head">
                    <span className={`settings-openclaw-step-index ${openClawTokenReady ? 'done' : ''}`}>1</span>
                    <div>
                      <div className="settings-openclaw-step-title">生成连接信息</div>
                      <div className="settings-openclaw-step-desc">
                        先生成一次性连接令牌，本地插件会用它和 AITodo 建立长连接。
                      </div>
                    </div>
                  </div>
                  <div className="settings-openclaw-step-body">
                    <div className="settings-openclaw-inline-meta">
                      <span>Channel：{openClawBinding?.channelCode || 'aitodo'}</span>
                      <span>WS 地址：{openClawBinding?.wsUrl || '当前服务端未配置'}</span>
                      {openClawBinding?.docsUrl && (
                        <a href={openClawBinding.docsUrl} target="_blank" rel="noreferrer">查看文档</a>
                      )}
                    </div>

                    {openClawTokenReady ? (
                      <>
                        <div className="settings-openclaw-command-block">
                          <code>{openClawBinding?.connectToken}</code>
                        </div>
                        <div className="settings-inline-actions">
                          <button
                            type="button"
                            className="settings-btn settings-btn-secondary"
                            onClick={() => void copyText(openClawBinding?.connectToken ?? '', '已复制连接令牌')}
                          >
                            复制连接令牌
                          </button>
                          <button
                            type="button"
                            className="settings-btn settings-btn-secondary"
                            onClick={handleRotateOpenClawToken}
                            disabled={openClawMutating}
                          >
                            重置令牌
                          </button>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="settings-openclaw-step-hint">
                          先点击“生成连接信息”，系统会为你创建专属 token。
                        </div>
                        <button
                          type="button"
                          className="settings-btn settings-btn-secondary"
                          onClick={handleProvisionOpenClaw}
                          disabled={openClawMutating}
                        >
                          {provisionOpenClawMutation.isPending ? '生成中...' : '生成连接信息'}
                        </button>
                      </>
                    )}
                  </div>
                </section>

                <section className="settings-openclaw-step-card">
                  <div className="settings-openclaw-step-head">
                    <span className={`settings-openclaw-step-index ${openClawConnectionReady ? 'done' : ''}`}>2</span>
                    <div>
                      <div className="settings-openclaw-step-title">安装 `aitodo` 插件</div>
                      <div className="settings-openclaw-step-desc">
                        在本地 OpenClaw Gateway 安装插件包 <code>{openClawPluginPackageName}</code>。
                      </div>
                    </div>
                  </div>
                  <div className="settings-openclaw-step-body">
                    <div className="settings-openclaw-inline-meta">
                      <span>插件包：{openClawPluginPackageName}</span>
                    </div>
                    {openClawPluginInstallCommand ? (
                      <>
                        <div className="settings-openclaw-command-block">
                          <code>{openClawPluginInstallCommand}</code>
                        </div>
                        <button
                          type="button"
                          className="settings-btn settings-btn-secondary"
                          onClick={() => void copyText(openClawPluginInstallCommand, '已复制插件安装命令')}
                        >
                          复制插件安装命令
                        </button>
                      </>
                    ) : (
                      <div className="settings-openclaw-step-hint">
                        当前服务端未生成插件安装命令，请检查后端 `OPENCLAW_PLUGIN_INSTALL_COMMAND_TEMPLATE` 配置。
                      </div>
                    )}
                  </div>
                </section>

                <section className="settings-openclaw-step-card">
                  <div className="settings-openclaw-step-head">
                    <span className={`settings-openclaw-step-index ${openClawRuntimeReady && openClawConnectionReady ? 'done' : ''}`}>3</span>
                    <div>
                      <div className="settings-openclaw-step-title">启用插件并确认连接</div>
                      <div className="settings-openclaw-step-desc">
                        执行启用命令后，插件会用第 1 步的 token 建立连接；连接成功后状态会变成“已连接”。
                      </div>
                    </div>
                  </div>
                  <div className="settings-openclaw-step-body">
                    {openClawPluginEnableCommand ? (
                      <>
                        <div className="settings-openclaw-command-block">
                          <code>{openClawPluginEnableCommand}</code>
                        </div>
                        <button
                          type="button"
                          className="settings-btn settings-btn-secondary"
                          onClick={() => void copyText(openClawPluginEnableCommand, '已复制插件启用命令')}
                        >
                          复制插件启用命令
                        </button>
                      </>
                    ) : (
                      <div className="settings-openclaw-step-hint">
                        先完成第 1 步生成 token，系统才能生成插件启用命令。
                      </div>
                    )}

                    {openClawPluginConfigSnippet && (
                      <>
                        <div className="settings-openclaw-command-block">
                          <code>{openClawPluginConfigSnippet}</code>
                        </div>
                        <button
                          type="button"
                          className="settings-btn settings-btn-secondary"
                          onClick={() => void copyText(openClawPluginConfigSnippet, '已复制插件配置片段')}
                        >
                          复制插件配置片段
                        </button>
                      </>
                    )}

                    <div className="settings-openclaw-inline-meta">
                      <span>当前状态：{openClawConnectionStatusLabel}</span>
                      <span>最近在线：{formatDateTime(openClawBinding?.lastSeenAt)}</span>
                    </div>

                    <div className="settings-inline-actions">
                      <button
                        type="button"
                        className="settings-btn settings-btn-secondary"
                        onClick={() => queryClient.invalidateQueries({ queryKey: ['openclaw-me', userScope] })}
                        disabled={openClawMutating}
                      >
                        刷新状态
                      </button>
                    </div>

                    <label className="settings-field-label" htmlFor="settings-openclaw-device-label">设备名称</label>
                    <input
                      id="settings-openclaw-device-label"
                      className="settings-input settings-input-single"
                      maxLength={100}
                      placeholder={openClawBinding?.suggestedDeviceLabel || '例如：aitodo-macbook-pro'}
                      value={openClawDeviceLabel}
                      onChange={(e) => {
                        setOpenClawFormDirty(true);
                        setOpenClawDeviceLabel(e.target.value);
                      }}
                    />
                    <div className="settings-field-meta">
                      <span>用于标识当前本地连接设备。</span>
                      <span>{openClawDeviceLabel.length}/100</span>
                    </div>

                    <label className="settings-field-label" htmlFor="settings-openclaw-timeout-seconds">任务等待时间（秒）</label>
                    <input
                      id="settings-openclaw-timeout-seconds"
                      className="settings-input settings-input-single"
                      type="number"
                      min={30}
                      max={3600}
                      value={openClawTimeoutSeconds}
                      onChange={(e) => {
                        setOpenClawFormDirty(true);
                        setOpenClawTimeoutSeconds(e.target.value);
                      }}
                    />
                  </div>
                </section>

                <section className="settings-openclaw-step-card">
                  <div className="settings-openclaw-step-head">
                    <span className={`settings-openclaw-step-index ${openClawAutoDispatchReady ? 'done' : ''}`}>4</span>
                    <div>
                      <div className="settings-openclaw-step-title">打开自动分发</div>
                      <div className="settings-openclaw-step-desc">
                        打开后，共享卡片里 @ 到你的待办会自动发给本地 OpenClaw 做方案设计。
                      </div>
                    </div>
                  </div>
                  <div className="settings-openclaw-step-body">
                    <label className="settings-openclaw-toggle-row" htmlFor="settings-openclaw-enabled-toggle">
                      <span className="settings-openclaw-toggle-label">启用自动分发</span>
                      <input
                        className="settings-openclaw-toggle-input"
                        id="settings-openclaw-enabled-toggle"
                        type="checkbox"
                        checked={openClawEnabled}
                        onChange={(e) => {
                          setOpenClawFormDirty(true);
                          setOpenClawEnabled(e.target.checked);
                        }}
                      />
                      <span className="settings-openclaw-toggle-switch" aria-hidden="true">
                        <span className="settings-openclaw-toggle-knob" />
                      </span>
                    </label>

                    {openClawTokenReady && (
                      <div className="settings-openclaw-runtime-card">
                        <div>Channel：{openClawBinding?.channelCode || 'aitodo'}</div>
                        <div>Session 策略：{openClawBinding?.sessionStrategy === 'per_todo' ? '每条待办一个会话' : '未设置'}</div>
                        <div>路由提示：{openClawBinding?.routingHint || '无'}</div>
                        <div>当前设备：{openClawBinding?.deviceLabel || openClawDeviceLabel || '未设置'}</div>
                        <div>最近在线：{formatDateTime(openClawBinding?.lastSeenAt)}</div>
                        <div>最近分发：{formatDateTime(openClawBinding?.lastDispatchedAt)}</div>
                        <div>最近完成：{formatDateTime(openClawBinding?.lastCompletedAt)}</div>
                        <div>最近错误：{openClawBinding?.lastError || '无'}</div>
                      </div>
                    )}
                  </div>
                </section>
              </div>

              <div className="settings-action-row">
                {openClawBinding?.connectToken && (
                  <button
                    type="button"
                    className="settings-btn settings-btn-danger"
                    onClick={handleDeleteOpenClaw}
                    disabled={openClawMutating}
                  >
                    {deleteOpenClawMutation.isPending ? '解绑中...' : '解除绑定'}
                  </button>
                )}
                <button
                  type="button"
                  className="settings-btn settings-btn-secondary"
                  onClick={() => handleHydrateOpenClawForm(openClawBinding)}
                  disabled={openClawMutating}
                >
                  重置表单
                </button>
                <button
                  type="button"
                  className="settings-btn settings-btn-primary"
                  onClick={handleSaveOpenClaw}
                  disabled={openClawMutating || !openClawBinding?.connectToken}
                >
                  {openClawMutating ? '保存中...' : '保存绑定设置'}
                </button>
              </div>
            </section>
          )}
        </main>
      </div>
    </div>
  );
}
