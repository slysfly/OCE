import { useEffect, useState } from 'react';
import { useStore, DEPTS, DEPT_SUB_AGENTS } from '../store';
import { api, RemoteSkillItem } from '../api';

// 社区知名 Skills 源快选列表
const COMMUNITY_SOURCES = [
  {
    label: 'obra/superpowers',
    emoji: '⚡',
    stars: '66.9k',
    desc: '完整开发工作流技能集',
    skills: [
      { name: 'brainstorming', url: 'https://raw.gitfinancesercontent.com/obra/superpowers/refs/heads/main/skills/brainstorming/SKILL.md' },
      { name: 'test-driven-development', url: 'https://raw.gitfinancesercontent.com/obra/superpowers/refs/heads/main/skills/test-driven-development/SKILL.md' },
      { name: 'systematic-debugging', url: 'https://raw.gitfinancesercontent.com/obra/superpowers/refs/heads/main/skills/systematic-debugging/SKILL.md' },
      { name: 'subagent-driven-development', url: 'https://raw.gitfinancesercontent.com/obra/superpowers/refs/heads/main/skills/subagent-driven-development/SKILL.md' },
      { name: 'writing-plans', url: 'https://raw.gitfinancesercontent.com/obra/superpowers/refs/heads/main/skills/writing-plans/SKILL.md' },
      { name: 'executing-plans', url: 'https://raw.gitfinancesercontent.com/obra/superpowers/refs/heads/main/skills/executing-plans/SKILL.md' },
      { name: 'requesting-code-review', url: 'https://raw.gitfinancesercontent.com/obra/superpowers/refs/heads/main/skills/requesting-code-review/SKILL.md' },
      { name: 'root-cause-tracing', url: 'https://raw.gitfinancesercontent.com/obra/superpowers/refs/heads/main/skills/root-cause-tracing/SKILL.md' },
      { name: 'verification-before-completion', url: 'https://raw.gitfinancesercontent.com/obra/superpowers/refs/heads/main/skills/verification-before-completion/SKILL.md' },
      { name: 'dispatching-parallel-agents', url: 'https://raw.gitfinancesercontent.com/obra/superpowers/refs/heads/main/skills/dispatching-parallel-agents/SKILL.md' },
    ],
  },
  {
    label: 'anthropics/skills',
    emoji: '🏛️',
    stars: '官方',
    desc: 'Anthropic 官方技能库',
    skills: [
      { name: 'docx', url: 'https://raw.gitfinancesercontent.com/anthropics/skills/main/skills/docx/SKILL.md' },
      { name: 'pdf', url: 'https://raw.gitfinancesercontent.com/anthropics/skills/main/skills/pdf/SKILL.md' },
      { name: 'xlsx', url: 'https://raw.gitfinancesercontent.com/anthropics/skills/main/skills/xlsx/SKILL.md' },
      { name: 'pptx', url: 'https://raw.gitfinancesercontent.com/anthropics/skills/main/skills/pptx/SKILL.md' },
      { name: 'mcp-builder', url: 'https://raw.gitfinancesercontent.com/anthropics/skills/main/skills/mcp-builder/SKILL.md' },
      { name: 'frontend-design', url: 'https://raw.gitfinancesercontent.com/anthropics/skills/main/skills/frontend-design/SKILL.md' },
      { name: 'web-artifacts-builder', url: 'https://raw.gitfinancesercontent.com/anthropics/skills/main/skills/web-artifacts-builder/SKILL.md' },
      { name: 'webapp-testing', url: 'https://raw.gitfinancesercontent.com/anthropics/skills/main/skills/webapp-testing/SKILL.md' },
      { name: 'algorithmic-art', url: 'https://raw.gitfinancesercontent.com/anthropics/skills/main/skills/algorithmic-art/SKILL.md' },
      { name: 'canvas-design', url: 'https://raw.gitfinancesercontent.com/anthropics/skills/main/skills/canvas-design/SKILL.md' },
    ],
  },
  {
    label: 'ComposioHQ/awesome-claude-skills',
    emoji: '🌐',
    stars: '39.2k',
    desc: '100+ 社区精选技能',
    skills: [
      { name: 'github-integration', url: 'https://raw.gitfinancesercontent.com/ComposioHQ/awesome-claude-skills/master/github-integration/SKILL.md' },
      { name: 'data-analysis', url: 'https://raw.gitfinancesercontent.com/ComposioHQ/awesome-claude-skills/master/data-analysis/SKILL.md' },
      { name: 'code-review', url: 'https://raw.gitfinancesercontent.com/ComposioHQ/awesome-claude-skills/master/code-review/SKILL.md' },
    ],
  },
];

