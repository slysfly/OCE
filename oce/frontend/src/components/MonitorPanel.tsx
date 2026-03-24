import { useEffect, useState } from 'react';
import { useStore, DEPTS, DEPT_SUB_AGENTS, isOce, stateLabel } from '../store';
import { api, type OfficialInfo } from '../api';

export default function MonitorPanel() {
  const liveStatus = useStore((s) => s.liveStatus);
  const agentsStatusData = useStore((s) => s.agentsStatusData);
  const officialsData = useStore((s) => s.officialsData);
  const loadAgentsStatus = useStore((s) => s.loadAgentsStatus);
  const setModalTaskId = useStore((s) => s.setModalTaskId);
  const toast = useStore((s) => s.toast);

  useEffect(() => {
    loadAgentsStatus();
  }, [loadAgentsStatus]);

  const tasks = liveStatus?.tasks || [];
  const activeTasks = tasks.filter((t: any) => isOce(t) && t.state !== 'Done' && t.state !== 'Next');

  const offMap: Record<string, OfficialInfo> = {};
  if (officialsData?.officials) {
    officialsData.officials.forEach((o) => { offMap[o.id] = o; });
  }
  
  const defaultModel = officialsData?.officials?.[0]?.model_short || 'tc-code-latest';

  const handleWake = async (agentId: string) => {
    try {
      const r = await api.agentWake(agentId);
      toast(r.message || '唤醒指令已发出');
      setTimeout(() => loadAgentsStatus(), 30000);
    } catch { toast('唤醒失败', 'err'); }
  };

  const handleWakeAll = async () => {
    if (!agentsStatusData) return;
    const toWake = agentsStatusData.agents.filter(
      (a) => a.id !== 'main' && a.status !== 'running' && a.status !== 'unconfigured'
    );
    if (!toWake.length) { toast('所有 Agent 均已在线'); return; }
    toast(`正在唤醒 ${toWake.length} 个 Agent...`);
    for (const a of toWake) {
      try { await api.agentWake(a.id); } catch { /* ignore */ }
    }
    toast(`${toWake.length} 个唤醒指令已发出，30秒后刷新状态`);
    setTimeout(() => loadAgentsStatus(), 30000);
  };

  const asData = agentsStatusData;
  // 优先使用 officialsData 计算 Agent 状态（与COO视角、Agent池等保持一致）
  const employees = officialsData?.employees || [];
  const running = employees.filter((e: any) => e.status === 'busy' || e.status === 'very-busy' || e.status === 'running').length;
  const idle = employees.filter((e: any) => e.status === 'idle').length;
  const offline = 0;  // 本地部署无离线概念
  
  const filtered = asData?.agents?.filter((a) => a.id !== 'main') || [];
  const unconf = filtered.filter((a) => a.status === 'unconfigured').length;
  const gw = asData?.gateway;
  const gwCls = gw?.probe ? 'ok' : gw?.alive ? 'warn' : 'err';

  // 部门效率排行
  const deptEfficiency = DEPTS.map(d => {
    const myTasks = activeTasks.filter((t: any) => t.org === d.label);
    const doneCount = tasks.filter((t: any) => t.org === d.label && t.state === 'Done').length;
    const blockedCount = myTasks.filter((t: any) => t.block && t.block !== '无').length;
    const efficiency = myTasks.length > 0 ? Math.round((myTasks.length - blockedCount) / myTasks.length * 100) : 100;
    return { ...d, activeCount: myTasks.length, doneCount, blockedCount, efficiency };
  }).sort((a, b) => b.efficiency - a.efficiency);

  // 最繁忙部门
  const busiestDepts = [...deptEfficiency].sort((a, b) => b.activeCount - a.activeCount).slice(0, 5);
  
  // 最高效部门
  const topEfficiencyDepts = deptEfficiency.filter(d => d.activeCount > 0).slice(0, 5);
  
  // 阻塞最多的部门
  const blockedDepts = [...deptEfficiency].filter(d => d.blockedCount > 0).sort((a, b) => b.blockedCount - a.blockedCount);

  return (
    <div style={{ padding: 12, maxWidth: 1920, margin: '0 auto' }}>
      
      {/* 顶部状态统计 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: 8, marginBottom: 12 }}>
        <div style={{ background: 'linear-gradient(135deg, #22c55e20, #22c55e10)', borderRadius: 10, padding: 12, border: '1px solid #22c55e40', textAlign: 'center' }}>
          <div style={{ fontSize: 10, color: 'var(--muted)' }}>🔄 运行中</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#22c55e' }}>{running}</div>
        </div>
        <div style={{ background: 'linear-gradient(135deg, #f59e0b20, #f59e0b10)', borderRadius: 10, padding: 12, border: '1px solid #f59e0b40', textAlign: 'center' }}>
          <div style={{ fontSize: 10, color: 'var(--muted)' }}>💤 待命</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#f59e0b' }}>{idle}</div>
        </div>
        <div style={{ background: 'linear-gradient(135deg, #ef444420, #ef444410)', borderRadius: 10, padding: 12, border: '1px solid #ef444440', textAlign: 'center' }}>
          <div style={{ fontSize: 10, color: 'var(--muted)' }}>❌ 离线</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#ef4444' }}>{offline}</div>
        </div>
        <div style={{ background: 'var(--panel)', borderRadius: 10, padding: 12, border: '1px solid var(--line)', textAlign: 'center' }}>
          <div style={{ fontSize: 10, color: 'var(--muted)' }}>📋 活跃任务</div>
          <div style={{ fontSize: 22, fontWeight: 800 }}>{activeTasks.length}</div>
        </div>
        <div style={{ background: 'linear-gradient(135deg, #3b82f620, #3b82f610)', borderRadius: 10, padding: 12, border: '1px solid #3b82f640', textAlign: 'center' }}>
          <div style={{ fontSize: 10, color: 'var(--muted)' }}>🏢 部门总数</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#3b82f6' }}>{(officialsData?.totals?.total_departments) || DEPTS.length}</div>
        </div>
        <div style={{ background: 'linear-gradient(135deg, #8b5cf620, #8b5cf610)', borderRadius: 10, padding: 12, border: '1px solid #8b5cf640', textAlign: 'center' }}>
          <div style={{ fontSize: 10, color: 'var(--muted)' }}>👥 总人数</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#8b5cf6' }}>{(officialsData?.employees?.length) || (officialsData?.totals?.total_employees) || (officialsData?.officials?.length) || 0}</div>
        </div>
        <div style={{ background: 'linear-gradient(135deg, #10b98120, #10b98110)', borderRadius: 10, padding: 12, border: '1px solid #10b98140', textAlign: 'center' }}>
          <div style={{ fontSize: 10, color: 'var(--muted)' }}>⭐ 平均效率</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#10b981' }}>
            {deptEfficiency.length > 0 ? Math.round(deptEfficiency.reduce((a, b) => a + b.efficiency, 0) / deptEfficiency.length) : 100}%
          </div>
        </div>
        <div style={{ background: 'linear-gradient(135deg, #fbbf2420, #fbbf2410)', borderRadius: 10, padding: 12, border: '1px solid #fbbf2440', textAlign: 'center', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <div style={{ fontSize: 9, color: gwCls === 'ok' ? '#22c55e' : gwCls === 'warn' ? '#f59e0b' : '#ef4444', fontWeight: 600 }}>
            {gwCls === 'ok' ? '✅ 正常' : gwCls === 'warn' ? '⚠️ 告警' : '❌ 异常'}
          </div>
          <div style={{ fontSize: 10, color: 'var(--muted)' }}>Gateway</div>
        </div>
      </div>

      {/* 排行榜区域 */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 12 }}>
        {/* 最繁忙部门 */}
        <div style={{ background: 'var(--panel)', borderRadius: 10, border: '1px solid #f59e0b50', overflow: 'hidden' }}>
          <div style={{ padding: '8px 12px', background: 'linear-gradient(90deg, #f59e0b20, transparent)', borderBottom: '1px solid var(--line)', display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 14 }}>🔥</span>
            <span style={{ fontWeight: 700, fontSize: 12, color: '#f59e0b' }}>最繁忙部门 TOP 5</span>
          </div>
          <div style={{ padding: 6 }}>
            {busiestDepts.map((d, i) => (
              <div key={d.id} style={{ display: 'flex', alignItems: 'center', padding: '6px 8px', gap: 8, background: i === 0 ? '#f59e0b15' : 'transparent', borderRadius: 6 }}>
                <span style={{ width: 18, height: 18, borderRadius: '50%', background: i === 0 ? '#f59e0b' : i === 1 ? '#fbbf24' : i === 2 ? '#fcd34d' : 'var(--panel2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: i < 3 ? '#000' : 'var(--muted)' }}>{i + 1}</span>
                <span style={{ fontSize: 14 }}>{d.emoji}</span>
                <span style={{ fontWeight: 600, flex: 1, fontSize: 12 }}>{d.label}</span>
                <span style={{ fontWeight: 700, color: '#f59e0b', fontSize: 13 }}>{d.activeCount}个</span>
              </div>
            ))}
          </div>
        </div>

        {/* 最高效部门 */}
        <div style={{ background: 'var(--panel)', borderRadius: 10, border: '1px solid #22c55e50', overflow: 'hidden' }}>
          <div style={{ padding: '8px 12px', background: 'linear-gradient(90deg, #22c55e20, transparent)', borderBottom: '1px solid var(--line)', display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 14 }}>🏆</span>
            <span style={{ fontWeight: 700, fontSize: 12, color: '#22c55e' }}>最高效部门 TOP 5</span>
          </div>
          <div style={{ padding: 6 }}>
            {topEfficiencyDepts.map((d, i) => (
              <div key={d.id} style={{ display: 'flex', alignItems: 'center', padding: '6px 8px', gap: 8, background: i === 0 ? '#22c55e15' : 'transparent', borderRadius: 6 }}>
                <span style={{ width: 18, height: 18, borderRadius: '50%', background: i === 0 ? '#22c55e' : i === 1 ? '#4ade80' : i === 2 ? '#86efac' : 'var(--panel2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: i < 3 ? '#fff' : 'var(--muted)' }}>{i + 1}</span>
                <span style={{ fontSize: 14 }}>{d.emoji}</span>
                <span style={{ fontWeight: 600, flex: 1, fontSize: 12 }}>{d.label}</span>
                <span style={{ fontWeight: 700, color: '#22c55e', fontSize: 13 }}>{d.efficiency}%</span>
              </div>
            ))}
          </div>
        </div>

        {/* 阻塞告警 */}
        <div style={{ background: 'var(--panel)', borderRadius: 10, border: '1px solid #ef444450', overflow: 'hidden' }}>
          <div style={{ padding: '8px 12px', background: 'linear-gradient(90deg, #ef444420, transparent)', borderBottom: '1px solid var(--line)', display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 14 }}>⚠️</span>
            <span style={{ fontWeight: 700, fontSize: 12, color: '#ef4444' }}>阻塞告警</span>
          </div>
          <div style={{ padding: 6 }}>
            {blockedDepts.length > 0 ? blockedDepts.slice(0, 5).map((d, i) => (
              <div key={d.id} style={{ display: 'flex', alignItems: 'center', padding: '6px 8px', gap: 8, borderRadius: 6 }}>
                <span style={{ width: 18, height: 18, borderRadius: '50%', background: '#ef4444', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: '#fff' }}>!</span>
                <span style={{ fontSize: 14 }}>{d.emoji}</span>
                <span style={{ fontWeight: 600, flex: 1, fontSize: 12 }}>{d.label}</span>
                <span style={{ fontWeight: 700, color: '#ef4444', fontSize: 13 }}>{d.blockedCount}阻塞</span>
              </div>
            )) : (
              <div style={{ textAlign: 'center', padding: 20, color: '#22c55e', fontSize: 12 }}>✅ 无阻塞任务</div>
            )}
          </div>
        </div>
      </div>

      {/* Agent 快速唤醒 */}
      {asData && asData.ok && (
        <div style={{ background: 'var(--panel)', borderRadius: 10, border: '1px solid var(--line)', marginBottom: 12, padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 14 }}>🔌</span>
          <span style={{ fontWeight: 600, fontSize: 12 }}>Agent 状态</span>
          <span style={{ fontSize: 11, color: 'var(--muted)' }}>运行{running} / 待命{idle} / 离线{offline}</span>
          <button onClick={() => loadAgentsStatus()} style={{ marginLeft: 'auto', padding: '4px 12px', fontSize: 11, border: '1px solid var(--line)', borderRadius: 6, background: 'var(--panel2)', cursor: 'pointer' }}>🔄 刷新</button>
          {(offline + unconf > 0) && (
            <button onClick={handleWakeAll} style={{ padding: '4px 12px', fontSize: 11, border: '1px solid #f59e0b', borderRadius: 6, background: '#f59e0b20', color: '#f59e0b', cursor: 'pointer' }}>⚡ 全部唤醒</button>
          )}
        </div>
      )}

      {/* 部门网格 - 紧凑展示 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 6 }}>
        {DEPTS.map((d) => {
          const myTasks = activeTasks.filter((t) => t.org === d.label);
          const isActive = myTasks.some((t) => t.state === 'Doing');
          const isBlocked = myTasks.some((t) => t.block && t.block !== '无');
          const off = offMap[d.id];
          const hb = off?.heartbeat || { status: 'idle' };
          const deptEmployees: any[] = (DEPT_SUB_AGENTS as any)[d.id] || [];
          const runningInDept = deptEmployees.filter((emp: any) => {
            const empInfo = (officialsData?.officials || []).find((o: any) => o.id === emp.id);
            return empInfo?.status === 'running';
          }).length;

          const statusColor = isBlocked ? '#ef4444' : isActive ? '#22c55e' : hb.status === 'active' ? '#3b82f6' : 'var(--muted)';
          const statusBg = isBlocked ? '#ef444415' : isActive ? '#22c55e15' : 'transparent';

          return (
            <div key={d.id} style={{ background: 'var(--panel)', borderRadius: 8, border: `1px solid ${statusColor}40`, overflow: 'hidden' }}>
              {/* 部门标题 */}
              <div style={{ 
                padding: '6px 8px', 
                background: 'var(--panel2)', 
                borderBottom: '1px solid var(--line)',
                display: 'flex',
                alignItems: 'center',
                gap: 4
              }}>
                <span style={{ fontSize: 14 }}>{d.emoji}</span>
                <span style={{ fontWeight: 600, fontSize: 11, flex: 1 }}>{d.label}</span>
                <span style={{ fontSize: 9, padding: '1px 4px', borderRadius: 3, background: statusBg, color: statusColor, fontWeight: 600 }}>
                  {isBlocked ? '⚠️' : isActive ? '🔄' : '⚪'} {myTasks.length}
                </span>
              </div>
              
              {/* 领导 */}
              <div style={{ padding: '4px 6px', borderBottom: '1px solid var(--line)', display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ fontSize: 12 }}>{d.gender === '男' ? '👨' : '👩'}</span>
                <span style={{ fontSize: 10, flex: 1, fontWeight: 500 }}>{d.name || d.role}</span>
                <span style={{ fontSize: 8, padding: '1px 4px', background: '#f5c84222', color: '#f5c842', borderRadius: 2 }}>★</span>
              </div>
              
              {/* 员工列表 */}
              <div style={{ padding: 4, maxHeight: 120, overflowY: 'auto' }}>
                {deptEmployees.map((emp: any) => {
                  const empInfo = (officialsData?.officials || []).find((o: any) => o.id === emp.id);
                  const isRunning = empInfo?.status === 'running';
                  
                  return (
                    <div key={emp.id} style={{ 
                      display: 'flex', 
                      alignItems: 'center', 
                      gap: 4, 
                      padding: '3px 4px', 
                      borderRadius: 4, 
                      background: isRunning ? '#22c55e10' : 'transparent',
                      marginBottom: 2 
                    }}>
                      <span style={{ fontSize: 10 }}>{emp.gender === '男' ? '👨' : '👩'}</span>
                      <span style={{ fontSize: 9, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{emp.name}</span>
                      <span style={{ fontSize: 8, color: isRunning ? '#22c55e' : 'var(--muted)' }}>{isRunning ? '🔄' : '⚪'}</span>
                    </div>
                  );
                })}
              </div>

              {/* 任务列表 */}
              {myTasks.length > 0 && (
                <div style={{ padding: '4px 6px', borderTop: '1px solid var(--line)', maxHeight: 80, overflowY: 'auto' }}>
                  {myTasks.slice(0, 3).map((t: any) => (
                    <div key={t.id} style={{ fontSize: 8, padding: '2px 4px', background: 'var(--panel2)', borderRadius: 3, marginBottom: 2, cursor: 'pointer' }} onClick={() => setModalTaskId(t.id)}>
                      <span style={{ fontWeight: 600, color: t.block ? '#ef4444' : '#22c55e' }}>{t.id}</span>
                      <span style={{ marginLeft: 4 }}>{t.title?.substring(0, 15)}...</span>
                    </div>
                  ))}
                  {myTasks.length > 3 && <div style={{ fontSize: 8, color: 'var(--muted)', textAlign: 'center' }}>+{myTasks.length - 3} 更多</div>}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
