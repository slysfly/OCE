import { useEffect, useState } from 'react';
import { useStore } from '../store';
import { api } from '../api';

const FALLBACK_MODELS = [
  { id: 'anthropic/claude-sonnet-4-6', l: 'Claude Sonnet 4.6', p: 'Anthropic' },
  { id: 'anthropic/claude-opus-4-5', l: 'Claude Opus 4.5', p: 'Anthropic' },
  { id: 'anthropic/claude-haiku-3-5', l: 'Claude Haiku 3.5', p: 'Anthropic' },
  { id: 'openai/gpt-4o', l: 'GPT-4o', p: 'OpenAI' },
  { id: 'openai/gpt-4o-mini', l: 'GPT-4o Mini', p: 'OpenAI' },
  { id: 'google/gemini-2.5-pro', l: 'Gemini 2.5 Pro', p: 'Google' },
  { id: 'copilot/claude-sonnet-4', l: 'Claude Sonnet 4', p: 'Copilot' },
  { id: 'copilot/claude-opus-4.5', l: 'Claude Opus 4.5', p: 'Copilot' },
  { id: 'copilot/gpt-4o', l: 'GPT-4o', p: 'Copilot' },
  { id: 'copilot/gemini-2.5-pro', l: 'Gemini 2.5 Pro', p: 'Copilot' },
];

