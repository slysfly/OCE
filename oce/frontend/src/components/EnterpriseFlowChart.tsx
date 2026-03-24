/**
 * 企业协作流程图 - 多Agent并行架构
 * 
 * 展示：
 * 1. 领导 → 助理池（负载均衡）
 * 2. 助理 → 部门负责人池（智能路由）
 * 3. 部门负责人 → 员工池（轮询调度）
 */

import { useState, useEffect } from 'react';

interface AgentInfo {
  id: string;
  label: string;
  emoji: string;
  role?: string;
  status: 'idle' | 'busy' | 'offline';
  tasks: number;
  total: number;
  skills?: string[];
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

// 部门配置
const DEPT_CONFIG: Record<string, { color: string }> = {
  product: { color: '#a855f7' },
  architecture: { color: '#6366f1' },
  tech: { color: '#22c55e' },
  data: { color: '#f59e0b' },
  docs: { color: '#3b82f6' },
  dev: { color: '#ef4444' },
  security: { color: '#ec4899' },
  ops: { color: '#14b8a6' },
  hr: { color: '#8b5cf6' },
  sales: { color: '#06b6d4' },
  marketing: { color: '#f97316' },
  finance: { color: '#84cc16' },
  admin: { color: '#78716c' },
  legal: { color: '#64748b' },
};

export default function EnterpriseFlowChart() {
  const [status, setStatus] = useState<AgentPoolStatus | null>(null);
  const [stats, setStats] = useState<Statistics | null>(null);
  const [animatingStep, setAnimatingStep] = useState(0);
  const [hoveredDept, setHoveredDept] = useState<string | null>(null);

  useEffect(() => {
    loadStatus();
    const interval = setInterval(loadStatus, 10000);
    return () => clearInterval(interval);
  }, []);

  // 动画步进
  useEffect(() => {
    const animInterval = setInterval(() => {
      setAnimatingStep(prev => (prev + 1) % 6);
    }, 1500);
    return () => clearInterval(animInterval);
  }, []);

  const loadStatus = async () => {
    try {
      const [statusRes, statsRes] = await Promise.all([
        fetch('/api/agent-pool/status').then(r => r.json()),
        fetch('/api/agent-pool/statistics').then(r => r.json()),
      ]);
      setStatus(statusRes);
      setStats(statsRes);
    } catch (e) {
      console.error('加载状态失败:', e);
    }
  };

  return (
    <div style={{ 
      background: 'var(--panel)', 
      borderRadius: 16, 
      padding: 20, 
      border: '1px solid var(--line)', 
      marginBottom: 20,
      boxShadow: '0 4px 20px rgba(0,0,0,0.06)',
    }}>
      {/* 标题栏 */}
      <div style={{ 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'space-between',
        marginBottom: 20,
        padding: '14px 18px',
        background: 'linear-gradient(135deg, #6366f115, #a855f715)',
        borderRadius: 14,
        border: '1px solid #6366f130',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <span style={{ fontSize: 28 }}>🏛️</span>
          <div>
            <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>企业协作流程 · 多Agent并行架构</h3>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 3 }}>
              实时状态 · 智能路由 · 负载均衡 · 轮询调度
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <StatBadge icon="👥" value={stats?.total_agents || 143} label="Agent" color="#6366f1" />
          <StatBadge icon="🟢" value={stats?.idle_agents || 0} label="待命" color="#22c55e" />
          <StatBadge icon="🟡" value={stats?.busy_agents || 0} label="工作" color="#f59e0b" />
        </div>
      </div>

      {/* ========== 主流程图 ========== */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        
        {/* ===== 第一层：领导入口 → 助理池 ===== */}
        <div style={{ 
          background: 'linear-gradient(135deg, #f59e0b12, #f59e0b06)', 
          borderRadius: 14, 
          border: '1px solid #f59e0b40',
          overflow: 'hidden',
        }}>
          <div style={{ 
            padding: '10px 16px', 
            background: 'linear-gradient(90deg, #f59e0b15, transparent)',
            borderBottom: '1px solid #f59e0b30',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
          }}>
            <span style={{ fontSize: 15, fontWeight: 700, color: '#f59e0b' }}>🎯 第一层：战略决策 · 助理池调度</span>
            <span style={{ 
              padding: '3px 10px', 
              background: '#f59e0b20', 
              borderRadius: 6, 
              fontSize: 10,
              color: '#f59e0b',
            }}>
              负载均衡策略
            </span>
          </div>
          
          <div style={{ padding: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 24 }}>
            {/* 领导 */}
            <div style={{ textAlign: 'center' }}>
              <div style={{
                background: 'linear-gradient(180deg, #f59e0b25, #f59e0b12)',
                borderRadius: 14,
                border: '2px solid #f59e0b',
                padding: '14px 20px',
                boxShadow: '0 4px 12px rgba(245,158,11,0.15)',
              }}>
                <div style={{ fontSize: 28 }}>👑</div>
                <div style={{ fontWeight: 700, fontSize: 13, marginTop: 6 }}>领导</div>
                <div style={{ fontSize: 9, color: '#f59e0b', marginTop: 2 }}>下达需求</div>
              </div>
            </div>
            
            {/* 流向动画 */}
            <FlowArrowAnimated active={animatingStep === 0 || animatingStep === 1} color="#f59e0b" label="需求下发" />
            
            {/* 助理池 */}
            <div style={{ 
              background: 'linear-gradient(180deg, #f59e0b15, #f59e0b08)',
              borderRadius: 16,
              padding: 16,
              border: '2px solid #f59e0b',
              minWidth: 320,
            }}>
              <div style={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: 8, 
                marginBottom: 12,
                justifyContent: 'center',
              }}>
                <span style={{ fontSize: 16 }}>🤴</span>
                <span style={{ fontWeight: 700, fontSize: 13, color: '#f59e0b' }}>助理池（2人并行）</span>
              </div>
              
              <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
                {status?.assistant_pool?.map((agent, i) => (
                  <div key={agent.id} style={{
                    background: 'var(--panel)',
                    borderRadius: 12,
                    padding: '12px 16px',
                    border: `1px solid ${agent.status === 'busy' ? '#f59e0b' : '#22c55e'}40`,
                    textAlign: 'center',
                    minWidth: 90,
                    transition: 'all 0.2s',
                    animation: animatingStep === i + 1 ? 'pulse 0.5s' : 'none',
                  }}>
                    <div style={{ fontSize: 22 }}>{agent.emoji || '🧑‍💼'}</div>
                    <div style={{ fontWeight: 600, fontSize: 11, marginTop: 4 }}>{agent.label}</div>
                    <div style={{ 
                      marginTop: 6, 
                      padding: '3px 8px', 
                      background: `${agent.status === 'busy' ? '#f59e0b' : '#22c55e'}15`, 
                      borderRadius: 6, 
                      fontSize: 9,
                      color: agent.status === 'busy' ? '#f59e0b' : '#22c55e',
                    }}>
                      {agent.status === 'busy' ? '🟡 工作中' : '🟢 待命'}
                    </div>
                    {agent.tasks > 0 && (
                      <div style={{ fontSize: 9, color: 'var(--muted)', marginTop: 4 }}>
                        📋 {agent.tasks} 任务
                      </div>
                    )}
                  </div>
                ))}
              </div>
              
              <div style={{ 
                marginTop: 12, 
                padding: '8px 12px', 
                background: '#f59e0b10', 
                borderRadius: 8, 
                fontSize: 10,
                color: '#f59e0b',
                textAlign: 'center',
              }}>
                ⚡ 路由策略：选择当前最空闲的助理处理新任务
              </div>
            </div>
            
            {/* 流向动画 */}
            <FlowArrowAnimated active={animatingStep === 2} color="#a855f7" label="创建任务" />
            
            {/* 任务创建 */}
            <div style={{ textAlign: 'center' }}>
              <div style={{
                background: 'linear-gradient(180deg, #a855f725, #a855f712)',
                borderRadius: 14,
                border: '2px solid #a855f7',
                padding: '14px 18px',
                boxShadow: '0 4px 12px rgba(168,85,247,0.15)',
              }}>
                <div style={{ fontSize: 24 }}>📋</div>
                <div style={{ fontWeight: 700, fontSize: 12, marginTop: 6 }}>创建任务</div>
                <div style={{ fontSize: 9, color: '#a855f7', marginTop: 2 }}>OCE-XXXXXX</div>
              </div>
            </div>
          </div>
        </div>

        {/* 流向分隔 */}
        <FlowDivider text="⬇️ 智能路由 · 需求分拣 ⬇️" color="#a855f7" />

        {/* ===== 第二层：部门负责人池 ===== */}
        <div style={{ 
          background: 'linear-gradient(135deg, #a855f712, #a855f706)', 
          borderRadius: 14, 
          border: '1px solid #a855f740',
          overflow: 'hidden',
        }}>
          <div style={{ 
            padding: '10px 16px', 
            background: 'linear-gradient(90deg, #a855f715, transparent)',
            borderBottom: '1px solid #a855f730',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
          }}>
            <span style={{ fontSize: 15, fontWeight: 700, color: '#a855f7' }}>📋 第二层：部门负责人池 · 任务分拣</span>
            <span style={{ 
              padding: '3px 10px', 
              background: '#a855f720', 
              borderRadius: 6, 
              fontSize: 10,
              color: '#a855f7',
            }}>
              按任务类型路由
            </span>
          </div>
          
          <div style={{ padding: 14 }}>
            {/* 路由策略说明 */}
            <div style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: 12, 
              marginBottom: 14,
              padding: '10px 14px',
              background: 'var(--panel)',
              borderRadius: 10,
              border: '1px solid var(--line)',
            }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: '#a855f7' }}>🔀 路由策略：</span>
              <span style={{ fontSize: 11, color: 'var(--muted)' }}>
                助理根据任务类型 → 选择对应部门负责人 → 负责人分配给员工池
              </span>
            </div>

            {/* 部门负责人网格 */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 10 }}>
              {status?.departments && Object.entries(status.departments).map(([deptId, dept]) => {
                const config = DEPT_CONFIG[deptId] || { color: '#6366f1' };
                const managers = dept.managers || [];
                const employees = dept.employees || [];
                const total = managers.length + employees.length;
                const busyCount = [...managers, ...employees].filter(a => a.status === 'busy').length;
                const isHovered = hoveredDept === deptId;
                
                return (
                  <div 
                    key={deptId}
                    onMouseEnter={() => setHoveredDept(deptId)}
                    onMouseLeave={() => setHoveredDept(null)}
                    style={{
                      background: isHovered ? `${config.color}12` : 'var(--panel)',
                      borderRadius: 12,
                      padding: 12,
                      border: `1px solid ${config.color}${isHovered ? '60' : '30'}`,
                      transition: 'all 0.2s',
                      cursor: 'pointer',
                      transform: isHovered ? 'translateY(-2px)' : 'none',
                      boxShadow: isHovered ? `0 6px 16px ${config.color}20` : 'none',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                      <span style={{ fontSize: 16 }}>{dept.emoji}</span>
                      <span style={{ fontWeight: 600, fontSize: 11, color: config.color }}>{dept.label}</span>
                      <span style={{ marginLeft: 'auto', fontSize: 9, color: 'var(--muted)' }}>{total}人</span>
                    </div>
                    
                    {/* 负责人 */}
                    <div style={{ display: 'flex', gap: 4, marginBottom: 8, flexWrap: 'wrap' }}>
                      {managers.slice(0, 3).map((m) => (
                        <div key={m.id} style={{
                          background: `${config.color}15`,
                          borderRadius: 6,
                          padding: '4px 8px',
                          border: `1px solid ${config.color}30`,
                          display: 'flex',
                          alignItems: 'center',
                          gap: 4,
                        }}>
                          <div style={{ width: 6, height: 6, borderRadius: '50%', background: m.status === 'busy' ? '#f59e0b' : '#22c55e' }} />
                          <span style={{ fontSize: 9, fontWeight: 500 }}>{m.label}</span>
                          <span style={{ fontSize: 8 }}>👑</span>
                        </div>
                      ))}
                    </div>
                    
                    {/* 员工数 & 状态 */}
                    <div style={{ 
                      fontSize: 9, 
                      color: 'var(--muted)',
                      display: 'flex',
                      justifyContent: 'space-between',
                      padding: '6px 8px',
                      background: 'var(--panel2)',
                      borderRadius: 6,
                    }}>
                      <span>👥 {employees.length}员工</span>
                      <span style={{ color: busyCount > 0 ? '#f59e0b' : '#22c55e' }}>
                        {busyCount > 0 ? `🟡 ${busyCount}工作` : '🟢 全部待命'}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* 悬停时展示员工池详情 */}
            {hoveredDept && status?.departments?.[hoveredDept] && (
              <div style={{ 
                marginTop: 14, 
                padding: 14,
                background: `${DEPT_CONFIG[hoveredDept]?.color || '#6366f1'}10`,
                borderRadius: 12,
                border: `1px solid ${DEPT_CONFIG[hoveredDept]?.color || '#6366f1'}40`,
              }}>
                <div style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: 8, 
                  marginBottom: 10,
                }}>
                  <span style={{ fontSize: 18 }}>{status.departments[hoveredDept].emoji}</span>
                  <span style={{ fontWeight: 700, fontSize: 13 }}>
                    {status.departments[hoveredDept].label} - 员工池详情
                  </span>
                  <span style={{ fontSize: 10, color: 'var(--muted)' }}>
                    ({status.departments[hoveredDept].employees?.length || 0}人)
                  </span>
                </div>
                
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {status.departments[hoveredDept].employees?.slice(0, 15).map((emp) => (
                    <div key={emp.id} style={{
                      background: 'var(--panel)',
                      borderRadius: 8,
                      padding: '8px 12px',
                      border: `1px solid ${emp.status === 'busy' ? '#f59e0b30' : '#22c55e30'}`,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      minWidth: 140,
                    }}>
                      <div style={{ 
                        width: 26, 
                        height: 26, 
                        borderRadius: 8, 
                        background: `${DEPT_CONFIG[hoveredDept]?.color || '#6366f1'}20`, 
                        display: 'flex', 
                        alignItems: 'center', 
                        justifyContent: 'center',
                        fontSize: 12,
                      }}>
                        {emp.emoji || '🧑‍💼'}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 600, fontSize: 10 }}>{emp.label}</div>
                        <div style={{ fontSize: 9, color: 'var(--muted)' }}>{emp.role}</div>
                      </div>
                      <div style={{ 
                        padding: '2px 6px', 
                        background: `${emp.status === 'busy' ? '#f59e0b' : '#22c55e'}15`, 
                        borderRadius: 4, 
                        fontSize: 8,
                        color: emp.status === 'busy' ? '#f59e0b' : '#22c55e',
                      }}>
                        {emp.status === 'busy' ? '工作' : '待命'}
                      </div>
                    </div>
                  ))}
                  {(status.departments[hoveredDept].employees?.length || 0) > 15 && (
                    <div style={{
                      background: 'var(--panel)',
                      borderRadius: 8,
                      padding: '8px 12px',
                      border: '1px solid var(--line)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      minWidth: 140,
                      fontSize: 10,
                      color: 'var(--muted)',
                    }}>
                      +{(status.departments[hoveredDept].employees?.length || 0) - 15} 更多
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* 流向分隔 */}
        <FlowDivider text="⬇️ 任务派发 · 轮询调度 ⬇️" color="#22c55e" />

        {/* ===== 第三层：员工执行池 ===== */}
        <div style={{ 
          background: 'linear-gradient(135deg, #22c55e12, #22c55e06)', 
          borderRadius: 14, 
          border: '1px solid #22c55e40',
          overflow: 'hidden',
        }}>
          <div style={{ 
            padding: '10px 16px', 
            background: 'linear-gradient(90deg, #22c55e15, transparent)',
            borderBottom: '1px solid #22c55e30',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
          }}>
            <span style={{ fontSize: 15, fontWeight: 700, color: '#22c55e' }}>🔧 第三层：员工执行池 · 并行处理</span>
            <span style={{ 
              padding: '3px 10px', 
              background: '#22c55e20', 
              borderRadius: 6, 
              fontSize: 10,
              color: '#22c55e',
            }}>
              轮询调度
            </span>
          </div>
          
          <div style={{ padding: 14 }}>
            {/* 调度策略说明 */}
            <div style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: 16, 
              marginBottom: 14,
              padding: '10px 14px',
              background: 'var(--panel)',
              borderRadius: 10,
              border: '1px solid var(--line)',
              flexWrap: 'wrap',
            }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: '#22c55e' }}>⚙️ 调度策略</span>
              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ padding: '3px 10px', background: '#22c55e15', borderRadius: 6, fontSize: 10, color: '#22c55e' }}>Round-Robin</span>
                  <span style={{ fontSize: 10, color: 'var(--muted)' }}>轮询分配</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ padding: '3px 10px', background: '#f59e0b15', borderRadius: 6, fontSize: 10, color: '#f59e0b' }}>Least-Busy</span>
                  <span style={{ fontSize: 10, color: 'var(--muted)' }}>最空闲优先</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ padding: '3px 10px', background: '#6366f115', borderRadius: 6, fontSize: 10, color: '#6366f1' }}>Skill-Match</span>
                  <span style={{ fontSize: 10, color: 'var(--muted)' }}>技能匹配</span>
                </div>
              </div>
            </div>

            {/* 部门员工状态概览 */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 8 }}>
              {status?.departments && Object.entries(status.departments).map(([deptId, dept]) => {
                const config = DEPT_CONFIG[deptId] || { color: '#6366f1' };
                const employees = dept.employees || [];
                const managers = dept.managers || [];
                const allStaff = [...managers, ...employees];
                const idleCount = allStaff.filter(e => e.status === 'idle').length;
                const busyCount = allStaff.filter(e => e.status === 'busy').length;
                const total = allStaff.length;
                const idlePercent = total > 0 ? (idleCount / total) * 100 : 100;
                const busyPercent = total > 0 ? (busyCount / total) * 100 : 0;
                
                return (
                  <div key={deptId} style={{
                    background: 'var(--panel)',
                    borderRadius: 10,
                    padding: 10,
                    border: '1px solid var(--line)',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                      <span style={{ fontSize: 14 }}>{dept.emoji}</span>
                      <span style={{ fontWeight: 600, fontSize: 11 }}>{dept.label}</span>
                      <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--muted)' }}>
                        {total}人
                      </span>
                    </div>
                    
                    {/* 进度条 */}
                    <div style={{ display: 'flex', height: 6, borderRadius: 3, overflow: 'hidden', background: 'var(--panel2)' }}>
                      <div style={{ width: `${idlePercent}%`, background: '#22c55e' }} />
                      <div style={{ width: `${busyPercent}%`, background: '#f59e0b' }} />
                    </div>
                    
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: 'var(--muted)', marginTop: 6 }}>
                      <span>🟢 {idleCount} 待命</span>
                      <span>🟡 {busyCount} 工作</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* 反馈闭环 */}
        <div style={{ 
          background: 'linear-gradient(90deg, #22c55e12, #a855f712, #f59e0b12)', 
          borderRadius: 12, 
          padding: 14,
          border: '1px solid var(--line)',
        }}>
          <div style={{ textAlign: 'center', marginBottom: 10, fontWeight: 600, fontSize: 12 }}>
            🔄 反馈闭环
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, flexWrap: 'wrap' }}>
            {[
              { icon: '✅', text: '完成验收', color: '#22c55e' },
              { icon: '📝', text: '复盘总结', color: '#a855f7' },
              { icon: '📊', text: '汇报领导', color: '#f59e0b' },
              { icon: '📁', text: '任务归档', color: '#6366f1' },
            ].map((item, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{
                  padding: '8px 14px',
                  background: `${item.color}12`,
                  borderRadius: 10,
                  border: `1px solid ${item.color}40`,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}>
                  <span style={{ fontSize: 14 }}>{item.icon}</span>
                  <span style={{ fontSize: 11, fontWeight: 600, color: item.color }}>{item.text}</span>
                </div>
                {i < 3 && <span style={{ color: 'var(--muted)', fontSize: 16 }}>→</span>}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 底部说明 */}
      <div style={{ 
        marginTop: 16, 
        padding: 14, 
        background: 'var(--panel2)', 
        borderRadius: 12, 
        border: '1px solid var(--line)',
      }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 20, fontSize: 10 }}>
          <div>
            <div style={{ fontWeight: 700, marginBottom: 8, color: '#f59e0b', fontSize: 11 }}>⚡ 并行处理优势</div>
            <div style={{ color: 'var(--muted)', lineHeight: 1.7 }}>
              • 多助理同时接收任务<br/>
              • 各部门独立并行执行<br/>
              • 提升整体处理效率3x+
            </div>
          </div>
          <div>
            <div style={{ fontWeight: 700, marginBottom: 8, color: '#a855f7', fontSize: 11 }}>🔀 智能路由机制</div>
            <div style={{ color: 'var(--muted)', lineHeight: 1.7 }}>
              • 任务类型自动匹配部门<br/>
              • 负载均衡避免过载<br/>
              • 技能匹配最优分配
            </div>
          </div>
          <div>
            <div style={{ fontWeight: 700, marginBottom: 8, color: '#22c55e', fontSize: 11 }}>📊 实时状态同步</div>
            <div style={{ color: 'var(--muted)', lineHeight: 1.7 }}>
              • Agent状态实时更新<br/>
              • 任务进度全程追踪<br/>
              • 异常告警及时响应
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ========== 子组件 ==========

function StatBadge({ icon, value, label, color }: { icon: string; value: number; label: string; color: string }) {
  return (
    <div style={{ 
      display: 'flex', 
      alignItems: 'center', 
      gap: 6, 
      padding: '6px 12px',
      background: `${color}12`,
      borderRadius: 10,
      border: `1px solid ${color}30`,
    }}>
      <span>{icon}</span>
      <span style={{ fontWeight: 700, fontSize: 14, color }}>{value}</span>
      <span style={{ fontSize: 10, color: 'var(--muted)' }}>{label}</span>
    </div>
  );
}

function FlowDivider({ text, color }: { text: string; color: string }) {
  return (
    <div style={{ textAlign: 'center', padding: '6px 0' }}>
      <span style={{ 
        padding: '6px 24px', 
        background: `${color}12`, 
        borderRadius: 20, 
        fontSize: 11, 
        color,
        fontWeight: 600,
        border: `1px solid ${color}30`,
      }}>
        {text}
      </span>
    </div>
  );
}

function FlowArrowAnimated({ active, color, label }: { active: boolean; color: string; label: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
        {[0, 1, 2].map(i => (
          <div 
            key={i}
            style={{
              width: 10,
              height: 10,
              borderRadius: '50%',
              background: active ? color : `${color}30`,
              transition: 'all 0.2s',
              animation: active ? `flowPulse 0.6s ${i * 0.1}s infinite` : 'none',
            }}
          />
        ))}
        <span style={{ color, fontSize: 20, marginLeft: 4 }}>→</span>
      </div>
      <span style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 500 }}>{label}</span>
    </div>
  );
}
