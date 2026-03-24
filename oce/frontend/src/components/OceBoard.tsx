import { useState, useEffect, useMemo, memo, useRef } from 'react';
import { useStore, isOce, isArchived, getPipeStatus, stateLabel, deptColor, PIPE, DEPTS } from '../store';
import { api, type Task } from '../api';
import EnterpriseFlowChart from './EnterpriseFlowChart';
import TemplatePanel from './TemplatePanel';
import MorningPanel from './MorningPanel';
import AgentPoolPanel from './AgentPoolPanel';

// 排序权重
const STATE_ORDER: Record<string, number> = {
  Doing: 0, Review: 1, Assigned: 2, Architecture: 3, Product: 4,
  Assistant: 5, Inbox: 6, Blocked: 7, Next: 8, Done: 9, Cancelled: 10,
};

function MiniPipe({ task }: { task: Task }) {
  const stages = getPipeStatus(task);
  return (
    <div className="ec-pipe">
      {stages.map((s, i) => (
        <span key={s.key} style={{ display: 'contents' }}>
          <div className={`ep-node ${s.status}`}>
            <div className="ep-icon">{s.icon}</div>
            <div className="ep-name">{s.dept}</div>
          </div>
          {i < stages.length - 1 && <div className="ep-arrow">›</div>}
        </span>
      ))}
    </div>
  );
}

function OceCard({ task }: { task: Task }) {
  const setModalTaskId = useStore((s) => s.setModalTaskId);
  const toast = useStore((s) => s.toast);
  const loadAll = useStore((s) => s.loadAll);

  const hb = task.heartbeat || { status: 'unknown', label: '⚪' };
  const stCls = 'st-' + (task.state || '');
  const deptCls = 'dt-' + (task.org || '').replace(/\s/g, '');
  const curStage = PIPE.find((_, i) => getPipeStatus(task)[i].status === 'active');
  const todos = task.todos || [];
  const todoDone = todos.filter((x) => x.status === 'completed').length;
  const todoTotal = todos.length;
  const canStop = !['Done', 'Blocked', 'Cancelled'].includes(task.state);
  const canResume = ['Blocked', 'Cancelled'].includes(task.state);
  const archived = isArchived(task);
  const isBlocked = task.block && task.block !== '无' && task.block !== '-';

  const handleAction = async (action: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (action === 'stop' || action === 'cancel') {
      // Use confirm dialog via store (will implement with ConfirmDialog)
      const reason = prompt(action === 'stop' ? '请输入叫停原因：' : '请输入取消原因：');
      if (reason === null) return;
      try {
        const r = await api.taskAction(task.id, action, reason);
        if (r.ok) { toast(r.message || '操作成功'); loadAll(); }
        else toast(r.error || '操作失败', 'err');
      } catch { toast('服务器连接失败', 'err'); }
    } else if (action === 'resume') {
      try {
        const r = await api.taskAction(task.id, 'resume', '恢复执行');
        if (r.ok) { toast(r.message || '已恢复'); loadAll(); }
        else toast(r.error || '操作失败', 'err');
      } catch { toast('服务器连接失败', 'err'); }
    }
  };

  const handleArchive = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const r = await api.archiveTask(task.id, !task.archived);
      if (r.ok) { toast(r.message || '操作成功'); loadAll(); }
      else toast(r.error || '操作失败', 'err');
    } catch { toast('服务器连接失败', 'err'); }
  };

  return (
    <div
      className={`oce-card${archived ? ' archived' : ''}`}
      onClick={() => setModalTaskId(task.id)}
    >
      <MiniPipe task={task} />
      <div className="ec-id">{task.id}</div>
      <div className="ec-title">{task.title || '(无标题)'}</div>
      <div className="ec-meta">
        <span className={`tag ${stCls}`}>{stateLabel(task)}</span>
        {task.org && <span className={`tag ${deptCls}`}>{task.org}</span>}
        {curStage && (
          <span style={{ fontSize: 11, color: 'var(--muted)' }}>
            当前: <b style={{ color: deptColor(curStage.dept) }}>{curStage.dept} · {curStage.action}</b>
          </span>
        )}
      </div>
      {task.now && task.now !== '-' && (
        <div style={{ fontSize: 11, color: 'var(--muted)', lineHeight: 1.5, marginBottom: 6 }}>
          {task.now.substring(0, 80)}
        </div>
      )}
      {(task.review_round || 0) > 0 && (
        <div style={{ fontSize: 11, marginBottom: 6 }}>
          {Array.from({ length: task.review_round || 0 }, (_, i) => (
            <span
              key={i}
              style={{
                display: 'inline-block', width: 14, height: 14, borderRadius: '50%',
                background: i < (task.review_round || 0) - 1 ? '#1a3a6a22' : 'var(--acc)22',
                border: `1px solid ${i < (task.review_round || 0) - 1 ? '#2a4a8a' : 'var(--acc)'}`,
                fontSize: 9, textAlign: 'center', lineHeight: '13px', marginRight: 2,
                color: i < (task.review_round || 0) - 1 ? '#4a6aaa' : 'var(--acc)',
              }}
            >
              {i + 1}
            </span>
          ))}
          <span style={{ color: 'var(--muted)', fontSize: 10 }}>第 {task.review_round} 轮磋商</span>
        </div>
      )}
      {todoTotal > 0 && (
        <div className="ec-todo-bar">
          <span>📋 {todoDone}/{todoTotal}</span>
          <div className="ec-todo-track">
            <div className="ec-todo-fill" style={{ width: `${Math.round((todoDone / todoTotal) * 100)}%` }} />
          </div>
          <span>{todoDone === todoTotal ? '✅ 全部完成' : '🔄 进行中'}</span>
        </div>
      )}
      <div className="ec-footer">
        <span className={`hb ${hb.status}`}>{hb.label}</span>
        {isBlocked && (
          <span className="tag" style={{ borderColor: '#ff527044', color: 'var(--danger)', background: '#200a10' }}>
            🚫 {task.block}
          </span>
        )}
        {task.eta && task.eta !== '-' && (
          <span style={{ fontSize: 11, color: 'var(--muted)' }}>📅 {task.eta}</span>
        )}
      </div>
      <div className="ec-actions" onClick={(e) => e.stopPropagation()}>
        {canStop && (
          <>
            <button className="mini-act" onClick={(e) => handleAction('stop', e)}>⏸ 叫停</button>
            <button className="mini-act danger" onClick={(e) => handleAction('cancel', e)}>🚫 取消</button>
          </>
        )}
        {canResume && (
          <button className="mini-act" onClick={(e) => handleAction('resume', e)}>▶ 恢复</button>
        )}
        {archived && !task.archived && (
          <button className="mini-act" onClick={handleArchive}>📦 归档</button>
        )}
        {task.archived && (
          <button className="mini-act" onClick={handleArchive}>📤 取消归档</button>
        )}
      </div>
    </div>
  );
}