export default function ModelConfig() {
  const agentConfig = useStore((s) => s.agentConfig);
  const changeLog = useStore((s) => s.changeLog);
  const loadAgentConfig = useStore((s) => s.loadAgentConfig);
  const toast = useStore((s) => s.toast);

  const [selMap, setSelMap] = useState<Record<string, string>>({});
  const [statusMap, setStatusMap] = useState<Record<string, { cls: string; text: string }>>({});
  const [searchModel, setSearchModel] = useState('');

  useEffect(() => {
    loadAgentConfig();
  }, [loadAgentConfig]);

  useEffect(() => {
    if (agentConfig?.agents) {
      const m: Record<string, string> = {};
      agentConfig.agents.forEach((ag) => {
        m[ag.id] = ag.model;
      });
      setSelMap(m);
    }
  }, [agentConfig]);

  if (!agentConfig?.agents) {
    return <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>⚠️ 请先启动本地服务器</div>;
  }

  const models = agentConfig.knownModels?.length
    ? agentConfig.knownModels.map((m) => ({ id: m.id, l: m.label, p: m.provider }))
    : FALLBACK_MODELS;

  const handleSelect = (agentId: string, val: string) => {
    setSelMap((p) => ({ ...p, [agentId]: val }));
  };

  const resetMC = (agentId: string) => {
    const ag = agentConfig.agents.find((a) => a.id === agentId);
    if (ag) setSelMap((p) => ({ ...p, [agentId]: ag.model }));
  };

  const applyModel = async (agentId: string) => {
    const model = selMap[agentId];
    if (!model) return;
    setStatusMap((p) => ({ ...p, [agentId]: { cls: 'pending', text: '⟳ 提交中…' } }));
    try {
      const r = await api.setModel(agentId, model);
      if (r.ok) {
        setStatusMap((p) => ({ ...p, [agentId]: { cls: 'ok', text: '✅ 已提交，Gateway 重启中（约5秒）' } }));
        toast(agentId + ' 模型已更改', 'ok');
        setTimeout(() => loadAgentConfig(), 5500);
      } else {
        setStatusMap((p) => ({ ...p, [agentId]: { cls: 'err', text: '❌ ' + (r.error || '错误') } }));
      }
    } catch {
      setStatusMap((p) => ({ ...p, [agentId]: { cls: 'err', text: '❌ 无法连接服务器' } }));
    }
  };

  const filteredAgents = agentConfig.agents.filter(ag => {
    if (!searchModel) return true;
    const search = searchModel.toLowerCase();
    return ag.label?.toLowerCase().includes(search) || 
           ag.id?.toLowerCase().includes(search);
  });

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
          placeholder="🔍 搜索部门..."
          value={searchModel}
          onChange={(e) => setSearchModel(e.target.value)}
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
          <span style={{ fontSize: 11, color: 'var(--muted)' }}>Agent</span>
          <span style={{ fontSize: 18, fontWeight: 700, color: '#22c55e' }}>{agentConfig.agents.length}</span>
        </div>
      </div>

      {/* 模型网格 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 16 }}>
        {filteredAgents.map((ag) => {
          const sel = selMap[ag.id] || ag.model;
          const changed = sel !== ag.model;
          const st = statusMap[ag.id];
          
          const gradientColor = ag.id === 'assistant' ? '#f59e0b' : 
                               ag.id === 'product' ? '#3b82f6' :
                               ag.id === 'tech' ? '#22c55e' :
                               ag.id === 'dev' ? '#ef4444' :
                               '#6366f1';
          
          return (
            <div key={ag.id} style={{ 
              background: 'var(--panel)', 
              borderRadius: 16, 
              border: `1px solid ${changed ? gradientColor : 'var(--line)'}`, 
              overflow: 'hidden',
              boxShadow: changed ? `0 4px 16px ${gradientColor}33` : '0 4px 12px rgba(0,0,0,0.08)',
              transition: 'all 0.2s'
            }}>
              {/* Agent头部 */}
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
                  {ag.emoji || '🏛️'}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{ag.label}</div>
                  <div style={{ fontSize: 11, color: 'var(--muted)' }}>{ag.role}</div>
                </div>
                {changed && (
                  <div style={{
                    padding: '4px 10px',
                    background: `${gradientColor}22`,
                    borderRadius: 6,
                    fontSize: 10,
                    color: gradientColor,
                    fontWeight: 600
                  }}>
                    ⚡ 已修改
                  </div>
                )}
              </div>
              
              {/* 当前模型 */}
              <div style={{ padding: '12px 18px', borderBottom: '1px solid var(--line)' }}>
                <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 4 }}>当前模型</div>
                <div style={{ fontSize: 12, fontWeight: 600, fontFamily: 'monospace' }}>{ag.model}</div>
              </div>
              
              {/* 选择器 */}
              <div style={{ padding: 16 }}>
                <select 
                  value={sel} 
                  onChange={(e) => handleSelect(ag.id, e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: 8,
                    border: '1px solid var(--line)',
                    background: 'var(--bg)',
                    color: 'var(--text)',
                    fontSize: 12,
                    cursor: 'pointer'
                  }}
                >
                  {models.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.l} ({m.p})
                    </option>
                  ))}
                </select>
                
                {/* 按钮 */}
                <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                  <button
                    disabled={!changed}
                    onClick={() => applyModel(ag.id)}
                    style={{
                      flex: 1,
                      padding: '10px 12px',
                      background: changed 
                        ? `linear-gradient(135deg, ${gradientColor}, ${gradientColor}dd)` 
                        : 'var(--panel2)',
                      color: changed ? '#fff' : 'var(--muted)',
                      border: 'none',
                      borderRadius: 8,
                      fontSize: 12,
                      fontWeight: 500,
                      cursor: changed ? 'pointer' : 'not-allowed',
                      opacity: changed ? 1 : 0.5
                    }}
                  >
                    ✅ 应用
                  </button>
                  <button
                    onClick={() => resetMC(ag.id)}
                    style={{
                      padding: '10px 16px',
                      background: 'var(--panel2)',
                      border: '1px solid var(--line)',
                      borderRadius: 8,
                      fontSize: 12,
                      cursor: 'pointer'
                    }}
                  >
                    ↺ 重置
                  </button>
                </div>
                
                {/* 状态 */}
                {st && (
                  <div style={{ 
                    marginTop: 10, 
                    padding: '8px 12px',
                    background: st.cls === 'ok' ? '#22c55e15' : st.cls === 'err' ? '#ef444415' : '#f59e0b15',
                    borderRadius: 6,
                    fontSize: 11,
                    color: st.cls === 'ok' ? '#22c55e' : st.cls === 'err' ? '#ef4444' : '#f59e0b'
                  }}>
                    {st.text}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* 变更日志 */}
      <div style={{ marginTop: 24, background: 'var(--panel)', borderRadius: 12, border: '1px solid var(--line)', overflow: 'hidden' }}>
        <div style={{ 
          padding: '12px 18px', 
          borderBottom: '1px solid var(--line)',
          fontWeight: 600,
          fontSize: 13
        }}>
          📋 变更日志
        </div>
        <div style={{ padding: 12, maxHeight: 300, overflowY: 'auto' }}>
          {!changeLog?.length ? (
            <div style={{ fontSize: 12, color: 'var(--muted)', padding: 12, textAlign: 'center' }}>
              暂无变更记录
            </div>
          ) : (
            [...changeLog]
              .reverse()
              .slice(0, 15)
              .map((e, i) => (
                <div key={i} style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: 12,
                  padding: '10px 12px',
                  marginBottom: 6,
                  background: 'var(--panel2)',
                  borderRadius: 8,
                  fontSize: 12
                }}>
                  <span style={{ color: 'var(--muted)', minWidth: 130 }}>
                    {(e.at || '').substring(0, 16).replace('T', ' ')}
                  </span>
                  <span style={{ fontWeight: 600, color: '#6366f1', minWidth: 80 }}>{e.agentId}</span>
                  <span style={{ flex: 1 }}>
                    <b>{e.oldModel}</b> → <b style={{ color: '#22c55e' }}>{e.newModel}</b>
                  </span>
                  {e.rolledBack && (
                    <span style={{
                      color: '#ef4444',
                      fontSize: 10,
                      padding: '2px 6px',
                      background: '#ef444415',
                      borderRadius: 4,
                    }}>
                      ⚠ 已回滚
                    </span>
                  )}
                </div>
              ))
          )}
        </div>
      </div>
    </div>
  );
}
