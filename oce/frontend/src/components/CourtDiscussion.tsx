/**
 * 会议讨论 — 多成员实时讨论可视化组件
 *
 * 功能：
 *   - 可视化会议室布局，成员站位
 *   - 实时群聊讨论，成员各抒己见
 *   - 领导（用户）随时发言参与
 *   - 领导指令（全局视角）改变讨论走向
 *   - 命运骰子：随机事件增加趣味性
 *   - 自动推进 / 手动推进
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { useStore, DEPTS } from '../store';
import { api } from '../api';

// ── 常量 ──

const OFFICIAL_COLORS: Record<string, string> = {
  assistant: '#e8a040', product: '#a07aff', architecture: '#6a9eff', tech: '#2ecc8a',
  docs: '#f5c842', data: '#ff9a6a', dev: '#ff5270', security: '#cc4444',
  ops: '#44aaff', hr: '#9b59b6',
};

const EMOTION_EMOJI: Record<string, string> = {
  neutral: '', confident: '😏', worried: '😟', angry: '😤',
  thinking: '🤔', amused: '😄', happy: '😊',
};

const COURT_POSITIONS: Record<string, { x: number; y: number }> = {
  product: { x: 15, y: 25 }, architecture: { x: 15, y: 45 }, tech: { x: 15, y: 65 },
  docs: { x: 85, y: 20 }, data: { x: 85, y: 35 }, dev: { x: 85, y: 50 },
  security: { x: 85, y: 65 }, ops: { x: 85, y: 80 },
  assistant: { x: 50, y: 20 }, hr: { x: 50, y: 80 },
};

interface CourtMessage {
  type: string;
  content: string;
  official_id?: string;
  official_name?: string;
  emotion?: string;
  action?: string;
  timestamp?: number;
}

interface CourtSession {
  session_id: string;
  topic: string;
  officials: Array<{
    id: string;
    name: string;
    emoji: string;
    role: string;
    personality: string;
    speaking_style: string;
  }>;
  messages: CourtMessage[];
  round: number;
  phase: string;
}

export default function CourtDiscussion() {
  const [phase, setPhase] = useState<'setup' | 'session'>('setup');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [topic, setTopic] = useState('');
  const [session, setSession] = useState<CourtSession | null>(null);
  const [loading, setLoading] = useState(false);
  const [autoPlay, setAutoPlay] = useState(false);
  const autoPlayRef = useRef(false);
  const [userInput, setUserInput] = useState('');
  const [showDecree, setShowDecree] = useState(false);
  const [decreeInput, setDecreeInput] = useState('');
  const [decreeFlash, setDecreeFlash] = useState(false);
  const [diceRolling, setDiceRolling] = useState(false);
  const [diceResult, setDiceResult] = useState<string | null>(null);
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const [emotions, setEmotions] = useState<Record<string, string>>({});
  const [searchTopic, setSearchTopic] = useState('');

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const toast = useStore((s) => s.toast);
  const liveStatus = useStore((s) => s.liveStatus);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [session?.messages?.length]);

  useEffect(() => {
    autoPlayRef.current = autoPlay;
  }, [autoPlay]);

  useEffect(() => {
    if (!autoPlay || !session || loading) return;
    const timer = setInterval(() => {
      if (autoPlayRef.current && !loading) {
        handleAdvance();
      }
    }, 5000);
    return () => clearInterval(timer);
  }, [autoPlay, session, loading]);

  const toggleOfficial = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else if (next.size < 8) next.add(id);
      return next;
    });
  };

  const handleStart = async () => {
    if (!topic.trim() || selectedIds.size < 2 || loading) return;
    setLoading(true);
    try {
      const res = await api.courtDiscussStart(topic, Array.from(selectedIds));
      if (!res.ok) throw new Error(res.error || '启动失败');
      setSession({
        session_id: res.session_id || '',
        topic: res.topic || topic,
        officials: (res as any).officials || [],
        messages: (res as any).messages || [],
        round: res.round || 0,
        phase: 'active',
      });
      setPhase('session');
    } catch (e: unknown) {
      toast((e as Error).message || '启动失败', 'err');
    } finally {
      setLoading(false);
    }
  };

  const handleAdvance = useCallback(async (userMsg?: string, decree?: string) => {
    if (!session || loading) return;
    setLoading(true);

    try {
      const res = await api.courtDiscussAdvance(session.session_id, userMsg, decree);
      if (!res.ok) throw new Error(res.error || '推进失败');

      setSession((prev) => {
        if (!prev) return prev;
        const newMsgs: CourtMessage[] = [];

        if (userMsg) {
          newMsgs.push({ type: 'emperor', content: userMsg, timestamp: Date.now() / 1000 });
        }
        if (decree) {
          newMsgs.push({ type: 'decree', content: decree, timestamp: Date.now() / 1000 });
        }

        const aiMsgs = (res.new_messages || []).map((m: Record<string, string>) => ({
          type: 'official',
          official_id: m.official_id,
          official_name: m.name,
          content: m.content,
          emotion: m.emotion,
          action: m.action,
          timestamp: Date.now() / 1000,
        }));

        if (res.scene_note) {
          newMsgs.push({ type: 'scene_note', content: res.scene_note, timestamp: Date.now() / 1000 });
        }

        return {
          ...prev,
          round: res.round ?? prev.round + 1,
          messages: [...prev.messages, ...newMsgs, ...aiMsgs],
        };
      });

      const aiMsgs = res.new_messages || [];
      if (aiMsgs.length > 0) {
        const emotionMap: Record<string, string> = {};
        let idx = 0;
        const cycle = () => {
          if (idx < aiMsgs.length) {
            setSpeakingId(aiMsgs[idx].official_id);
            emotionMap[aiMsgs[idx].official_id] = aiMsgs[idx].emotion || 'neutral';
            idx++;
            setTimeout(cycle, 1200);
          } else {
            setSpeakingId(null);
          }
        };
        cycle();
        setEmotions((prev) => ({ ...prev, ...emotionMap }));
      }

      if ((res as any).phase === 'concluded') {
        setSession((prev) => prev ? { ...prev, phase: 'concluded' } : prev);
        setAutoPlay(false);
        toast('🎉 会议已结束', 'ok');
      }
    } catch (e: unknown) {
      toast((e as Error).message || '推进失败', 'err');
    } finally {
      setLoading(false);
    }
  }, [session, loading, toast]);

  const handleEmperor = () => {
    if (!userInput.trim() || loading) return;
    handleAdvance(userInput.trim());
    setUserInput('');
  };

  const handleDecree = () => {
    if (!decreeInput.trim() || loading) return;
    handleAdvance(undefined, decreeInput.trim());
    setDecreeInput('');
    setShowDecree(false);
    setDecreeFlash(true);
    setTimeout(() => setDecreeFlash(false), 800);
  };

  const handleDice = async () => {
    if (diceRolling || loading || !session) return;
    setDiceRolling(true);
    setDiceResult(null);
    try {
      const res = await api.courtDiscussFate() as any;
      if (!res.ok) throw new Error(res.error || '骰子失败');
      setDiceResult(res.event || '随机事件已触发');
      if (res.scene_note) {
        setSession((prev) =>
          prev
            ? {
                ...prev,
                messages: [...prev.messages, { type: 'scene_note', content: (res as any).scene_note, timestamp: Date.now() / 1000 }],
              }
            : prev
        );
      }
    } catch (e: unknown) {
      toast((e as Error).message || '骰子失败', 'err');
    } finally {
      setDiceRolling(false);
    }
  };

  const handleConclude = async () => {
    if (!session || loading) return;
    if (!confirm('确认结束本次会议？')) return;
    setLoading(true);
    try {
      const res = await api.courtDiscussConclude(session.session_id) as any;
      if (!res.ok) throw new Error(res.error || '结束失败');
      setSession((prev) => prev ? { ...prev, phase: 'concluded' } : prev);
      setAutoPlay(false);
      toast('📋 会议已结束', 'ok');
    } catch (e: unknown) {
      toast((e as Error).message || '结束失败', 'err');
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    if (!confirm('确认退出会议？')) return;
    setPhase('setup');
    setSession(null);
    setSelectedIds(new Set());
    setTopic('');
    setUserInput('');
    setShowDecree(false);
    setDecreeInput('');
    setAutoPlay(false);
    setEmotions({});
    setSpeakingId(null);
    setDiceResult(null);
  };

  const activeOces = (liveStatus?.tasks || []).filter(
    (t) => /^OCE-/i.test(t.id) && !['Done', 'Cancelled'].includes(t.state),
  );

  const presetTopics = [
    ...activeOces.slice(0, 3).map((t) => ({
      text: `讨论任务 ${t.id}：${t.title}`,
      taskId: t.id,
      icon: '📜',
    })),
    { text: '讨论系统架构优化方案', taskId: '', icon: '🏗️' },
    { text: '评估当前项目进展和风险', taskId: '', icon: '📊' },
    { text: '制定下周工作计划', taskId: '', icon: '📋' },
    { text: '紧急问题：线上Bug排查方案', taskId: '', icon: '🚨' },
  ];

  // ═══════════════════
  //     渲染：设置页
  // ═══════════════════

  if (phase === 'setup') {
    return (
      <div>
        {/* 顶部统计栏 */}
        <div style={{ 
          display: 'flex', 
          gap: 12, 
          marginBottom: 20,
          padding: 16,
          background: 'linear-gradient(135deg, #6366f122, #a855f722)',
          borderRadius: 12,
          border: '1px solid #6366f144'
        }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 4, background: 'linear-gradient(135deg, #6366f1, #a855f7)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              🏛 会议讨论
            </div>
            <div style={{ fontSize: 12, color: 'var(--muted)' }}>
              团队围绕议题展开讨论，您可随时发言或做出决策引导方向
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <div style={{ textAlign: 'center', padding: '8px 16px', background: 'var(--panel)', borderRadius: 8, border: '1px solid var(--line)' }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: '#6366f1' }}>{DEPTS.length}</div>
              <div style={{ fontSize: 10, color: 'var(--muted)' }}>可选成员</div>
            </div>
            <div style={{ textAlign: 'center', padding: '8px 16px', background: 'var(--panel)', borderRadius: 8, border: '1px solid var(--line)' }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: '#22c55e' }}>{selectedIds.size}</div>
              <div style={{ fontSize: 10, color: 'var(--muted)' }}>已选择</div>
            </div>
          </div>
        </div>

        {/* 选择成员 */}
        <div style={{ background: 'var(--panel)', borderRadius: 16, border: '1px solid var(--line)', overflow: 'hidden', marginBottom: 16 }}>
          <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--line)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 16 }}>👔</span>
            <span style={{ fontWeight: 600, fontSize: 13 }}>选择参会成员</span>
            <span style={{ fontSize: 11, color: 'var(--muted)', marginLeft: 'auto' }}>
              已选 {selectedIds.size}/8 人（至少2位）
            </span>
          </div>
          <div style={{ padding: 16 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 10 }}>
              {DEPTS.map((d) => {
                const active = selectedIds.has(d.id);
                const color = OFFICIAL_COLORS[d.id] || '#6366f1';
                return (
                  <div
                    key={d.id}
                    onClick={() => toggleOfficial(d.id)}
                    style={{
                      padding: '12px 14px',
                      borderRadius: 12,
                      border: `1px solid ${active ? color : 'var(--line)'}`,
                      background: active ? `${color}15` : 'var(--panel2)',
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                      boxShadow: active ? `0 0 16px ${color}25` : 'none',
                      position: 'relative',
                      overflow: 'hidden',
                    }}
                  >
                    {active && (
                      <div style={{
                        position: 'absolute',
                        top: 6,
                        right: 6,
                        width: 18,
                        height: 18,
                        borderRadius: '50%',
                        background: color,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#fff',
                        fontSize: 10,
                        fontWeight: 600,
                      }}>
                        ✓
                      </div>
                    )}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{
                        width: 36,
                        height: 36,
                        borderRadius: 10,
                        background: `${color}22`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 18,
                      }}>
                        {d.emoji}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 600, fontSize: 12, color: active ? color : 'var(--text)' }}>
                          {d.label}
                        </div>
                        <div style={{ fontSize: 10, color: 'var(--muted)' }}>{d.role}</div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* 设定议题 */}
        <div style={{ background: 'var(--panel)', borderRadius: 16, border: '1px solid var(--line)', overflow: 'hidden', marginBottom: 16 }}>
          <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--line)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 16 }}>📜</span>
            <span style={{ fontWeight: 600, fontSize: 13 }}>设定议题</span>
          </div>
          <div style={{ padding: 16 }}>
            {/* 快速选择 */}
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 8 }}>快速选择议题模板：</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {presetTopics.map((p, i) => (
                  <div
                    key={i}
                    onClick={() => setTopic(p.text)}
                    style={{
                      padding: '6px 12px',
                      borderRadius: 8,
                      border: `1px solid ${topic === p.text ? '#6366f1' : 'var(--line)'}`,
                      background: topic === p.text ? '#6366f122' : 'var(--panel2)',
                      fontSize: 11,
                      cursor: 'pointer',
                      transition: 'all 0.15s',
                      color: topic === p.text ? '#6366f1' : 'var(--text)',
                    }}
                  >
                    {p.icon} {p.text.length > 20 ? p.text.substring(0, 20) + '...' : p.text}
                  </div>
                ))}
              </div>
            </div>
            {/* 自定义输入 */}
            <textarea
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="或自定义会议议题..."
              style={{
                width: '100%',
                minHeight: 80,
                padding: '12px 14px',
                borderRadius: 10,
                border: '1px solid var(--line)',
                background: 'var(--panel2)',
                color: 'var(--text)',
                fontSize: 13,
                resize: 'vertical',
                outline: 'none',
              }}
            />
          </div>
        </div>

        {/* 功能特性 */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
          {[
            { icon: '👑', text: '领导发言', desc: '随时参与讨论' },
            { icon: '⚡', text: '领导指令', desc: '全局干预' },
            { icon: '🎲', text: '命运骰子', desc: '随机事件' },
            { icon: '🔄', text: '自动推进', desc: 'AI自动发言' },
          ].map((tag) => (
            <div key={tag.text} style={{
              padding: '8px 14px',
              background: 'var(--panel)',
              borderRadius: 10,
              border: '1px solid var(--line)',
              fontSize: 11,
            }}>
              <span style={{ marginRight: 6 }}>{tag.icon}</span>
              <span style={{ fontWeight: 500 }}>{tag.text}</span>
              <span style={{ color: 'var(--muted)', marginLeft: 6, fontSize: 10 }}>{tag.desc}</span>
            </div>
          ))}
        </div>

        {/* 开始按钮 */}
        <button
          onClick={handleStart}
          disabled={selectedIds.size < 2 || !topic.trim() || loading}
          style={{
            width: '100%',
            padding: '14px 20px',
            background: selectedIds.size >= 2 && topic.trim()
              ? 'linear-gradient(135deg, #6366f1, #a855f7)'
              : 'var(--panel2)',
            color: selectedIds.size >= 2 && topic.trim() ? '#fff' : 'var(--muted)',
            border: 'none',
            borderRadius: 12,
            fontSize: 14,
            fontWeight: 600,
            cursor: selectedIds.size >= 2 && topic.trim() && !loading ? 'pointer' : 'not-allowed',
            opacity: loading ? 0.6 : 1,
            transition: 'all 0.2s',
            boxShadow: selectedIds.size >= 2 && topic.trim() ? '0 4px 16px rgba(99, 102, 241, 0.3)' : 'none',
          }}
        >
          {loading ? '⏳ 召集中...' : `🏛 开始会议（${selectedIds.size}位参与）`}
        </button>
      </div>
    );
  }

  // ═══════════════════
  //   渲染：会议进行中
  // ═══════════════════

  const officials = session?.officials || [];
  const messages = session?.messages || [];

  return (
    <div>
      {/* 顶部控制栏 */}
      <div style={{ 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 8,
        background: 'linear-gradient(135deg, var(--panel), var(--panel2))',
        borderRadius: 12,
        padding: '10px 16px',
        border: '1px solid var(--line)',
        marginBottom: 12,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 18, fontWeight: 700 }}>🏛 会议讨论</span>
          <span style={{
            padding: '4px 10px',
            background: '#6366f122',
            borderRadius: 8,
            fontSize: 11,
            color: '#6366f1',
            fontWeight: 600,
          }}>
            第{session?.round || 0}轮
          </span>
          {session?.phase === 'concluded' && (
            <span style={{
              padding: '4px 10px',
              background: '#22c55e22',
              borderRadius: 8,
              fontSize: 11,
              color: '#22c55e',
              fontWeight: 600,
            }}>
              ✅ 已结束
            </span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button
            onClick={() => setShowDecree(!showDecree)}
            style={{
              padding: '6px 12px',
              background: showDecree ? 'linear-gradient(135deg, #f59e0b, #fbbf24)' : 'transparent',
              border: `1px solid ${showDecree ? '#f59e0b' : '#f59e0b44'}`,
              borderRadius: 8,
              fontSize: 11,
              cursor: 'pointer',
              color: showDecree ? '#000' : '#f59e0b',
              fontWeight: 500,
            }}
          >
            ⚡ 指令
          </button>
          <button
            onClick={handleDice}
            disabled={diceRolling || loading}
            style={{
              padding: '6px 12px',
              background: diceRolling ? 'var(--panel2)' : 'transparent',
              border: '1px solid #a855f744',
              borderRadius: 8,
              fontSize: 11,
              cursor: diceRolling || loading ? 'not-allowed' : 'pointer',
              color: '#a855f7',
              fontWeight: 500,
              opacity: diceRolling || loading ? 0.5 : 1,
            }}
          >
            🎲 {diceRolling ? '...' : '骰子'}
          </button>
          <button
            onClick={() => setAutoPlay(!autoPlay)}
            style={{
              padding: '6px 12px',
              background: autoPlay ? 'linear-gradient(135deg, #22c55e, #10b981)' : 'transparent',
              border: `1px solid ${autoPlay ? '#22c55e' : 'var(--line)'}`,
              borderRadius: 8,
              fontSize: 11,
              cursor: 'pointer',
              color: autoPlay ? '#fff' : 'var(--muted)',
              fontWeight: 500,
            }}
          >
            {autoPlay ? '⏸ 暂停' : '▶ 自动'}
          </button>
          {session?.phase !== 'concluded' && (
            <button
              onClick={handleConclude}
              style={{
                padding: '6px 12px',
                background: 'transparent',
                border: '1px solid var(--line)',
                borderRadius: 8,
                fontSize: 11,
                cursor: 'pointer',
                color: 'var(--muted)',
              }}
            >
              📋 散会
            </button>
          )}
          <button
            onClick={handleReset}
            style={{
              padding: '6px 10px',
              background: 'transparent',
              border: '1px solid #ef444444',
              borderRadius: 8,
              fontSize: 11,
              cursor: 'pointer',
              color: '#ef4444',
            }}
          >
            ✕
          </button>
        </div>
      </div>

      {/* 领导指令面板 */}
      {showDecree && (
        <div style={{
          background: 'linear-gradient(135deg, #f59e0b15, #a855f715)',
          borderRadius: 12,
          padding: 16,
          border: '1px solid #f59e0b44',
          marginBottom: 12,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#f59e0b' }}>⚡ 领导指令 — 全局视角干预</span>
            <button onClick={() => setShowDecree(false)} style={{ fontSize: 11, color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer' }}>
              ✕
            </button>
          </div>
          <p style={{ fontSize: 10, color: '#f59e0b', opacity: 0.7, marginBottom: 10 }}>
            降下天意改变讨论走向，所有成员将对此做出反应
          </p>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              value={decreeInput}
              onChange={(e) => setDecreeInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleDecree()}
              placeholder="例如：突然发现预算多出一倍..."
              style={{
                flex: 1,
                padding: '10px 14px',
                borderRadius: 8,
                border: '1px solid #f59e0b44',
                background: 'var(--bg)',
                color: 'var(--text)',
                fontSize: 12,
                outline: 'none',
              }}
            />
            <button
              onClick={handleDecree}
              disabled={!decreeInput.trim()}
              style={{
                padding: '10px 20px',
                background: 'linear-gradient(135deg, #f59e0b, #a855f7)',
                border: 'none',
                borderRadius: 8,
                fontSize: 12,
                fontWeight: 600,
                color: '#fff',
                cursor: decreeInput.trim() ? 'pointer' : 'not-allowed',
                opacity: decreeInput.trim() ? 1 : 0.5,
              }}
            >
              降旨
            </button>
          </div>
        </div>
      )}

      {/* 命运骰子结果 */}
      {diceResult && (
        <div style={{
          background: 'linear-gradient(135deg, #a855f715, #ec489915)',
          borderRadius: 10,
          padding: '10px 14px',
          border: '1px solid #a855f744',
          fontSize: 12,
          color: '#a855f7',
          marginBottom: 12,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}>
          <span style={{ fontSize: 18 }}>🎲</span>
          {diceResult}
        </div>
      )}

      {/* 领导指令闪光效果 */}
      {decreeFlash && (
        <div style={{
          position: 'fixed',
          inset: 0,
          pointerEvents: 'none',
          zIndex: 50,
          background: 'radial-gradient(circle, rgba(255,200,50,0.3), transparent 70%)',
          animation: 'fadeOut .8s forwards',
        }} />
      )}

      {/* 议题 */}
      <div style={{ textAlign: 'center', fontSize: 11, color: 'var(--muted)', padding: '6px 0', marginBottom: 8 }}>
        📜 {session?.topic || ''}
      </div>

      {/* 主内容：会议室布局 + 聊天记录 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 }}>
        {/* 左侧：会议室可视化 */}
        <div style={{ 
          background: 'var(--panel)', 
          borderRadius: 16, 
          border: '1px solid var(--line)', 
          overflow: 'hidden',
          minHeight: 320,
        }}>
          <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--line)', background: 'linear-gradient(135deg, #6366f111, #a855f711)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 14 }}>🪑</span>
            <span style={{ fontWeight: 600, fontSize: 12 }}>会议室</span>
            <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--muted)' }}>{officials.length}人参会</span>
          </div>
          <div style={{ padding: 12, position: 'relative' }}>
            {/* 主位 */}
            <div style={{ textAlign: 'center', marginBottom: 12 }}>
              <div style={{
                display: 'inline-block',
                padding: '8px 16px',
                borderRadius: 10,
                background: 'linear-gradient(135deg, #f59e0b22, #fbbf2422)',
                border: '1px solid #f59e0b44',
              }}>
                <span style={{ fontSize: 20 }}>👑</span>
                <div style={{ fontSize: 10, color: '#f59e0b', fontWeight: 600 }}>主位</div>
              </div>
            </div>

            {/* 成员站位 */}
            <div style={{ position: 'relative', minHeight: 250 }}>
              <div style={{ position: 'absolute', left: 0, top: 0, fontSize: 9, color: 'var(--muted)', opacity: 0.5 }}>决策</div>
              <div style={{ position: 'absolute', right: 0, top: 0, fontSize: 9, color: 'var(--muted)', opacity: 0.5 }}>执行</div>

              {officials.map((o) => {
                const pos = COURT_POSITIONS[o.id] || { x: 50, y: 50 };
                const color = OFFICIAL_COLORS[o.id] || '#6366f1';
                const isSpeaking = speakingId === o.id;
                const emotion = emotions[o.id] || 'neutral';

                return (
                  <div
                    key={o.id}
                    style={{
                      position: 'absolute',
                      left: `${pos.x}%`,
                      top: `${pos.y}%`,
                      transform: 'translate(-50%, -50%)',
                      transition: 'all 0.5s',
                    }}
                  >
                    {/* 说话光圈 */}
                    {isSpeaking && (
                      <div style={{
                        position: 'absolute',
                        inset: -8,
                        borderRadius: '50%',
                        background: `radial-gradient(circle, ${color}40, transparent)`,
                        animation: 'pulse 1s infinite',
                      }} />
                    )}
                    {/* 头像 */}
                    <div style={{
                      position: 'relative',
                      width: 40,
                      height: 40,
                      borderRadius: '50%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 18,
                      border: `2px solid ${isSpeaking ? color : color + '40'}`,
                      background: isSpeaking ? color + '30' : color + '10',
                      transform: isSpeaking ? 'scale(1.2)' : 'scale(1)',
                      boxShadow: isSpeaking ? `0 0 16px ${color}50` : 'none',
                      transition: 'all 0.3s',
                    }}>
                      {o.emoji}
                      {/* 情绪气泡 */}
                      {EMOTION_EMOJI[emotion] && (
                        <span style={{
                          position: 'absolute',
                          top: -4,
                          right: -4,
                          fontSize: 12,
                        }}>
                          {EMOTION_EMOJI[emotion]}
                        </span>
                      )}
                    </div>
                    {/* 名字 */}
                    <div style={{
                      fontSize: 9,
                      textAlign: 'center',
                      marginTop: 2,
                      whiteSpace: 'nowrap',
                      color: isSpeaking ? color : 'var(--muted)',
                      fontWeight: isSpeaking ? 600 : 400,
                    }}>
                      {o.name}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* 右侧：聊天记录 */}
        <div style={{ 
          background: 'var(--panel)', 
          borderRadius: 16, 
          border: '1px solid var(--line)', 
          display: 'flex', 
          flexDirection: 'column',
          maxHeight: 500,
        }}>
          <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--line)', background: 'linear-gradient(135deg, #6366f111, #a855f711)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 14 }}>💬</span>
            <span style={{ fontWeight: 600, fontSize: 12 }}>讨论记录</span>
            <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--muted)' }}>{messages.length}条</span>
          </div>
          {/* 消息列表 */}
          <div style={{ flex: 1, overflowY: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 8, minHeight: 200 }}>
            {messages.map((msg, i) => (
              <MessageBubble key={i} msg={msg} officials={officials} />
            ))}
            {loading && (
              <div style={{ textAlign: 'center', fontSize: 11, color: 'var(--muted)', padding: 12, animation: 'pulse 1.5s infinite' }}>
                🏛 群臣正在思考...
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* 领导输入栏 */}
          {session?.phase !== 'concluded' && (
            <div style={{ borderTop: '1px solid var(--line)', padding: 10, display: 'flex', gap: 8 }}>
              <input
                value={userInput}
                onChange={(e) => setUserInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleEmperor()}
                placeholder="我有话说..."
                style={{
                  flex: 1,
                  padding: '10px 14px',
                  borderRadius: 8,
                  border: '1px solid var(--line)',
                  background: 'var(--panel2)',
                  color: 'var(--text)',
                  fontSize: 12,
                  outline: 'none',
                }}
              />
              <button
                onClick={handleEmperor}
                disabled={!userInput.trim() || loading}
                style={{
                  padding: '10px 16px',
                  background: userInput.trim() ? 'linear-gradient(135deg, #f59e0b, #fbbf24)' : 'var(--panel2)',
                  border: 'none',
                  borderRadius: 8,
                  fontSize: 12,
                  fontWeight: 600,
                  color: userInput.trim() ? '#000' : 'var(--muted)',
                  cursor: userInput.trim() && !loading ? 'pointer' : 'not-allowed',
                  opacity: loading ? 0.5 : 1,
                }}
              >
                👑 发言
              </button>
              <button
                onClick={() => handleAdvance()}
                disabled={loading}
                style={{
                  padding: '10px 14px',
                  background: 'transparent',
                  border: '1px solid #6366f144',
                  borderRadius: 8,
                  fontSize: 12,
                  color: '#6366f1',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  opacity: loading ? 0.5 : 1,
                }}
              >
                ▶ 下一轮
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── 消息气泡 ──

function MessageBubble({
  msg,
  officials,
}: {
  msg: CourtMessage;
  officials: Array<{ id: string; name: string; emoji: string }>;
}) {
  const color = OFFICIAL_COLORS[msg.official_id || ''] || '#6366f1';
  const official = officials.find((o) => o.id === msg.official_id);

  if (msg.type === 'system') {
    return (
      <div style={{ textAlign: 'center', fontSize: 10, color: 'var(--muted)', padding: '6px 0', borderBottom: '1px dashed var(--line)' }}>
        {msg.content}
      </div>
    );
  }

  if (msg.type === 'scene_note') {
    return (
      <div style={{ textAlign: 'center', fontSize: 10, color: '#a855f7', padding: '6px 0', fontStyle: 'italic' }}>
        ✦ {msg.content} ✦
      </div>
    );
  }

  if (msg.type === 'emperor') {
    return (
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <div style={{
          maxWidth: '80%',
          background: 'linear-gradient(135deg, #f59e0b22, #fbbf2422)',
          borderRadius: 12,
          padding: '10px 14px',
          border: '1px solid #f59e0b44',
        }}>
          <div style={{ fontSize: 10, color: '#f59e0b', marginBottom: 4, fontWeight: 600 }}>👑 领导</div>
          <div style={{ fontSize: 12 }}>{msg.content}</div>
        </div>
      </div>
    );
  }

  if (msg.type === 'decree') {
    return (
      <div style={{ textAlign: 'center', padding: '10px 0' }}>
        <div style={{
          display: 'inline-block',
          background: 'linear-gradient(135deg, #f59e0b15, #a855f715)',
          borderRadius: 10,
          padding: '10px 20px',
          border: '1px solid #f59e0b44',
        }}>
          <div style={{ fontSize: 11, color: '#f59e0b', fontWeight: 700 }}>⚡ 领导指令</div>
          <div style={{ fontSize: 12, marginTop: 4 }}>{msg.content}</div>
        </div>
      </div>
    );
  }

  // 成员消息
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
      <div style={{
        width: 28,
        height: 28,
        borderRadius: '50%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 13,
        flexShrink: 0,
        border: `1px solid ${color}60`,
        background: `${color}15`,
      }}>
        {official?.emoji || '💬'}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
          <span style={{ fontSize: 11, fontWeight: 600, color }}>{msg.official_name || '成员'}</span>
          {msg.emotion && EMOTION_EMOJI[msg.emotion] && (
            <span style={{ fontSize: 12 }}>{EMOTION_EMOJI[msg.emotion]}</span>
          )}
        </div>
        <div style={{ fontSize: 12, lineHeight: 1.5 }}>
          {msg.content?.split(/(\*[^*]+\*)/).map((part, i) => {
            if (part.startsWith('*') && part.endsWith('*')) {
              return (
                <span key={i} style={{ color: 'var(--muted)', fontStyle: 'italic', fontSize: 11 }}>
                  {part.slice(1, -1)}
                </span>
              );
            }
            return <span key={i}>{part}</span>;
          })}
        </div>
      </div>
    </div>
  );
}
