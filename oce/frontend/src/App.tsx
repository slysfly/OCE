import { useEffect, useState } from 'react';
import { useStore, TAB_DEFS, startPolling, stopPolling, isOce, isArchived, useTheme } from './store';
import OceBoard from './components/OceBoard';
import MonitorPanel from './components/MonitorPanel';
import OcePanel from './components/OcePanel';
import CostPanel from './components/CostPanel';
import ModelConfig from './components/ModelConfig';
import SkillsConfig from './components/SkillsConfig';
// import SessionsPanel from './components/SessionsPanel';
import MemorialPanel from './components/MemorialPanel';
import TaskModal from './components/TaskModal';
// ConfirmDialog is used inside TaskModal as needed
import Toaster from './components/Toaster';
import CourtCeremony from './components/CourtCeremony';
import CourtDiscussion from './components/CourtDiscussion';
// import AgentPoolPanel from './components/AgentPoolPanel';
import ThemeSwitcher from './components/ThemeSwitcher';

export default function App() {
  const activeTab = useStore((s) => s.activeTab);
  const setActiveTab = useStore((s) => s.setActiveTab);
  const liveStatus = useStore((s) => s.liveStatus);
  const countdown = useStore((s) => s.countdown);
  const loadAll = useStore((s) => s.loadAll);
  const [demoEnabled, setDemoEnabled] = useState(false);

  useEffect(() => {
    startPolling();
    // 检查demo状态
    fetch('/api/demo/status')
      .then(r => r.json())
      .then(data => setDemoEnabled(data.enabled || false))
      .catch(() => {});
    return () => stopPolling();
  }, []);

  const toggleDemo = async () => {
    try {
      const endpoint = demoEnabled ? '/api/demo/disable' : '/api/demo/enable';
      const res = await fetch(endpoint, { method: 'POST' });
      const data = await res.json();
      if (data.ok) {
        setDemoEnabled(!demoEnabled);
        loadAll(); // 刷新数据
        alert(demoEnabled ? 'Demo模式已关闭' : 'Demo模式已开启，演示数据已加载');
      }
    } catch (err) {
      console.error('切换Demo模式失败:', err);
    }
  };

  // Compute header chips
  const tasks = liveStatus?.tasks || [];
  const oces = tasks.filter(isOce);
  const activeOces = oces.filter((t) => !isArchived(t));
  const sync = liveStatus?.syncStatus;
  const syncOk = sync?.ok;

  // Tab badge counts
  const tabBadge = (key: string): string => {
    if (key === 'oces') return String(activeOces.length);
    // if (key === 'sessions') return String(tasks.filter((t) => !isOce(t)).length);
    if (key === 'memorials') return String(oces.filter((t) => ['Done', 'Cancelled'].includes(t.state)).length);
    if (key === 'monitor') {
      const activeDepts = tasks.filter((t) => isOce(t) && t.state === 'Doing').length;
      return activeDepts + '活跃';
    }
    return '';
  };

  return (
    <div className="wrap">
      {/* ── Header ── */}
      <div className="hdr">
        <div>
          <div className="logo">企业总控台</div>
          <div className="sub-text">OpenClaw Enterprise Dashboard</div>
        </div>
        <div className="hdr-r">
          <button 
            onClick={toggleDemo}
            style={{
              padding: '4px 12px',
              fontSize: 12,
              border: demoEnabled ? '1px solid #22c55e' : '1px solid var(--line)',
              borderRadius: 6,
              background: demoEnabled ? 'rgba(34,197,94,0.15)' : 'var(--panel)',
              color: demoEnabled ? '#22c55e' : 'var(--muted)',
              cursor: 'pointer',
              marginRight: 8,
            }}
          >
            {demoEnabled ? '🎬 Demo ON' : '🎬 Demo'}
          </button>
          <ThemeSwitcher />
          <span className={`chip ${syncOk ? 'ok' : syncOk === false ? 'err' : ''}`}>
            {syncOk ? '✅ 同步正常' : syncOk === false ? '❌ 服务器未启动' : '⏳ 连接中…'}
          </span>
          <span className="chip">{activeOces.length} 道任务</span>
          <button className="btn-refresh" onClick={() => loadAll()}>
            ⟳ 刷新
          </button>
        </div>
      </div>

      {/* ── Tabs ── */}
      <div className="tabs">
        {TAB_DEFS.map((t) => (
          <div
            key={t.key}
            className={`tab ${activeTab === t.key ? 'active' : ''}`}
            onClick={() => setActiveTab(t.key)}
          >
            {t.icon} {t.label}
            {tabBadge(t.key) && <span className="tbadge">{tabBadge(t.key)}</span>}
          </div>
        ))}
      </div>

      {/* ── Panels ── */}
      {activeTab === 'oces' && <OceBoard />}
      {activeTab === 'court' && <CourtDiscussion />}
      {/* {activeTab === 'agent_pool' && <AgentPoolPanel />} */}
      {activeTab === 'monitor' && <MonitorPanel />}
      {activeTab === 'officials' && <OcePanel />}
      {activeTab === 'cost' && <CostPanel />}
      {activeTab === 'models' && <ModelConfig />}
      {activeTab === 'skills' && <SkillsConfig />}
      {/* {activeTab === 'sessions' && <SessionsPanel />} */}
      {activeTab === 'memorials' && <MemorialPanel />}

      {/* ── Overlays ── */}
      <TaskModal />
      <Toaster />
      <CourtCeremony />
    </div>
  );
}
