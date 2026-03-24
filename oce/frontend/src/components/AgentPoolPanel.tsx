import { useState, useEffect, useMemo } from 'react';

interface AgentInfo {
  id: string;
  label: string;
  emoji: string;
  role?: string;
  status: 'idle' | 'busy' | 'offline';
  tasks: number;
  total: number;
  skills?: string[];
  dept_id?: string;
  dept_label?: string;
  type?: 'assistant' | 'manager' | 'employee';
}

interface DepartmentPool {
  label: string;
  emoji: string;
  managers: AgentInfo[];
  employees: AgentInfo[];
}

interface AgentPoolStatus {
  assistant_pool: AgentInfo[];
  departments: Record<string, DepartmentPool>;
}

interface Statistics {
  total_agents: number;
  idle_agents: number;
  busy_agents: number;
  total_tasks_assigned: number;
  current_tasks: number;
}

// 部门颜色映射
const DEPT_COLORS: Record<string, string> = {
  assistant: '#e8a040',
  product: '#a855f7',
  tech: '#22c55e',
  architecture: '#6366f1',
  dev: '#ef4444',
  data: '#f59e0b',
  docs: '#3b82f6',
  security: '#ec4899',
  ops: '#14b8a6',
  hr: '#8b5cf6',
  sales: '#06b6d4',
  marketing: '#f97316',
  finance: '#84cc16',
  admin: '#78716c',
  legal: '#64748b',
};

