import { useStore } from '../store';

export default function CostPanel() {
  const tab = useStore((s) => s.activeTab);
  if (tab !== 'cost') return null;

  const officialsData = useStore((s) => s.officialsData);
  const rawTotals = officialsData?.totals || { tasks_done: 0, cost_cny: 0 };
  const totals = {
    tasks_done: rawTotals.tasks_done || 0,
    cost_cny: rawTotals.cost_cny || 0,
    tokens_in: (rawTotals as any).tokens_in || 0,
    tokens_out: (rawTotals as any).tokens_out || 0,
  };
  const officials = officialsData?.officials || [];
  const employees = officialsData?.employees || [];
  const deptCount = officialsData?.totals?.total_departments || officials.length;
  const employeeCount = officialsData?.totals?.total_employees || employees.length || deptCount;
  const deptCosts: Record<string, { cost: number; tasks: number; members: number }> = {};
  officials.forEach((o: any) => {
    const dept = o.org || '未知';
    if (!deptCosts[dept]) deptCosts[dept] = { cost: 0, tasks: 0, members: 0 };
    deptCosts[dept].cost += o.cost_cny || 0;
    deptCosts[dept].tasks += o.tasks_done || 0;
    deptCosts[dept].members++;
  });
  
  const deptCostList = Object.entries(deptCosts).map(([name, data]) => ({ name, ...data })).sort((a, b) => b.cost - a.cost);
  const topCostDepts = deptCostList.slice(0, 5);
  const topTaskDepts = [...deptCostList].sort((a, b) => b.tasks - a.tasks).slice(0, 5);
  const avgCostPerTask = totals.tasks_done > 0 ? totals.cost_cny / totals.tasks_done : 0;
  
  // 个人成本排行
  const personCosts = officials.map((o: any) => ({
    name: o.name || o.label,
    dept: o.org,
    cost: o.cost_cny || 0,
    tasks: o.tasks_done || 0,
    efficiency: o.tasks_done > 0 ? (o.cost_cny / o.tasks_done).toFixed(2) : '-',
  })).sort((a, b) => b.cost - a.cost);
  
  const topSpenders = personCosts.slice(0, 5);
  const lowEfficiency = personCosts.filter(p => p.tasks > 0).sort((a, b) => parseFloat(a.efficiency as string) - parseFloat(b.efficiency as string)).slice(0, 3);
  
  return (
    <div style={{ padding: 12, maxWidth: 1920, margin: '0 auto' }}>
      {/* 顶部统计 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: 8, marginBottom: 12 }}>
        <div style={{ background: 'linear-gradient(135deg, #ef444420, #ef444410)', borderRadius: 10, padding: 12, border: '1px solid #ef444440', textAlign: 'center' }}>
          <div style={{ fontSize: 10, color: 'var(--muted)' }}>💰 累计成本</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: '#ef4444' }}>¥{(totals.cost_cny || 0).toLocaleString()}</div>
        </div>
        <div style={{ background: 'linear-gradient(135deg, #3b82f620, #3b82f610)', borderRadius: 10, padding: 12, border: '1px solid #3b82f640', textAlign: 'center' }}>
          <div style={{ fontSize: 10, color: 'var(--muted)' }}>📊 完成任务</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: '#3b82f6' }}>{totals.tasks_done || 0}</div>
        </div>
        <div style={{ background: 'linear-gradient(135deg, #22c55e20, #22c55e10)', borderRadius: 10, padding: 12, border: '1px solid #22c55e40', textAlign: 'center' }}>
          <div style={{ fontSize: 10, color: 'var(--muted)' }}>💵 单任务成本</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: '#22c55e' }}>¥{avgCostPerTask.toFixed(2)}</div>
        </div>
        <div style={{ background: 'linear-gradient(135deg, #8b5cf620, #8b5cf610)', borderRadius: 10, padding: 12, border: '1px solid #8b5cf640', textAlign: 'center' }}>
          <div style={{ fontSize: 10, color: 'var(--muted)' }}>🏢 部门数</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: '#8b5cf6' }}>{deptCount}</div>
        </div>
        <div style={{ background: 'linear-gradient(135deg, #f59e0b20, #f59e0b10)', borderRadius: 10, padding: 12, border: '1px solid #f59e0b40', textAlign: 'center' }}>
          <div style={{ fontSize: 10, color: 'var(--muted)' }}>👥 总人数</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: '#f59e0b' }}>{employeeCount}</div>
        </div>
        <div style={{ background: 'var(--panel)', borderRadius: 10, padding: 12, border: '1px solid var(--line)', textAlign: 'center' }}>
          <div style={{ fontSize: 10, color: 'var(--muted)' }}>📥 输入Token</div>
          <div style={{ fontSize: 16, fontWeight: 700 }}>{((totals.tokens_in || 0) / 1000000).toFixed(2)}M</div>
        </div>
        <div style={{ background: 'var(--panel)', borderRadius: 10, padding: 12, border: '1px solid var(--line)', textAlign: 'center' }}>
          <div style={{ fontSize: 10, color: 'var(--muted)' }}>📤 输出Token</div>
          <div style={{ fontSize: 16, fontWeight: 700 }}>{((totals.tokens_out || 0) / 1000000).toFixed(2)}M</div>
        </div>
        <div style={{ background: 'linear-gradient(135deg, #10b98120, #10b98110)', borderRadius: 10, padding: 12, border: '1px solid #10b98140', textAlign: 'center' }}>
          <div style={{ fontSize: 10, color: 'var(--muted)' }}>📈 预算执行率</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#10b981' }}>{Math.min(100, Math.round(totals.cost_cny / 50000 * 100))}%</div>
        </div>
      </div>

      {/* 排行榜 */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 12 }}>
        {/* 成本消耗TOP5 */}
        <div style={{ background: 'var(--panel)', borderRadius: 10, border: '1px solid #ef444450', overflow: 'hidden' }}>
          <div style={{ padding: '8px 12px', background: 'linear-gradient(90deg, #ef444420, transparent)', borderBottom: '1px solid var(--line)', display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 14 }}>💰</span>
            <span style={{ fontWeight: 700, fontSize: 12, color: '#ef4444' }}>成本消耗 TOP 5</span>
          </div>
          <div style={{ padding: 6 }}>
            {topCostDepts.map((d, i) => (
              <div key={d.name} style={{ display: 'flex', alignItems: 'center', padding: '6px 8px', gap: 8, background: i === 0 ? '#ef444415' : 'transparent', borderRadius: 6 }}>
                <span style={{ width: 18, height: 18, borderRadius: '50%', background: i === 0 ? '#ef4444' : i === 1 ? '#f87171' : i === 2 ? '#fca5a5' : 'var(--panel2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: i < 3 ? '#fff' : 'var(--muted)' }}>{i + 1}</span>
                <span style={{ fontWeight: 600, flex: 1, fontSize: 12 }}>{d.name}</span>
                <span style={{ fontWeight: 700, color: '#ef4444', fontSize: 13 }}>¥{d.cost.toFixed(0)}</span>
              </div>
            ))}
          </div>
        </div>

        {/* 任务完成TOP5 */}
        <div style={{ background: 'var(--panel)', borderRadius: 10, border: '1px solid #3b82f650', overflow: 'hidden' }}>
          <div style={{ padding: '8px 12px', background: 'linear-gradient(90deg, #3b82f620, transparent)', borderBottom: '1px solid var(--line)', display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 14 }}>📊</span>
            <span style={{ fontWeight: 700, fontSize: 12, color: '#3b82f6' }}>任务完成 TOP 5</span>
          </div>
          <div style={{ padding: 6 }}>
            {topTaskDepts.map((d, i) => (
              <div key={d.name} style={{ display: 'flex', alignItems: 'center', padding: '6px 8px', gap: 8, background: i === 0 ? '#3b82f615' : 'transparent', borderRadius: 6 }}>
                <span style={{ width: 18, height: 18, borderRadius: '50%', background: i === 0 ? '#3b82f6' : i === 1 ? '#60a5fa' : i === 2 ? '#93c5fd' : 'var(--panel2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: i < 3 ? '#fff' : 'var(--muted)' }}>{i + 1}</span>
                <span style={{ fontWeight: 600, flex: 1, fontSize: 12 }}>{d.name}</span>
                <span style={{ fontWeight: 700, color: '#3b82f6', fontSize: 13 }}>{d.tasks}个</span>
              </div>
            ))}
          </div>
        </div>

        {/* 低效率提醒 */}
        <div style={{ background: 'var(--panel)', borderRadius: 10, border: '1px solid #f59e0b50', overflow: 'hidden' }}>
          <div style={{ padding: '8px 12px', background: 'linear-gradient(90deg, #f59e0b20, transparent)', borderBottom: '1px solid var(--line)', display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 14 }}>⚠️</span>
            <span style={{ fontWeight: 700, fontSize: 12, color: '#f59e0b' }}>高成本/任务 提醒</span>
          </div>
          <div style={{ padding: 6 }}>
            {lowEfficiency.length > 0 ? lowEfficiency.map((p, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', padding: '6px 8px', gap: 8, borderRadius: 6 }}>
                <span style={{ width: 18, height: 18, borderRadius: '50%', background: '#f59e0b', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: '#fff' }}>!</span>
                <span style={{ fontWeight: 600, flex: 1, fontSize: 12 }}>{p.name}</span>
                <span style={{ fontSize: 10, color: 'var(--muted)' }}>{p.dept}</span>
                <span style={{ fontWeight: 700, color: '#f59e0b', fontSize: 13 }}>¥{p.efficiency}/个</span>
              </div>
            )) : (
              <div style={{ textAlign: 'center', padding: 20, color: '#22c55e', fontSize: 12 }}>✅ 效率正常</div>
            )}
          </div>
        </div>
      </div>

      {/* 个人成本网格 */}
      <div style={{ background: 'var(--panel)', borderRadius: 10, border: '1px solid var(--line)', overflow: 'hidden' }}>
        <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--line)', display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 14 }}>👥</span>
          <span style={{ fontWeight: 700, fontSize: 12 }}>个人成本明细 ({personCosts.length}人)</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: 4, padding: 8, maxHeight: 300, overflowY: 'auto' }}>
          {personCosts.map((p, i) => (
            <div key={i} style={{ padding: 8, background: 'var(--panel2)', borderRadius: 6, textAlign: 'center', border: `1px solid ${p.cost > avgCostPerTask * 5 ? '#ef444440' : 'var(--line)'}` }}>
              <div style={{ fontSize: 11, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</div>
              <div style={{ fontSize: 9, color: 'var(--muted)' }}>{p.dept}</div>
              <div style={{ fontSize: 12, fontWeight: 700, color: p.cost > 0 ? '#ef4444' : 'var(--muted)', marginTop: 4 }}>¥{p.cost.toFixed(0)}</div>
              <div style={{ fontSize: 9, color: '#22c55e' }}>{p.tasks}任务</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