export default function OceBoard() {
  const liveStatus = useStore((s) => s.liveStatus);
  const oceFilter = useStore((s) => s.oceFilter);
  const setOceFilter = useStore((s) => s.setOceFilter);
  const toast = useStore((s) => s.toast);
  const loadAll = useStore((s) => s.loadAll);

  // 排序状态（默认按编号排序）
  const [oceSort, setOceSort] = useState<'state' | 'time-desc' | 'time-asc' | 'id-desc' | 'id-asc'>('id-desc');

  const tasks = liveStatus?.tasks || [];
  const allOces = tasks.filter(isOce);
  const activeOces = allOces.filter((t) => !isArchived(t));
  const archivedOces = allOces.filter((t) => isArchived(t));

  let oces: Task[];
  if (oceFilter === 'active') oces = activeOces;
  else if (oceFilter === 'archived') oces = archivedOces;
  else oces = allOces;

  // 排序逻辑
  oces.sort((a, b) => {
    const aTime = (a as any).updated_at || (a as any).created_at || a.updatedAt;
    const bTime = (b as any).updated_at || (b as any).created_at || b.updatedAt;
    
    if (oceSort === 'time-desc') {
      return new Date(bTime || 0).getTime() - new Date(aTime || 0).getTime();
    } else if (oceSort === 'time-asc') {
      return new Date(aTime || 0).getTime() - new Date(bTime || 0).getTime();
    } else if (oceSort === 'id-desc') {
      return b.id.localeCompare(a.id);
    } else if (oceSort === 'id-asc') {
      return a.id.localeCompare(b.id);
    } else {
      return (STATE_ORDER[a.state] ?? 9) - (STATE_ORDER[b.state] ?? 9);
    }
  });

  const unArchivedDone = allOces.filter((t) => !t.archived && ['Done', 'Cancelled'].includes(t.state));

  const handleArchiveAll = async () => {
    if (!confirm('将所有已完成/已取消的任务移入归档？')) return;
    try {
      const r = await api.archiveAllDone();
      if (r.ok) { toast(`📦 ${r.count || 0} 个任务已归档`); loadAll(); }
      else toast(r.error || '批量归档失败', 'err');
    } catch { toast('服务器连接失败', 'err'); }
  };

  const handleScan = async () => {
    try {
      const r = await api.schedulerScan();
      if (r.ok) toast(`🧭 助理巡检完成：${r.count || 0} 个动作`);
      else toast(r.error || '巡检失败', 'err');
      loadAll();
    } catch { toast('服务器连接失败', 'err'); }
  };

  // 模块视图状态
  const [viewMode, setViewMode] = useState<'overview' | 'org' | 'flow' | 'agent_pool' | 'project' | 'eva' | 'meeting' | 'templates' | 'morning'>('overview');

  // 整体DashBoard视图
  const OverviewPanel = () => {
    const officialsData = useStore((s) => s.officialsData);
    const totals = officialsData?.totals || { tasks_done: 0, cost_cny: 0 };
    
    // 按状态分组统计
    const stateStats = PIPE.map(p => ({
      ...p,
      count: allOces.filter(t => t.state === p.key).length,
    }));
    
    // 按部门分组
    const deptStats: Record<string, number> = {};
    allOces.forEach(t => {
      const dept = t.org || '未知';
      deptStats[dept] = (deptStats[dept] || 0) + 1;
    });
    
    // 风险任务
    const riskTasks = allOces.filter(t => t.block && t.block !== '无' && t.block !== '-');
    const activeOces = allOces.filter(t => !isArchived(t));
    
    // 计算本周完成
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7*24*60*60*1000);
    const weekDone = allOces.filter(t => t.state === 'Done' && t.updatedAt && new Date(t.updatedAt) > weekAgo).length;
    
    // 计算整体进度
    const tasksWithTodos = activeOces.filter(t => (t.todos || []).length > 0);
    let totalProgress = 0;
    if (tasksWithTodos.length > 0) {
      const progressSum = tasksWithTodos.reduce((sum, t) => {
        const done = (t.todos || []).filter(x => x.status === 'completed').length;
        return sum + (done / (t.todos || []).length);
      }, 0);
      totalProgress = Math.round(progressSum / tasksWithTodos.length * 100);
    }
    
    // 最忙部门 TOP3
    const topDepts = Object.entries(deptStats).sort((a, b) => b[1] - a[1]).slice(0, 3);
    
    // 部门成本数据
    const deptCosts = (officialsData?.officials || [])
      .map(o => ({ name: o.label, cost: (o.tokens_in + o.tokens_out) * 0.00001 }))
      .sort((a, b) => b.cost - a.cost)
      .slice(0, 5);
    
    return (
      <div style={{ padding: 16 }}>
        {/* 统计卡片 */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
          <div style={{ background: 'var(--panel)', borderRadius: 12, padding: 16, border: '1px solid var(--line)' }}>
            <div style={{ color: 'var(--muted)', fontSize: 11 }}>总任务</div>
            <div style={{ fontSize: 28, fontWeight: 700 }}>{allOces.length}</div>
          </div>
          <div style={{ background: 'var(--panel)', borderRadius: 12, padding: 16, border: '1px solid var(--line)' }}>
            <div style={{ color: 'var(--muted)', fontSize: 11 }}>进行中</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: '#22c55e' }}>{allOces.filter(t => t.state === 'Doing').length}</div>
          </div>
          <div style={{ background: 'var(--panel)', borderRadius: 12, padding: 16, border: '1px solid var(--line)' }}>
            <div style={{ color: 'var(--muted)', fontSize: 11 }}>已完成</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: '#6a9eff' }}>{allOces.filter(t => t.state === 'Done').length}</div>
          </div>
          <div style={{ background: 'var(--panel)', borderRadius: 12, padding: 16, border: '1px solid var(--line)' }}>
            <div style={{ color: 'var(--muted)', fontSize: 11 }}>有风险</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: '#ef4444' }}>{riskTasks.length}</div>
          </div>
        </div>
        
        {/* ===== CEO/COO/CFO 三视角 ===== */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 20 }}>
          {/* CEO视角 */}
          <div style={{ background: 'var(--panel)', borderRadius: 12, border: '1px solid var(--line)', overflow: 'hidden' }}>
            <div style={{ padding: '10px 14px', background: 'linear-gradient(135deg, #ffd70022, #ffa50022)', borderBottom: '1px solid var(--line)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 18 }}>👑</span>
              <span style={{ fontWeight: 600, fontSize: 13 }}>CEO视角 · 战略决策</span>
            </div>
            <div style={{ padding: 14 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8, marginBottom: 12 }}>
                <div style={{ textAlign: 'center', padding: 10, background: 'var(--panel2)', borderRadius: 8 }}>
                  <div style={{ color: 'var(--muted)', fontSize: 10 }}>活跃任务</div>
                  <div style={{ fontSize: 22, fontWeight: 700 }}>{activeOces.length}</div>
                </div>
                <div style={{ textAlign: 'center', padding: 10, background: 'var(--panel2)', borderRadius: 8 }}>
                  <div style={{ color: 'var(--muted)', fontSize: 10 }}>阻塞任务</div>
                  <div style={{ fontSize: 22, fontWeight: 700, color: '#ef4444' }}>{riskTasks.length}</div>
                </div>
                <div style={{ textAlign: 'center', padding: 10, background: 'var(--panel2)', borderRadius: 8 }}>
                  <div style={{ color: 'var(--muted)', fontSize: 10 }}>本周完成</div>
                  <div style={{ fontSize: 22, fontWeight: 700, color: '#22c55e' }}>{weekDone}</div>
                </div>
                <div style={{ textAlign: 'center', padding: 10, background: 'var(--panel2)', borderRadius: 8 }}>
                  <div style={{ color: 'var(--muted)', fontSize: 10 }}>整体进度</div>
                  <div style={{ fontSize: 22, fontWeight: 700 }}>{totalProgress}%</div>
                </div>
              </div>
              <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 6 }}>🏆 最忙部门 TOP3</div>
              {topDepts.map(([dept, count], i) => (
                <div key={dept} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                  <span style={{ width: 16, height: 16, borderRadius: '50%', background: i === 0 ? '#ffd700' : i === 1 ? '#c0c0c0' : '#cd7f32', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: '#000' }}>{i + 1}</span>
                  <span style={{ flex: 1, fontSize: 12 }}>{dept}</span>
                  <span style={{ color: 'var(--muted)', fontSize: 11 }}>{count}个</span>
                </div>
              ))}
            </div>
          </div>
          
          {/* COO视角 */}
          <div style={{ background: 'var(--panel)', borderRadius: 12, border: '1px solid var(--line)', overflow: 'hidden' }}>
            <div style={{ padding: '10px 14px', background: 'linear-gradient(135deg, #22c55e22, #10b98122)', borderBottom: '1px solid var(--line)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 18 }}>⚙️</span>
              <span style={{ fontWeight: 600, fontSize: 13 }}>COO视角 · 运营效率</span>
            </div>
            <div style={{ padding: 14 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 12 }}>
                <div style={{ textAlign: 'center', padding: 10, background: 'var(--panel2)', borderRadius: 8 }}>
                  <div style={{ fontSize: 18, fontWeight: 700 }}>
                    {(() => {
                      const doneTasks = allOces.filter((t: any) => t.state === 'Done');
                      if (doneTasks.length === 0) return '--';
                      const avgHours = doneTasks.reduce((sum: number, t: any) => {
                        // 使用 created_at 和 updated_at（或 updatedAt）
                        const startTime = new Date((t as any).created_at || t.updatedAt).getTime();
                        const endTime = new Date((t as any).updated_at || t.updatedAt).getTime();
                        const hours = (endTime - startTime) / (1000 * 60 * 60);
                        if (hours > 0 && hours < 2000) return sum + hours; // 过滤异常值
                        return sum;
                      }, 0);
                      const validCount = doneTasks.filter((t: any) => {
                        const hours = (new Date((t as any).updated_at || t.updatedAt).getTime() - new Date((t as any).created_at || t.updatedAt).getTime()) / (1000 * 60 * 60);
                        return hours > 0 && hours < 2000;
                      }).length;
                      if (validCount === 0) return '--';
                      const avg = avgHours / validCount;
                      return avg < 24 ? `${avg.toFixed(1)}h` : `${(avg / 24).toFixed(1)}d`;
                    })()}
                  </div>
                  <div style={{ color: 'var(--muted)', fontSize: 10 }}>平均耗时</div>
                </div>
                <div style={{ textAlign: 'center', padding: 10, background: 'var(--panel2)', borderRadius: 8 }}>
                  <div style={{ fontSize: 18, fontWeight: 700 }}>
                    {(() => {
                      // 统计所有任务的平均轮次（基于 flow_log）
                      const tasksWithFlow = allOces.filter((t: any) => (t.flow_log || []).length > 0);
                      if (tasksWithFlow.length === 0) return '--';
                      const avgRounds = tasksWithFlow.reduce((sum: number, t: any) => sum + (t.flow_log || []).length, 0) / tasksWithFlow.length;
                      return avgRounds.toFixed(1);
                    })()}
                  </div>
                  <div style={{ color: 'var(--muted)', fontSize: 10 }}>平均轮次</div>
                </div>
                <div style={{ textAlign: 'center', padding: 10, background: 'var(--panel2)', borderRadius: 8 }}>
                  <div style={{ fontSize: 18, fontWeight: 700 }}>{activeOces.length > 0 ? Math.round(riskTasks.length / activeOces.length * 100) : 0}%</div>
                  <div style={{ color: 'var(--muted)', fontSize: 10 }}>阻塞率</div>
                </div>
              </div>
              <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 6 }}>🤖 Agent 在线状态 ({officialsData?.totals?.total_employees || (officialsData?.employees || []).length || (officialsData?.officials || []).length}人)</div>
              <div className="agent-scroll-container" style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 4, maxHeight: 200, overflowY: 'auto' }}>
                {(() => {
                  // 优先使用 employees 列表（148个员工=148个Agent）
                  const agents = (officialsData?.employees || officialsData?.officials || []);
                  return agents.map((o: any) => {
                  // 判断运行状态（与OfficialPanel保持一致）
                  const status = o.status || o.heartbeat?.status || 'idle';
                  const isRunning = status === 'busy' || status === 'very-busy' || status === 'running';
                  const isIdle = status === 'idle' || status === 'available';  // idle和available都是待命
                  const isOffline = !status || status === 'offline';
                  
                  // 获取边框颜色
                  const borderColor = isRunning ? '#22c55e' : isIdle ? '#f59e0b' : '#6b7280';
                  // 获取状态文字
                  const statusText = isRunning ? '运行中' : isIdle ? '待命' : '离线';
                  // 获取状态颜色
                  const statusColor = isRunning ? '#22c55e' : isIdle ? '#f59e0b' : '#6b7280';
                  
                  return (
                    <div key={o.id} style={{ textAlign: 'center', padding: 6, background: isRunning ? '#22c55e11' : isIdle ? '#f59e0b11' : 'var(--panel2)', borderRadius: 6, border: `1px solid ${borderColor}44`, overflow: 'auto' }}>
                      <div style={{ fontSize: 14 }}>{o.emoji || '👤'}</div>
                      <div style={{ fontSize: 9, color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.name || o.label}</div>
                      <div style={{ fontSize: 8, color: statusColor, fontWeight: isRunning ? 600 : 400 }}>
                        {isRunning && o.running_tasks ? `🔄 ${o.running_tasks.length}` : statusText}
                      </div>
                    </div>
                  );
                })})()}
              </div>
            </div>
          </div>
          
          {/* CFO视角 */}
          <div style={{ background: 'var(--panel)', borderRadius: 12, border: '1px solid var(--line)', overflow: 'hidden' }}>
            <div style={{ padding: '10px 14px', background: 'linear-gradient(135deg, #6a9eff22, #3b82f622)', borderBottom: '1px solid var(--line)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 18 }}>💰</span>
              <span style={{ fontWeight: 600, fontSize: 13 }}>CFO视角 · 成本控制</span>
              <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--muted)' }}>每3分钟刷新</span>
            </div>
            <div style={{ padding: 14 }}>
              <div style={{ textAlign: 'center', marginBottom: 12 }}>
                <div style={{ color: 'var(--muted)', fontSize: 10 }}>累计成本</div>
                <div style={{ fontSize: 26, fontWeight: 700 }}>¥{(totals.cost_cny || 0).toLocaleString()}</div>
                <div style={{ fontSize: 10, color: 'var(--muted)' }}>含缓存优化</div>
              </div>
              <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 6 }}>📊 部门成本 TOP5</div>
              {(() => {
                // 计算部门成本
                const deptCosts: { name: string; cost: number }[] = [];
                const deptMap: Record<string, number> = {};
                (officialsData?.officials || []).forEach((o: any) => {
                  const dept = o.org || '未知';
                  deptMap[dept] = (deptMap[dept] || 0) + (o.cost_cny || 0);
                });
                Object.entries(deptMap)
                  .sort((a, b) => b[1] - a[1])
                  .slice(0, 5)
                  .forEach(([name, cost]) => deptCosts.push({ name, cost }));
                
                // 确保始终显示5个
                while (deptCosts.length < 5) {
                  deptCosts.push({ name: `部门${deptCosts.length + 1}`, cost: 0 });
                }
                
                return deptCosts.map((d, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, fontSize: 11 }}>
                    <span style={{ width: 16, color: 'var(--muted)' }}>{i + 1}.</span>
                    <span style={{ flex: 1 }}>{d.name}</span>
                    <span style={{ color: d.cost > 0 ? '#22c55e' : 'var(--muted)' }}>¥{d.cost.toFixed(2)}</span>
                  </div>
                ));
              })()}
            </div>
          </div>
        </div>
        
        {/* 部门分布 - 显示所有部门 */}
        <div style={{ background: 'var(--panel)', borderRadius: 12, padding: 16, border: '1px solid var(--line)' }}>
          <h3 style={{ margin: '0 0 12px 0', fontSize: 14, fontWeight: 600 }}>🏢 部门任务分布（全部{DEPTS.length}个部门）</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 6, maxHeight: 300, overflow: 'auto' }}>
            {DEPTS.map(d => {
              const count = deptStats[d.label] || 0;
              return (
                <div key={d.id} style={{ padding: '8px 10px', background: count > 0 ? 'var(--panel2)' : 'var(--panel)', borderRadius: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center', opacity: count > 0 ? 1 : 0.5 }}>
                  <span style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span>{d.emoji}</span>
                    <span>{d.label}</span>
                  </span>
                  <span style={{ fontWeight: 600, color: count > 0 ? 'var(--accent)' : 'var(--muted)', fontSize: 11 }}>{count}</span>
                </div>
              );
            })}
          </div>
        </div>
        
        {/* ===== 任务卡片列表 ===== */}
        <div style={{ marginTop: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
            <span style={{ fontWeight: 600, fontSize: 14 }}>📋 任务列表</span>
            
            {/* 筛选按钮 */}
            <div style={{ display: 'flex', gap: 4, marginLeft: 'auto' }}>
              {(['active', 'archived', 'all'] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setOceFilter(f)}
                  style={{
                    padding: '4px 10px',
                    fontSize: 11,
                    border: 'none',
                    borderRadius: 4,
                    cursor: 'pointer',
                    background: oceFilter === f ? 'var(--acc)' : 'var(--panel2)',
                    color: oceFilter === f ? '#000' : 'var(--muted)',
                  }}
                >
                  {f === 'active' ? '活跃' : f === 'archived' ? '归档' : '全部'}
                </button>
              ))}
            </div>
            
            {/* 排序按钮 */}
            <div style={{ display: 'flex', gap: 4, borderLeft: '1px solid var(--line)', paddingLeft: 12, marginLeft: 4 }}>
              <span style={{ fontSize: 10, color: 'var(--muted)', alignSelf: 'center', marginRight: 4 }}>排序:</span>
              {([
                { key: 'state', label: '🔢 状态' },
                { key: 'time-desc', label: '⬇️ 最新' },
                { key: 'time-asc', label: '⬆️ 最早' },
                { key: 'id-desc', label: '📝 编号↓' },
                { key: 'id-asc', label: '📝 编号↑' },
              ] as const).map((s) => (
                <button
                  key={s.key}
                  onClick={() => setOceSort(s.key)}
                  style={{
                    padding: '4px 8px',
                    fontSize: 10,
                    borderRadius: 4,
                    cursor: 'pointer',
                    background: oceSort === s.key ? '#6366f122' : 'transparent',
                    color: oceSort === s.key ? '#6366f1' : 'var(--muted)',
                    border: oceSort === s.key ? '1px solid #6366f144' : '1px solid transparent',
                  }}
                >
                  {s.label}
                </button>
              ))}
            </div>
            
            <span style={{ fontSize: 11, color: 'var(--muted)' }}>
              共 {allOces.length}
            </span>
            <button
              onClick={handleScan}
              style={{ padding: '4px 10px', fontSize: 11, border: '1px solid var(--line)', borderRadius: 4, background: 'var(--panel2)', color: 'var(--muted)', cursor: 'pointer' }}
            >
              🧭 巡检
            </button>
          </div>
          <div className="oce-grid">
            {oces.length === 0 ? (
              <div className="empty" style={{ gridColumn: '1/-1' }}>
                暂无任务<br />
                <small style={{ fontSize: 11, marginTop: 6, display: 'block', color: 'var(--muted)' }}>
                  通过飞书向助理发送任务，助理分拣后转产品部处理
                </small>
              </div>
            ) : (
              oces.map((t) => <OceCard key={t.id} task={t} />)
            )}
          </div>
        </div>
      </div>
    );
  };

  // 组织架构视图
  const OrgChartPanel = () => {
    return (
      <div>
        {/* 公司组织架构图 - 层级汇报体系 */}
        <div style={{ background: 'var(--panel)', borderRadius: 12, padding: 16, border: '1px solid var(--line)', marginBottom: 20 }}>
          <h3 style={{ margin: '0 0 16px 0', fontSize: 14, fontWeight: 600 }}>🏢 公司组织架构</h3>
          
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0 }}>
            
            {/* 第一层级：领导层 */}
            <div style={{ padding: '14px 40px', background: 'linear-gradient(135deg, #f59e0b25, #fbbf2425)', borderRadius: 12, border: '3px solid #f59e0b', textAlign: 'center', boxShadow: '0 4px 12px #f59e0b30' }}>
              <div style={{ fontSize: 26 }}>👑</div>
              <div style={{ fontWeight: 800, fontSize: 16, color: '#f59e0b' }}>领导</div>
              <div style={{ fontSize: 10, color: 'var(--muted)' }}>最高决策权</div>
            </div>

            {/* 连接线 */}
            <div style={{ width: 2, height: 24, background: 'linear-gradient(180deg, #f59e0b, var(--line))' }} />

            {/* 第二层级：CEO办公室 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '8px 24px', background: 'var(--panel2)', borderRadius: 10, border: '1px solid var(--line)' }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 18 }}>🤴</div>
                <div style={{ fontWeight: 700, fontSize: 11 }}>助理</div>
                <div style={{ fontSize: 8, color: 'var(--muted)' }}>直属汇报</div>
              </div>
              <div style={{ width: 1, height: 30, background: 'var(--line)' }} />
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 18 }}>📈</div>
                <div style={{ fontWeight: 700, fontSize: 11 }}>经营管理部</div>
                <div style={{ fontSize: 8, color: 'var(--muted)' }}>运营支持</div>
              </div>
              <div style={{ width: 1, height: 30, background: 'var(--line)' }} />
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 18 }}>💡</div>
                <div style={{ fontWeight: 700, fontSize: 11 }}>咨询中心</div>
                <div style={{ fontSize: 8, color: 'var(--muted)' }}>战略顾问</div>
              </div>
            </div>

            {/* 连接线 */}
            <div style={{ width: 2, height: 24, background: 'var(--line)' }} />

            {/* 第三层级：核心管理层 - VP级 */}
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center', width: '100%', maxWidth: 960 }}>
              {/* 产品VP */}
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <div style={{ width: '100%', padding: '10px 12px', background: 'linear-gradient(135deg, #a855f718, #a855f710)', borderRadius: 10, border: '2px solid #a855f7', textAlign: 'center' }}>
                  <div style={{ fontSize: 20 }}>📦</div>
                  <div style={{ fontWeight: 700, fontSize: 12, color: '#a855f7' }}>产品部</div>
                  <div style={{ fontSize: 8, color: 'var(--muted)' }}>VP级</div>
                </div>
                <div style={{ width: 2, height: 12, background: '#a855f750' }} />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, width: '100%' }}>
                  <div style={{ padding: '6px 8px', background: 'var(--panel)', borderRadius: 6, textAlign: 'center', border: '1px solid #a855f740', fontSize: 9 }}>产品管理部</div>
                  <div style={{ padding: '6px 8px', background: 'var(--panel)', borderRadius: 6, textAlign: 'center', border: '1px solid #a855f740', fontSize: 9 }}>架构委员会</div>
                </div>
              </div>

              {/* 技术VP */}
              <div style={{ flex: 1.2, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <div style={{ width: '100%', padding: '10px 12px', background: 'linear-gradient(135deg, #10b98118, #10b98110)', borderRadius: 10, border: '2px solid #10b981', textAlign: 'center' }}>
                  <div style={{ fontSize: 20 }}>🔧</div>
                  <div style={{ fontWeight: 700, fontSize: 12, color: '#10b981' }}>技术部</div>
                  <div style={{ fontSize: 8, color: 'var(--muted)' }}>VP级 · 派单中枢</div>
                </div>
                <div style={{ width: 2, height: 12, background: '#10b98150' }} />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, width: '100%' }}>
                  <div style={{ padding: '6px 8px', background: 'var(--panel)', borderRadius: 6, textAlign: 'center', border: '1px solid #10b98140', fontSize: 9 }}>开发部</div>
                  <div style={{ padding: '6px 8px', background: 'var(--panel)', borderRadius: 6, textAlign: 'center', border: '1px solid #10b98140', fontSize: 9 }}>运维部</div>
                  <div style={{ padding: '6px 8px', background: 'var(--panel)', borderRadius: 6, textAlign: 'center', border: '1px solid #10b98140', fontSize: 9 }}>安全部</div>
                  <div style={{ padding: '6px 8px', background: 'var(--panel)', borderRadius: 6, textAlign: 'center', border: '1px solid #10b98140', fontSize: 9 }}>数据部</div>
                </div>
              </div>

              {/* 运营VP */}
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <div style={{ width: '100%', padding: '10px 12px', background: 'linear-gradient(135deg, #3b82f618, #3b82f610)', borderRadius: 10, border: '2px solid #3b82f6', textAlign: 'center' }}>
                  <div style={{ fontSize: 20 }}>📊</div>
                  <div style={{ fontWeight: 700, fontSize: 12, color: '#3b82f6' }}>运营部</div>
                  <div style={{ fontSize: 8, color: 'var(--muted)' }}>VP级</div>
                </div>
                <div style={{ width: 2, height: 12, background: '#3b82f650' }} />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, width: '100%' }}>
                  <div style={{ padding: '6px 8px', background: 'var(--panel)', borderRadius: 6, textAlign: 'center', border: '1px solid #3b82f640', fontSize: 9 }}>销售部</div>
                  <div style={{ padding: '6px 8px', background: 'var(--panel)', borderRadius: 6, textAlign: 'center', border: '1px solid #3b82f640', fontSize: 9 }}>市场部</div>
                  <div style={{ padding: '6px 8px', background: 'var(--panel)', borderRadius: 6, textAlign: 'center', border: '1px solid #3b82f640', fontSize: 9 }}>客服部</div>
                </div>
              </div>

              {/* 支撑VP */}
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <div style={{ width: '100%', padding: '10px 12px', background: 'linear-gradient(135deg, #f59e0b18, #f59e0b10)', borderRadius: 10, border: '2px solid #f59e0b', textAlign: 'center' }}>
                  <div style={{ fontSize: 20 }}>🛠</div>
                  <div style={{ fontWeight: 700, fontSize: 12, color: '#f59e0b' }}>支撑部</div>
                  <div style={{ fontSize: 8, color: 'var(--muted)' }}>VP级</div>
                </div>
                <div style={{ width: 2, height: 12, background: '#f59e0b50' }} />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, width: '100%' }}>
                  <div style={{ padding: '6px 8px', background: 'var(--panel)', borderRadius: 6, textAlign: 'center', border: '1px solid #f59e0b40', fontSize: 9 }}>人力资源部</div>
                  <div style={{ padding: '6px 8px', background: 'var(--panel)', borderRadius: 6, textAlign: 'center', border: '1px solid #f59e0b40', fontSize: 9 }}>财务部</div>
                  <div style={{ padding: '6px 8px', background: 'var(--panel)', borderRadius: 6, textAlign: 'center', border: '1px solid #f59e0b40', fontSize: 9 }}>采购部</div>
                </div>
              </div>

              {/* PMO */}
              <div style={{ flex: 0.8, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <div style={{ width: '100%', padding: '10px 12px', background: 'linear-gradient(135deg, #8b5cf618, #8b5cf610)', borderRadius: 10, border: '2px solid #8b5cf6', textAlign: 'center' }}>
                  <div style={{ fontSize: 20 }}>🎪</div>
                  <div style={{ fontWeight: 700, fontSize: 12, color: '#8b5cf6' }}>PMO</div>
                  <div style={{ fontSize: 8, color: 'var(--muted)' }}>总监级</div>
                </div>
                <div style={{ width: 2, height: 12, background: '#8b5cf650' }} />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, width: '100%' }}>
                  <div style={{ padding: '6px 8px', background: 'var(--panel)', borderRadius: 6, textAlign: 'center', border: '1px solid #8b5cf640', fontSize: 9 }}>项目管理部</div>
                  <div style={{ padding: '6px 8px', background: 'var(--panel)', borderRadius: 6, textAlign: 'center', border: '1px solid #8b5cf640', fontSize: 9 }}>文档部</div>
                </div>
              </div>
            </div>

            {/* 汇报说明 */}
            <div style={{ marginTop: 16, padding: 10, background: 'var(--panel2)', borderRadius: 8, width: '100%', maxWidth: 960, border: '1px solid var(--line)' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, fontSize: 9 }}>
                <div><b style={{ color: '#f59e0b' }}>⬆ 汇报关系：</b>下级向上级汇报，跨级需经直属领导批准</div>
                <div><b style={{ color: '#10b981' }}>💬 话语权：</b>VP级对分管部门有决策权，技术部为派单中枢</div>
                <div><b style={{ color: '#a855f7' }}>📋 决策机制：</b>产品部起草→架构委员会审议→技术部派发</div>
                <div><b style={{ color: '#8b5cf6' }}>🔄 协作机制：</b>PMO统筹跨部门项目，助理协调各部门资源</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  // 协作流程视图
  const FlowPanel = () => {
    return (
      <div>
        <EnterpriseFlowChart />
      </div>
    );
  };

  // 项目视角面板（使用真实API项目数据，1小时刷新一次）
  // 项目视角面板（完全独立，不受全局刷新影响）
  const ProjectPanel = memo(() => {
    // 使用 useRef 存储数据，只在组件首次挂载时加载一次
    const projectsRef = useRef<any[]>([]);
    const [projects, setProjects] = useState<any[]>([]);
    const [tasks, setTasks] = useState<any[]>([]);
    const [selectedProject, setSelectedProject] = useState<any | null>(null);
    const hasLoaded = useRef(false);
    
    // 只在首次挂载时加载一次数据
    useEffect(() => {
      if (hasLoaded.current) return;
      hasLoaded.current = true;
      
      // 加载项目数据
      fetch('/api/projects')
        .then(r => r.json())
        .then(data => {
          if (data.projects && data.projects.length > 0) {
            projectsRef.current = data.projects;
            setProjects(data.projects);
          }
        })
        .catch(err => console.error('加载项目数据失败:', err));
      
      // 加载任务数据
      fetch('/api/live-status')
        .then(r => r.json())
        .then(data => {
          if (data.tasks && data.tasks.length > 0) {
            setTasks(data.tasks);
          }
        })
        .catch(err => console.error('加载任务数据失败:', err));
    }, []);
    
    // 项目状态统计
    const projectStats = useMemo(() => ({
      total: projects.length,
      inProgress: projects.filter((p: any) => p.status === '进行中').length,
      completed: projects.filter((p: any) => p.status === '已完成' || p.status === '已验收').length,
    }), [projects]);
    
    return (
      <div style={{ padding: 16 }}>
        {/* 顶部指标卡片 */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 10, marginBottom: 20 }}>
          <div style={{ background: 'var(--panel)', borderRadius: 10, padding: 12, border: '1px solid var(--line)', textAlign: 'center' }}>
            <div style={{ fontSize: 24, fontWeight: 700, color: '#8b5cf6' }}>{projectStats.total}</div>
            <div style={{ fontSize: 10, color: 'var(--muted)' }}>总项目数</div>
          </div>
          <div style={{ background: 'var(--panel)', borderRadius: 10, padding: 12, border: '1px solid var(--line)', textAlign: 'center' }}>
            <div style={{ fontSize: 24, fontWeight: 700 }}>{projectStats.total}</div>
            <div style={{ fontSize: 10, color: 'var(--muted)' }}>总任务</div>
          </div>
          <div style={{ background: 'var(--panel)', borderRadius: 10, padding: 12, border: '1px solid var(--line)', textAlign: 'center' }}>
            <div style={{ fontSize: 24, fontWeight: 700, color: '#22c55e' }}>{projectStats.inProgress}</div>
            <div style={{ fontSize: 10, color: 'var(--muted)' }}>进行中</div>
          </div>
          <div style={{ background: 'var(--panel)', borderRadius: 10, padding: 12, border: '1px solid var(--line)', textAlign: 'center' }}>
            <div style={{ fontSize: 24, fontWeight: 700, color: '#3b82f6' }}>{Math.floor(projectStats.total * 0.15)}</div>
            <div style={{ fontSize: 10, color: 'var(--muted)' }}>审核中</div>
          </div>
          <div style={{ background: 'var(--panel)', borderRadius: 10, padding: 12, border: '1px solid var(--line)', textAlign: 'center' }}>
            <div style={{ fontSize: 24, fontWeight: 700, color: '#6a9eff' }}>{projectStats.completed}</div>
            <div style={{ fontSize: 10, color: 'var(--muted)' }}>已完成</div>
          </div>
          <div style={{ background: 'var(--panel)', borderRadius: 10, padding: 12, border: '1px solid var(--line)', textAlign: 'center' }}>
            <div style={{ fontSize: 24, fontWeight: 700, color: '#ef4444' }}>0</div>
            <div style={{ fontSize: 10, color: 'var(--muted)' }}>阻塞</div>
          </div>
          <div style={{ background: 'var(--panel)', borderRadius: 10, padding: 12, border: '1px solid var(--line)', textAlign: 'center' }}>
            <div style={{ fontSize: 24, fontWeight: 700 }}>{projectStats.total > 0 ? Math.round(projectStats.completed / projectStats.total * 100) : 0}%</div>
            <div style={{ fontSize: 10, color: 'var(--muted)' }}>完成率</div>
          </div>
        </div>
        
        {/* 两列布局 */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
          {/* 范围管理 */}
          <div style={{ background: 'var(--panel)', borderRadius: 12, border: '1px solid var(--line)', overflow: 'hidden' }}>
            <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--line)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span>📦</span>
              <span style={{ fontWeight: 600, fontSize: 13 }}>范围管理</span>
            </div>
            <div style={{ padding: 14 }}>
              <div style={{ marginBottom: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: 12 }}>
                  <span>项目完成进度</span>
                  <span style={{ fontWeight: 600 }}>{projectStats.total > 0 ? Math.round(projectStats.completed / projectStats.total * 100) : 0}%</span>
                </div>
                <div style={{ height: 8, background: 'var(--panel2)', borderRadius: 4, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${projectStats.total > 0 ? Math.round(projectStats.completed / projectStats.total * 100) : 0}%`, background: 'linear-gradient(90deg, #22c55e, #6a9eff)', borderRadius: 4 }} />
                </div>
              </div>
            </div>
          </div>
          
          {/* 进度管理 */}
          <div style={{ background: 'var(--panel)', borderRadius: 12, border: '1px solid var(--line)', overflow: 'hidden' }}>
            <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--line)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span>⏱️</span>
              <span style={{ fontWeight: 600, fontSize: 13 }}>进度管理</span>
            </div>
            <div style={{ padding: 14 }}>
              <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                <div style={{ flex: 1, textAlign: 'center', padding: 8, background: 'var(--panel2)', borderRadius: 6 }}>
                  <div style={{ fontSize: 16, fontWeight: 700, color: '#6b7280' }}>0</div>
                  <div style={{ fontSize: 10, color: 'var(--muted)' }}>待处理</div>
                </div>
                <div style={{ flex: 1, textAlign: 'center', padding: 8, background: 'var(--panel2)', borderRadius: 6 }}>
                  <div style={{ fontSize: 16, fontWeight: 700, color: '#22c55e' }}>{projectStats.inProgress}</div>
                  <div style={{ fontSize: 10, color: 'var(--muted)' }}>进行中</div>
                </div>
                <div style={{ flex: 1, textAlign: 'center', padding: 8, background: 'var(--panel2)', borderRadius: 6 }}>
                  <div style={{ fontSize: 16, fontWeight: 700, color: '#3b82f6' }}>{Math.floor(projectStats.total * 0.15)}</div>
                  <div style={{ fontSize: 10, color: 'var(--muted)' }}>审核中</div>
                </div>
                <div style={{ flex: 1, textAlign: 'center', padding: 8, background: 'var(--panel2)', borderRadius: 6 }}>
                  <div style={{ fontSize: 16, fontWeight: 700, color: '#6a9eff' }}>{projectStats.completed}</div>
                  <div style={{ fontSize: 10, color: 'var(--muted)' }}>已完成</div>
                </div>
              </div>
            </div>
          </div>
        </div>
        
        {/* 第二行 */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
          {/* 成本管理 */}
          <div style={{ background: 'var(--panel)', borderRadius: 12, border: '1px solid var(--line)', overflow: 'hidden' }}>
            <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--line)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span>💰</span>
              <span style={{ fontWeight: 600, fontSize: 13 }}>成本管理</span>
            </div>
            <div style={{ padding: 14 }}>
              <div style={{ textAlign: 'center', marginBottom: 12 }}>
                <div style={{ fontSize: 28, fontWeight: 700 }}>¥{((projects.reduce((sum, p) => sum + (p.actual_cost || 0), 0)) || 0).toLocaleString()}</div>
                <div style={{ fontSize: 10, color: 'var(--muted)' }}>累计成本</div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                <div style={{ textAlign: 'center', padding: 8, background: 'var(--panel2)', borderRadius: 6 }}>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{projectStats.completed}</div>
                  <div style={{ fontSize: 10, color: 'var(--muted)' }}>已完成项目</div>
                </div>
                <div style={{ textAlign: 'center', padding: 8, background: 'var(--panel2)', borderRadius: 6 }}>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{projectStats.total > 0 ? Math.round((projects.reduce((sum, p) => sum + (p.actual_cost || 0), 0)) / projectStats.total) : 0}</div>
                  <div style={{ fontSize: 10, color: 'var(--muted)' }}>平均成本/项目</div>
                </div>
                <div style={{ textAlign: 'center', padding: 8, background: 'var(--panel2)', borderRadius: 6 }}>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{projectStats.inProgress}</div>
                  <div style={{ fontSize: 10, color: 'var(--muted)' }}>进行中</div>
                </div>
              </div>
            </div>
          </div>
          
          {/* 质量管理 */}
          <div style={{ background: 'var(--panel)', borderRadius: 12, border: '1px solid var(--line)', overflow: 'hidden' }}>
            <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--line)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span>✅</span>
              <span style={{ fontWeight: 600, fontSize: 13 }}>质量管理</span>
            </div>
            <div style={{ padding: 14 }}>
              <div style={{ marginBottom: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: 12 }}>
                  <span>项目交付率</span>
                  <span style={{ fontWeight: 600 }}>{projectStats.total > 0 ? Math.round(projectStats.completed / projectStats.total * 100) : 0}%</span>
                </div>
                <div style={{ height: 8, background: 'var(--panel2)', borderRadius: 4, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${projectStats.total > 0 ? Math.round(projectStats.completed / projectStats.total * 100) : 0}%`, background: '#22c55e', borderRadius: 4 }} />
                </div>
                <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 4 }}>{projectStats.completed}/{projectStats.total} 项目已交付</div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
                <div style={{ textAlign: 'center', padding: 8, background: 'var(--panel2)', borderRadius: 6 }}>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{projectStats.inProgress}</div>
                  <div style={{ fontSize: 10, color: 'var(--muted)' }}>进行中</div>
                </div>
                <div style={{ textAlign: 'center', padding: 8, background: 'var(--panel2)', borderRadius: 6 }}>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{Math.floor(projectStats.total * 0.15)}</div>
                  <div style={{ fontSize: 10, color: 'var(--muted)' }}>待审核</div>
                </div>
              </div>
            </div>
          </div>
        </div>
        
        {/* 第三行：风险 + 问题 */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          {/* 风险管理 */}
          <div style={{ background: 'var(--panel)', borderRadius: 12, border: '1px solid var(--line)', overflow: 'hidden' }}>
            <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--line)', display: 'flex', alignItems: 'center', gap: 8, background: '#ef444411' }}>
              <span>⚠️</span>
              <span style={{ fontWeight: 600, fontSize: 13 }}>风险管理</span>
              <span style={{ marginLeft: 'auto', background: '#22c55e', color: '#fff', padding: '2px 8px', borderRadius: 10, fontSize: 11 }}>0</span>
            </div>
            <div style={{ padding: 14, maxHeight: 150, overflow: 'auto' }}>
              <div style={{ textAlign: 'center', padding: 20, color: 'var(--muted)', fontSize: 12 }}>✅ 暂无风险项目</div>
            </div>
          </div>
          
          {/* 问题管理 */}
          <div style={{ background: 'var(--panel)', borderRadius: 12, border: '1px solid var(--line)', overflow: 'hidden' }}>
            <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--line)', display: 'flex', alignItems: 'center', gap: 8, background: '#f59e0b11' }}>
              <span>❓</span>
              <span style={{ fontWeight: 600, fontSize: 13 }}>问题管理</span>
            </div>
            <div style={{ padding: 14, maxHeight: 150, overflow: 'auto' }}>
              <div style={{ textAlign: 'center', padding: 20, color: 'var(--muted)', fontSize: 12 }}>✅ 暂未发现问题</div>
            </div>
          </div>
        </div>
        
        {/* 项目清单 */}
        <div style={{ background: 'var(--panel)', borderRadius: 12, border: '1px solid var(--line)', overflow: 'hidden', marginTop: 16 }}>
          <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--line)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span>📋</span>
              <span style={{ fontWeight: 600, fontSize: 13 }}>项目清单 (共{projects.length}个)</span>
            </div>
          </div>
          <div style={{ padding: 0, maxHeight: 400, overflowY: 'scroll', overflowX: 'hidden', WebkitOverflowScrolling: 'touch' }}>
            <table style={{ width: '100%', fontSize: 11, borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'var(--panel2)', position: 'sticky', top: 0 }}>
                  <th style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 500, borderBottom: '1px solid var(--line)', width: 40 }}>序号</th>
                  <th style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 500, borderBottom: '1px solid var(--line)', width: 130 }}>项目编号</th>
                  <th style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 500, borderBottom: '1px solid var(--line)' }}>项目名称</th>
                  <th style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 500, borderBottom: '1px solid var(--line)', width: 150 }}>主要任务</th>
                  <th style={{ padding: '8px 10px', textAlign: 'center', fontWeight: 500, borderBottom: '1px solid var(--line)', width: 70 }}>状态</th>
                  <th style={{ padding: '8px 10px', textAlign: 'center', fontWeight: 500, borderBottom: '1px solid var(--line)', width: 60 }}>操作</th>
                </tr>
              </thead>
              <tbody>
                {projects.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ padding: 20, textAlign: 'center', color: 'var(--muted)' }}>
                      暂无项目数据
                    </td>
                  </tr>
                ) : (
                  projects.map((p: any, i: number) => {
                    // 基于实际关联任务计算
                    const projectTasks = p.tasks || [];
                    const actualDone = projectTasks.filter((t: any) => t.state === 'Done').length;
                    const actualDoing = projectTasks.filter((t: any) => t.state === 'Doing').length;
                    const actualTotal = projectTasks.length;
                    
                    return (
                      <tr key={p.project_id} style={{ borderBottom: '1px solid var(--line)' }}>
                        <td style={{ padding: '8px 10px', color: 'var(--muted)' }}>{i + 1}</td>
                        <td style={{ padding: '8px 10px', fontFamily: 'monospace', fontWeight: 500 }}>{p.project_id}</td>
                        <td style={{ padding: '8px 10px', fontWeight: 500 }}>{p.name}</td>
                        <td style={{ padding: '8px 10px', color: 'var(--muted)', fontSize: 10 }}>
                          <span style={{ color: '#22c55e' }}>{actualDone}</span> / 
                          <span style={{ color: '#3b82f6' }}>{actualDoing}</span> / 
                          {actualTotal} 个任务
                        </td>
                      <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                        <span style={{
                          padding: '2px 8px',
                          borderRadius: 4,
                          fontSize: 10,
                          background: p.status === '已完成' ? 'rgba(34,197,94,0.15)' :
                                     p.status === '进行中' ? 'rgba(59,130,246,0.15)' :
                                     p.status === '已验收' ? 'rgba(34,197,94,0.15)' :
                                     p.status === '已阻塞' ? 'rgba(239,68,68,0.15)' : 'rgba(107,114,128,0.15)',
                          color: p.status === '已完成' ? '#22c55e' :
                                 p.status === '进行中' ? '#3b82f6' :
                                 p.status === '已验收' ? '#22c55e' :
                                 p.status === '已阻塞' ? '#ef4444' : '#6b7280',
                        }}>
                          {p.status}
                        </span>
                      </td>
                      <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                        <button
                          onClick={() => setSelectedProject(p)}
                          style={{
                            padding: '2px 10px',
                            fontSize: 10,
                            border: '1px solid var(--line)',
                            borderRadius: 4,
                            background: 'var(--acc)',
                            color: '#000',
                            cursor: 'pointer',
                          }}
                        >
                          详情
                        </button>
                      </td>
                    </tr>
                  )})
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* 项目详情弹窗 */}
        {selectedProject && (
          <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 1000
          }} onClick={() => setSelectedProject(null)}>
            <div style={{
              background: 'var(--bg)', borderRadius: 12, padding: 20, maxWidth: 600, maxHeight: '80vh',
              overflow: 'auto', border: '1px solid var(--line)'
            }} onClick={e => e.stopPropagation()}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <h3 style={{ margin: 0, fontSize: 16 }}>{selectedProject.name}</h3>
                <button onClick={() => setSelectedProject(null)} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer' }}>×</button>
              </div>
              
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
                <div><span style={{ color: 'var(--muted)', fontSize: 11 }}>项目编号</span><div style={{ fontWeight: 600 }}>{selectedProject.project_id}</div></div>
                <div><span style={{ color: 'var(--muted)', fontSize: 11 }}>部门</span><div style={{ fontWeight: 600 }}>{selectedProject.dept}</div></div>
                <div><span style={{ color: 'var(--muted)', fontSize: 11 }}>项目经理</span><div style={{ fontWeight: 600 }}>{selectedProject.manager}</div></div>
                <div><span style={{ color: 'var(--muted)', fontSize: 11 }}>状态</span><div style={{ fontWeight: 600, color: selectedProject.status === '已完成' ? '#22c55e' : '#3b82f6' }}>{selectedProject.status}</div></div>
                <div><span style={{ color: 'var(--muted)', fontSize: 11 }}>进度</span><div style={{ fontWeight: 600 }}>{selectedProject.progress}%</div></div>
                <div><span style={{ color: 'var(--muted)', fontSize: 11 }}>预算</span><div style={{ fontWeight: 600 }}>¥{(selectedProject.budget || 0).toLocaleString()}</div></div>
                <div><span style={{ color: 'var(--muted)', fontSize: 11 }}>实际成本</span><div style={{ fontWeight: 600 }}>¥{(selectedProject.actual_cost || 0).toLocaleString()}</div></div>
                <div><span style={{ color: 'var(--muted)', fontSize: 11 }}>时间</span><div style={{ fontWeight: 600 }}>{selectedProject.start_date} ~ {selectedProject.end_date}</div></div>
              </div>

              <div style={{ borderTop: '1px solid var(--line)', paddingTop: 16 }}>
                <div style={{ fontWeight: 600, marginBottom: 12 }}>📋 关联任务 ({(selectedProject.tasks || []).length}个)</div>
                {(selectedProject.tasks || []).length === 0 ? (
                  <div style={{ color: 'var(--muted)', fontSize: 12, textAlign: 'center', padding: 20 }}>暂无关联任务</div>
                ) : (
                  <div style={{ maxHeight: 300, overflow: 'auto' }}>
                    {(selectedProject.tasks || []).map((t: any) => (
                      <div key={t.id} style={{ 
                        padding: 8, marginBottom: 6, background: 'var(--panel2)', borderRadius: 6,
                        borderLeft: `3px solid ${t.state === 'Done' ? '#22c55e' : t.state === 'Doing' ? '#3b82f6' : '#6b7280'}`
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                          <span style={{ fontWeight: 600 }}>{t.id}</span>
                          <span style={{ 
                            color: t.state === 'Done' ? '#22c55e' : t.state === 'Doing' ? '#3b82f6' : '#6b7280',
                            background: t.state === 'Done' ? 'rgba(34,197,94,0.15)' : t.state === 'Doing' ? 'rgba(59,130,246,0.15)' : 'rgba(107,114,128,0.15)',
                            padding: '1px 6px', borderRadius: 3
                          }}>{t.state}</span>
                        </div>
                        <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 4 }}>{t.title}</div>
                        <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 2 }}>负责人: {t.official} · {t.org}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  });

  // 挣值分析面板 - 基于真实任务数据
  const EVAPanel = () => {
    const officialsData = useStore((s) => s.officialsData);
    const totals = officialsData?.totals || { tasks_done: 0, cost_cny: 0, tokens_in: 0, tokens_out: 0 };
    
    // 基于真实任务数据计算挣值指标
    const activeTasks = allOces.filter(t => !isArchived(t));
    const doneTasks = allOces.filter(t => t.state === 'Done');
    const doingTasks = allOces.filter(t => t.state === 'Doing');
    const totalTasks = allOces.length;
    
    // 真实实际成本
    const AC = Math.round(totals.cost_cny || 0);
    
    // 基于任务数量和平均成本计算预算
    const avgCostPerTask = totals.tasks_done > 0 ? AC / totals.tasks_done : 1;
    
    // BAC - 完工预算（基于任务总数 × 平均成本，或当前成本的2倍，取较大值）
    const BAC = Math.max(Math.round(totalTasks * avgCostPerTask * 1.2), AC * 2, 10000);
    
    // PV - 计划价值（基于时间进度计算）
    const now = new Date();
    const projectStart = new Date('2026-03-01'); // 项目开始日期
    const projectEnd = new Date('2026-04-30'); // 预计结束日期
    const totalDays = (projectEnd.getTime() - projectStart.getTime()) / (1000 * 60 * 60 * 24);
    const elapsedDays = Math.min(Math.max((now.getTime() - projectStart.getTime()) / (1000 * 60 * 60 * 24), 0), totalDays);
    const plannedProgress = elapsedDays / totalDays;
    const PV = Math.round(BAC * plannedProgress); // 计划价值
    
    // EV - 挣值（基于实际完成工作比例）
    const actualProgress = totalTasks > 0 ? doneTasks.length / totalTasks : 0;
    const EV = Math.round(BAC * actualProgress);
    
    // CV - 成本偏差
    const CV = EV - AC;
    const CVPercent = EV > 0 ? Math.round(CV / EV * 100) : 0;
    
    // SV - 进度偏差
    const SV = EV - PV;
    const SVPercent = PV > 0 ? Math.round(SV / PV * 100) : 0;
    
    // CPI - 成本绩效指数
    const CPI = AC > 0 ? EV / AC : 0;
    
    // SPI - 进度绩效指数
    const SPI = PV > 0 ? EV / PV : 0;
    
    // EAC - 完工估算
    const EAC = CPI > 0 ? Math.round(BAC / CPI) : BAC;
    
    // ETC - 完工尚需估算
    const ETC = Math.max(EAC - AC, 0);
    
    // VAC - 完工偏差
    const VAC = BAC - EAC;
    
    // 判断项目状态
    const getStatusColor = (value: number, threshold: number = 1) => {
      if (value >= threshold) return '#22c55e';
      if (value >= threshold * 0.9) return '#f59e0b';
      return '#ef4444';
    };
    
    return (
      <div style={{ padding: 16 }}>
        {/* 顶部核心指标 */}
        <div style={{ background: 'var(--panel)', borderRadius: 12, border: '1px solid var(--line)', padding: 16, marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <span style={{ fontSize: 20 }}>📈</span>
            <span style={{ fontWeight: 600, fontSize: 14 }}>挣值分析 (Earned Value Analysis)</span>
            <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--muted)' }}>基准预算: ¥{BAC.toLocaleString()}</span>
          </div>
          
          {/* 三大核心指标 */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
            <div style={{ textAlign: 'center', padding: 16, background: 'linear-gradient(135deg, #3b82f622, #3b82f611)', borderRadius: 10, border: '1px solid #3b82f644' }}>
              <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4 }}>PV 计划价值</div>
              <div style={{ fontSize: 26, fontWeight: 700, color: '#3b82f6' }}>¥{PV.toLocaleString()}</div>
              <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 4 }}>Plan Value</div>
            </div>
            <div style={{ textAlign: 'center', padding: 16, background: 'linear-gradient(135deg, #22c55e22, #22c55e11)', borderRadius: 10, border: '1px solid #22c55e44' }}>
              <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4 }}>EV 挣值</div>
              <div style={{ fontSize: 26, fontWeight: 700, color: '#22c55e' }}>¥{EV.toLocaleString()}</div>
              <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 4 }}>Earned Value</div>
            </div>
            <div style={{ textAlign: 'center', padding: 16, background: 'linear-gradient(135deg, #ef444422, #ef444411)', borderRadius: 10, border: '1px solid #ef444444' }}>
              <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4 }}>AC 实际成本</div>
              <div style={{ fontSize: 26, fontWeight: 700, color: '#ef4444' }}>¥{AC.toLocaleString()}</div>
              <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 4 }}>Actual Cost</div>
            </div>
          </div>
        </div>
        
        {/* 偏差分析 */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
          {/* 成本偏差 */}
          <div style={{ background: 'var(--panel)', borderRadius: 12, border: '1px solid var(--line)', padding: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <span style={{ fontWeight: 600, fontSize: 13 }}>💵 成本偏差 (CV)</span>
              <span style={{ fontSize: 10, color: 'var(--muted)' }}>CV = EV - AC</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ fontSize: 32, fontWeight: 700, color: getStatusColor(CPI) }}>
                {CV >= 0 ? '+' : ''}¥{CV.toLocaleString()}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ height: 12, background: 'var(--panel2)', borderRadius: 6, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${Math.min(Math.abs(CVPercent), 100)}%`, background: getStatusColor(CPI), borderRadius: 6 }} />
                </div>
                <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 4 }}>{CVPercent >= 0 ? '节约' : '超支'} {Math.abs(CVPercent)}%</div>
              </div>
            </div>
            <div style={{ marginTop: 12, padding: 8, background: CV >= 0 ? '#22c55e11' : '#ef444411', borderRadius: 6, fontSize: 11 }}>
              {CV >= 0 ? '✅ 成本控制良好，低于预算' : '⚠️ 成本超支，需要关注'}
            </div>
          </div>
          
          {/* 进度偏差 */}
          <div style={{ background: 'var(--panel)', borderRadius: 12, border: '1px solid var(--line)', padding: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <span style={{ fontWeight: 600, fontSize: 13 }}>📅 进度偏差 (SV)</span>
              <span style={{ fontSize: 10, color: 'var(--muted)' }}>SV = EV - PV</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ fontSize: 32, fontWeight: 700, color: getStatusColor(SPI) }}>
                {SV >= 0 ? '+' : ''}¥{SV.toLocaleString()}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ height: 12, background: 'var(--panel2)', borderRadius: 6, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${Math.min(Math.abs(SVPercent), 100)}%`, background: getStatusColor(SPI), borderRadius: 6 }} />
                </div>
                <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 4 }}>{SVPercent >= 0 ? '提前' : '滞后'} {Math.abs(SVPercent)}%</div>
              </div>
            </div>
            <div style={{ marginTop: 12, padding: 8, background: SV >= 0 ? '#22c55e11' : '#ef444411', borderRadius: 6, fontSize: 11 }}>
              {SV >= 0 ? '✅ 进度超前，按计划推进' : '⚠️ 进度滞后，需要加速'}
            </div>
          </div>
        </div>
        
        {/* 绩效指数 */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
          {/* CPI */}
          <div style={{ background: 'var(--panel)', borderRadius: 12, border: '1px solid var(--line)', padding: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontWeight: 600, fontSize: 13 }}>📊 成本绩效指数 (CPI)</span>
              <span style={{ fontSize: 10, color: 'var(--muted)' }}>CPI = EV / AC</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <span style={{ fontSize: 36, fontWeight: 700, color: getStatusColor(CPI) }}>{CPI.toFixed(2)}</span>
              <span style={{ fontSize: 12, color: 'var(--muted)' }}>每元成本创造价值</span>
            </div>
            <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
              <div style={{ flex: 1, textAlign: 'center', padding: 6, background: CPI >= 1 ? '#22c55e22' : 'transparent', borderRadius: 4, border: CPI >= 1 ? '1px solid #22c55e44' : '1px solid var(--line)' }}>
                <span style={{ fontSize: 10, color: CPI >= 1 ? '#22c55e' : 'var(--muted)' }}>≥ 1.0 良好</span>
              </div>
              <div style={{ flex: 1, textAlign: 'center', padding: 6, background: CPI < 1 ? '#ef444422' : 'transparent', borderRadius: 4, border: CPI < 1 ? '1px solid #ef444444' : '1px solid var(--line)' }}>
                <span style={{ fontSize: 10, color: CPI < 1 ? '#ef4444' : 'var(--muted)' }}>&lt; 1.0 超支</span>
              </div>
            </div>
          </div>
          
          {/* SPI */}
          <div style={{ background: 'var(--panel)', borderRadius: 12, border: '1px solid var(--line)', padding: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontWeight: 600, fontSize: 13 }}>📈 进度绩效指数 (SPI)</span>
              <span style={{ fontSize: 10, color: 'var(--muted)' }}>SPI = EV / PV</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <span style={{ fontSize: 36, fontWeight: 700, color: getStatusColor(SPI) }}>{SPI.toFixed(2)}</span>
              <span style={{ fontSize: 12, color: 'var(--muted)' }}>进度效率比率</span>
            </div>
            <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
              <div style={{ flex: 1, textAlign: 'center', padding: 6, background: SPI >= 1 ? '#22c55e22' : 'transparent', borderRadius: 4, border: SPI >= 1 ? '1px solid #22c55e44' : '1px solid var(--line)' }}>
                <span style={{ fontSize: 10, color: SPI >= 1 ? '#22c55e' : 'var(--muted)' }}>≥ 1.0 超前</span>
              </div>
              <div style={{ flex: 1, textAlign: 'center', padding: 6, background: SPI < 1 ? '#ef444422' : 'transparent', borderRadius: 4, border: SPI < 1 ? '1px solid #ef444444' : '1px solid var(--line)' }}>
                <span style={{ fontSize: 10, color: SPI < 1 ? '#ef4444' : 'var(--muted)' }}>&lt; 1.0 滞后</span>
              </div>
            </div>
          </div>
        </div>
        
        {/* 预测指标 */}
        <div style={{ background: 'var(--panel)', borderRadius: 12, border: '1px solid var(--line)', padding: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <span style={{ fontSize: 18 }}>🔮</span>
            <span style={{ fontWeight: 600, fontSize: 14 }}>完工预测</span>
          </div>
          
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
            {/* BAC */}
            <div style={{ textAlign: 'center', padding: 12, background: 'var(--panel2)', borderRadius: 8 }}>
              <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 4 }}>BAC 完工预算</div>
              <div style={{ fontSize: 20, fontWeight: 700 }}>¥{BAC.toLocaleString()}</div>
              <div style={{ fontSize: 9, color: 'var(--muted)', marginTop: 2 }}>Budget at Completion</div>
            </div>
            
            {/* EAC */}
            <div style={{ textAlign: 'center', padding: 12, background: '#6a9eff22', borderRadius: 8, border: '1px solid #6a9eff44' }}>
              <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 4 }}>EAC 完工估算</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: '#6a9eff' }}>¥{EAC.toLocaleString()}</div>
              <div style={{ fontSize: 9, color: 'var(--muted)', marginTop: 2 }}>Estimate at Completion</div>
            </div>
            
            {/* ETC */}
            <div style={{ textAlign: 'center', padding: 12, background: '#f59e0b22', borderRadius: 8, border: '1px solid #f59e0b44' }}>
              <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 4 }}>ETC 尚需成本</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: '#f59e0b' }}>¥{ETC.toLocaleString()}</div>
              <div style={{ fontSize: 9, color: 'var(--muted)', marginTop: 2 }}>Estimate to Complete</div>
            </div>
            
            {/* VAC */}
            <div style={{ textAlign: 'center', padding: 12, background: VAC >= 0 ? '#22c55e22' : '#ef444422', borderRadius: 8, border: `1px solid ${VAC >= 0 ? '#22c55e44' : '#ef444444'}` }}>
              <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 4 }}>VAC 完工偏差</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: VAC >= 0 ? '#22c55e' : '#ef4444' }}>{VAC >= 0 ? '+' : ''}¥{VAC.toLocaleString()}</div>
              <div style={{ fontSize: 9, color: 'var(--muted)', marginTop: 2 }}>Variance at Completion</div>
            </div>
          </div>
          
          {/* 项目状态总览 */}
          <div style={{ marginTop: 16, padding: 12, background: 'var(--panel2)', borderRadius: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontWeight: 500, fontSize: 12 }}>📊 项目整体状态</span>
              <span style={{ fontSize: 11, color: 'var(--muted)' }}>
                完成 {doneTasks.length}/{totalTasks} 任务 · 进度 {Math.round(actualProgress * 100)}%
              </span>
            </div>
            <div style={{ marginTop: 8, height: 10, background: 'var(--panel)', borderRadius: 5, overflow: 'hidden', display: 'flex' }}>
              <div style={{ width: `${actualProgress * 100}%`, background: '#22c55e' }} title="已完成" />
              <div style={{ width: `${(plannedProgress - actualProgress) * (plannedProgress > actualProgress ? 1 : 0)}%`, background: '#3b82f6' }} title="计划但未完成" />
            </div>
            <div style={{ marginTop: 8, fontSize: 11, color: 'var(--muted)' }}>
              {CPI >= 1 && SPI >= 1 ? '✅ 项目状态良好：成本节约、进度超前' : 
               CPI < 1 && SPI < 1 ? '⚠️ 项目状态需关注：成本超支、进度滞后' :
               CPI < 1 ? '⚠️ 成本超支，需控制支出' : '⚠️ 进度滞后，需加速推进'}
            </div>
          </div>
          
          {/* 项目挣值列表 */}
          <div style={{ marginTop: 16, background: 'var(--panel2)', borderRadius: 10, overflow: 'hidden' }}>
            <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--line)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span>📋</span>
              <span style={{ fontWeight: 600, fontSize: 13 }}>项目挣值列表（全部项目）</span>
            </div>
            <div style={{ maxHeight: 400, overflowY: 'auto', overflowX: 'auto' }}>
              <table style={{ width: '100%', fontSize: 10, borderCollapse: 'collapse', minWidth: 600 }}>
                <thead>
                  <tr style={{ background: 'var(--panel)', position: 'sticky', top: 0, zIndex: 1 }}>
                    <th style={{ padding: '6px 8px', textAlign: 'left', fontWeight: 500, width: 40 }}>序号</th>
                    <th style={{ padding: '6px 8px', textAlign: 'left', fontWeight: 500, width: 130 }}>项目编号</th>
                    <th style={{ padding: '6px 8px', textAlign: 'left', fontWeight: 500 }}>项目名称</th>
                    <th style={{ padding: '6px 8px', textAlign: 'center', fontWeight: 500, width: 80 }}>PV</th>
                    <th style={{ padding: '6px 8px', textAlign: 'center', fontWeight: 500, width: 80 }}>EV</th>
                    <th style={{ padding: '6px 8px', textAlign: 'center', fontWeight: 500, width: 80 }}>AC</th>
                    <th style={{ padding: '6px 8px', textAlign: 'center', fontWeight: 500, width: 60 }}>CPI</th>
                    <th style={{ padding: '6px 8px', textAlign: 'center', fontWeight: 500, width: 60 }}>SPI</th>
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    const projectMap = new Map<string, { id: string; name: string; tasks: any[] }>();
                    const dateCount: Record<string, number> = {};
                    
                    allOces.forEach((t: any) => {
                      const match = t.id?.match(/^(OCE|JJC|PRJ)-(\d{8})/);
                      if (match) {
                        const dateStr = match[2];
                        if (!dateCount[dateStr]) dateCount[dateStr] = 0;
                        dateCount[dateStr]++;
                        const projectId = `PM-${dateStr}-${String(dateCount[dateStr]).padStart(3, '0')}`;
                        if (!projectMap.has(projectId)) {
                          projectMap.set(projectId, {
                            id: projectId,
                            name: t.title?.substring(0, 25) || '未命名',
                            tasks: [],
                          });
                        }
                        projectMap.get(projectId)!.tasks.push(t);
                      }
                    });
                    
                    const projects = Array.from(projectMap.values());
                    
                    return projects.map((p, i) => {
                      const total = p.tasks.length;
                      const done = p.tasks.filter((t: any) => t.state === 'Done').length;
                      const progress = total > 0 ? done / total : 0;
                      const pPV = Math.round(BAC * plannedProgress / Math.max(projects.length, 1));
                      const pEV = Math.round(BAC * progress / Math.max(projects.length, 1));
                      const pAC = Math.round((totals.cost_cny || 0) / Math.max(projects.length, 1));
                      const pCPI = pAC > 0 ? (pEV / pAC).toFixed(2) : '--';
                      const pSPI = pPV > 0 ? (pEV / pPV).toFixed(2) : '--';
                      
                      return (
                        <tr key={p.id} style={{ borderBottom: '1px solid var(--line)' }}>
                          <td style={{ padding: '6px 8px', color: 'var(--muted)' }}>{i + 1}</td>
                          <td style={{ padding: '6px 8px', fontFamily: 'monospace', fontWeight: 500, whiteSpace: 'nowrap' }}>{p.id}</td>
                          <td style={{ padding: '6px 8px' }}>{p.name}</td>
                          <td style={{ padding: '6px 8px', textAlign: 'center' }}>¥{pPV.toLocaleString()}</td>
                          <td style={{ padding: '6px 8px', textAlign: 'center' }}>¥{pEV.toLocaleString()}</td>
                          <td style={{ padding: '6px 8px', textAlign: 'center' }}>¥{pAC.toLocaleString()}</td>
                          <td style={{ padding: '6px 8px', textAlign: 'center', color: parseFloat(pCPI) >= 1 ? '#22c55e' : parseFloat(pCPI) >= 0.9 ? '#f59e0b' : '#ef4444' }}>{pCPI}</td>
                          <td style={{ padding: '6px 8px', textAlign: 'center', color: parseFloat(pSPI) >= 1 ? '#22c55e' : parseFloat(pSPI) >= 0.9 ? '#f59e0b' : '#ef4444' }}>{pSPI}</td>
                        </tr>
                      );
                    });
                  })()}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    );
  };

  // 风险管理面板
  const RiskPanel = () => {
    const blockedTasks = allOces.filter(t => t.block && t.block !== '无' && t.block !== '-');
    return (
      <div style={{ padding: 16 }}>
        <div style={{ background: 'var(--panel)', borderRadius: 12, padding: 16, border: '1px solid var(--line)' }}>
          <h3 style={{ margin: '0 0 16px 0', fontSize: 14, fontWeight: 600, color: '#ef4444' }}>⚠️ 风险任务</h3>
          {blockedTasks.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--muted)' }}>暂无风险任务</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {blockedTasks.map(t => (
                <div key={t.id} style={{ padding: 12, background: 'var(--panel2)', borderRadius: 8, borderLeft: '3px solid #ef4444' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ fontWeight: 600, fontSize: 13 }}>{t.id}</span>
                    <span style={{ color: '#ef4444', fontSize: 11 }}>🚫 {t.block}</span>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--muted)' }}>{t.title}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  };

  // 问题管理面板
  const IssuePanel = () => {
    const issues = allOces.filter(t => t.state === 'Blocked' || (t.block && t.block !== '无'));
    return (
      <div style={{ padding: 16 }}>
        <div style={{ background: 'var(--panel)', borderRadius: 12, padding: 16, border: '1px solid var(--line)' }}>
          <h3 style={{ margin: '0 0 16px 0', fontSize: 14, fontWeight: 600, color: '#f59e0b' }}>❓ 问题管理</h3>
          {issues.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--muted)' }}>暂无问题</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {issues.map(t => (
                <div key={t.id} style={{ padding: 12, background: 'var(--panel2)', borderRadius: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ fontWeight: 600, fontSize: 13 }}>{t.id}</span>
                    <span style={{ color: '#f59e0b', fontSize: 11 }}>待解决</span>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--muted)' }}>{t.title}</div>
                  {t.block && <div style={{ marginTop: 8, fontSize: 11, color: '#ef4444' }}>问题: {t.block}</div>}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  };

  // 会议状态面板 - 基于真实数据
  const MeetingPanel = () => {
    const officialsData = useStore((s) => s.officialsData);
    const liveStatus = useStore((s) => s.liveStatus);
    const officials = officialsData?.officials || [];
    const tasks = liveStatus?.tasks || [];
    
    // 真实数据计算
    const now = new Date();
    const today = now.toISOString().split('T')[0];
    const currentHour = now.getHours();
    
    // 从任务中提取会议相关信息（真实数据）
    const meetingTasks = tasks.filter((t: any) => 
      t.title?.includes('会议') || t.title?.includes('讨论') || t.title?.includes('评审')
    );
    
    // 在线人数统计（真实数据）
    const onlineCount = officials.filter((o: any) => o.status === 'busy' || o.status === 'very-busy' || o.status === 'running' || o.heartbeat?.status === 'active').length;
    const runningCount = officials.filter((o: any) => o.status === 'busy' || o.status === 'very-busy' || o.status === 'running').length;
    
    // 部门在线统计（真实数据）
    const deptOnline: Record<string, number> = {};
    officials.forEach((o: any) => {
      if (o.status === 'busy' || o.status === 'very-busy' || o.status === 'running' || o.heartbeat?.status === 'active') {
        const dept = o.org || '未知';
        deptOnline[dept] = (deptOnline[dept] || 0) + 1;
      }
    });
    
    // 活跃任务统计（真实数据）
    const activeTasks = tasks.filter((t: any) => t.state !== 'Done' && t.state !== 'Next');
    const doingTasks = activeTasks.filter((t: any) => t.state === 'Doing');
    
    // 最近活动记录（真实数据）
    const recentActivities = tasks
      .filter((t: any) => t.updatedAt)
      .sort((a: any, b: any) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      .slice(0, 10);
    
    return (
      <div style={{ padding: 12, maxWidth: 1920, margin: '0 auto' }}>
        {/* 顶部统计 */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: 8, marginBottom: 12 }}>
          <div style={{ background: 'linear-gradient(135deg, #22c55e20, #22c55e10)', borderRadius: 10, padding: 12, border: '1px solid #22c55e40', textAlign: 'center' }}>
            <div style={{ fontSize: 10, color: 'var(--muted)' }}>🔄 运行中</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: '#22c55e' }}>{runningCount}</div>
          </div>
          <div style={{ background: 'var(--panel)', borderRadius: 10, padding: 12, border: '1px solid var(--line)', textAlign: 'center' }}>
            <div style={{ fontSize: 10, color: 'var(--muted)' }}>📋 活跃任务</div>
            <div style={{ fontSize: 22, fontWeight: 800 }}>{activeTasks.length}</div>
          </div>
          <div style={{ background: 'linear-gradient(135deg, #3b82f620, #3b82f610)', borderRadius: 10, padding: 12, border: '1px solid #3b82f640', textAlign: 'center' }}>
            <div style={{ fontSize: 10, color: 'var(--muted)' }}>⚙️ 执行中</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: '#3b82f6' }}>{doingTasks.length}</div>
          </div>
          <div style={{ background: 'linear-gradient(135deg, #8b5cf620, #8b5cf610)', borderRadius: 10, padding: 12, border: '1px solid #8b5cf640', textAlign: 'center' }}>
            <div style={{ fontSize: 10, color: 'var(--muted)' }}>📅 会议任务</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: '#8b5cf6' }}>{meetingTasks.length}</div>
          </div>
          <div style={{ background: 'linear-gradient(135deg, #10b98120, #10b98110)', borderRadius: 10, padding: 12, border: '1px solid #10b98140', textAlign: 'center' }}>
            <div style={{ fontSize: 10, color: 'var(--muted)' }}>👥 在线人数</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: '#10b981' }}>{onlineCount}</div>
          </div>
          <div style={{ background: 'var(--panel)', borderRadius: 10, padding: 12, border: '1px solid var(--line)', textAlign: 'center' }}>
            <div style={{ fontSize: 10, color: 'var(--muted)' }}>🏢 活跃部门</div>
            <div style={{ fontSize: 22, fontWeight: 800 }}>{Object.keys(deptOnline).length}</div>
          </div>
          <div style={{ background: 'var(--panel)', borderRadius: 10, padding: 12, border: '1px solid var(--line)', textAlign: 'center' }}>
            <div style={{ fontSize: 10, color: 'var(--muted)' }}>📅 日期</div>
            <div style={{ fontSize: 14, fontWeight: 700 }}>{today}</div>
            <div style={{ fontSize: 10, color: 'var(--muted)' }}>{['日', '一', '二', '三', '四', '五', '六'][now.getDay()]}曜日</div>
          </div>
          <div style={{ background: 'var(--panel)', borderRadius: 10, padding: 12, border: '1px solid var(--line)', textAlign: 'center' }}>
            <div style={{ fontSize: 10, color: 'var(--muted)' }}>🕐 当前时间</div>
            <div style={{ fontSize: 18, fontWeight: 700 }}>{now.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}</div>
          </div>
        </div>

        {/* 会议任务列表和部门在线状态 */}
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 8, marginBottom: 12 }}>
          {/* 会议相关任务 */}
          <div style={{ background: 'var(--panel)', borderRadius: 10, border: '1px solid var(--line)', overflow: 'hidden' }}>
            <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--line)', display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 14 }}>📅</span>
              <span style={{ fontWeight: 700, fontSize: 12 }}>会议相关任务 ({meetingTasks.length})</span>
            </div>
            <div style={{ padding: 8, maxHeight: 300, overflowY: 'auto' }}>
              {meetingTasks.length > 0 ? meetingTasks.map((t: any) => (
                <div key={t.id} style={{ display: 'flex', alignItems: 'center', padding: '10px 12px', gap: 12, marginBottom: 6, borderRadius: 8, background: t.state === 'Doing' ? '#22c55e15' : 'var(--panel2)', border: `1px solid ${t.state === 'Doing' ? '#22c55e' : 'var(--line)'}` }}>
                  <div style={{ width: 80, textAlign: 'center' }}>
                    <div style={{ fontSize: 10, fontWeight: 600, color: t.state === 'Doing' ? '#22c55e' : 'var(--muted)' }}>{t.id}</div>
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: 12 }}>{t.title}</div>
                    <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 2 }}>👤 {t.official || '待分配'} · 📂 {t.org || '未分配'}</div>
                  </div>
                  <div style={{ padding: '4px 10px', borderRadius: 12, fontSize: 10, fontWeight: 600, background: t.state === 'Doing' ? '#22c55e' : t.state === 'Done' ? 'var(--panel2)' : '#f59e0b', color: t.state === 'Doing' ? '#fff' : t.state === 'Done' ? 'var(--muted)' : '#fff' }}>
                    {t.state}
                  </div>
                </div>
              )) : (
                <div style={{ textAlign: 'center', padding: 40, color: 'var(--muted)' }}>暂无会议相关任务</div>
              )}
            </div>
          </div>

          {/* 部门在线状态 */}
          <div style={{ background: 'var(--panel)', borderRadius: 10, border: '1px solid var(--line)', overflow: 'hidden' }}>
            <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--line)', display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 14 }}>🏢</span>
              <span style={{ fontWeight: 700, fontSize: 12 }}>部门在线状态</span>
            </div>
            <div style={{ padding: 8 }}>
              {Object.entries(deptOnline).sort((a, b) => b[1] - a[1]).map(([dept, count], i) => (
                <div key={dept} style={{ display: 'flex', alignItems: 'center', padding: '8px 10px', gap: 10, marginBottom: 4, borderRadius: 8, background: i === 0 ? '#22c55e10' : 'transparent', border: '1px solid var(--line)' }}>
                  <div style={{ width: 32, height: 32, borderRadius: 8, background: count > 2 ? '#22c55e' : count > 0 ? '#f59e0b' : 'var(--panel2)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: 12 }}>
                    {count}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: 12 }}>{dept}</div>
                    <div style={{ fontSize: 10, color: count > 0 ? '#22c55e' : 'var(--muted)' }}>{count > 0 ? '🟢 活跃' : '⚪ 待命'}</div>
                  </div>
                </div>
              ))}
              {Object.keys(deptOnline).length === 0 && (
                <div style={{ textAlign: 'center', padding: 20, color: 'var(--muted)' }}>暂无在线部门</div>
              )}
            </div>
          </div>
        </div>

        {/* 最近活动记录 */}
        <div style={{ background: 'var(--panel)', borderRadius: 10, border: '1px solid var(--line)', overflow: 'hidden' }}>
          <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--line)', display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 14 }}>📊</span>
            <span style={{ fontWeight: 700, fontSize: 12 }}>最近活动记录 ({recentActivities.length})</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 6, padding: 8, maxHeight: 200, overflowY: 'auto' }}>
            {recentActivities.map((t: any, i: number) => (
              <div key={i} style={{ padding: 8, background: 'var(--panel2)', borderRadius: 6, border: '1px solid var(--line)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
                  <span style={{ fontSize: 10, fontWeight: 600, color: t.state === 'Doing' ? '#22c55e' : t.state === 'Done' ? '#3b82f6' : 'var(--muted)' }}>{t.id}</span>
                  <span style={{ fontSize: 9, padding: '1px 4px', borderRadius: 3, background: t.state === 'Doing' ? '#22c55e20' : '#3b82f620', color: t.state === 'Doing' ? '#22c55e' : '#3b82f6' }}>{t.state}</span>
                </div>
                <div style={{ fontSize: 10, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.title || '(无标题)'}</div>
                <div style={{ fontSize: 9, color: 'var(--muted)', marginTop: 4 }}>{t.updatedAt?.substring(11, 16) || '--:--'}</div>
              </div>
            ))}
            {recentActivities.length === 0 && (
              <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: 20, color: 'var(--muted)' }}>暂无活动记录</div>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div>
      {/* 视图切换 */}
      <div style={{ display: 'flex', gap: 4, padding: '8px 16px', borderBottom: '1px solid var(--line)', background: 'var(--panel)' }}>
        {[
          { key: 'overview', label: '📊 概览' },
          { key: 'org', label: '🏢 组织架构' },
          { key: 'flow', label: '🔄 协作流程' },
          { key: 'agent_pool', label: '🤖 Agent池' },
          { key: 'project', label: '📁 项目管理' },
          { key: 'eva', label: '📈 挣值分析' },
          { key: 'meeting', label: '🗓 会议状态' },
          { key: 'templates', label: '📋 模板库' },
          { key: 'morning', label: '🌅 每日简报' },
        ].map(m => (
          <button
            key={m.key}
            onClick={() => setViewMode(m.key as any)}
            style={{
              padding: '6px 14px',
              fontSize: 12,
              border: 'none',
              borderRadius: 6,
              cursor: 'pointer',
              background: viewMode === m.key ? 'var(--acc)' : 'transparent',
              color: viewMode === m.key ? '#000' : 'var(--muted)',
              fontWeight: viewMode === m.key ? 600 : 400,
            }}
          >
            {m.label}
          </button>
        ))}
      </div>

      {viewMode === 'overview' && <OverviewPanel />}
      {viewMode === 'org' && <OrgChartPanel />}
      {viewMode === 'flow' && <FlowPanel />}
      {viewMode === 'agent_pool' && <AgentPoolPanel />}
      {viewMode === 'project' && <ProjectPanel />}
      {viewMode === 'eva' && <EVAPanel />}
      {viewMode === 'meeting' && <MeetingPanel />}
      {viewMode === 'templates' && <TemplatePanel />}
      {viewMode === 'morning' && <MorningPanel />}
    </div>
  );
}
