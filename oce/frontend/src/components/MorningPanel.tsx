import { useEffect, useState, useRef } from 'react';
import { useStore } from '../store';
import { api } from '../api';
import type { SubConfig, MorningNewsItem } from '../api';

const CAT_META: Record<string, { icon: string; color: string; desc: string }> = {
  '政治': { icon: '🏛️', color: '#6a9eff', desc: '全球政治动态' },
  '军事': { icon: '⚔️', color: '#ff5270', desc: '军事与冲突' },
  '经济': { icon: '💹', color: '#2ecc8a', desc: '经济与市场' },
  'AI大模型': { icon: '🤖', color: '#a07aff', desc: 'AI与大模型进展' },
};

const DEFAULT_CATS = ['政治', '军事', '经济', 'AI大模型'];

export default function MorningPanel() {
  const morningBrief = useStore((s) => s.morningBrief);
  const subConfig = useStore((s) => s.subConfig);
  const loadMorning = useStore((s) => s.loadMorning);
  const loadSubConfig = useStore((s) => s.loadSubConfig);
  const toast = useStore((s) => s.toast);

  const [showConfig, setShowConfig] = useState(false);
  const [localConfig, setLocalConfig] = useState<SubConfig | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshLabel, setRefreshLabel] = useState('⟳ 立即采集');
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    loadMorning();
  }, [loadMorning]);

  useEffect(() => {
    if (subConfig) setLocalConfig(JSON.parse(JSON.stringify(subConfig)));
  }, [subConfig]);

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const refreshNews = async () => {
    setRefreshing(true);
    setRefreshLabel('⟳ 采集中…');
    let lastDate: string | null = null;
    try {
      lastDate = morningBrief?.generated_at || null;
    } catch { /* */ }

    try {
      await api.refreshMorning();
      toast('采集已触发，自动检测更新中…', 'ok');
      let count = 0;
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = setInterval(async () => {
        count++;
        if (count > 24) {
          clearInterval(pollRef.current!);
          pollRef.current = null;
          setRefreshing(false);
          setRefreshLabel('⟳ 立即采集');
          toast('采集超时，请重试', 'err');
          return;
        }
        try {
          const fresh = await api.morningBrief();
          if (fresh.generated_at && fresh.generated_at !== lastDate) {
            clearInterval(pollRef.current!);
            pollRef.current = null;
            setRefreshing(false);
            setRefreshLabel('⟳ 立即采集');
            loadMorning();
            toast('✅ 每日简报已更新', 'ok');
          } else {
            setRefreshLabel(`⟳ 采集中… (${count * 5}s)`);
          }
        } catch { /* */ }
      }, 5000);
    } catch {
      toast('触发失败', 'err');
      setRefreshing(false);
      setRefreshLabel('⟳ 立即采集');
    }
  };

  // Config helpers
  const toggleCat = (name: string) => {
    if (!localConfig) return;
    const cats = [...(localConfig.categories || [])];
    const existing = cats.find((c) => c.name === name);
    if (existing) existing.enabled = !existing.enabled;
    else cats.push({ name, enabled: true });
    setLocalConfig({ ...localConfig, categories: cats });
  };

  const addKeyword = (kw: string) => {
    if (!localConfig || !kw) return;
    const kws = [...(localConfig.keywords || [])];
    if (!kws.includes(kw)) kws.push(kw);
    setLocalConfig({ ...localConfig, keywords: kws });
  };

  const removeKeyword = (i: number) => {
    if (!localConfig) return;
    const kws = [...(localConfig.keywords || [])];
    kws.splice(i, 1);
    setLocalConfig({ ...localConfig, keywords: kws });
  };

  const addFeed = (name: string, url: string, category: string) => {
    if (!localConfig || !name || !url) {
      toast('请填写源名称和URL', 'err');
      return;
    }
    const feeds = [...(localConfig.custom_feeds || [])];
    feeds.push({ name, url, category });
    setLocalConfig({ ...localConfig, custom_feeds: feeds });
  };

  const removeFeed = (i: number) => {
    if (!localConfig) return;
    const feeds = [...(localConfig.custom_feeds || [])];
    feeds.splice(i, 1);
    setLocalConfig({ ...localConfig, custom_feeds: feeds });
  };

  const saveConfig = async () => {
    if (!localConfig) return;
    try {
      const r = await api.saveMorningConfig(localConfig);
      if (r.ok) {
        toast('订阅配置已保存', 'ok');
        loadSubConfig();
      } else {
        toast(r.error || '保存失败', 'err');
      }
    } catch {
      toast('服务器连接失败', 'err');
    }
  };

  const enabledSet = localConfig
    ? new Set((localConfig.categories || []).filter((c) => c.enabled).map((c) => c.name))
    : new Set(DEFAULT_CATS);
  const userKws = (localConfig?.keywords || []).map((k) => k.toLowerCase());

  const cats = morningBrief?.categories || {};
  const dateStr = morningBrief?.date
    ? morningBrief.date.replace(/(\d{4})(\d{2})(\d{2})/, '$1年$2月$3日')
    : '';
  const totalNews = Object.values(cats).flat().length;

  return (
    <div>
      {/* Header */}
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center', 
        marginBottom: 20,
        padding: 16,
        background: 'linear-gradient(135deg, #f59e0b22, #f59e0b11)',
        borderRadius: 12,
        border: '1px solid #f59e0b44'
      }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 4 }}>🌅 每日简报</div>
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>
            {dateStr && `${dateStr} | `}
            {morningBrief?.generated_at && `采集于 ${morningBrief.generated_at} | `}
            共 <span style={{ fontWeight: 700, color: '#f59e0b' }}>{totalNews}</span> 条要闻
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => setShowConfig(!showConfig)}
            style={{
              padding: '8px 16px',
              background: showConfig ? 'linear-gradient(135deg, #f59e0b, #f59e0bdd)' : 'var(--panel)',
              border: `1px solid ${showConfig ? '#f59e0b' : 'var(--line)'}`,
              borderRadius: 8,
              fontSize: 12,
              cursor: 'pointer',
              color: showConfig ? '#fff' : 'var(--text)'
            }}
          >
            ⚙ 订阅配置
          </button>
          <button
            disabled={refreshing}
            onClick={refreshNews}
            style={{
              padding: '8px 16px',
              background: refreshing ? 'var(--panel2)' : 'linear-gradient(135deg, #f59e0b, #fbbf24)',
              border: 'none',
              borderRadius: 8,
              fontSize: 12,
              fontWeight: 500,
              cursor: refreshing ? 'not-allowed' : 'pointer',
              color: refreshing ? 'var(--muted)' : '#fff'
            }}
          >
            {refreshLabel}
          </button>
        </div>
      </div>

      {/* Subscription Config */}
      {showConfig && localConfig && (
        <SubConfigPanel
          config={localConfig}
          enabledSet={enabledSet}
          onToggleCat={toggleCat}
          onAddKeyword={addKeyword}
          onRemoveKeyword={removeKeyword}
          onAddFeed={addFeed}
          onRemoveFeed={removeFeed}
          onSave={saveConfig}
          onSetWebhook={(v) => setLocalConfig({ ...localConfig, feishu_webhook: v })}
        />
      )}

      {/* News */}
      {!Object.keys(cats).length ? (
        <div style={{ 
          textAlign: 'center', 
          padding: 60, 
          background: 'var(--panel)', 
          borderRadius: 12, 
          border: '1px dashed var(--line)' 
        }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>📰</div>
          <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>暂无每日简报</div>
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>点击右上角「立即采集」获取今日简报</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {Object.entries(cats).map(([cat, items]) => {
            if (!enabledSet.has(cat)) return null;
            const meta = CAT_META[cat] || { icon: '📰', color: 'var(--acc)', desc: cat };
            const scored = (items as MorningNewsItem[])
              .map((item) => {
                const text = ((item.title || '') + (item.summary || '')).toLowerCase();
                const kwHits = userKws.filter((k) => text.includes(k)).length;
                return { ...item, _kwHits: kwHits };
              })
              .sort((a, b) => b._kwHits - a._kwHits);

            return (
              <div 
                key={cat}
                style={{ 
                  background: 'var(--panel)', 
                  borderRadius: 16, 
                  border: '1px solid var(--line)', 
                  overflow: 'hidden' 
                }}
              >
                {/* 分类头部 */}
                <div style={{ 
                  padding: '14px 20px', 
                  background: `linear-gradient(135deg, ${meta.color}22, ${meta.color}11)`,
                  borderBottom: '1px solid var(--line)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10
                }}>
                  <div style={{
                    width: 40,
                    height: 40,
                    borderRadius: 10,
                    background: `${meta.color}33`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 20
                  }}>
                    {meta.icon}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: 15, color: meta.color }}>{cat}</div>
                    <div style={{ fontSize: 11, color: 'var(--muted)' }}>{meta.desc}</div>
                  </div>
                  <div style={{
                    padding: '6px 14px',
                    background: `${meta.color}22`,
                    borderRadius: 8,
                    fontSize: 12,
                    fontWeight: 600,
                    color: meta.color
                  }}>
                    {scored.length} 条
                  </div>
                </div>

                {/* 新闻列表 */}
                <div style={{ padding: 12 }}>
                  {!scored.length ? (
                    <div style={{ textAlign: 'center', padding: 20, color: 'var(--muted)', fontSize: 12 }}>
                      暂无新闻
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {scored.map((item, i) => {
                        const hasImg = !!(item.image && item.image.startsWith('http'));
                        
                        return (
                          <div
                            key={i}
                            onClick={() => window.open(item.link, '_blank')}
                            style={{
                              padding: 14,
                              background: 'var(--panel2)',
                              borderRadius: 12,
                              border: '1px solid var(--line)',
                              cursor: 'pointer',
                              transition: 'all 0.15s',
                              display: 'flex',
                              gap: 14
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.background = 'var(--bg)';
                              e.currentTarget.style.borderColor = meta.color;
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.background = 'var(--panel2)';
                              e.currentTarget.style.borderColor = 'var(--line)';
                            }}
                          >
                            {/* 图片/图标 */}
                            <div style={{
                              width: 80,
                              height: 80,
                              borderRadius: 10,
                              background: 'var(--panel)',
                              overflow: 'hidden',
                              flexShrink: 0,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center'
                            }}>
                              {hasImg ? (
                                <img
                                  src={item.image}
                                  onError={(e) => {
                                    (e.target as HTMLImageElement).style.display = 'none';
                                  }}
                                  loading="lazy"
                                  alt=""
                                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                />
                              ) : (
                                <span style={{ fontSize: 32 }}>{meta.icon}</span>
                              )}
                            </div>
                            
                            {/* 内容 */}
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ 
                                fontSize: 13, 
                                fontWeight: 600, 
                                marginBottom: 6,
                                lineHeight: 1.4,
                                display: '-webkit-box',
                                WebkitLineClamp: 2,
                                WebkitBoxOrient: 'vertical',
                                overflow: 'hidden'
                              }}>
                                {item.title}
                                {item._kwHits > 0 && (
                                  <span
                                    style={{
                                      fontSize: 9,
                                      padding: '2px 6px',
                                      borderRadius: 4,
                                      background: '#a07aff22',
                                      color: '#a07aff',
                                      marginLeft: 6,
                                      fontWeight: 600
                                    }}
                                  >
                                    ⭐ 关注
                                  </span>
                                )}
                              </div>
                              <div style={{ 
                                fontSize: 11, 
                                color: 'var(--muted)', 
                                marginBottom: 8,
                                lineHeight: 1.4,
                                display: '-webkit-box',
                                WebkitLineClamp: 2,
                                WebkitBoxOrient: 'vertical',
                                overflow: 'hidden'
                              }}>
                                {item.summary || item.desc || ''}
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 10, color: 'var(--muted)' }}>
                                <span>📡 {item.source || '未知来源'}</span>
                                {item.pub_date && (
                                  <span>🕐 {item.pub_date.substring(0, 16)}</span>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function SubConfigPanel({
  config,
  enabledSet,
  onToggleCat,
  onAddKeyword,
  onRemoveKeyword,
  onAddFeed,
  onRemoveFeed,
  onSave,
  onSetWebhook,
}: {
  config: SubConfig;
  enabledSet: Set<string>;
  onToggleCat: (name: string) => void;
  onAddKeyword: (kw: string) => void;
  onRemoveKeyword: (i: number) => void;
  onAddFeed: (name: string, url: string, cat: string) => void;
  onRemoveFeed: (i: number) => void;
  onSave: () => void;
  onSetWebhook: (v: string) => void;
}) {
  const [newKw, setNewKw] = useState('');
  const [feedName, setFeedName] = useState('');
  const [feedUrl, setFeedUrl] = useState('');
  const [feedCat, setFeedCat] = useState(DEFAULT_CATS[0]);

  const allCats = [...DEFAULT_CATS];
  (config.categories || []).forEach((c) => {
    if (!allCats.includes(c.name)) allCats.push(c.name);
  });

  return (
    <div style={{ 
      marginBottom: 20, 
      padding: 20, 
      background: 'linear-gradient(135deg, var(--panel), var(--panel2))', 
      borderRadius: 16, 
      border: '1px solid var(--line)' 
    }}>
      <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
        ⚙ <span style={{ color: '#f59e0b' }}>订阅配置</span>
      </div>

      {/* Categories */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 10 }}>订阅分类</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {allCats.map((cat) => {
            const meta = CAT_META[cat] || { icon: '📰', color: 'var(--acc)', desc: cat };
            const on = enabledSet.has(cat);
            return (
              <div
                key={cat}
                onClick={() => onToggleCat(cat)}
                style={{ 
                  cursor: 'pointer', 
                  padding: '8px 14px', 
                  borderRadius: 10, 
                  border: `1px solid ${on ? meta.color : 'var(--line)'}`, 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: 6,
                  background: on ? `${meta.color}15` : 'var(--panel)',
                  transition: 'all 0.15s'
                }}
              >
                <span>{meta.icon}</span>
                <span style={{ fontSize: 12, fontWeight: on ? 600 : 400 }}>{cat}</span>
                {on && <span style={{ fontSize: 10, color: meta.color }}>✓</span>}
              </div>
            );
          })}
        </div>
      </div>

      {/* Keywords */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 10 }}>关注关键词</div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
          {(config.keywords || []).map((kw, i) => (
            <span 
              key={i} 
              style={{ 
                fontSize: 11, 
                padding: '4px 10px', 
                borderRadius: 6, 
                background: '#a07aff22', 
                border: '1px solid #a07aff44',
                color: '#a07aff',
                display: 'flex',
                alignItems: 'center',
                gap: 6
              }}
            >
              {kw}
              <span 
                style={{ cursor: 'pointer', fontWeight: 700 }} 
                onClick={() => onRemoveKeyword(i)}
              >
                ✕
              </span>
            </span>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            type="text"
            value={newKw}
            onChange={(e) => setNewKw(e.target.value)}
            placeholder="输入关键词..."
            onKeyDown={(e) => { if (e.key === 'Enter') { onAddKeyword(newKw.trim()); setNewKw(''); } }}
            style={{ 
              flex: 1, 
              padding: '10px 14px', 
              background: 'var(--bg)', 
              border: '1px solid var(--line)', 
              borderRadius: 8, 
              color: 'var(--text)', 
              fontSize: 12, 
              outline: 'none' 
            }}
          />
          <button 
            onClick={() => { onAddKeyword(newKw.trim()); setNewKw(''); }} 
            style={{
              padding: '10px 18px',
              background: 'linear-gradient(135deg, #a07aff, #8b5cf6)',
              border: 'none',
              borderRadius: 8,
              color: '#fff',
              fontSize: 12,
              fontWeight: 500,
              cursor: 'pointer'
            }}
          >
            ➕ 添加
          </button>
        </div>
      </div>

      {/* Custom Feeds */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 10 }}>自定义信息源</div>
        {(config.custom_feeds || []).map((f, i) => (
          <div 
            key={i} 
            style={{ 
              display: 'flex', 
              gap: 8, 
              alignItems: 'center', 
              marginBottom: 8, 
              fontSize: 11,
              padding: '8px 12px',
              background: 'var(--panel)',
              borderRadius: 8
            }}
          >
            <span style={{ fontWeight: 600, minWidth: 60 }}>{f.name}</span>
            <span style={{ color: 'var(--muted)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>{f.url}</span>
            <span style={{ color: '#22c55e', fontSize: 10, padding: '2px 6px', background: '#22c55e22', borderRadius: 4 }}>{f.category}</span>
            <span style={{ cursor: 'pointer', color: '#ef4444', fontWeight: 700 }} onClick={() => onRemoveFeed(i)}>✕</span>
          </div>
        ))}
        <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
          <input 
            placeholder="源名称" 
            value={feedName} 
            onChange={(e) => setFeedName(e.target.value)}
            style={{ 
              width: 90, 
              padding: '8px 10px', 
              background: 'var(--bg)', 
              border: '1px solid var(--line)', 
              borderRadius: 6, 
              color: 'var(--text)', 
              fontSize: 11, 
              outline: 'none' 
            }} 
          />
          <input 
            placeholder="RSS / URL" 
            value={feedUrl} 
            onChange={(e) => setFeedUrl(e.target.value)}
            style={{ 
              flex: 1, 
              padding: '8px 10px', 
              background: 'var(--bg)', 
              border: '1px solid var(--line)', 
              borderRadius: 6, 
              color: 'var(--text)', 
              fontSize: 11, 
              outline: 'none' 
            }} 
          />
          <select 
            value={feedCat} 
            onChange={(e) => setFeedCat(e.target.value)}
            style={{ 
              padding: '8px 8px', 
              background: 'var(--bg)', 
              border: '1px solid var(--line)', 
              borderRadius: 6, 
              color: 'var(--text)', 
              fontSize: 11, 
              outline: 'none' 
            }}
          >
            {allCats.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <button 
            onClick={() => { onAddFeed(feedName, feedUrl, feedCat); setFeedName(''); setFeedUrl(''); }} 
            style={{
              padding: '8px 14px',
              background: 'linear-gradient(135deg, #22c55e, #16a34a)',
              border: 'none',
              borderRadius: 6,
              color: '#fff',
              fontSize: 11,
              cursor: 'pointer'
            }}
          >
            添加
          </button>
        </div>
      </div>

      {/* Feishu Webhook */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>飞书 Webhook</div>
        <input
          type="text"
          value={config.feishu_webhook || ''}
          onChange={(e) => onSetWebhook(e.target.value)}
          placeholder="https://open.feishu.cn/open-apis/bot/v2/hook/..."
          style={{ 
            width: '100%', 
            padding: '10px 14px', 
            background: 'var(--bg)', 
            border: '1px solid var(--line)', 
            borderRadius: 8, 
            color: 'var(--text)', 
            fontSize: 12, 
            outline: 'none' 
          }}
        />
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button 
          onClick={onSave} 
          style={{
            padding: '10px 24px',
            background: 'linear-gradient(135deg, #f59e0b, #fbbf24)',
            border: 'none',
            borderRadius: 8,
            color: '#fff',
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer',
            boxShadow: '0 4px 12px rgba(245, 158, 11, 0.3)'
          }}
        >
          💾 保存配置
        </button>
      </div>
    </div>
  );
}