export default function AgentPoolPanel() {
  const [status, setStatus] = useState<AgentPoolStatus | null>(null);
  const [stats, setStats] = useState<Statistics | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedDept, setSelectedDept] = useState<string>('all');
  const [showBusy, setShowBusy] = useState(true);
  const [showIdle, setShowIdle] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<string>('');
  
  // 操作相关状态
  const [viewMode, setViewMode] = useState<'card' | 'list' | 'queue'>('card');
  const [selectedAgent, setSelectedAgent] = useState<AgentInfo | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [quickAssignTaskId, setQuickAssignTaskId] = useState('');

  useEffect(() => {
    loadStatus();
  }, []);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(loadStatus, 5000);
    return () => clearInterval(interval);
  }, [autoRefresh]);

  const loadStatus = async () => {
    try {
      const [statusRes, statsRes] = await Promise.all([
        fetch('/api/agent-pool/status').then(r => r.json()),
        fetch('/api/agent-pool/statistics').then(r => r.json()),
      ]);
      setStatus(statusRes);
      setStats(statsRes);
      setLastUpdate(new Date().toLocaleTimeString());
    } catch (e) {
      console.error('加载Agent状态失败:', e);
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (s: string) => {
    switch (s) {
      case 'idle': return '#22c55e';
      case 'busy': return '#f59e0b';
      case 'offline': return '#6b7280';
      default: return '#6b7280';
    }
  };

  // 获取所有Agent
  const allAgents = useMemo(() => {
    if (!status) return [];
    const agents: AgentInfo[] = [];
    
    status.assistant_pool?.forEach(a => {
      agents.push({ ...a, dept_id: 'assistant', dept_label: '助理池', type: 'assistant' });
    });
    
    Object.entries(status.departments || {}).forEach(([deptId, dept]) => {
      dept.managers?.forEach(m => {
        agents.push({ ...m, dept_id: deptId, dept_label: dept.label, type: 'manager' });
      });
      dept.employees?.forEach(e => {
        agents.push({ ...e, dept_id: deptId, dept_label: dept.label, type: 'employee' });
      });
    });
    
    return agents;
  }, [status]);

  // 过滤Agent
  const filteredAgents = useMemo(() => {
    return allAgents.filter(a => {
      if (search && !a.label.toLowerCase().includes(search.toLowerCase())) return false;
      if (selectedDept !== 'all' && a.dept_id !== selectedDept) return false;
      if (!showBusy && a.status === 'busy') return false;
      if (!showIdle && a.status === 'idle') return false;
      return true;
    });
  }, [allAgents, search, selectedDept, showBusy, showIdle]);

  const assistantPool = filteredAgents.filter(a => a.type === 'assistant');
  
  // 点击Agent
  const handleAgentClick = (agent: AgentInfo) => {
    setSelectedAgent(agent);
    setShowModal(true);
  };

  // 快速分配
  const handleQuickAssign = () => {
    if (!quickAssignTaskId.trim() || !selectedAgent) return;
    alert(`任务 ${quickAssignTaskId} 已分配给 ${selectedAgent.label}`);
    setQuickAssignTaskId('');
  };

  if (loading) {
    return <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>⏳ 加载中...</div>;
  }

  return (
    <div>
      {/* 顶部统计 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 10, marginBottom: 16 }}>
        {[
          { label: '总人数', value: stats?.total_agents || 0, color: '#6366f1', icon: '👥' },
          { label: '待命', value: stats?.idle_agents || 0, color: '#22c55e', icon: '🟢' },
          { label: '工作中', value: stats?.busy_agents || 0, color: '#f59e0b', icon: '🟡' },
          { label: '任务数', value: stats?.current_tasks || 0, color: '#3b82f6', icon: '📋' },
        ].map((stat) => (
          <div key={stat.label} style={{
            background: 'var(--panel)',
            borderRadius: 12,
            border: '1px solid var(--line)',
            padding: '14px 16px',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
          }}>
            <div style={{ fontSize: 18 }}>{stat.icon}</div>
            <div>
              <div style={{ fontSize: 18, fontWeight: 700, color: stat.color }}>{stat.value}</div>
              <div style={{ fontSize: 10, color: 'var(--muted)' }}>{stat.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* 工具栏 */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        {/* 视图切换 */}
        <div style={{ display: 'flex', gap: 4 }}>
          {[
            { key: 'card', icon: '📇', label: '卡片' },
            { key: 'list', icon: '📋', label: '列表' },
            { key: 'queue', icon: '📊', label: '队列' },
          ].map(mode => (
            <button key={mode.key} onClick={() => setViewMode(mode.key as any)}
              style={{
                padding: '8px 12px',
                background: viewMode === mode.key ? '#6366f122' : 'transparent',
                border: `1px solid ${viewMode === mode.key ? '#6366f1' : 'var(--line)'}`,
                borderRadius: 6,
                color: viewMode === mode.key ? '#6366f1' : 'var(--muted)',
                fontSize: 11,
                cursor: 'pointer',
              }}>
              {mode.icon} {mode.label}
            </button>
          ))}
        </div>

        {/* 搜索 */}
        <input type="text" placeholder="🔍 搜索..." value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ flex: 1, minWidth: 150, padding: '8px 12px', borderRadius: 6, border: '1px solid var(--line)', background: 'var(--bg)', color: 'var(--text)', fontSize: 12 }}
        />

        {/* 部门筛选 */}
        <select value={selectedDept} onChange={(e) => setSelectedDept(e.target.value)}
          style={{ padding: '8px 12px', borderRadius: 6, border: '1px solid var(--line)', background: 'var(--bg)', color: 'var(--text)', fontSize: 11 }}>
          <option value="all">全部</option>
          <option value="assistant">🤴 助理</option>
          {status?.departments && Object.entries(status.departments).map(([id, dept]) => (
            <option key={id} value={id}>{dept.emoji} {dept.label}</option>
          ))}
        </select>

        {/* 状态筛选 */}
        <label style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '6px 10px', background: showIdle ? '#22c55e15' : 'var(--panel2)', borderRadius: 6, fontSize: 11, cursor: 'pointer' }}>
          <input type="checkbox" checked={showIdle} onChange={(e) => setShowIdle(e.target.checked)} style={{ accentColor: '#22c55e' }} />
          🟢 待命
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '6px 10px', background: showBusy ? '#f59e0b15' : 'var(--panel2)', borderRadius: 6, fontSize: 11, cursor: 'pointer' }}>
          <input type="checkbox" checked={showBusy} onChange={(e) => setShowBusy(e.target.checked)} style={{ accentColor: '#f59e0b' }} />
          🟡 工作
        </label>

        <button onClick={loadStatus} style={{ padding: '8px 12px', background: '#6366f1', border: 'none', borderRadius: 6, color: '#fff', fontSize: 11, cursor: 'pointer' }}>⟳</button>
        <span style={{ fontSize: 10, color: 'var(--muted)' }}>{lastUpdate}</span>
      </div>

      {/* 搜索结果 */}
      <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 12 }}>
        结果: <b style={{ color: '#6366f1' }}>{filteredAgents.length}</b> 人
      </div>

      {/* === 队列视图 === */}
      {viewMode === 'queue' && (
        <div style={{ background: 'var(--panel)', borderRadius: 12, border: '1px solid var(--line)', padding: 16, marginBottom: 16 }}>
          <div style={{ fontWeight: 600, marginBottom: 12 }}>📊 工作队列</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 10 }}>
            {filteredAgents.filter(a => a.status === 'busy').map(agent => (
              <div key={agent.id} onClick={() => handleAgentClick(agent)}
                style={{ padding: 12, background: 'var(--panel2)', borderRadius: 8, border: '1px solid #f59e0b40', cursor: 'pointer' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <span style={{ fontSize: 20 }}>{agent.emoji}</span>
                  <span style={{ fontWeight: 600, fontSize: 12 }}>{agent.label}</span>
                  <span style={{ marginLeft: 'auto', fontSize: 10, color: '#f59e0b' }}>🟡 {agent.tasks}任务</span>
                </div>
                <div style={{ height: 4, background: 'var(--panel)', borderRadius: 2, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: '60%', background: '#f59e0b' }} />
                </div>
              </div>
            ))}
            {filteredAgents.filter(a => a.status === 'busy').length === 0 && (
              <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: 30, color: 'var(--muted)' }}>暂无工作中的Agent</div>
            )}
          </div>
        </div>
      )}

      {/* === 列表视图 === */}
      {viewMode === 'list' && (
        <div style={{ background: 'var(--panel)', borderRadius: 12, border: '1px solid var(--line)', overflow: 'hidden', marginBottom: 16 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
            <thead>
              <tr style={{ background: 'var(--panel2)' }}>
                <th style={{ padding: 10, textAlign: 'left', borderBottom: '1px solid var(--line)' }}>Agent</th>
                <th style={{ padding: 10, textAlign: 'left', borderBottom: '1px solid var(--line)' }}>部门</th>
                <th style={{ padding: 10, textAlign: 'center', borderBottom: '1px solid var(--line)' }}>状态</th>
                <th style={{ padding: 10, textAlign: 'center', borderBottom: '1px solid var(--line)' }}>任务</th>
                <th style={{ padding: 10, textAlign: 'center', borderBottom: '1px solid var(--line)' }}>操作</th>
              </tr>
            </thead>
            <tbody>
              {filteredAgents.slice(0, 30).map(agent => (
                <tr key={agent.id} style={{ borderBottom: '1px solid var(--line)' }}>
                  <td style={{ padding: 10 }}>
                    <span style={{ fontSize: 16, marginRight: 6 }}>{agent.emoji}</span>
                    <span style={{ fontWeight: 600 }}>{agent.label}</span>
                  </td>
                  <td style={{ padding: 10, color: 'var(--muted)' }}>{agent.dept_label}</td>
                  <td style={{ padding: 10, textAlign: 'center' }}>
                    <span style={{ padding: '2px 6px', borderRadius: 4, fontSize: 10, background: `${getStatusColor(agent.status)}22`, color: getStatusColor(agent.status) }}>
                      {agent.status === 'idle' ? '🟢' : '🟡'} {agent.status === 'idle' ? '待命' : '工作'}
                    </span>
                  </td>
                  <td style={{ padding: 10, textAlign: 'center', fontWeight: 600 }}>{agent.tasks}</td>
                  <td style={{ padding: 10, textAlign: 'center' }}>
                    <button onClick={() => handleAgentClick(agent)} style={{ padding: '4px 10px', background: '#6366f122', border: '1px solid #6366f144', borderRadius: 4, color: '#6366f1', fontSize: 10, cursor: 'pointer' }}>查看</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* === 卡片视图 === */}
      {viewMode === 'card' && (
        <>
          {/* 助理池 */}
          {assistantPool.length > 0 && (
            <div style={{ background: 'var(--panel)', borderRadius: 12, border: '1px solid var(--line)', marginBottom: 16 }}>
              <div style={{ padding: '12px 16px', background: '#6366f115', borderBottom: '1px solid var(--line)', display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 18 }}>🤴</span>
                <span style={{ fontWeight: 600, fontSize: 13 }}>助理池</span>
                <span style={{ fontSize: 10, padding: '2px 8px', background: '#6366f122', borderRadius: 6, color: '#6366f1' }}>{assistantPool.length}人</span>
              </div>
              <div style={{ padding: 12, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 8 }}>
                {assistantPool.map(agent => (
                  <div key={agent.id} onClick={() => handleAgentClick(agent)}
                    style={{ padding: 12, background: 'var(--panel2)', borderRadius: 8, border: `1px solid ${getStatusColor(agent.status)}40`, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 36, height: 36, borderRadius: 8, background: `${getStatusColor(agent.status)}22`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>{agent.emoji}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, fontSize: 12 }}>{agent.label}</div>
                      <div style={{ fontSize: 10, color: 'var(--muted)' }}>{agent.role}</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 10, color: getStatusColor(agent.status) }}>{agent.status === 'idle' ? '🟢 待命' : '🟡 工作'}</div>
                      {agent.tasks > 0 && <div style={{ fontSize: 9, color: 'var(--muted)' }}>{agent.tasks}任务</div>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 部门池 */}
          {status?.departments && Object.entries(status.departments).map(([deptId, dept]) => {
            const deptAgents = [...(dept.managers || []), ...(dept.employees || [])].filter(a => filteredAgents.some(fa => fa.id === a.id));
            if (deptAgents.length === 0) return null;
            const color = DEPT_COLORS[deptId] || '#6366f1';
            
            return (
              <div key={deptId} style={{ background: 'var(--panel)', borderRadius: 12, border: '1px solid var(--line)', marginBottom: 16 }}>
                <div style={{ padding: '10px 16px', background: `${color}10`, borderBottom: '1px solid var(--line)', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 16 }}>{dept.emoji}</span>
                  <span style={{ fontWeight: 600, fontSize: 12 }}>{dept.label}</span>
                  <span style={{ fontSize: 10, padding: '2px 8px', background: `${color}22`, borderRadius: 6, color }}>{deptAgents.length}人</span>
                </div>
                <div style={{ padding: 10 }}>
                  {/* 负责人 */}
                  {dept.managers && dept.managers.length > 0 && (
                    <div style={{ marginBottom: 8 }}>
                      <div style={{ fontSize: 9, color: 'var(--muted)', marginBottom: 4 }}>👔 负责人</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {dept.managers.filter(m => filteredAgents.some(fa => fa.id === m.id)).map(m => (
                          <div key={m.id} onClick={() => handleAgentClick(m)}
                            style={{ padding: '6px 10px', background: 'var(--panel2)', borderRadius: 6, border: `1px solid ${color}40`, fontSize: 10, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                            <span style={{ width: 6, height: 6, borderRadius: '50%', background: getStatusColor(m.status) }} />
                            <span>{m.label}</span>
                            {m.tasks > 0 && <span style={{ fontSize: 9, color }}>{m.tasks}</span>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {/* 员工 */}
                  {dept.employees && dept.employees.length > 0 && (
                    <div>
                      <div style={{ fontSize: 9, color: 'var(--muted)', marginBottom: 4 }}>👥 员工</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {dept.employees.filter(e => filteredAgents.some(fa => fa.id === e.id)).map(e => (
                          <div key={e.id} onClick={() => handleAgentClick(e)}
                            style={{ padding: '4px 8px', background: 'var(--panel2)', borderRadius: 4, border: `1px solid ${color}30`, fontSize: 9, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3 }}>
                            <span style={{ width: 4, height: 4, borderRadius: '50%', background: getStatusColor(e.status) }} />
                            <span>{e.label}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </>
      )}

      {/* 详情弹窗 */}
      {showModal && selectedAgent && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
          onClick={() => setShowModal(false)}>
          <div style={{ background: 'var(--panel)', borderRadius: 12, width: '90%', maxWidth: 400, border: '1px solid var(--line)' }}
            onClick={e => e.stopPropagation()}>
            {/* 头部 */}
            <div style={{ padding: 16, background: `${DEPT_COLORS[selectedAgent.dept_id || 'assistant']}15`, borderBottom: '1px solid var(--line)', display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 40, height: 40, borderRadius: 10, background: `${DEPT_COLORS[selectedAgent.dept_id || 'assistant']}22`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>
                {selectedAgent.emoji}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{selectedAgent.label}</div>
                <div style={{ fontSize: 10, color: 'var(--muted)' }}>{selectedAgent.dept_label} · {selectedAgent.type === 'manager' ? '负责人' : selectedAgent.type === 'assistant' ? '助理' : '员工'}</div>
              </div>
              <button onClick={() => setShowModal(false)} style={{ background: 'transparent', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 16 }}>✕</button>
            </div>
            {/* 内容 */}
            <div style={{ padding: 16 }}>
              {/* 统计 */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 16 }}>
                <div style={{ padding: 10, background: 'var(--panel2)', borderRadius: 8, textAlign: 'center' }}>
                  <div style={{ fontSize: 16 }}>{selectedAgent.status === 'idle' ? '🟢' : '🟡'}</div>
                  <div style={{ fontSize: 10, fontWeight: 600 }}>{selectedAgent.status === 'idle' ? '待命' : '工作'}</div>
                </div>
                <div style={{ padding: 10, background: 'var(--panel2)', borderRadius: 8, textAlign: 'center' }}>
                  <div style={{ fontSize: 16, fontWeight: 700, color: '#f59e0b' }}>{selectedAgent.tasks}</div>
                  <div style={{ fontSize: 10, color: 'var(--muted)' }}>当前任务</div>
                </div>
                <div style={{ padding: 10, background: 'var(--panel2)', borderRadius: 8, textAlign: 'center' }}>
                  <div style={{ fontSize: 16, fontWeight: 700, color: '#22c55e' }}>{selectedAgent.total}</div>
                  <div style={{ fontSize: 10, color: 'var(--muted)' }}>累计</div>
                </div>
              </div>
              {/* 快速分配 */}
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 6 }}>⚡ 快速分配任务</div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <input type="text" placeholder="任务ID" value={quickAssignTaskId} onChange={(e) => setQuickAssignTaskId(e.target.value)}
                    style={{ flex: 1, padding: '8px 10px', borderRadius: 6, border: '1px solid var(--line)', background: 'var(--bg)', color: 'var(--text)', fontSize: 11 }}
                  />
                  <button onClick={handleQuickAssign} style={{ padding: '8px 12px', background: '#6366f1', border: 'none', borderRadius: 6, color: '#fff', fontSize: 11, cursor: 'pointer' }}>分配</button>
                </div>
              </div>
              {/* 操作按钮 */}
              <div style={{ display: 'flex', gap: 6 }}>
                <button style={{ flex: 1, padding: '8px 12px', background: '#22c55e15', border: '1px solid #22c55e40', borderRadius: 6, color: '#22c55e', fontSize: 11, cursor: 'pointer' }}>📋 查看任务</button>
                <button style={{ flex: 1, padding: '8px 12px', background: '#f59e0b15', border: '1px solid #f59e0b40', borderRadius: 6, color: '#f59e0b', fontSize: 11, cursor: 'pointer' }}>📊 工作记录</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 说明 */}
      <div style={{ background: 'linear-gradient(135deg, #6366f111, #a855f711)', borderRadius: 10, padding: 14, fontSize: 11, color: 'var(--muted)', border: '1px solid #6366f122' }}>
        <div style={{ fontWeight: 600, marginBottom: 6 }}>💡 操作提示</div>
        <div>• 点击Agent卡片查看详情、分配任务、查看工作记录</div>
        <div>• 队列视图展示所有工作中的Agent和进度</div>
        <div>• 使用筛选快速定位目标Agent</div>
      </div>
    </div>
  );
}
