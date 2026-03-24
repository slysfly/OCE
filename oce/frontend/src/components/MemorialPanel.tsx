import { useState } from 'react';
import { useStore, isOce, STATE_LABEL } from '../store';
import type { Task, FlowEntry } from '../api';

export default function MemorialPanel() {
  const liveStatus = useStore((s) => s.liveStatus);
  const [filter, setFilter] = useState('all');
  const [searchMem, setSearchMem] = useState('');
  const [detailTask, setDetailTask] = useState<Task | null>(null);
  const toast = useStore((s) => s.toast);

  const tasks = liveStatus?.tasks || [];
  let mems = tasks.filter((t) => isOce(t) && ['Done', 'Cancelled'].includes(t.state));
  if (filter !== 'all') mems = mems.filter((t) => t.state === filter);
  if (searchMem) {
    const search = searchMem.toLowerCase();
    mems = mems.filter(t => 
      t.title?.toLowerCase().includes(search) ||
      t.id?.toLowerCase().includes(search) ||
      t.org?.toLowerCase().includes(search)
    );
  }

  // 统计数据
  const totalDone = tasks.filter(t => isOce(t) && t.state === 'Done').length;
  const totalCancelled = tasks.filter(t => isOce(t) && t.state === 'Cancelled').length;

  const exportMemorial = (t: Task) => {
    const fl = t.flow_log || [];
    let md = `# 📜 任务记录 · ${t.title}\n\n`;
    md += `- **任务编号**: ${t.id}\n`;
    md += `- **状态**: ${t.state}\n`;
    md += `- **负责部门**: ${t.org}\n`;
    if (fl.length) {
      const startAt = fl[0].at ? fl[0].at.substring(0, 19).replace('T', ' ') : '未知';
      const endAt = fl[fl.length - 1].at ? fl[fl.length - 1].at.substring(0, 19).replace('T', ' ') : '未知';
      md += `- **开始时间**: ${startAt}\n`;
      md += `- **完成时间**: ${endAt}\n`;
    }
    md += `\n## 流转记录\n\n`;
    for (const f of fl) {
      md += `- **${f.from}** → **${f.to}**  \n  ${f.remark}  \n  _${(f.at || '').substring(0, 19)}_\n\n`;
    }
    if (t.output && t.output !== '-') md += `## 产出物\n\n\`${t.output}\`\n`;
    navigator.clipboard.writeText(md).then(
      () => toast('✅ 任务记录已复制为 Markdown', 'ok'),
      () => toast('复制失败', 'err')
    );
  };

  return (
    <div>
      {/* 搜索和统计栏 */}
      <div style={{ 
        display: 'flex', 
        gap: 12, 
        marginBottom: 20,
        padding: 16,
        background: 'linear-gradient(135deg, var(--panel), var(--panel2))',
        borderRadius: 12,
        border: '1px solid var(--line)'
      }}>
        <input
          type="text"
          placeholder="🔍 搜索任务记录..."
          value={searchMem}
          onChange={(e) => setSearchMem(e.target.value)}
          style={{
            flex: 1,
            padding: '10px 16px',
            borderRadius: 8,
            border: '1px solid var(--line)',
            background: 'var(--bg)',
            color: 'var(--text)',
            fontSize: 13
          }}
        />
        <div style={{
          padding: '10px 16px',
          background: 'linear-gradient(135deg, #22c55e22, #22c55e11)',
          borderRadius: 8,
          border: '1px solid #22c55e44',
          display: 'flex',
          alignItems: 'center',
          gap: 8
        }}>
          <span style={{ fontSize: 11, color: 'var(--muted)' }}>已完成</span>
          <span style={{ fontSize: 18, fontWeight: 700, color: '#22c55e' }}>{totalDone}</span>
        </div>
        <div style={{
          padding: '10px 16px',
          background: 'linear-gradient(135deg, #ef444422, #ef444411)',
          borderRadius: 8,
          border: '1px solid #ef444444',
          display: 'flex',
          alignItems: 'center',
          gap: 8
        }}>
          <span style={{ fontSize: 11, color: 'var(--muted)' }}>已取消</span>
          <span style={{ fontSize: 18, fontWeight: 700, color: '#ef4444' }}>{totalCancelled}</span>
        </div>
      </div>

      {/* 筛选按钮 */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, alignItems: 'center' }}>
        {[
          { key: 'all', label: '📊 全部', count: totalDone + totalCancelled },
          { key: 'Done', label: '✅ 已完成', count: totalDone },
          { key: 'Cancelled', label: '🚫 已取消', count: totalCancelled },
        ].map((f) => (
          <div
            key={f.key}
            onClick={() => setFilter(f.key)}
            style={{
              padding: '8px 16px',
              background: filter === f.key ? 'linear-gradient(135deg, #6366f1, #8b5cf6)' : 'var(--panel)',
              border: `1px solid ${filter === f.key ? '#6366f1' : 'var(--line)'}`,
              borderRadius: 8,
              cursor: 'pointer',
              fontSize: 12,
              fontWeight: 500,
              color: filter === f.key ? '#fff' : 'var(--text)',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              transition: 'all 0.15s'
            }}
          >
            {f.label}
            <span style={{
              padding: '2px 6px',
              background: filter === f.key ? 'rgba(255,255,255,0.2)' : 'var(--panel2)',
              borderRadius: 6,
              fontSize: 10
            }}>
              {f.count}
            </span>
          </div>
        ))}
      </div>

      {/* 任务卡片网格 */}
      {!mems.length ? (
        <div style={{ 
          textAlign: 'center', 
          padding: 60, 
          background: 'var(--panel)', 
          borderRadius: 12, 
          border: '1px dashed var(--line)' 
        }}>
          <div style={{ fontSize: 32, marginBottom: 10 }}>📜</div>
          <div style={{ fontSize: 14, color: 'var(--muted)' }}>暂无任务记录</div>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 6 }}>任务完成后自动生成记录</div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(380px, 1fr))', gap: 16 }}>
          {mems.map((t) => {
            const fl = t.flow_log || [];
            const depts = [...new Set(fl.map((f) => f.from).concat(fl.map((f) => f.to)).filter((x) => x && x !== '领导'))];
            const firstAt = fl.length ? (fl[0].at || '').substring(0, 16).replace('T', ' ') : '';
            const lastAt = fl.length ? (fl[fl.length - 1].at || '').substring(0, 16).replace('T', ' ') : '';
            const stIcon = t.state === 'Done' ? '✅' : '🚫';
            const gradientColor = t.state === 'Done' ? '#22c55e' : '#ef4444';
            
            return (
              <div 
                key={t.id} 
                onClick={() => setDetailTask(t)}
                style={{ 
                  background: 'var(--panel)', 
                  borderRadius: 16, 
                  border: '1px solid var(--line)', 
                  overflow: 'hidden',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                  transition: 'all 0.2s',
                  cursor: 'pointer'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'translateY(-2px)';
                  e.currentTarget.style.boxShadow = '0 8px 20px rgba(0,0,0,0.12)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.08)';
                }}
              >
                {/* 头部 */}
                <div style={{ 
                  padding: '14px 18px', 
                  background: `linear-gradient(135deg, ${gradientColor}22, ${gradientColor}11)`,
                  borderBottom: '1px solid var(--line)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10
                }}>
                  <div style={{
                    width: 36,
                    height: 36,
                    borderRadius: 10,
                    background: `${gradientColor}33`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 18
                  }}>
                    📜
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>
                      {stIcon} {t.title || t.id}
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--muted)' }}>
                      {t.id} · {t.org || '未分配'}
                    </div>
                  </div>
                  <div style={{
                    padding: '4px 10px',
                    background: `${gradientColor}22`,
                    borderRadius: 6,
                    fontSize: 11,
                    fontWeight: 600,
                    color: gradientColor
                  }}>
                    流转 {fl.length} 步
                  </div>
                </div>
                
                {/* 时间信息 */}
                <div style={{ padding: '12px 18px', borderBottom: '1px solid var(--line)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                    <div>
                      <span style={{ color: 'var(--muted)' }}>开始：</span>
                      <span style={{ fontWeight: 600 }}>{firstAt || '未知'}</span>
                    </div>
                    <div>
                      <span style={{ color: 'var(--muted)' }}>完成：</span>
                      <span style={{ fontWeight: 600 }}>{lastAt || firstAt}</span>
                    </div>
                  </div>
                </div>
                
                {/* 参与部门 */}
                <div style={{ padding: '12px 18px' }}>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {depts.slice(0, 5).map((d) => (
                      <span 
                        key={d}
                        style={{
                          padding: '4px 10px',
                          background: 'var(--panel2)',
                          borderRadius: 6,
                          fontSize: 10,
                          border: '1px solid var(--line)'
                        }}
                      >
                        {d}
                      </span>
                    ))}
                    {depts.length > 5 && (
                      <span style={{
                        padding: '4px 10px',
                        background: 'var(--panel2)',
                        borderRadius: 6,
                        fontSize: 10,
                        color: 'var(--muted)'
                      }}>
                        +{depts.length - 5}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Detail Modal */}
      {detailTask && (
        <MemorialDetailModal task={detailTask} onClose={() => setDetailTask(null)} onExport={exportMemorial} />
      )}
    </div>
  );
}

function MemorialDetailModal({
  task: t,
  onClose,
  onExport,
}: {
  task: Task;
  onClose: () => void;
  onExport: (t: Task) => void;
}) {
  const fl = t.flow_log || [];
  const st = t.state || 'Unknown';
  const stIcon = st === 'Done' ? '✅' : st === 'Cancelled' ? '🚫' : '🔄';
  const depts = [...new Set(fl.map((f) => f.from).concat(fl.map((f) => f.to)).filter((x) => x && x !== '领导'))];

  // Reconstruct phases
  const originLog: FlowEntry[] = [];
  const planLog: FlowEntry[] = [];
  const reviewLog: FlowEntry[] = [];
  const execLog: FlowEntry[] = [];
  const resultLog: FlowEntry[] = [];
  for (const f of fl) {
    if (f.from === '领导') originLog.push(f);
    else if (f.to === '产品部' || f.from === '产品部') planLog.push(f);
    else if (f.to === '架构委员会' || f.from === '架构委员会') reviewLog.push(f);
    else if (f.remark && (f.remark.includes('完成') || f.remark.includes('汇报'))) resultLog.push(f);
    else execLog.push(f);
  }

  const renderPhase = (title: string, icon: string, items: FlowEntry[], color: string) => {
    if (!items.length) return null;
    return (
      <div style={{ marginBottom: 18 }}>
        <div style={{ 
          fontSize: 13, 
          fontWeight: 700, 
          marginBottom: 10,
          padding: '8px 12px',
          background: `${color}15`,
          borderRadius: 8,
          borderLeft: `3px solid ${color}`
        }}>
          {icon} {title}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {items.map((f, i) => {
            const isSuccess = f.remark?.includes('✅');
            const isReject = f.remark?.includes('驳');
            const dotColor = isSuccess ? '#22c55e' : isReject ? '#ef4444' : '#6366f1';
            
            return (
              <div 
                key={i}
                style={{
                  padding: '10px 14px',
                  background: 'var(--panel2)',
                  borderRadius: 8,
                  border: '1px solid var(--line)',
                  borderLeft: `3px solid ${dotColor}`
                }}
              >
                <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', marginBottom: 6 }}>
                  <span style={{ fontWeight: 600, fontSize: 12 }}>{f.from}</span>
                  <span style={{ color: 'var(--muted)', fontSize: 10 }}>→</span>
                  <span style={{ fontWeight: 600, fontSize: 12, color: '#6366f1' }}>{f.to}</span>
                </div>
                <div style={{ fontSize: 12, marginBottom: 4, color: 'var(--text)' }}>{f.remark}</div>
                <div style={{ fontSize: 10, color: 'var(--muted)' }}>
                  {(f.at || '').substring(0, 19).replace('T', ' ')}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div 
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0,0,0,0.6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: 20
      }}
      onClick={onClose}
    >
      <div 
        style={{
          background: 'var(--bg)',
          borderRadius: 16,
          maxWidth: 900,
          width: '100%',
          maxHeight: '90vh',
          overflow: 'auto',
          boxShadow: '0 20px 60px rgba(0,0,0,0.3)'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 头部 */}
        <div style={{ 
          padding: '20px 24px', 
          borderBottom: '1px solid var(--line)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start'
        }}>
          <div>
            <div style={{ fontSize: 11, color: '#6366f1', fontWeight: 700, letterSpacing: '.04em', marginBottom: 4 }}>
              {t.id}
            </div>
            <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 8 }}>
              {stIcon} {t.title || t.id}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{
                padding: '4px 12px',
                background: st === 'Done' ? '#22c55e22' : '#ef444422',
                borderRadius: 6,
                fontSize: 11,
                fontWeight: 600,
                color: st === 'Done' ? '#22c55e' : '#ef4444'
              }}>
                {STATE_LABEL[st] || st}
              </span>
              <span style={{ fontSize: 11, color: 'var(--muted)' }}>{t.org}</span>
              <span style={{ fontSize: 11, color: 'var(--muted)' }}>流转 {fl.length} 步</span>
            </div>
          </div>
          <button 
            onClick={onClose}
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              border: '1px solid var(--line)',
              background: 'var(--panel)',
              cursor: 'pointer',
              fontSize: 16
            }}
          >
            ✕
          </button>
        </div>

        {/* 内容 */}
        <div style={{ padding: 24 }}>
          {t.now && (
            <div style={{ 
              background: 'linear-gradient(135deg, #6366f115, #8b5cf615)', 
              border: '1px solid #6366f144', 
              borderRadius: 12, 
              padding: '14px 18px', 
              marginBottom: 20, 
              fontSize: 12,
              borderLeft: '3px solid #6366f1'
            }}>
              <div style={{ fontWeight: 600, marginBottom: 4, color: '#6366f1' }}>当前状态</div>
              {t.now}
            </div>
          )}

          {renderPhase('任务原文', '👑', originLog, '#f59e0b')}
          {renderPhase('产品规划', '📋', planLog, '#3b82f6')}
          {renderPhase('架构评审', '🔍', reviewLog, '#8b5cf6')}
          {renderPhase('各部门执行', '⚔️', execLog, '#22c55e')}
          {renderPhase('汇总汇报', '📨', resultLog, '#6366f1')}

          {t.output && t.output !== '-' && (
            <div style={{ 
              marginTop: 20, 
              padding: '14px 18px',
              background: 'var(--panel)',
              borderRadius: 12,
              border: '1px solid var(--line)'
            }}>
              <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 6 }}>📦 产出物</div>
              <code style={{ fontSize: 11, wordBreak: 'break-all', color: '#6366f1' }}>{t.output}</code>
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, marginTop: 20, justifyContent: 'flex-end' }}>
            <button 
              onClick={() => onExport(t)} 
              style={{
                padding: '10px 20px',
                background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                color: '#fff',
                border: 'none',
                borderRadius: 8,
                fontSize: 12,
                fontWeight: 500,
                cursor: 'pointer'
              }}
            >
              📋 复制任务记录
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
