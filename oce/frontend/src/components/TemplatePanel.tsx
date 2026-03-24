import { useState } from 'react';
import { useStore, TEMPLATES, TPL_CATS } from '../store';
import type { Template } from '../store';
import { api } from '../api';

export default function TemplatePanel() {
  const tplCatFilter = useStore((s) => s.tplCatFilter);
  const setTplCatFilter = useStore((s) => s.setTplCatFilter);
  const toast = useStore((s) => s.toast);
  const loadAll = useStore((s) => s.loadAll);

  const [formTpl, setFormTpl] = useState<Template | null>(null);
  const [formVals, setFormVals] = useState<Record<string, string>>({});
  const [previewCmd, setPreviewCmd] = useState('');
  const [searchTpl, setSearchTpl] = useState('');

  let tpls = TEMPLATES;
  if (tplCatFilter !== '全部') tpls = tpls.filter((t) => t.cat === tplCatFilter);
  if (searchTpl) {
    const search = searchTpl.toLowerCase();
    tpls = tpls.filter(t => 
      t.name?.toLowerCase().includes(search) ||
      t.desc?.toLowerCase().includes(search)
    );
  }

  const openForm = (tpl: Template) => {
    const vals: Record<string, string> = {};
    tpl.params.forEach((p) => {
      vals[p.key] = p.default || '';
    });
    setFormVals(vals);
    setFormTpl(tpl);
    setPreviewCmd('');
  };

  const buildCmd = (tpl: Template) => {
    let cmd = tpl.command;
    for (const p of tpl.params) {
      cmd = cmd.replace(new RegExp('\\{' + p.key + '\\}', 'g'), formVals[p.key] || p.default || '');
    }
    return cmd;
  };

  const preview = () => {
    if (!formTpl) return;
    setPreviewCmd(buildCmd(formTpl));
  };

  const execute = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formTpl) return;
    const cmd = buildCmd(formTpl);
    if (!cmd.trim()) {
      toast('请填写必填参数', 'err');
      return;
    }

    // Pre-check gateway
    try {
      const st = await api.agentsStatus();
      if (st.ok && st.gateway && !st.gateway.alive) {
        toast('⚠️ Gateway 未启动，任务将无法派发！', 'err');
        if (!confirm('Gateway 未启动，继续？')) return;
      }
    } catch {
      /* ignore */
    }

    if (!confirm(`确认下发？\n\n${cmd.substring(0, 200)}${cmd.length > 200 ? '…' : ''}`)) return;

    try {
      const params: Record<string, string> = {};
      for (const p of formTpl.params) {
        params[p.key] = formVals[p.key] || p.default || '';
      }
      const r = await api.createTask({
        title: cmd.substring(0, 120),
        org: '产品部',
        targetDept: formTpl.depts[0] || '',
        priority: 'normal',
        templateId: formTpl.id,
        params,
      });
      if (r.ok) {
        toast(`📜 ${r.taskId} 任务已下达`, 'ok');
        setFormTpl(null);
        loadAll();
      } else {
        toast(r.error || '下发失败', 'err');
      }
    } catch {
      toast('⚠️ 服务器连接失败', 'err');
    }
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
          placeholder="🔍 搜索模板..."
          value={searchTpl}
          onChange={(e) => setSearchTpl(e.target.value)}
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
          background: 'linear-gradient(135deg, #6366f122, #6366f111)',
          borderRadius: 8,
          border: '1px solid #6366f144',
          display: 'flex',
          alignItems: 'center',
          gap: 8
        }}>
          <span style={{ fontSize: 11, color: 'var(--muted)' }}>模板</span>
          <span style={{ fontSize: 18, fontWeight: 700, color: '#6366f1' }}>{TEMPLATES.length}</span>
        </div>
      </div>

      {/* Category filter */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {TPL_CATS.map((c) => {
          const count = c.name === '全部' ? TEMPLATES.length : TEMPLATES.filter(t => t.cat === c.name).length;
          return (
            <div
              key={c.name}
              onClick={() => setTplCatFilter(c.name)}
              style={{
                padding: '8px 16px',
                background: tplCatFilter === c.name ? 'linear-gradient(135deg, #6366f1, #8b5cf6)' : 'var(--panel)',
                border: `1px solid ${tplCatFilter === c.name ? '#6366f1' : 'var(--line)'}`,
                borderRadius: 8,
                cursor: 'pointer',
                fontSize: 12,
                fontWeight: 500,
                color: tplCatFilter === c.name ? '#fff' : 'var(--text)',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                transition: 'all 0.15s'
              }}
            >
              <span>{c.icon}</span>
              <span>{c.name}</span>
              <span style={{
                padding: '2px 6px',
                background: tplCatFilter === c.name ? 'rgba(255,255,255,0.2)' : 'var(--panel2)',
                borderRadius: 6,
                fontSize: 10
              }}>
                {count}
              </span>
            </div>
          );
        })}
      </div>

      {/* Template Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: 16 }}>
        {tpls.map((t) => {
          const gradientColor = t.cat === '产品' ? '#3b82f6' :
                               t.cat === '技术' ? '#22c55e' :
                               t.cat === '设计' ? '#f59e0b' :
                               t.cat === '运营' ? '#ec4899' :
                               '#6366f1';
          
          return (
            <div 
              key={t.id}
              style={{ 
                background: 'var(--panel)', 
                borderRadius: 16, 
                border: '1px solid var(--line)', 
                overflow: 'hidden',
                boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                transition: 'all 0.2s'
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
                  width: 40,
                  height: 40,
                  borderRadius: 10,
                  background: `${gradientColor}33`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 20
                }}>
                  {t.icon}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{t.name}</div>
                  <div style={{ fontSize: 10, color: 'var(--muted)' }}>{t.cat}</div>
                </div>
              </div>
              
              {/* 描述 */}
              <div style={{ padding: '12px 18px', borderBottom: '1px solid var(--line)' }}>
                <div style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.5 }}>
                  {t.desc}
                </div>
              </div>
              
              {/* 底部 */}
              <div style={{ padding: '12px 18px', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                {t.depts.slice(0, 2).map((d) => (
                  <span 
                    key={d}
                    style={{
                      padding: '4px 10px',
                      background: `${gradientColor}15`,
                      borderRadius: 6,
                      fontSize: 10,
                      color: gradientColor,
                      fontWeight: 500
                    }}
                  >
                    {d}
                  </span>
                ))}
                {t.depts.length > 2 && (
                  <span style={{ fontSize: 10, color: 'var(--muted)' }}>
                    +{t.depts.length - 2}
                  </span>
                )}
                <div style={{ flex: 1 }} />
                <span style={{ fontSize: 10, color: 'var(--muted)' }}>
                  ⏱ {t.est} · 💰 {t.cost}
                </span>
                <button
                  onClick={() => openForm(t)}
                  style={{
                    padding: '6px 16px',
                    background: `linear-gradient(135deg, ${gradientColor}, ${gradientColor}dd)`,
                    color: '#fff',
                    border: 'none',
                    borderRadius: 6,
                    fontSize: 11,
                    fontWeight: 500,
                    cursor: 'pointer'
                  }}
                >
                  📜 下发
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Template Form Modal */}
      {formTpl && (
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
          onClick={() => setFormTpl(null)}
        >
          <div 
            style={{
              background: 'var(--bg)',
              borderRadius: 16,
              maxWidth: 700,
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
                  任务模板
                </div>
                <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 8 }}>
                  {formTpl.icon} {formTpl.name}
                </div>
                <div style={{ fontSize: 12, color: 'var(--muted)' }}>{formTpl.desc}</div>
              </div>
              <button 
                onClick={() => setFormTpl(null)}
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

            {/* 表单 */}
            <form onSubmit={execute} style={{ padding: 24 }}>
              <div style={{ display: 'flex', gap: 6, marginBottom: 18, flexWrap: 'wrap' }}>
                {formTpl.depts.map((d) => (
                  <span 
                    key={d}
                    style={{
                      padding: '4px 12px',
                      background: '#6366f115',
                      borderRadius: 6,
                      fontSize: 11,
                      color: '#6366f1',
                      fontWeight: 500
                    }}
                  >
                    {d}
                  </span>
                ))}
                <div style={{ flex: 1 }} />
                <span style={{ fontSize: 11, color: 'var(--muted)' }}>
                  ⏱ {formTpl.est} · 💰 {formTpl.cost}
                </span>
              </div>

              {formTpl.params.map((p) => (
                <div key={p.key} style={{ marginBottom: 16 }}>
                  <label style={{ 
                    display: 'block', 
                    fontSize: 12, 
                    fontWeight: 600, 
                    marginBottom: 6,
                    color: 'var(--text)'
                  }}>
                    {p.label}
                    {p.required && <span style={{ color: '#ef4444', marginLeft: 4 }}>*</span>}
                  </label>
                  {p.type === 'textarea' ? (
                    <textarea
                      required={p.required}
                      value={formVals[p.key] || ''}
                      onChange={(e) => setFormVals((v) => ({ ...v, [p.key]: e.target.value }))}
                      style={{
                        width: '100%',
                        minHeight: 80,
                        resize: 'vertical',
                        padding: '10px 12px',
                        borderRadius: 8,
                        border: '1px solid var(--line)',
                        background: 'var(--panel)',
                        color: 'var(--text)',
                        fontSize: 12
                      }}
                    />
                  ) : p.type === 'select' ? (
                    <select
                      value={formVals[p.key] || p.default || ''}
                      onChange={(e) => setFormVals((v) => ({ ...v, [p.key]: e.target.value }))}
                      style={{
                        width: '100%',
                        padding: '10px 12px',
                        borderRadius: 8,
                        border: '1px solid var(--line)',
                        background: 'var(--panel)',
                        color: 'var(--text)',
                        fontSize: 12
                      }}
                    >
                      {(p.options || []).map((o) => (
                        <option key={o}>{o}</option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="text"
                      required={p.required}
                      value={formVals[p.key] || ''}
                      onChange={(e) => setFormVals((v) => ({ ...v, [p.key]: e.target.value }))}
                      style={{
                        width: '100%',
                        padding: '10px 12px',
                        borderRadius: 8,
                        border: '1px solid var(--line)',
                        background: 'var(--panel)',
                        color: 'var(--text)',
                        fontSize: 12
                      }}
                    />
                  )}
                </div>
              ))}

              {previewCmd && (
                <div
                  style={{
                    background: 'linear-gradient(135deg, #6366f115, #8b5cf615)',
                    border: '1px solid #6366f144',
                    borderRadius: 12,
                    padding: 14,
                    marginBottom: 16,
                    fontSize: 12,
                    borderLeft: '3px solid #6366f1'
                  }}
                >
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#6366f1', marginBottom: 6 }}>
                    📜 将发送给产品部的任务：
                  </div>
                  <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{previewCmd}</div>
                </div>
              )}

              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button 
                  type="button" 
                  onClick={preview} 
                  style={{
                    padding: '10px 20px',
                    background: 'var(--panel)',
                    border: '1px solid var(--line)',
                    borderRadius: 8,
                    fontSize: 12,
                    cursor: 'pointer'
                  }}
                >
                  👁 预览任务
                </button>
                <button 
                  type="submit" 
                  style={{
                    padding: '10px 24px',
                    background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                    color: '#fff',
                    border: 'none',
                    borderRadius: 8,
                    fontSize: 12,
                    fontWeight: 500,
                    cursor: 'pointer'
                  }}
                >
                  📜 下发任务
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