export default function SkillsConfig() {
  const agentConfig = useStore((s) => s.agentConfig);
  const loadAgentConfig = useStore((s) => s.loadAgentConfig);
  const toast = useStore((s) => s.toast);
  const officialsData = useStore((s) => s.officialsData);

  // 统一使用 officialsData 的 totals 数据
  const totalEmployees = officialsData?.totals?.total_employees || officialsData?.employees?.length || 0;
  const totalDepartments = officialsData?.totals?.total_departments || DEPTS.length;

  // 本地技能状态
  const [skillModal, setSkillModal] = useState<{ agentId: string; name: string; content: string; path: string } | null>(null);
  const [addForm, setAddForm] = useState<{ agentId: string; agentLabel: string } | null>(null);
  const [formData, setFormData] = useState({ name: '', desc: '', trigger: '' });
  const [submitting, setSubmitting] = useState(false);

  // 主 Tab 切换
  const [activeTab, setActiveTab] = useState<'local' | 'remote' | 'employee'>('local');

  // 远程技能状态
  const [remoteSkills, setRemoteSkills] = useState<RemoteSkillItem[]>([]);
  const [remoteLoading, setRemoteLoading] = useState(false);
  const [addRemoteForm, setAddRemoteForm] = useState(false);
  const [remoteFormData, setRemoteFormData] = useState({ agentId: '', skillName: '', sourceUrl: '', description: '' });
  const [remoteSubmitting, setRemoteSubmitting] = useState(false);
  const [updatingSkill, setUpdatingSkill] = useState<string | null>(null);
  const [removingSkill, setRemovingSkill] = useState<string | null>(null);
  const [quickPickSource, setQuickPickSource] = useState<(typeof COMMUNITY_SOURCES)[0] | null>(null);
  const [quickPickAgent, setQuickPickAgent] = useState('');

  useEffect(() => {
    loadAgentConfig();
  }, [loadAgentConfig]);

  useEffect(() => {
    if (activeTab === 'remote') loadRemoteSkills();
  }, [activeTab]);

  const loadRemoteSkills = async () => {
    setRemoteLoading(true);
    try {
      const r = await api.remoteSkillsList();
      if (r.ok) setRemoteSkills(r.remoteSkills || []);
    } catch {
      toast('远程技能列表加载失败', 'err');
    }
    setRemoteLoading(false);
  };

  const openSkill = async (agentId: string, skillName: string) => {
    setSkillModal({ agentId, name: skillName, content: '⟳ 加载中…', path: '' });
    try {
      const r = await api.skillContent(agentId, skillName);
      if (r.ok) {
        setSkillModal({ agentId, name: skillName, content: r.content || '', path: r.path || '' });
      } else {
        setSkillModal({ agentId, name: skillName, content: '❌ ' + (r.error || '无法读取'), path: '' });
      }
    } catch {
      setSkillModal({ agentId, name: skillName, content: '❌ 服务器连接失败', path: '' });
    }
  };

  const openAddForm = (agentId: string, agentLabel: string) => {
    setAddForm({ agentId, agentLabel });
    setFormData({ name: '', desc: '', trigger: '' });
  };

  const submitAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addForm || !formData.name) return;
    setSubmitting(true);
    try {
      const r = await api.addSkill(addForm.agentId, formData.name, formData.desc, formData.trigger);
      if (r.ok) {
        toast(`✅ 技能 ${formData.name} 已添加到 ${addForm.agentLabel}`, 'ok');
        setAddForm(null);
        loadAgentConfig();
      } else {
        toast(r.error || '添加失败', 'err');
      }
    } catch {
      toast('服务器连接失败', 'err');
    }
    setSubmitting(false);
  };

  const submitAddRemote = async (e: React.FormEvent) => {
    e.preventDefault();
    const { agentId, skillName, sourceUrl, description } = remoteFormData;
    if (!agentId || !skillName || !sourceUrl) return;
    setRemoteSubmitting(true);
    try {
      const r = await api.addRemoteSkill(agentId, skillName, sourceUrl, description);
      if (r.ok) {
        toast(`✅ 远程技能 ${skillName} 已添加到 ${agentId}`, 'ok');
        setAddRemoteForm(false);
        setRemoteFormData({ agentId: '', skillName: '', sourceUrl: '', description: '' });
        loadRemoteSkills();
        loadAgentConfig();
      } else {
        toast(r.error || '添加失败', 'err');
      }
    } catch {
      toast('服务器连接失败', 'err');
    }
    setRemoteSubmitting(false);
  };

  const handleUpdate = async (skill: RemoteSkillItem) => {
    const key = `${skill.agentId}/${skill.skillName}`;
    setUpdatingSkill(key);
    try {
      const r = await api.updateRemoteSkill(skill.agentId, skill.skillName);
      if (r.ok) {
        toast(`✅ 技能 ${skill.skillName} 已更新`, 'ok');
        loadRemoteSkills();
      } else {
        toast(r.error || '更新失败', 'err');
      }
    } catch {
      toast('服务器连接失败', 'err');
    }
    setUpdatingSkill(null);
  };

  const handleRemove = async (skill: RemoteSkillItem) => {
    const key = `${skill.agentId}/${skill.skillName}`;
    setRemovingSkill(key);
    try {
      const r = await api.removeRemoteSkill(skill.agentId, skill.skillName);
      if (r.ok) {
        toast(`🗑️ 技能 ${skill.skillName} 已移除`, 'ok');
        loadRemoteSkills();
        loadAgentConfig();
      } else {
        toast(r.error || '移除失败', 'err');
      }
    } catch {
      toast('服务器连接失败', 'err');
    }
    setRemovingSkill(null);
  };

  const handleQuickImport = async (skillUrl: string, skillName: string) => {
    if (!quickPickAgent) { toast('请先选择目标 Agent', 'err'); return; }
    try {
      const r = await api.addRemoteSkill(quickPickAgent, skillName, skillUrl, '');
      if (r.ok) {
        toast(`✅ ${skillName} → ${quickPickAgent}`, 'ok');
        loadRemoteSkills();
        loadAgentConfig();
      } else {
        toast(r.error || '导入失败', 'err');
      }
    } catch {
      toast('服务器连接失败', 'err');
    }
  };

  if (!agentConfig?.agents) {
    return <div className="empty">无法加载</div>;
  }

  // ── 本地技能面板 ──
  // ── 本地技能面板 ──
  const [localSearch, setLocalSearch] = useState('');
  
  const filteredAgents = agentConfig.agents.filter(ag => {
    if (!localSearch) return true;
    const search = localSearch.toLowerCase();
    return ag.label?.toLowerCase().includes(search) || 
           ag.id?.toLowerCase().includes(search);
  });

  const localPanel = (
    <div>
      {/* 搜索栏 */}
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
          placeholder="🔍 搜索部门或技能..."
          value={localSearch}
          onChange={(e) => setLocalSearch(e.target.value)}
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
          <span style={{ fontSize: 11, color: 'var(--muted)' }}>总技能</span>
          <span style={{ fontSize: 18, fontWeight: 700, color: '#22c55e' }}>
            {agentConfig.agents.reduce((n, a) => n + (a.skills?.length || 0), 0)}
          </span>
        </div>
      </div>

      {/* 部门网格 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: 16 }}>
        {filteredAgents.map((ag) => {
          const skillCount = (ag.skills || []).length;
          const gradientColor = ag.id === 'assistant' ? '#f59e0b' : 
                               ag.id === 'product' ? '#3b82f6' :
                               ag.id === 'tech' ? '#22c55e' :
                               ag.id === 'dev' ? '#ef4444' :
                               '#6366f1';
          
          return (
            <div key={ag.id} style={{ 
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
              {/* 部门头部 */}
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
                  <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                    {ag.role}
                  </div>
                </div>
                <div style={{
                  padding: '4px 12px',
                  background: `${gradientColor}22`,
                  borderRadius: 8,
                  fontSize: 13,
                  fontWeight: 600,
                  color: gradientColor
                }}>
                  {skillCount} 技能
                </div>
              </div>
              
              {/* 技能列表 */}
              <div style={{ padding: 12, maxHeight: 280, overflowY: 'auto' }}>
                {!skillCount ? (
                  <div style={{ 
                    textAlign: 'center', 
                    color: 'var(--muted)', 
                    fontSize: 12, 
                    padding: 30,
                    background: 'var(--panel2)',
                    borderRadius: 8
                  }}>
                    暂无技能配置
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {(ag.skills || []).map((sk, idx) => (
                      <div 
                        key={sk.name || idx} 
                        onClick={() => openSkill(ag.id, sk.name)}
                        style={{ 
                          padding: '10px 12px', 
                          background: 'var(--panel2)', 
                          borderRadius: 8,
                          border: '1px solid var(--line)',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 10,
                          cursor: 'pointer',
                          transition: 'all 0.15s'
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = 'var(--bg)';
                          e.currentTarget.style.borderColor = gradientColor;
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = 'var(--panel2)';
                          e.currentTarget.style.borderColor = 'var(--line)';
                        }}
                      >
                        <div style={{
                          width: 28,
                          height: 28,
                          borderRadius: 6,
                          background: `${gradientColor}22`,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: 12
                        }}>
                          📦
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 500, fontSize: 12 }}>{sk.name}</div>
                          <div style={{ fontSize: 10, color: 'var(--muted)' }}>
                            {sk.description?.substring(0, 40) || '暂无描述'}
                          </div>
                        </div>
                        <span style={{ color: 'var(--muted)', fontSize: 16 }}>›</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              
              {/* 底部操作 */}
              <div style={{ 
                padding: '10px 16px', 
                borderTop: '1px solid var(--line)',
                display: 'flex',
                gap: 8
              }}>
                <button
                  onClick={() => openAddForm(ag.id, ag.label)}
                  style={{
                    flex: 1,
                    padding: '8px 12px',
                    background: `linear-gradient(135deg, ${gradientColor}, ${gradientColor}dd)`,
                    color: '#fff',
                    border: 'none',
                    borderRadius: 8,
                    fontSize: 12,
                    fontWeight: 500,
                    cursor: 'pointer'
                  }}
                >
                  ➕ 添加技能
                </button>
                <button
                  onClick={() => {/* 批量导入 */}}
                  style={{
                    padding: '8px 12px',
                    background: 'var(--panel2)',
                    border: '1px solid var(--line)',
                    borderRadius: 8,
                    fontSize: 12,
                    cursor: 'pointer'
                  }}
                >
                  📥 导入
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  // ── 远程技能面板 ──
  // ── 远程技能面板 ──
  const [remoteSearch, setRemoteSearch] = useState('');
  
  const filteredRemoteSkills = remoteSkills.filter(sk => {
    if (!remoteSearch) return true;
    const search = remoteSearch.toLowerCase();
    return sk.skillName?.toLowerCase().includes(search) || 
           sk.description?.toLowerCase().includes(search);
  });

  const remotePanel = (
    <div>
      {/* 增强的操作栏 */}
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
          placeholder="🔍 搜索远程技能..."
          value={remoteSearch}
          onChange={(e) => setRemoteSearch(e.target.value)}
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
        <button
          style={{ 
            padding: '10px 20px', 
            background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', 
            color: '#fff', 
            border: 'none', 
            borderRadius: 8, 
            cursor: 'pointer', 
            fontWeight: 600, 
            fontSize: 13,
            boxShadow: '0 4px 12px rgba(99, 102, 241, 0.3)'
          }}
          onClick={() => { setAddRemoteForm(true); setQuickPickSource(null); }}
        >
          ➕ 添加远程 Skill
        </button>
        <button
          style={{ 
            padding: '10px 16px', 
            background: 'transparent', 
            color: 'var(--acc)', 
            border: '1px solid var(--acc)', 
            borderRadius: 8, 
            cursor: 'pointer', 
            fontSize: 12 
          }}
          onClick={loadRemoteSkills}
        >
          ⟳ 刷新
        </button>
        <div style={{
          padding: '10px 16px',
          background: 'linear-gradient(135deg, #8b5cf622, #8b5cf611)',
          borderRadius: 8,
          border: '1px solid #8b5cf644',
          display: 'flex',
          alignItems: 'center',
          gap: 8
        }}>
          <span style={{ fontSize: 11, color: 'var(--muted)' }}>已安装</span>
          <span style={{ fontSize: 18, fontWeight: 700, color: '#8b5cf6' }}>{remoteSkills.length}</span>
        </div>
      </div>

      {/* 社区快选区 */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', letterSpacing: '.06em', marginBottom: 10 }}>
          🌐 社区技能源 — 一键导入
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {COMMUNITY_SOURCES.map((src) => (
            <div
              key={src.label}
              onClick={() => setQuickPickSource(quickPickSource?.label === src.label ? null : src)}
              style={{
                padding: '8px 14px',
                background: quickPickSource?.label === src.label ? '#0d1f45' : 'var(--panel)',
                border: `1px solid ${quickPickSource?.label === src.label ? 'var(--acc)' : 'var(--line)'}`,
                borderRadius: 10,
                cursor: 'pointer',
                fontSize: 12,
                transition: 'all .15s',
              }}
            >
              <span style={{ marginRight: 6 }}>{src.emoji}</span>
              <b style={{ color: 'var(--text)' }}>{src.label}</b>
              <span style={{ marginLeft: 6, color: '#f0b429', fontSize: 11 }}>★ {src.stars}</span>
              <span style={{ marginLeft: 8, color: 'var(--muted)' }}>{src.desc}</span>
            </div>
          ))}
        </div>

        {quickPickSource && (
          <div style={{ marginTop: 14, background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 12, padding: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
              <span style={{ fontSize: 12, fontWeight: 600 }}>目标 Agent：</span>
              <select
                value={quickPickAgent}
                onChange={(e) => setQuickPickAgent(e.target.value)}
                style={{ padding: '6px 10px', background: 'var(--bg)', border: '1px solid var(--line)', borderRadius: 6, color: 'var(--text)', fontSize: 12 }}
              >
                <option value="">— 选择 Agent —</option>
                {agentConfig.agents.map((ag) => (
                  <option key={ag.id} value={ag.id}>{ag.emoji} {ag.label} ({ag.id})</option>
                ))}
              </select>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 8 }}>
              {quickPickSource.skills.map((sk) => {
                const alreadyAdded = remoteSkills.some((r) => r.skillName === sk.name && r.agentId === quickPickAgent);
                return (
                  <div
                    key={sk.name}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '8px 12px', background: 'var(--panel2)', borderRadius: 8,
                      border: '1px solid var(--line)',
                    }}
                  >
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 600 }}>📦 {sk.name}</div>
                      <div style={{ fontSize: 10, color: 'var(--muted)', wordBreak: 'break-all', maxWidth: 180 }}>{sk.url.split('/').slice(-2).join('/')}</div>
                    </div>
                    {alreadyAdded ? (
                      <span style={{ fontSize: 10, color: '#4caf88', fontWeight: 600 }}>✓ 已导入</span>
                    ) : (
                      <button
                        onClick={() => handleQuickImport(sk.url, sk.name)}
                        style={{ padding: '4px 10px', background: 'var(--acc)', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 11, whiteSpace: 'nowrap' }}
                      >
                        导入
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* 已添加的远程技能列表 */}
      {remoteLoading ? (
        <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--muted)', fontSize: 13 }}>⟳ 加载中…</div>
      ) : remoteSkills.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px', background: 'var(--panel)', borderRadius: 12, border: '1px dashed var(--line)' }}>
          <div style={{ fontSize: 32, marginBottom: 10 }}>🌐</div>
          <div style={{ fontSize: 14, color: 'var(--muted)' }}>尚无远程技能</div>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 6 }}>从社区技能源快速导入，或手动添加 URL</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {remoteSkills.map((sk) => {
            const key = `${sk.agentId}/${sk.skillName}`;
            const isUpdating = updatingSkill === key;
            const isRemoving = removingSkill === key;
            const agInfo = agentConfig.agents.find((a) => a.id === sk.agentId);
            return (
              <div
                key={key}
                style={{
                  background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 12, padding: '14px 18px',
                  display: 'grid', gridTemplateColumns: '1fr auto', gap: 12, alignItems: 'center',
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                    <span style={{ fontSize: 14, fontWeight: 700 }}>📦 {sk.skillName}</span>
                    <span style={{
                      fontSize: 10, padding: '2px 8px', borderRadius: 999,
                      background: sk.status === 'valid' ? '#0d3322' : '#3d1111',
                      color: sk.status === 'valid' ? '#4caf88' : '#ff5270',
                      fontWeight: 600,
                    }}>
                      {sk.status === 'valid' ? '✓ 有效' : '✗ 文件丢失'}
                    </span>
                    <span style={{ fontSize: 11, color: 'var(--muted)', background: 'var(--panel2)', padding: '2px 8px', borderRadius: 6 }}>
                      {agInfo?.emoji} {agInfo?.label || sk.agentId}
                    </span>
                  </div>
                  {sk.description && (
                    <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 4 }}>{sk.description}</div>
                  )}
                  <div style={{ fontSize: 10, color: 'var(--muted)', display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                    <span>🔗 <a href={sk.sourceUrl} target="_blank" rel="noreferrer" style={{ color: 'var(--acc)', textDecoration: 'none' }}>{sk.sourceUrl.length > 60 ? sk.sourceUrl.slice(0, 60) + '…' : sk.sourceUrl}</a></span>
                    <span>📅 {sk.lastUpdated ? sk.lastUpdated.slice(0, 10) : sk.addedAt?.slice(0, 10)}</span>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    onClick={() => openSkill(sk.agentId, sk.skillName)}
                    style={{ padding: '6px 12px', background: 'transparent', color: 'var(--muted)', border: '1px solid var(--line)', borderRadius: 6, cursor: 'pointer', fontSize: 11 }}
                  >
                    查看
                  </button>
                  <button
                    onClick={() => handleUpdate(sk)}
                    disabled={isUpdating}
                    style={{ padding: '6px 12px', background: 'transparent', color: 'var(--acc)', border: '1px solid var(--acc)', borderRadius: 6, cursor: 'pointer', fontSize: 11 }}
                  >
                    {isUpdating ? '⟳' : '更新'}
                  </button>
                  <button
                    onClick={() => handleRemove(sk)}
                    disabled={isRemoving}
                    style={{ padding: '6px 12px', background: 'transparent', color: '#ff5270', border: '1px solid #ff5270', borderRadius: 6, cursor: 'pointer', fontSize: 11 }}
                  >
                    {isRemoving ? '⟳' : '删除'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );

  // ── 员工技能面板 ──
  const [searchEmp, setSearchEmp] = useState('');
  const [selectedDept, setSelectedDept] = useState<string | null>(null);
  const [expandedEmp, setExpandedEmp] = useState<string | null>(null);
  
  // 过滤员工
  const filteredDepts = (DEPTS || []).filter(dept => {
    if (!dept) return false;
    if (selectedDept && dept.id !== selectedDept) return false;
    return true;
  });
  
  const employeePanel = (
    <div>
      {/* 顶部搜索和过滤栏 */}
      <div style={{ 
        display: 'flex', 
        gap: 12, 
        marginBottom: 20,
        padding: 16,
        background: 'linear-gradient(135deg, var(--panel), var(--panel2))',
        borderRadius: 12,
        border: '1px solid var(--line)'
      }}>
        <div style={{ flex: 1 }}>
          <input
            type="text"
            placeholder="🔍 搜索员工姓名、职位..."
            value={searchEmp}
            onChange={(e) => setSearchEmp(e.target.value)}
            style={{
              width: '100%',
              padding: '10px 16px',
              borderRadius: 8,
              border: '1px solid var(--line)',
              background: 'var(--bg)',
              color: 'var(--text)',
              fontSize: 13
            }}
          />
        </div>
        <select
          value={selectedDept || ''}
          onChange={(e) => setSelectedDept(e.target.value || null)}
          style={{
            padding: '10px 16px',
            borderRadius: 8,
            border: '1px solid var(--line)',
            background: 'var(--bg)',
            color: 'var(--text)',
            fontSize: 13,
            cursor: 'pointer'
          }}
        >
          <option value="">全部部门</option>
          {DEPTS.map(d => (
            <option key={d.id} value={d.id}>{d.emoji} {d.label}</option>
          ))}
        </select>
        <button
          style={{
            padding: '10px 20px',
            background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
            color: '#fff',
            border: 'none',
            borderRadius: 8,
            fontSize: 13,
            fontWeight: 600,
            cursor: 'pointer',
            boxShadow: '0 4px 12px rgba(99, 102, 241, 0.3)'
          }}
          onClick={() => {/* 批量添加技能 */}}
        >
          ⚡ 批量配置
        </button>
      </div>
      
      {/* 统计卡片 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
        <div style={{ 
          padding: 16, 
          background: 'linear-gradient(135deg, #22c55e22, #22c55e11)', 
          borderRadius: 12,
          border: '1px solid #22c55e44'
        }}>
          <div style={{ fontSize: 11, color: 'var(--muted)' }}>总员工数</div>
          <div style={{ fontSize: 28, fontWeight: 700, color: '#22c55e' }}>
            {totalEmployees}
          </div>
        </div>
        <div style={{ 
          padding: 16, 
          background: 'linear-gradient(135deg, #3b82f622, #3b82f611)', 
          borderRadius: 12,
          border: '1px solid #3b82f644'
        }}>
          <div style={{ fontSize: 11, color: 'var(--muted)' }}>部门数量</div>
          <div style={{ fontSize: 28, fontWeight: 700, color: '#3b82f6' }}>{totalDepartments}</div>
        </div>
        <div style={{ 
          padding: 16, 
          background: 'linear-gradient(135deg, #f59e0b22, #f59e0b11)', 
          borderRadius: 12,
          border: '1px solid #f59e0b44'
        }}>
          <div style={{ fontSize: 11, color: 'var(--muted)' }}>已配置技能</div>
          <div style={{ fontSize: 28, fontWeight: 700, color: '#f59e0b' }}>
            {agentConfig.agents.reduce((n, a) => n + (a.skills?.length || 0), 0)}
          </div>
        </div>
        <div style={{ 
          padding: 16, 
          background: 'linear-gradient(135deg, #8b5cf622, #8b5cf611)', 
          borderRadius: 12,
          border: '1px solid #8b5cf644'
        }}>
          <div style={{ fontSize: 11, color: 'var(--muted)' }}>人均技能</div>
          <div style={{ fontSize: 28, fontWeight: 700, color: '#8b5cf6' }}>
            {totalEmployees > 0 
              ? Math.round(agentConfig.agents.reduce((n, a) => n + (a.skills?.length || 0), 0) / totalEmployees * 10) / 10 
              : 0}
          </div>
        </div>
      </div>
      
      {/* 员工网格 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
        {filteredDepts.filter(Boolean).map((dept) => {
          if (!dept || !dept.id) return null;
          const employees = DEPT_SUB_AGENTS[dept.id] || [];
          const deptAgent = agentConfig.agents.find((a) => a.id === dept.id);
          const deptSkills = deptAgent?.skills || [];
          
          // 过滤搜索
          const filteredEmps = employees.filter((emp: any) => {
            if (searchEmp) {
              const search = searchEmp.toLowerCase();
              return emp.name?.toLowerCase().includes(search) || 
                     emp.role?.toLowerCase().includes(search);
            }
            return true;
          });
          
          if (filteredEmps.length === 0 && !searchEmp) return null;
          
          return (
            <div key={dept.id} style={{ 
              background: 'var(--panel)', 
              borderRadius: 16, 
              border: '1px solid var(--line)', 
              overflow: 'hidden',
              boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
              transition: 'transform 0.2s, box-shadow 0.2s'
            }}>
              {/* 部门头部 */}
              <div style={{ 
                padding: '14px 18px', 
                background: `linear-gradient(135deg, #6366f122, #6366f111)`,
                borderBottom: '1px solid var(--line)',
                display: 'flex',
                alignItems: 'center',
                gap: 10
              }}>
                <div style={{
                  width: 36,
                  height: 36,
                  borderRadius: 10,
                  background: `#6366f133`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 18
                }}>
                  {dept.emoji}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{dept.label}</div>
                  <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                    {filteredEmps.length} 名员工 · {deptSkills.length} 个技能
                  </div>
                </div>
                <div style={{
                  padding: '4px 10px',
                  background: `#6366f122`,
                  borderRadius: 6,
                  fontSize: 11,
                  color: '#6366f1',
                  fontWeight: 500
                }}>
                  {dept.id.toUpperCase()}
                </div>
              </div>
              
              {/* 员工列表 */}
              <div style={{ padding: 12, maxHeight: 400, overflowY: 'auto' }}>
                {/* 部门领导 */}
                <div style={{
                  padding: 12,
                  marginBottom: 8,
                  background: 'linear-gradient(135deg, #f5c84215, #f5c84208)',
                  borderRadius: 10,
                  border: '1px solid #f5c84244',
                  cursor: 'pointer',
                  transition: 'transform 0.15s'
                }}
                onClick={() => setExpandedEmp(expandedEmp === dept.id ? null : dept.id)}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{
                      width: 32,
                      height: 32,
                      borderRadius: 8,
                      background: '#f5c84233',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 16
                    }}>
                      {dept.gender === '男' ? '👨' : '👩'}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>{dept.name || dept.role}</div>
                      <div style={{ fontSize: 11, color: 'var(--muted)' }}>部门负责人</div>
                    </div>
                    <div style={{
                      padding: '3px 8px',
                      background: '#f5c84233',
                      color: '#f5c842',
                      borderRadius: 6,
                      fontSize: 10,
                      fontWeight: 600
                    }}>
                      👑 领导
                    </div>
                    <div style={{ fontSize: 11, color: '#22c55e' }}>
                      📦 {deptSkills.length}
                    </div>
                  </div>
                </div>
                
                {/* 员工卡片 */}
                {filteredEmps.length === 0 ? (
                  <div style={{ textAlign: 'center', color: 'var(--muted)', fontSize: 12, padding: 20 }}>
                    无匹配员工
                  </div>
                ) : (
                  filteredEmps.map((emp: any) => {
                    const isExpanded = expandedEmp === emp.id;
                    return (
                      <div
                        key={emp.id}
                        style={{
                          padding: 12,
                          marginBottom: 8,
                          background: isExpanded ? 'var(--panel2)' : 'transparent',
                          borderRadius: 10,
                          border: `1px solid ${isExpanded ? 'var(--acc)' : 'var(--line)'}`,
                          cursor: 'pointer',
                          transition: 'all 0.2s'
                        }}
                        onClick={() => setExpandedEmp(isExpanded ? null : emp.id)}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div style={{
                            width: 32,
                            height: 32,
                            borderRadius: 8,
                            background: 'var(--panel2)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: 16
                          }}>
                            {emp.gender === '男' ? '👨' : '👩'}
                          </div>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontWeight: 500, fontSize: 13 }}>{emp.name}</div>
                            <div style={{ fontSize: 11, color: 'var(--muted)' }}>{emp.role}</div>
                          </div>
                          <div style={{
                            padding: '3px 8px',
                            background: 'var(--panel2)',
                            borderRadius: 6,
                            fontSize: 10
                          }}>
                            {emp.level}
                          </div>
                          <div style={{ fontSize: 11, color: 'var(--acc)' }}>
                            📦 {deptSkills.length}
                          </div>
                        </div>
                        
                        {/* 展开的操作区域 */}
                        {isExpanded && (
                          <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--line)' }}>
                            <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 8 }}>
                              继承的部门技能：
                            </div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
                              {deptSkills.slice(0, 5).map((s: any, i: number) => (
                                <div key={i} style={{
                                  padding: '4px 10px',
                                  background: 'linear-gradient(135deg, #6366f122, #6366f111)',
                                  borderRadius: 6,
                                  fontSize: 10,
                                  color: '#6366f1',
                                  border: '1px solid #6366f133'
                                }}>
                                  {typeof s === 'string' ? s : s.name}
                                </div>
                              ))}
                              {deptSkills.length > 5 && (
                                <div style={{
                                  padding: '4px 10px',
                                  background: 'var(--panel2)',
                                  borderRadius: 6,
                                  fontSize: 10,
                                  color: 'var(--muted)'
                                }}>
                                  +{deptSkills.length - 5} 更多
                                </div>
                              )}
                            </div>
                            <div style={{ display: 'flex', gap: 8 }}>
                              <button
                                style={{
                                  flex: 1,
                                  padding: '8px 12px',
                                  background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                                  color: '#fff',
                                  border: 'none',
                                  borderRadius: 8,
                                  fontSize: 12,
                                  fontWeight: 500,
                                  cursor: 'pointer'
                                }}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openAddForm(dept.id, `${emp.name} (${dept.label})`);
                                }}
                              >
                                ➕ 添加技能
                              </button>
                              <button
                                style={{
                                  padding: '8px 12px',
                                  background: 'var(--panel2)',
                                  border: '1px solid var(--line)',
                                  borderRadius: 8,
                                  fontSize: 12,
                                  cursor: 'pointer'
                                }}
                                onClick={(e) => e.stopPropagation()}
                              >
                                📋 查看
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  return (
    <div>
      {/* 主 Tab 切换 */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20, borderBottom: '1px solid var(--line)', paddingBottom: 0 }}>
        {[
          { key: 'local', label: '🏛️ 本地技能', count: agentConfig.agents.reduce((n, a) => n + (a.skills?.length || 0), 0) },
          { key: 'remote', label: '🌐 远程技能', count: remoteSkills.length },
          { key: 'employee', label: '👥 员工技能', count: Object.values(DEPT_SUB_AGENTS).flat().length },
        ].map((t) => (
          <div
            key={t.key}
            onClick={() => setActiveTab(t.key as 'local' | 'remote' | 'employee')}
            style={{
              padding: '8px 18px', cursor: 'pointer', fontSize: 13, borderRadius: '8px 8px 0 0',
              fontWeight: activeTab === t.key ? 700 : 400,
              background: activeTab === t.key ? 'var(--panel)' : 'transparent',
              color: activeTab === t.key ? 'var(--text)' : 'var(--muted)',
              border: activeTab === t.key ? '1px solid var(--line)' : '1px solid transparent',
              borderBottom: activeTab === t.key ? '1px solid var(--panel)' : '1px solid transparent',
              position: 'relative', bottom: -1,
              transition: 'all .15s',
            }}
          >
            {t.label}
            {t.count > 0 && (
              <span style={{ marginLeft: 6, fontSize: 10, padding: '1px 6px', borderRadius: 999, background: '#1a2040', color: 'var(--acc)' }}>
                {t.count}
              </span>
            )}
          </div>
        ))}
      </div>

      {activeTab === 'local' ? localPanel : activeTab === 'remote' ? remotePanel : employeePanel}

      {/* Skill Content Modal */}
      {skillModal && (
        <div className="modal-bg open" onClick={() => setSkillModal(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setSkillModal(null)}>✕</button>
            <div className="modal-body">
              <div style={{ fontSize: 11, color: 'var(--acc)', fontWeight: 700, letterSpacing: '.04em', marginBottom: 4 }}>
                {skillModal.agentId.toUpperCase()}
              </div>
              <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 16 }}>📦 {skillModal.name}</div>
              <div className="sk-modal-body">
                <div className="sk-md" style={{ whiteSpace: 'pre-wrap', fontSize: 12, lineHeight: 1.7 }}>
                  {skillModal.content}
                </div>
                {skillModal.path && (
                  <div className="sk-path" style={{ fontSize: 10, color: 'var(--muted)', marginTop: 12 }}>
                    📂 {skillModal.path}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 本地 Add Skill Form Modal */}
      {addForm && (
        <div className="modal-bg open" onClick={() => setAddForm(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setAddForm(null)}>✕</button>
            <div className="modal-body">
              <div style={{ fontSize: 11, color: 'var(--acc)', fontWeight: 700, letterSpacing: '.04em', marginBottom: 4 }}>
                为 {addForm.agentLabel} 添加技能
              </div>
              <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 18 }}>＋ 新增 Skill</div>

              <div
                style={{
                  background: 'var(--panel2)',
                  border: '1px solid var(--line)',
                  borderRadius: 10,
                  padding: 14,
                  marginBottom: 18,
                  fontSize: 12,
                  lineHeight: 1.7,
                  color: 'var(--muted)',
                }}
              >
                <b style={{ color: 'var(--text)' }}>📋 Skill 规范说明</b>
                <br />
                • 技能名称使用<b style={{ color: 'var(--text)' }}>小写英文 + 连字符</b>
                <br />
                • 创建后会生成模板文件 SKILL.md
                <br />
                • 技能会在 agent 收到相关任务时<b style={{ color: 'var(--text)' }}>自动激活</b>
              </div>

              <form onSubmit={submitAdd} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 6 }}>
                    技能名称 <span style={{ color: '#ff5270' }}>*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="如 data-analysis, code-review"
                    value={formData.name}
                    onChange={(e) =>
                      setFormData((p) => ({ ...p, name: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') }))
                    }
                    style={{ width: '100%', padding: '10px 12px', background: 'var(--bg)', border: '1px solid var(--line)', borderRadius: 8, color: 'var(--text)', fontSize: 13, outline: 'none' }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 6 }}>技能描述</label>
                  <input
                    type="text"
                    placeholder="一句话说明用途"
                    value={formData.desc}
                    onChange={(e) => setFormData((p) => ({ ...p, desc: e.target.value }))}
                    style={{ width: '100%', padding: '10px 12px', background: 'var(--bg)', border: '1px solid var(--line)', borderRadius: 8, color: 'var(--text)', fontSize: 13, outline: 'none' }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 6 }}>触发条件（可选）</label>
                  <input
                    type="text"
                    placeholder="何时激活此技能"
                    value={formData.trigger}
                    onChange={(e) => setFormData((p) => ({ ...p, trigger: e.target.value }))}
                    style={{ width: '100%', padding: '10px 12px', background: 'var(--bg)', border: '1px solid var(--line)', borderRadius: 8, color: 'var(--text)', fontSize: 13, outline: 'none' }}
                  />
                </div>
                <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
                  <button type="button" className="btn btn-g" onClick={() => setAddForm(null)} style={{ padding: '8px 20px' }}>
                    取消
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    style={{ padding: '8px 20px', fontSize: 13, background: 'var(--acc)', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}
                  >
                    {submitting ? '⟳ 创建中…' : '📦 创建技能'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* 远程 Add Remote Skill Modal */}
      {addRemoteForm && (
        <div className="modal-bg open" onClick={() => setAddRemoteForm(false)}>
          <div className="modal" style={{ maxWidth: 520 }} onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setAddRemoteForm(false)}>✕</button>
            <div className="modal-body">
              <div style={{ fontSize: 11, color: '#a07aff', fontWeight: 700, letterSpacing: '.04em', marginBottom: 4 }}>
                远程技能管理
              </div>
              <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 18 }}>🌐 添加远程 Skill</div>

              <div style={{ background: 'var(--panel2)', border: '1px solid var(--line)', borderRadius: 10, padding: 12, marginBottom: 18, fontSize: 11, color: 'var(--muted)', lineHeight: 1.7 }}>
                支持 GitHub Raw URL，如：<br />
                <code style={{ color: 'var(--acc)', fontSize: 10 }}>https://raw.gitfinancesercontent.com/obra/superpowers/refs/heads/main/skills/brainstorming/SKILL.md</code>
              </div>

              <form onSubmit={submitAddRemote} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 6 }}>目标 Agent <span style={{ color: '#ff5270' }}>*</span></label>
                  <select
                    required
                    value={remoteFormData.agentId}
                    onChange={(e) => setRemoteFormData((p) => ({ ...p, agentId: e.target.value }))}
                    style={{ width: '100%', padding: '10px 12px', background: 'var(--bg)', border: '1px solid var(--line)', borderRadius: 8, color: 'var(--text)', fontSize: 13 }}
                  >
                    <option value="">— 选择 Agent —</option>
                    {agentConfig.agents.map((ag) => (
                      <option key={ag.id} value={ag.id}>{ag.emoji} {ag.label} ({ag.id})</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 6 }}>技能名称 <span style={{ color: '#ff5270' }}>*</span></label>
                  <input
                    type="text"
                    required
                    placeholder="如 brainstorming, code-review"
                    value={remoteFormData.skillName}
                    onChange={(e) => setRemoteFormData((p) => ({ ...p, skillName: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') }))}
                    style={{ width: '100%', padding: '10px 12px', background: 'var(--bg)', border: '1px solid var(--line)', borderRadius: 8, color: 'var(--text)', fontSize: 13, outline: 'none' }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 6 }}>源 URL <span style={{ color: '#ff5270' }}>*</span></label>
                  <input
                    type="url"
                    required
                    placeholder="https://raw.gitfinancesercontent.com/..."
                    value={remoteFormData.sourceUrl}
                    onChange={(e) => setRemoteFormData((p) => ({ ...p, sourceUrl: e.target.value }))}
                    style={{ width: '100%', padding: '10px 12px', background: 'var(--bg)', border: '1px solid var(--line)', borderRadius: 8, color: 'var(--text)', fontSize: 12, outline: 'none' }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 6 }}>描述（可选）</label>
                  <input
                    type="text"
                    placeholder="一句话说明用途"
                    value={remoteFormData.description}
                    onChange={(e) => setRemoteFormData((p) => ({ ...p, description: e.target.value }))}
                    style={{ width: '100%', padding: '10px 12px', background: 'var(--bg)', border: '1px solid var(--line)', borderRadius: 8, color: 'var(--text)', fontSize: 13, outline: 'none' }}
                  />
                </div>
                <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
                  <button type="button" className="btn btn-g" onClick={() => setAddRemoteForm(false)} style={{ padding: '8px 20px' }}>取消</button>
                  <button
                    type="submit"
                    disabled={remoteSubmitting}
                    style={{ padding: '8px 20px', fontSize: 13, background: '#a07aff', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}
                  >
                    {remoteSubmitting ? '⟳ 下载中…' : '🌐 添加远程技能'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
