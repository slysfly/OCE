import { useEffect, useState } from 'react';
import { useStore, STATE_LABEL, DEPTS, DEPT_SUB_AGENTS } from '../store';

export default function OfficialPanel() {
  const officialsData = useStore((s) => s.officialsData);
  const liveStatus = useStore((s) => s.liveStatus);
  const selectedOfficial = useStore((s) => s.selectedOfficial);
  const setSelectedOfficial = useStore((s) => s.setSelectedOfficial);
  const loadOfficials = useStore((s) => s.loadOfficials);

  useEffect(() => {
    loadOfficials();
  }, [loadOfficials]);

  const [detailMember, setDetailMember] = useState<any>(null);
  const [sortBy, setSortBy] = useState<'performance' | 'tasks' | 'salary'>('performance');

  // 优先使用 employees（148个员工=148个Agent），其次使用 officials（20个部门）
  if (!officialsData?.employees && !officialsData?.officials) {
    return <div className="empty">⚠️ 请确保本地服务器已启动</div>;
  }

  // 使用 employees 列表（148人）优先，officials 作为部门数据
  const employees = officialsData.employees || [];
  const offs = officialsData.officials || [];
  const totals = officialsData.totals || { 
    tasks_done: 0, 
    cost_cny: 0,
    total_employees: employees.length,
    total_departments: offs.length 
  };
  const tasks = liveStatus?.tasks || [];

  // 基于真实任务数据计算绩效指标
  const getMemberTasks = (memberId: string) => {
    return tasks.filter((t: any) => t.official === memberId || t.official_id === memberId);
  };

  const getMemberDoneTasks = (memberId: string) => {
    return tasks.filter((t: any) => 
      (t.official === memberId || t.official_id === memberId) && t.state === 'Done'
    );
  };

  // 计算真实绩效分（基于任务完成数和成本效率）
  const calculatePerformance = (o: any) => {
    const memberTasks = getMemberTasks(o.id);
    const doneTasks = memberTasks.filter((t: any) => t.state === 'Done');
    const taskScore = Math.min(50, doneTasks.length * 5); // 任务完成分，最多50分
    const completionRate = memberTasks.length > 0 ? doneTasks.length / memberTasks.length : 0;
    const rateScore = completionRate * 30; // 完成率分，最多30分
    const statusScore = (o.status === 'busy' || o.status === 'very-busy' || o.status === 'running' || (o as any).status === 'active') ? 20 : 10; // 状态分
    return Math.min(100, Math.round(taskScore + rateScore + statusScore));
  };

  // 计算真实任务完成量
  const calculateTasksDone = (o: any) => {
    return getMemberDoneTasks(o.id).length;
  };

  // 计算真实效率（基于单任务成本）
  const calculateEfficiency = (o: any) => {
    const tasksDone = o.tasks_done || calculateTasksDone(o);
    if (tasksDone === 0) return 50;
    const costPerTask = (o.cost_cny || 0) / tasksDone;
    // 成本越低效率越高，最高100，最低30
    if (costPerTask < 1) return 95;
    if (costPerTask < 2) return 85;
    if (costPerTask < 5) return 75;
    if (costPerTask < 10) return 65;
    return Math.max(30, 100 - costPerTask * 5);
  };

  // 转换数据并添加绩效指标 - 优先使用 employees 列表（148人）
  const allEmployees = employees.length > 0 
    ? employees.map((o: any) => ({
        id: o.id,
        name: o.name || o.label || o.id,
        gender: o.gender || '男',
        role: o.role || '员工',
        level: o.level || 'P5',
        department: o.label || '未知部门',  // employees 的 label 是部门名
        base_salary: o.base_salary || 15000,
        performance_bonus: o.performance_bonus || 5000,
        isLeader: false,
        personality: o.personality || '踏实靠谱',
        emoji: '👤',
        status: o.status || o.heartbeat?.status || 'idle',
        performance: 50,  // 默认50分
        tasksDone: o.tasks_done || 0,
        efficiency: 75,  // 默认75
        costCny: 0,
      }))
    : offs.map((o: any) => ({
        id: o.id,
        name: o.name || o.label || o.id,
        gender: o.gender || '男',
        role: o.role || o.label || '员工',
        level: o.level || o.rank || 'P5',
        department: o.org || o.dept || '未知部门',
        base_salary: o.base_salary || 15000,
        performance_bonus: o.performance_bonus || 5000,
        isLeader: o.isLeader || false,
        personality: o.personality || '踏实靠谱',
        emoji: o.emoji || '👤',
        status: o.status || o.heartbeat?.status || 'idle',
        performance: calculatePerformance(o),
        tasksDone: o.tasks_done || calculateTasksDone(o),
        efficiency: Math.round(calculateEfficiency(o)),
        costCny: o.cost_cny || 0,
      }));

  // 按部门分组
  const deptGroups: Record<string, typeof allEmployees> = {};
  allEmployees.forEach(emp => {
    if (!deptGroups[emp.department]) deptGroups[emp.department] = [];
    deptGroups[emp.department].push(emp);
  });

  // 获取成员状态
  const getStatus = (id: string) => {
    if (employees.length > 0) {
      const emp = employees.find((e: any) => e.id === id);
      return emp?.status || emp?.heartbeat?.status || 'idle';
    }
    const official = offs.find((o: any) => o.id === id);
    return official?.status || official?.heartbeat?.status || 'idle';
  };

  // 统计 - 使用 employees 或 totals
  const totalHeadcount = employees.length > 0 ? employees.length : totals.total_employees || allEmployees.length;
  const maleCount = employees.length > 0 ? employees.filter((e: any) => e.gender === '男').length : Math.floor(totalHeadcount / 2);
  const femaleCount = employees.length > 0 ? employees.filter((e: any) => e.gender === '女').length : Math.ceil(totalHeadcount / 2);
  const runningCount = employees.length > 0 ? employees.filter((e: any) => e.status === 'busy' || e.status === 'very-busy' || e.status === 'running').length : offs.filter((o: any) => o.status === 'running').length;
  const activeCount = employees.length > 0 ? runningCount : offs.filter((o: any) => o.status === 'running' || o.heartbeat?.status === 'active').length;
  const avgPerformance = allEmployees.length > 0 ? Math.floor(allEmployees.reduce((a, b) => a + b.performance, 0) / allEmployees.length) : 0;
  const avgEfficiency = allEmployees.length > 0 ? Math.floor(allEmployees.reduce((a, b) => a + b.efficiency, 0) / allEmployees.length) : 0;
  const totalCost = employees.length > 0 ? 0 : allEmployees.reduce((a, b) => a + (b.costCny || 0), 0);
  const totalTasksDone = employees.length > 0 ? employees.reduce((a: any, b: any) => a + (b.tasks_done || 0), 0) : allEmployees.reduce((a, b) => a + (b.tasksDone || 0), 0);

  // 排行榜
  const topPerformers = [...allEmployees].sort((a, b) => b.performance - a.performance).slice(0, 5);
  const topTaskers = [...allEmployees].sort((a, b) => b.tasksDone - a.tasksDone).slice(0, 5);
  const lowPerformers = [...allEmployees].sort((a, b) => a.performance - b.performance).slice(0, 3);

  return (
    <div style={{ padding: 12, maxWidth: 1920, margin: '0 auto' }}>
      
      {/* 顶部统计行 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: 8, marginBottom: 12 }}>
        <div style={{ background: 'linear-gradient(135deg, #3b82f620, #3b82f610)', borderRadius: 10, padding: 12, border: '1px solid #3b82f640', textAlign: 'center' }}>
          <div style={{ fontSize: 10, color: 'var(--muted)' }}>👥 总人数</div>
          <div style={{ fontSize: 22, fontWeight: 800 }}>{totalHeadcount}</div>
        </div>
        <div style={{ background: 'linear-gradient(135deg, #ec489920, #ec489910)', borderRadius: 10, padding: 12, border: '1px solid #ec489940', textAlign: 'center' }}>
          <div style={{ fontSize: 10, color: 'var(--muted)' }}>👫 性别</div>
          <div style={{ fontSize: 14, fontWeight: 700 }}>👨{maleCount} / 👩{femaleCount}</div>
        </div>
        <div style={{ background: 'linear-gradient(135deg, #22c55e20, #22c55e10)', borderRadius: 10, padding: 12, border: '1px solid #22c55e40', textAlign: 'center' }}>
          <div style={{ fontSize: 10, color: 'var(--muted)' }}>🔄 运行中</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#22c55e' }}>{runningCount}</div>
        </div>
        <div style={{ background: 'var(--panel)', borderRadius: 10, padding: 12, border: '1px solid var(--line)', textAlign: 'center' }}>
          <div style={{ fontSize: 10, color: 'var(--muted)' }}>💤 待命</div>
          <div style={{ fontSize: 22, fontWeight: 800 }}>{totalHeadcount - activeCount}</div>
        </div>
        <div style={{ background: 'linear-gradient(135deg, #f59e0b20, #f59e0b10)', borderRadius: 10, padding: 12, border: '1px solid #f59e0b40', textAlign: 'center' }}>
          <div style={{ fontSize: 10, color: 'var(--muted)' }}>⭐ 平均绩效</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#f59e0b' }}>{avgPerformance}</div>
        </div>
        <div style={{ background: 'linear-gradient(135deg, #8b5cf620, #8b5cf610)', borderRadius: 10, padding: 12, border: '1px solid #8b5cf640', textAlign: 'center' }}>
          <div style={{ fontSize: 10, color: 'var(--muted)' }}>⚡ 平均效率</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#8b5cf6' }}>{avgEfficiency}%</div>
        </div>
        <div style={{ background: 'linear-gradient(135deg, #10b98120, #10b98110)', borderRadius: 10, padding: 12, border: '1px solid #10b98140', textAlign: 'center' }}>
          <div style={{ fontSize: 10, color: 'var(--muted)' }}>📊 累计任务</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#10b981' }}>{totals.tasks_done || 0}</div>
        </div>
        <div style={{ background: 'linear-gradient(135deg, #ef444420, #ef444410)', borderRadius: 10, padding: 12, border: '1px solid #ef444440', textAlign: 'center' }}>
          <div style={{ fontSize: 10, color: 'var(--muted)' }}>💰 月人力成本</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#ef4444' }}>¥{(allEmployees.reduce((a, b) => a + b.base_salary + b.performance_bonus, 0) / 10000).toFixed(0)}万</div>
        </div>
      </div>

      {/* 排行榜区域 */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 12 }}>
        {/* 绩效红榜 */}
        <div style={{ background: 'var(--panel)', borderRadius: 10, border: '1px solid #22c55e50', overflow: 'hidden' }}>
          <div style={{ padding: '8px 12px', background: 'linear-gradient(90deg, #22c55e20, transparent)', borderBottom: '1px solid var(--line)', display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 14 }}>🏆</span>
            <span style={{ fontWeight: 700, fontSize: 12, color: '#22c55e' }}>绩效红榜 TOP 5</span>
          </div>
          <div style={{ padding: 6 }}>
            {topPerformers.map((emp, i) => (
              <div key={emp.id} style={{ display: 'flex', alignItems: 'center', padding: '6px 8px', gap: 8, background: i === 0 ? '#ffd70015' : 'transparent', borderRadius: 6 }}>
                <span style={{ width: 18, height: 18, borderRadius: '50%', background: i === 0 ? '#ffd700' : i === 1 ? '#c0c0c0' : i === 2 ? '#cd7f32' : 'var(--panel2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: i < 3 ? '#000' : 'var(--muted)' }}>{i + 1}</span>
                <span style={{ fontSize: 14 }}>{emp.gender === '男' ? '👨' : '👩'}</span>
                <span style={{ fontWeight: 600, flex: 1, fontSize: 12 }}>{emp.name}</span>
                <span style={{ fontSize: 10, color: 'var(--muted)' }}>{emp.department}</span>
                <span style={{ fontWeight: 700, color: '#22c55e', fontSize: 13 }}>{emp.performance}分</span>
              </div>
            ))}
          </div>
        </div>

        {/* 任务达人 */}
        <div style={{ background: 'var(--panel)', borderRadius: 10, border: '1px solid #3b82f650', overflow: 'hidden' }}>
          <div style={{ padding: '8px 12px', background: 'linear-gradient(90deg, #3b82f620, transparent)', borderBottom: '1px solid var(--line)', display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 14 }}>📊</span>
            <span style={{ fontWeight: 700, fontSize: 12, color: '#3b82f6' }}>任务达人 TOP 5</span>
          </div>
          <div style={{ padding: 6 }}>
            {topTaskers.map((emp, i) => (
              <div key={emp.id} style={{ display: 'flex', alignItems: 'center', padding: '6px 8px', gap: 8, background: i === 0 ? '#3b82f615' : 'transparent', borderRadius: 6 }}>
                <span style={{ width: 18, height: 18, borderRadius: '50%', background: i === 0 ? '#3b82f6' : i === 1 ? '#60a5fa' : i === 2 ? '#93c5fd' : 'var(--panel2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: i < 3 ? '#fff' : 'var(--muted)' }}>{i + 1}</span>
                <span style={{ fontSize: 14 }}>{emp.gender === '男' ? '👨' : '👩'}</span>
                <span style={{ fontWeight: 600, flex: 1, fontSize: 12 }}>{emp.name}</span>
                <span style={{ fontSize: 10, color: 'var(--muted)' }}>{emp.department}</span>
                <span style={{ fontWeight: 700, color: '#3b82f6', fontSize: 13 }}>{emp.tasksDone}个</span>
              </div>
            ))}
          </div>
        </div>

        {/* 效率黑榜 */}
        <div style={{ background: 'var(--panel)', borderRadius: 10, border: '1px solid #ef444450', overflow: 'hidden' }}>
          <div style={{ padding: '8px 12px', background: 'linear-gradient(90deg, #ef444420, transparent)', borderBottom: '1px solid var(--line)', display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 14 }}>⚠️</span>
            <span style={{ fontWeight: 700, fontSize: 12, color: '#ef4444' }}>待改进 BOTTOM 3</span>
          </div>
          <div style={{ padding: 6 }}>
            {lowPerformers.map((emp, i) => (
              <div key={emp.id} style={{ display: 'flex', alignItems: 'center', padding: '6px 8px', gap: 8, borderRadius: 6 }}>
                <span style={{ width: 18, height: 18, borderRadius: '50%', background: '#ef4444', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: '#fff' }}>!</span>
                <span style={{ fontSize: 14 }}>{emp.gender === '男' ? '👨' : '👩'}</span>
                <span style={{ fontWeight: 600, flex: 1, fontSize: 12 }}>{emp.name}</span>
                <span style={{ fontSize: 10, color: 'var(--muted)' }}>{emp.department}</span>
                <span style={{ fontWeight: 700, color: '#ef4444', fontSize: 13 }}>{emp.performance}分</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 成员网格 - 紧凑展示 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 6 }}>
        {Object.entries(deptGroups).map(([dept, employees]) => {
          const deptInfo = DEPTS.find(d => d.label === dept);
          const runningInDept = employees.filter((e: any) => e.status === 'busy' || e.status === 'very-busy' || e.status === 'running').length;
          
          return (
            <div key={dept} style={{ background: 'var(--panel)', borderRadius: 8, border: '1px solid var(--line)', overflow: 'hidden' }}>
              {/* 部门标题 */}
              <div style={{ 
                padding: '6px 8px', 
                background: 'var(--panel2)', 
                borderBottom: '1px solid var(--line)',
                display: 'flex',
                alignItems: 'center',
                gap: 4
              }}>
                <span style={{ fontSize: 14 }}>{deptInfo?.emoji || '🏢'}</span>
                <span style={{ fontWeight: 600, fontSize: 11, flex: 1 }}>{dept}</span>
                <span style={{ fontSize: 10, padding: '1px 4px', borderRadius: 3, background: runningInDept > 0 ? '#22c55e30' : 'var(--panel)', color: runningInDept > 0 ? '#22c55e' : 'var(--muted)' }}>
                  {runningInDept}/{employees.length}
                </span>
              </div>
              
              {/* 人员列表 - 紧凑 */}
              <div style={{ padding: 4 }}>
                {employees.sort((a, b) => b.performance - a.performance).map(emp => {
                  const status = getStatus(emp.id) as string;
                  const isRunning = status === 'busy' || status === 'very-busy' || status === 'running' || status === 'active';
                  const perfColor = emp.performance >= 80 ? '#22c55e' : emp.performance >= 60 ? '#f59e0b' : '#ef4444';
                  
                  return (
                    <div 
                      key={emp.id}
                      style={{ 
                        display: 'flex', 
                        alignItems: 'center', 
                        padding: '4px 6px', 
                        borderRadius: 4,
                        background: isRunning ? '#22c55e10' : 'transparent',
                        borderLeft: `3px solid ${perfColor}`,
                        marginBottom: 2,
                        cursor: 'pointer',
                        transition: 'background 0.1s'
                      }}
                      onClick={() => setDetailMember(emp)}
                      onMouseEnter={(e) => e.currentTarget.style.background = 'var(--panel2)'}
                      onMouseLeave={(e) => e.currentTarget.style.background = isRunning ? '#22c55e10' : 'transparent'}
                    >
                      <span style={{ fontSize: 12 }}>{emp.gender === '男' ? '👨' : '👩'}</span>
                      <span style={{ fontWeight: 500, flex: 1, fontSize: 10, marginLeft: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {emp.name}
                        {emp.isLeader && <span style={{ color: '#f5c842' }}>★</span>}
                      </span>
                      <span style={{ fontSize: 9, color: perfColor, fontWeight: 700 }}>{emp.performance}</span>
                      {isRunning && <span style={{ fontSize: 8, marginLeft: 2 }}>🔄</span>}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* 成员详情弹窗 */}
      {detailMember && (
        <div className="modal-bg open" onClick={() => setDetailMember(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 500 }}>
            <button className="modal-close" onClick={() => setDetailMember(null)}>✕</button>
            <div className="modal-body" style={{ padding: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                <span style={{ fontSize: 36 }}>{detailMember.gender === '男' ? '👨' : '👩'}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 18, fontWeight: 700 }}>{detailMember.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--muted)' }}>{detailMember.department} · {detailMember.role}</div>
                </div>
                <span style={{ padding: '4px 10px', background: 'var(--panel2)', borderRadius: 6, fontSize: 11, fontWeight: 600 }}>{detailMember.level}</span>
              </div>

              {/* KPI指标 */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 16 }}>
                <div style={{ padding: 10, background: 'linear-gradient(135deg, #22c55e15, #22c55e08)', borderRadius: 8, textAlign: 'center', border: '1px solid #22c55e30' }}>
                  <div style={{ fontSize: 24, fontWeight: 800, color: '#22c55e' }}>{detailMember.performance}</div>
                  <div style={{ fontSize: 9, color: 'var(--muted)' }}>绩效分</div>
                </div>
                <div style={{ padding: 10, background: 'linear-gradient(135deg, #3b82f615, #3b82f608)', borderRadius: 8, textAlign: 'center', border: '1px solid #3b82f630' }}>
                  <div style={{ fontSize: 24, fontWeight: 800, color: '#3b82f6' }}>{detailMember.tasksDone}</div>
                  <div style={{ fontSize: 9, color: 'var(--muted)' }}>完成任务</div>
                </div>
                <div style={{ padding: 10, background: 'linear-gradient(135deg, #8b5cf615, #8b5cf608)', borderRadius: 8, textAlign: 'center', border: '1px solid #8b5cf630' }}>
                  <div style={{ fontSize: 24, fontWeight: 800, color: '#8b5cf6' }}>{detailMember.efficiency}%</div>
                  <div style={{ fontSize: 9, color: 'var(--muted)' }}>效率值</div>
                </div>
              </div>

              {/* 基本信息 */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16 }}>
                <div style={{ padding: 10, background: 'var(--panel2)', borderRadius: 8 }}>
                  <div style={{ fontSize: 9, color: 'var(--muted)', marginBottom: 2 }}>性格特点</div>
                  <div style={{ fontWeight: 500, fontSize: 12 }}>{detailMember.personality}</div>
                </div>
                <div style={{ padding: 10, background: 'var(--panel2)', borderRadius: 8 }}>
                  <div style={{ fontSize: 9, color: 'var(--muted)', marginBottom: 2 }}>月薪</div>
                  <div style={{ fontWeight: 600, fontSize: 14, color: '#f59e0b' }}>¥{(detailMember.base_salary + detailMember.performance_bonus).toLocaleString()}</div>
                </div>
              </div>

              {/* 当前状态 */}
              <div style={{ padding: 10, background: ((detailMember as any).status === 'busy' || (detailMember as any).status === 'very-busy' || detailMember.status === 'running') ? '#22c55e15' : 'var(--panel2)', borderRadius: 8, border: ((detailMember as any).status === 'busy' || (detailMember as any).status === 'very-busy' || detailMember.status === 'running') ? '1px solid #22c55e40' : 'none' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 20 }}>{((detailMember as any).status === 'busy' || (detailMember as any).status === 'very-busy' || detailMember.status === 'running') ? '🔄' : '💤'}</span>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 12 }}>{((detailMember as any).status === 'busy' || (detailMember as any).status === 'very-busy' || detailMember.status === 'running') ? '执行任务中' : '待命状态'}</div>
                    <div style={{ fontSize: 10, color: 'var(--muted)' }}>点击可查看详细任务进度</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
