/**
 * Zustand Store — 企业DashBoard状态管理
 * HTTP 5s 轮询，无 WebSocket
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  api,
  type Task,
  type LiveStatus,
  type AgentConfig,
  type OfficialsData,
  type AgentsStatusData,
  type MorningBrief,
  type SubConfig,
  type ChangeLogEntry,
} from './api';

// ── Theme Types ──

export type ThemeMode = 'light' | 'dark' | 'system';

// ── Theme Store ──

function applyTheme(theme: ThemeMode) {
  const root = document.documentElement;
  const effectiveTheme = theme === 'system'
    ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
    : theme;

  if (effectiveTheme === 'light') {
    root.classList.add('light');
    root.classList.remove('dark');
  } else {
    root.classList.add('dark');
    root.classList.remove('light');
  }
}

interface ThemeStore {
  theme: ThemeMode;
  setTheme: (theme: ThemeMode) => void;
  getEffectiveTheme: () => 'light' | 'dark';
}

export const useTheme = create<ThemeStore>()(
  persist(
    (set, get) => ({
      theme: 'system',
      setTheme: (theme) => {
        set({ theme });
        applyTheme(theme);
      },
      getEffectiveTheme: () => {
        const { theme } = get();
        if (theme === 'system') {
          return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
        }
        return theme;
      },
    }),
    {
      name: 'oce-theme',
      onRehydrateStorage: () => (state) => {
        // 无论是否有存储，都应用主题（默认为system）
        applyTheme(state?.theme || 'system');
      },
    }
  )
);

// ── System Theme Listener ──
// 监听系统主题变化，当设置为"跟随系统"时自动切换
if (typeof window !== 'undefined') {
  const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
  
  // 监听系统主题变化
  mediaQuery.addEventListener('change', (e) => {
    const { theme } = useTheme.getState();
    if (theme === 'system') {
      applyTheme('system');
    }
  });
  
  // 页面加载时立即应用主题
  const savedTheme = localStorage.getItem('oce-theme');
  if (savedTheme) {
    try {
      const parsed = JSON.parse(savedTheme);
      applyTheme(parsed.state?.theme || 'system');
    } catch {
      applyTheme('system');
    }
  } else {
    // 无存储时默认跟随系统
    applyTheme('system');
  }
}

// ── Pipeline Definition (PIPE) ──

export const PIPE = [
  { key: 'Inbox',    dept: '领导',   icon: '👑', action: '下任务' },
  { key: 'Assistant',    dept: '助理',   icon: '🤴', action: '分拣' },
  { key: 'Product', dept: '产品部', icon: '📜', action: '规划' },
  { key: 'Architecture',   dept: '架构委员会', icon: '🔍', action: '评审' },
  { key: 'Assigned', dept: '技术部', icon: '📮', action: '派发' },
  { key: 'Doing',    dept: '各部门',   icon: '⚙️', action: '执行' },
  { key: 'Review',   dept: '技术部', icon: '🔎', action: '汇总' },
  { key: 'Done',     dept: '回报',   icon: '✅', action: '完成' },
] as const;

export const PIPE_STATE_IDX: Record<string, number> = {
  Inbox: 0, Pending: 0, Assistant: 1, Product: 2, Architecture: 3,
  Assigned: 4, Doing: 5, Review: 6, Done: 7, Blocked: 5, Cancelled: 5, Next: 4,
};

export const DEPT_COLOR: Record<string, string> = {
  '助理': '#e8a040', '产品部': '#a07aff', '架构委员会': '#6a9eff', '技术部': '#6aef9a',
  '文档部': '#f5c842', '数据部': '#ff9a6a', '开发部': '#ff5270', '安全部': '#cc4444',
  '运维部': '#44aaff', '人力资源部': '#9b59b6', '领导': '#ffd700', '回报': '#2ecc8a',
};

export const STATE_LABEL: Record<string, string> = {
  Inbox: '收件', Pending: '待处理', Assistant: '助理分拣', Product: '产品规划',
  Architecture: '架构评审', Assigned: '已派发', Doing: '执行中', Review: '待审查',
  Done: '已完成', Blocked: '阻塞', Cancelled: '已取消', Next: '待执行',
};

export function deptColor(d: string): string {
  return DEPT_COLOR[d] || '#6a9eff';
}

export function stateLabel(t: Task): string {
  const r = t.review_round || 0;
  if (t.state === 'Architecture' && r > 1) return `架构评审（第${r}轮）`;
  if (t.state === 'Product' && r > 0) return `产品修订（第${r}轮）`;
  return STATE_LABEL[t.state] || t.state;
}

export function isOce(t: Task): boolean {
  return /^OCE-/i.test(t.id || '');
}

export function isSession(t: Task): boolean {
  return /^(OC-|MC-)/i.test(t.id || '');
}

export function isArchived(t: Task): boolean {
  return t.archived || ['Done', 'Cancelled'].includes(t.state);
}

export type PipeStatus = { key: string; dept: string; icon: string; action: string; status: 'done' | 'active' | 'pending' };

export function getPipeStatus(t: Task): PipeStatus[] {
  const stateIdx = PIPE_STATE_IDX[t.state] ?? 4;
  return PIPE.map((stage, i) => ({
    ...stage,
    status: (i < stateIdx ? 'done' : i === stateIdx ? 'active' : 'pending') as 'done' | 'active' | 'pending',
  }));
}

// ── Tabs ──

export type TabKey =
  | 'oces' | 'monitor' | 'officials' | 'models'
  | 'skills' /* | 'sessions' */ | 'memorials' | 'templates' | 'morning' | 'court' | 'cost' | 'agent_pool';

export const TAB_DEFS: { key: TabKey; label: string; icon: string }[] = [
  { key: 'oces',    label: 'Dashboard', icon: '📜' },
  { key: 'court',     label: '会议讨论', icon: '🏛️' },
  { key: 'monitor',   label: '部门调度', icon: '🔌' },
  { key: 'officials', label: '成员总览', icon: '👔' },
  { key: 'cost',      label: '资金管理', icon: '💰' },
  { key: 'models',    label: '模型配置', icon: '🤖' },
  { key: 'skills',    label: '技能配置', icon: '🎯' },
  // { key: 'sessions',  label: '小任务',   icon: '💬' },
  { key: 'memorials', label: '任务记录',   icon: '📜' },
];

// ── DEPTS for monitor ──
export const DEPTS = [
  { id: 'assistant',    label: '助理',   emoji: '🤴', role: '助理',     rank: 'CEO特助', headcount: 1, name: '郭静', gender: '女', personality: '结果导向' },
  { id: 'product', label: '产品部', emoji: '📜', role: '产品总监',   rank: 'VP级', headcount: 5, name: '李平', gender: '男', personality: '善于沟通' },
  { id: 'architecture',   label: '架构委员会', emoji: '🔍', role: '架构师主席',     rank: 'VP级', headcount: 5, name: '朱萌', gender: '女', personality: '幽默风趣' },
  { id: 'tech', label: '技术部', emoji: '📮', role: '技术总监',   rank: 'VP级', headcount: 14, name: '张峰', gender: '男', personality: '严谨细致' },
  { id: 'docs',     label: '文档部',   emoji: '📝', role: '文档总监', rank: '总监级', headcount: 6, name: '刘飞', gender: '男', personality: '雷厉风行' },
  { id: 'data',     label: '数据部',   emoji: '💰', role: '数据总监', rank: '总监级', headcount: 8, name: '吴琳', gender: '女', personality: '结果导向' },
  { id: 'dev',   label: '开发部',   emoji: '⚔️', role: '开发总监', rank: '总监级', headcount: 14, name: '刘杰', gender: '男', personality: '专注高效' },
  { id: 'security',   label: '安全部',   emoji: '⚖️', role: '安全总监', rank: '总监级', headcount: 7, name: '徐颖', gender: '女', personality: '雷厉风行' },
  { id: 'ops',   label: '运维部',   emoji: '🔧', role: '运维总监', rank: '总监级', headcount: 8, name: '胡琪', gender: '女', personality: '雷厉风行' },
  { id: 'hr',  label: '人力资源部',   emoji: '👔', role: 'HR总监', rank: '总监级', headcount: 6, name: '胡薇', gender: '女', personality: '专注高效' },
  { id: 'news',  label: '资讯中心', icon: '📰', role: '资讯专员',   rank: '高级经理级', headcount: 4, name: '周瑶', gender: '女', personality: '创新意识' },
  { id: 'xiaoshou', label: '销售部', emoji: '💼', role: '销售总监', rank: '总监级', headcount: 8, name: '马鑫', gender: '男', personality: '善于沟通' },
  { id: 'shichang', label: '市场部', emoji: '📢', role: '市场总监', rank: '总监级', headcount: 7, name: '杨勇', gender: '男', personality: '创新意识' },
  { id: 'caigou', label: '采购部', emoji: '🛒', role: '采购总监', rank: '总监级', headcount: 6, name: '刘亮', gender: '男', personality: '结果导向' },
  { id: 'kefu', label: '客服部', emoji: '🎧', role: '客服总监', rank: '总监级', headcount: 6, name: '胡涵', gender: '女', personality: '热情耐心' },
  { id: 'xingzheng', label: '项目管理部', emoji: '📋', role: '项目总监', rank: 'VP级', headcount: 8, name: '朱丹', gender: '女', personality: '结果导向' },
  { id: 'chanpin', label: '产品管理部', emoji: '🎯', role: '产品总监', rank: 'VP级', headcount: 10, name: '陈雪', gender: '女', personality: '善于沟通' },
  { id: 'jingying', label: '经营管理部', emoji: '📈', role: 'COO', rank: 'VP级', headcount: 10, name: '周鑫', gender: '男', personality: '严谨细致' },
  { id: 'pmo', label: '企业级PMO', emoji: '🎪', role: 'PMO经理', rank: '总监级', headcount: 5, name: '周强', gender: '男', personality: '专注高效' },
  { id: 'zixun', label: '咨询中心', emoji: '💡', role: '中心主任', rank: 'VP级', headcount: 10, name: '李凯', gender: '男', personality: '创新意识' },
];

// ── DEPT_SUB_AGENTS ── 各部门下属员工配置 (含工资)
export const DEPT_SUB_AGENTS: Record<string, { id: string; name: string; gender: string; role: string; level: string; personality: string; base_salary: number; performance_bonus: number; department: string }[]> = {
  'product': [
    { id: 'pm_liuxiao', name: '刘晓', gender: '男', role: '高级产品经理', level: 'P8', personality: '结果导向', base_salary: 35000, performance_bonus: 15000, department: '产品部' },
    { id: 'pm_wangjing', name: '王晶', gender: '女', role: '产品经理', level: 'P7', personality: '踏实靠谱', base_salary: 28000, performance_bonus: 12000, department: '产品部' },
  ],
  'architecture': [
    { id: 'arch_zhangwei', name: '张伟', gender: '男', role: '首席架构师', level: 'P8', personality: '善于沟通', base_salary: 40000, performance_bonus: 18000, department: '架构委员会' },
    { id: 'arch_lichao', name: '李超', gender: '男', role: '资深架构师', level: 'P7', personality: '创新意识', base_salary: 32000, performance_bonus: 14000, department: '架构委员会' },
  ],
  'tech': [
    { id: 'pm_manager_zhou', name: '周强', gender: '男', role: '项目总监', level: 'P8', personality: '踏实靠谱', base_salary: 38000, performance_bonus: 16000, department: '技术部' },
    { id: 'pm_manager_li', name: '李娜', gender: '女', role: '项目经理', level: 'P6', personality: '严谨细致', base_salary: 25000, performance_bonus: 60000, department: '技术部' },
  ],
  'dev': [
    { id: 'dev_zhangsan', name: '张三', gender: '男', role: '资深开发工程师', level: 'P7', personality: '理性客观', base_salary: 32000, performance_bonus: 14000, department: '开发部' },
    { id: 'dev_lisi', name: '李四', gender: '男', role: '高级开发工程师', level: 'P6', personality: '团队精神', base_salary: 26000, performance_bonus: 11000, department: '开发部' },
    { id: 'dev_wangwu', name: '王五', gender: '男', role: '开发工程师', level: 'P5', personality: '严谨细致', base_salary: 20000, performance_bonus: 8000, department: '开发部' },
    { id: 'dev_zhaoliu', name: '赵六', gender: '女', role: '初级开发工程师', level: 'P4', personality: '踏实靠谱', base_salary: 12000, performance_bonus: 5000, department: '开发部' },
  ],
  'security': [
    { id: 'sec_gaofeng', name: '高峰', gender: '男', role: '安全专家', level: 'P7', personality: '踏实靠谱', base_salary: 30000, performance_bonus: 13000, department: '安全部' },
    { id: 'sec_sunli', name: '孙丽', gender: '女', role: '合规专员', level: 'P5', personality: '热情主动', base_salary: 18000, performance_bonus: 7000, department: '安全部' },
  ],
  'ops': [
    { id: 'ops_chenjun', name: '陈军', gender: '男', role: '运维专家', level: 'P7', personality: '踏实靠谱', base_salary: 30000, performance_bonus: 13000, department: '运维部' },
    { id: 'ops_yangming', name: '杨明', gender: '男', role: 'SRE工程师', level: 'P6', personality: '严谨细致', base_salary: 25000, performance_bonus: 60000, department: '运维部' },
    { id: 'ops_wanghui', name: '王辉', gender: '男', role: 'DevOps工程师', level: 'P5', personality: '专注高效', base_salary: 20000, performance_bonus: 8000, department: '运维部' },
  ],
  'docs': [
    { id: 'doc_liuxiang', name: '刘翔', gender: '男', role: '技术写作专家', level: 'P6', personality: '思维活跃', base_salary: 24000, performance_bonus: 9000, department: '文档部' },
    { id: 'doc_zhangli', name: '张力', gender: '女', role: '文档工程师', level: 'P5', personality: '乐观开朗', base_salary: 18000, performance_bonus: 7000, department: '文档部' },
  ],
  'data': [
    { id: 'fin_liuxiu', name: '刘秀', gender: '女', role: '高级财务分析师', level: 'P7', personality: '耐心负责', base_salary: 30000, performance_bonus: 13000, department: '财务部' },
    { id: 'fin_wangqiang', name: '王强', gender: '男', role: '会计专员', level: 'P5', personality: '结果导向', base_salary: 18000, performance_bonus: 7000, department: '财务部' },
  ],
  'hr': [
    { id: 'hr_liming', name: '李明', gender: '男', role: 'HR经理', level: 'P6', personality: '善于沟通', base_salary: 26000, performance_bonus: 11000, department: '人力资源部' },
    { id: 'hr_zhangying', name: '张颖', gender: '女', role: '招聘专员', level: 'P5', personality: '热情主动', base_salary: 18000, performance_bonus: 7000, department: '人力资源部' },
  ],
  'xiaoshou': [
    { id: 'sales_linzhi', name: '林志', gender: '男', role: '销售经理', level: 'P7', personality: '善于沟通', base_salary: 25000, performance_bonus: 20000, department: '销售部' },
    { id: 'sales_wangmei', name: '王梅', gender: '女', role: '商务专员', level: 'P5', personality: '热情主动', base_salary: 18000, performance_bonus: 12000, department: '销售部' },
    { id: 'sales_zhouqiang', name: '周强', gender: '男', role: '客户经理', level: 'P5', personality: '结果导向', base_salary: 18000, performance_bonus: 15000, department: '销售部' },
  ],
  'shichang': [
    { id: 'mkt_huangxiao', name: '黄晓', gender: '女', role: '市场经理', level: 'P7', personality: '创新意识', base_salary: 28000, performance_bonus: 12000, department: '市场部' },
    { id: 'mkt_liujun', name: '刘军', gender: '男', role: '品牌专员', level: 'P5', personality: '思维活跃', base_salary: 20000, performance_bonus: 8000, department: '市场部' },
  ],
  'caigou': [
    { id: 'proc_liu', name: '刘明', gender: '男', role: '采购经理', level: 'P6', personality: '严谨细致', base_salary: 22000, performance_bonus: 60000, department: '采购部' },
    { id: 'proc_zhang', name: '张伟', gender: '男', role: '采购专员', level: 'P5', personality: '踏实靠谱', base_salary: 18000, performance_bonus: 7000, department: '采购部' },
  ],
  'kefu': [
    { id: 'kefu_zhangli', name: '张丽', gender: '女', role: '客服经理', level: 'P6', personality: '热情耐心', base_salary: 20000, performance_bonus: 8000, department: '客服部' },
    { id: 'kefu_wangqiang', name: '王强', gender: '男', role: '客服专员', level: 'P4', personality: '善于沟通', base_salary: 12000, performance_bonus: 5000, department: '客服部' },
    { id: 'kefu_liuxia', name: '刘霞', gender: '女', role: '客服专员', level: 'P4', personality: '服务意识强', base_salary: 12000, performance_bonus: 5000, department: '客服部' },
    { id: 'kefu_chenming', name: '陈明', gender: '男', role: '客服专员', level: 'P4', personality: '耐心细致', base_salary: 12000, performance_bonus: 5000, department: '客服部' },
  ],
  'xingzheng': [
    { id: 'pm_manager_zhang', name: '张明', gender: '男', role: '项目经理', level: 'P6', personality: '结果导向', base_salary: 25000, performance_bonus: 60000, department: '项目管理部' },
    { id: 'pm_manager_li', name: '李娜', gender: '女', role: '项目经理', level: 'P6', personality: '严谨细致', base_salary: 24000, performance_bonus: 60000, department: '项目管理部' },
    { id: 'pm_manager_wang', name: '王强', gender: '男', role: '项目经理', level: 'P6', personality: '善于沟通', base_salary: 24000, performance_bonus: 60000, department: '项目管理部' },
    { id: 'pm_manager_zhao', name: '赵敏', gender: '女', role: '项目助理', level: 'P5', personality: '踏实靠谱', base_salary: 18000, performance_bonus: 7000, department: '项目管理部' },
    { id: 'pm_manager_sun', name: '孙伟', gender: '男', role: '项目助理', level: 'P5', personality: '专注高效', base_salary: 18000, performance_bonus: 7000, department: '项目管理部' },
  ],
  'chanpin': [
    { id: 'product_liuxiao', name: '刘晓', gender: '男', role: '高级产品经理', level: 'P8', personality: '结果导向', base_salary: 35000, performance_bonus: 15000, department: '产品管理部' },
    { id: 'product_wangjing', name: '王晶', gender: '女', role: '产品经理', level: 'P7', personality: '创新意识', base_salary: 28000, performance_bonus: 12000, department: '产品管理部' },
    { id: 'product_zhangli', name: '张力', gender: '男', role: '产品经理', level: 'P7', personality: '善于沟通', base_salary: 28000, performance_bonus: 12000, department: '产品管理部' },
    { id: 'product_sunna', name: '孙娜', gender: '女', role: '产品专员', level: 'P6', personality: '踏实靠谱', base_salary: 22000, performance_bonus: 9000, department: '产品管理部' },
    { id: 'product_chenming', name: '陈明', gender: '男', role: '产品专员', level: 'P6', personality: '严谨细致', base_salary: 22000, performance_bonus: 9000, department: '产品管理部' },
  ],
  'jingying': [
    { id: 'ops_wangqiang', name: '王强', gender: '男', role: 'COO', level: 'P9', personality: '结果导向', base_salary: 50000, performance_bonus: 30000, department: '经营管理部' },
    { id: 'ops_liuhua', name: '刘华', gender: '女', role: '经营分析师', level: 'P7', personality: '严谨细致', base_salary: 28000, performance_bonus: 12000, department: '经营管理部' },
    { id: 'ops_zhangwei', name: '张伟', gender: '男', role: '经营分析师', level: 'P7', personality: '数据敏感', base_salary: 28000, performance_bonus: 12000, department: '经营管理部' },
    { id: 'ops_sunyan', name: '孙燕', gender: '女', role: '运营专员', level: 'P6', personality: '善于沟通', base_salary: 22000, performance_bonus: 9000, department: '经营管理部' },
    { id: 'ops_liming', name: '李明', gender: '男', role: '运营专员', level: 'P6', personality: '专注高效', base_salary: 22000, performance_bonus: 9000, department: '经营管理部' },
  ],
  'pmo': [
    { id: 'pmo_zhaomin', name: '赵敏', gender: '女', role: 'PMO经理', level: 'P8', personality: '严谨细致', base_salary: 35000, performance_bonus: 15000, department: '企业级PMO' },
    { id: 'pmo_zhangli', name: '张力', gender: '男', role: 'PMO专员', level: 'P6', personality: '结果导向', base_salary: 25000, performance_bonus: 60000, department: '企业级PMO' },
    { id: 'pmo_wangjing', name: '王晶', gender: '女', role: 'PMO专员', level: 'P6', personality: '善于沟通', base_salary: 24000, performance_bonus: 60000, department: '企业级PMO' },
    { id: 'pmo_liuxiao', name: '刘晓', gender: '男', role: '质量经理', level: 'P7', personality: '踏实靠谱', base_salary: 28000, performance_bonus: 12000, department: '企业级PMO' },
    { id: 'pmo_sunlei', name: '孙磊', gender: '男', role: '质量专员', level: 'P6', personality: '专注高效', base_salary: 22000, performance_bonus: 9000, department: '企业级PMO' },
    { id: 'pmo_chenting', name: '陈婷', gender: '女', role: '质量专员', level: 'P6', personality: '严谨细致', base_salary: 22000, performance_bonus: 9000, department: '企业级PMO' },
    { id: 'pmo_zhouqiang', name: '周强', gender: '男', role: '流程优化专员', level: 'P6', personality: '创新意识', base_salary: 22000, performance_bonus: 9000, department: '企业级PMO' },
    { id: 'pmo_wangmei', name: '王梅', gender: '女', role: '流程优化专员', level: 'P6', personality: '善于沟通', base_salary: 22000, performance_bonus: 9000, department: '企业级PMO' },
  ],
  'zixun': [
    { id: 'consult_chenlei', name: '陈磊', gender: '男', role: '中心主任', level: 'P9', personality: '创新意识', base_salary: 50000, performance_bonus: 30000, department: '咨询中心' },
    { id: 'consult_liuxiao', name: '刘晓', gender: '男', role: '专家级咨询师', level: 'P8', personality: '结果导向', base_salary: 40000, performance_bonus: 20000, department: '咨询中心' },
    { id: 'consult_wangjing', name: '王晶', gender: '女', role: '高级咨询师', level: 'P7', personality: '善于沟通', base_salary: 32000, performance_bonus: 15000, department: '咨询中心' },
    { id: 'consult_zhangwei', name: '张伟', gender: '男', role: '高级咨询师', level: 'P7', personality: '严谨细致', base_salary: 32000, performance_bonus: 15000, department: '咨询中心' },
    { id: 'consult_lichao', name: '李超', gender: '男', role: '中级咨询师', level: 'P6', personality: '思维活跃', base_salary: 25000, performance_bonus: 60000, department: '咨询中心' },
    { id: 'consult_zhaomin', name: '赵敏', gender: '女', role: '中级咨询师', level: 'P6', personality: '热情主动', base_salary: 24000, performance_bonus: 60000, department: '咨询中心' },
    { id: 'consult_sunyan', name: '孙燕', gender: '女', role: '中级咨询师', level: 'P6', personality: '踏实靠谱', base_salary: 24000, performance_bonus: 60000, department: '咨询中心' },
    { id: 'consult_liuning', name: '刘宁', gender: '男', role: '初级咨询师', level: 'P5', personality: '学习能力强', base_salary: 18000, performance_bonus: 7000, department: '咨询中心' },
    { id: 'consult_wanghua', name: '王华', gender: '女', role: '初级咨询师', level: 'P5', personality: '服务意识强', base_salary: 18000, performance_bonus: 7000, department: '咨询中心' },
    { id: 'consult_zhangli', name: '张力', gender: '男', role: '初级咨询师', level: 'P5', personality: '专注高效', base_salary: 18000, performance_bonus: 7000, department: '咨询中心' },
  ],
  'zaochao': [
    { id: 'news_fengtao', name: '冯涛', gender: '男', role: '资讯专员', level: 'P6', personality: '创新意识', base_salary: 22000, performance_bonus: 9000, department: '资讯中心' },
  ],
  'main': [
    { id: 'assistant_chenming', name: '陈明', gender: '男', role: '总助', level: 'P7', personality: '结果导向', base_salary: 30000, performance_bonus: 15000, department: '总经办' },
  ],
};

// ── Templates ──

export interface TemplateParam {
  key: string;
  label: string;
  type: 'text' | 'textarea' | 'select';
  default?: string;
  required?: boolean;
  options?: string[];
}

export interface Template {
  id: string;
  cat: string;
  icon: string;
  name: string;
  desc: string;
  depts: string[];
  est: string;
  cost: string;
  params: TemplateParam[];
  command: string;
}

export const TEMPLATES: Template[] = [
  {
    id: 'tpl-weekly-report', cat: '日常办公', icon: '📝', name: '周报生成',
    desc: '基于本周看板数据和各部产出，自动生成结构化周报',
    depts: ['数据部', '文档部'], est: '~10分钟', cost: '¥0.5',
    params: [
      { key: 'date_range', label: '报告周期', type: 'text', default: '本周', required: true },
      { key: 'focus', label: '重点关注（逗号分隔）', type: 'text', default: '项目进展,下周计划' },
      { key: 'format', label: '输出格式', type: 'select', options: ['Markdown', '飞书文档'], default: 'Markdown' },
    ],
    command: '生成{date_range}的周报，重点覆盖{focus}，输出为{format}格式',
  },
  {
    id: 'tpl-code-review', cat: '工程开发', icon: '🔍', name: '代码审查',
    desc: '对指定代码仓库/文件进行质量审查，输出问题清单和改进建议',
    depts: ['开发部', '安全部'], est: '~20分钟', cost: '¥2',
    params: [
      { key: 'repo', label: '仓库/文件路径', type: 'text', required: true },
      { key: 'scope', label: '审查范围', type: 'select', options: ['全量', '增量(最近commit)', '指定文件'], default: '增量(最近commit)' },
      { key: 'focus', label: '重点关注（可选）', type: 'text', default: '安全漏洞,错误处理,性能' },
    ],
    command: '对 {repo} 进行代码审查，范围：{scope}，重点关注：{focus}',
  },
  {
    id: 'tpl-api-design', cat: '工程开发', icon: '⚡', name: 'API 设计与实现',
    desc: '从需求描述到 RESTful API 设计、实现、测试一条龙',
    depts: ['产品部', '开发部'], est: '~45分钟', cost: '¥3',
    params: [
      { key: 'requirement', label: '需求描述', type: 'textarea', required: true },
      { key: 'tech', label: '技术栈', type: 'select', options: ['Python/FastAPI', 'Node/Express', 'Go/Gin'], default: 'Python/FastAPI' },
      { key: 'auth', label: '鉴权方式', type: 'select', options: ['JWT', 'API Key', '无'], default: 'JWT' },
    ],
    command: '设计并实现一个 {tech} 的 RESTful API：{requirement}。鉴权方式：{auth}',
  },
  {
    id: 'tpl-competitor', cat: '数据分析', icon: '📊', name: '竞品分析',
    desc: '爬取竞品网站数据，分析对比，生成结构化报告',
    depts: ['开发部', '数据部', '文档部'], est: '~60分钟', cost: '¥5',
    params: [
      { key: 'targets', label: '竞品名称/URL（每行一个）', type: 'textarea', required: true },
      { key: 'dimensions', label: '分析维度', type: 'text', default: '产品功能,定价策略,用户评价' },
      { key: 'format', label: '输出格式', type: 'select', options: ['Markdown报告', '表格对比'], default: 'Markdown报告' },
    ],
    command: '对以下竞品进行分析：\n{targets}\n\n分析维度：{dimensions}，输出格式：{format}',
  },
  {
    id: 'tpl-data-report', cat: '数据分析', icon: '📈', name: '数据报告',
    desc: '对给定数据集进行清洗、分析、可视化，输出分析报告',
    depts: ['数据部', '文档部'], est: '~30分钟', cost: '¥2',
    params: [
      { key: 'data_source', label: '数据源描述/路径', type: 'text', required: true },
      { key: 'questions', label: '分析问题（每行一个）', type: 'textarea' },
      { key: 'viz', label: '是否需要可视化图表', type: 'select', options: ['是', '否'], default: '是' },
    ],
    command: '对数据 {data_source} 进行分析。{questions}\n需要可视化：{viz}',
  },
  {
    id: 'tpl-blog', cat: '内容创作', icon: '✍️', name: '博客文章',
    desc: '给定主题和要求，生成高质量博客文章',
    depts: ['文档部'], est: '~15分钟', cost: '¥1',
    params: [
      { key: 'topic', label: '文章主题', type: 'text', required: true },
      { key: 'audience', label: '目标读者', type: 'text', default: '技术人员' },
      { key: 'length', label: '期望字数', type: 'select', options: ['~1000字', '~2000字', '~3000字'], default: '~2000字' },
      { key: 'style', label: '风格', type: 'select', options: ['技术教程', '观点评论', '案例分析'], default: '技术教程' },
    ],
    command: '写一篇关于「{topic}」的博客文章，面向{audience}，{length}，风格：{style}',
  },
  {
    id: 'tpl-deploy', cat: '工程开发', icon: '🚀', name: '部署方案',
    desc: '生成完整的部署检查单、Docker配置、CI/CD流程',
    depts: ['开发部', '运维部'], est: '~25分钟', cost: '¥2',
    params: [
      { key: 'project', label: '项目名称/描述', type: 'text', required: true },
      { key: 'env', label: '部署环境', type: 'select', options: ['Docker', 'K8s', 'VPS', 'Serverless'], default: 'Docker' },
      { key: 'ci', label: 'CI/CD 工具', type: 'select', options: ['GitHub Actions', 'GitLab CI', '无'], default: 'GitHub Actions' },
    ],
    command: '为项目「{project}」生成{env}部署方案，CI/CD使用{ci}',
  },
  {
    id: 'tpl-email', cat: '内容创作', icon: '📧', name: '邮件/通知文案',
    desc: '根据场景和目的，生成专业邮件或通知文案',
    depts: ['文档部'], est: '~5分钟', cost: '¥0.3',
    params: [
      { key: 'scenario', label: '使用场景', type: 'select', options: ['商务邮件', '产品发布', '客户通知', '内部公告'], default: '商务邮件' },
      { key: 'purpose', label: '目的/内容', type: 'textarea', required: true },
      { key: 'tone', label: '语调', type: 'select', options: ['正式', '友好', '简洁'], default: '正式' },
    ],
    command: '撰写一封{scenario}，{tone}语调。内容：{purpose}',
  },
  {
    id: 'tpl-standup', cat: '日常办公', icon: '🗓️', name: '每日站会摘要',
    desc: '汇总各部今日进展和明日计划，生成站会摘要',
    depts: ['技术部'], est: '~5分钟', cost: '¥0.3',
    params: [
      { key: 'range', label: '汇总范围', type: 'select', options: ['今天', '最近24小时', '昨天+今天'], default: '今天' },
    ],
    command: '汇总{range}各部工作进展和待办，生成站会摘要',
  },
];

export const TPL_CATS = [
  { name: '全部', icon: '📋' },
  { name: '日常办公', icon: '💼' },
  { name: '数据分析', icon: '📊' },
  { name: '工程开发', icon: '⚙️' },
  { name: '内容创作', icon: '✍️' },
];

// ── Main Store ──

interface AppStore {
  // Data
  liveStatus: LiveStatus | null;
  agentConfig: AgentConfig | null;
  changeLog: ChangeLogEntry[];
  officialsData: OfficialsData | null;
  agentsStatusData: AgentsStatusData | null;
  morningBrief: MorningBrief | null;
  subConfig: SubConfig | null;

  // UI State
  activeTab: TabKey;
  oceFilter: 'active' | 'archived' | 'all';
  sessFilter: string;
  tplCatFilter: string;
  selectedOfficial: string | null;
  modalTaskId: string | null;
  countdown: number;

  // Toast
  toasts: { id: number; msg: string; type: 'ok' | 'err' }[];

  // Actions
  setActiveTab: (tab: TabKey) => void;
  setOceFilter: (f: 'active' | 'archived' | 'all') => void;
  setSessFilter: (f: string) => void;
  setTplCatFilter: (f: string) => void;
  setSelectedOfficial: (id: string | null) => void;
  setModalTaskId: (id: string | null) => void;
  setCountdown: (n: number) => void;
  toast: (msg: string, type?: 'ok' | 'err') => void;

  // Data fetching
  loadLive: () => Promise<void>;
  loadCoreData: () => Promise<void>;
  loadAgentConfig: () => Promise<void>;
  loadOfficials: () => Promise<void>;
  loadAgentsStatus: () => Promise<void>;
  loadMorning: () => Promise<void>;
  loadSubConfig: () => Promise<void>;
  loadAll: () => Promise<void>;
}

let _toastId = 0;

export const useStore = create<AppStore>((set, get) => ({
  liveStatus: null,
  agentConfig: null,
  changeLog: [],
  officialsData: null,
  agentsStatusData: null,
  morningBrief: null,
  subConfig: null,

  activeTab: 'oces',
  oceFilter: 'all',
  sessFilter: 'all',
  tplCatFilter: '全部',
  selectedOfficial: null,
  modalTaskId: null,
  countdown: 5,

  toasts: [],

  setActiveTab: (tab) => {
    set({ activeTab: tab });
    const s = get();
    if (['models', 'skills', 'sessions'].includes(tab) && !s.agentConfig) s.loadAgentConfig();
    if (tab === 'officials' && !s.officialsData) s.loadOfficials();
    if (tab === 'monitor') s.loadAgentsStatus();
    if (tab === 'morning' && !s.morningBrief) s.loadMorning();
  },
  setOceFilter: (f) => set({ oceFilter: f }),
  setSessFilter: (f) => set({ sessFilter: f }),
  setTplCatFilter: (f) => set({ tplCatFilter: f }),
  setSelectedOfficial: (id) => set({ selectedOfficial: id }),
  setModalTaskId: (id) => set({ modalTaskId: id }),
  setCountdown: (n) => set({ countdown: n }),

  toast: (msg, type = 'ok') => {
    const id = ++_toastId;
    set((s) => ({ toasts: [...s.toasts, { id, msg, type }] }));
    setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
    }, 3000);
  },

  loadLive: async () => {
    try {
      const data = await api.liveStatus();
      set({ liveStatus: data });
    } catch {
      // silently fail
    }
  },

  // 并行加载所有核心数据（用于页面首次加载）
  loadCoreData: async () => {
    try {
      // 并行加载，确保快速完成
      const [liveData, officialsData] = await Promise.all([
        api.liveStatus().catch(() => null),
        api.officialsStats().catch(() => null),
      ]);
      if (liveData) set({ liveStatus: liveData });
      if (officialsData) set({ officialsData });
    } catch {
      // silently fail
    }
  },

  loadAgentConfig: async () => {
    try {
      const cfg = await api.agentConfig();
      const log = await api.modelChangeLog();
      set({ agentConfig: cfg, changeLog: log });
    } catch {
      // silently fail
    }
  },

  loadOfficials: async () => {
    try {
      const data = await api.officialsStats();
      set({ officialsData: data });
    } catch {
      // silently fail
    }
  },

  loadAgentsStatus: async () => {
    try {
      const data = await api.agentsStatus();
      set({ agentsStatusData: data });
    } catch {
      set({ agentsStatusData: null });
    }
  },

  loadMorning: async () => {
    try {
      const [brief, config] = await Promise.all([api.morningBrief(), api.morningConfig()]);
      set({ morningBrief: brief, subConfig: config });
    } catch {
      // silently fail
    }
  },

  loadSubConfig: async () => {
    try {
      const config = await api.morningConfig();
      set({ subConfig: config });
    } catch {
      // silently fail
    }
  },

  loadAll: async () => {
    // 并行加载所有核心数据（liveStatus + officials），确保3秒内完成
    const s = get();
    
    // 核心数据并行加载（必须完成）
    await s.loadCoreData();
    
    // 后台预加载其他数据（不阻塞页面显示）
    Promise.all([
      api.agentConfig().then((d) => set({ agentConfig: d })).catch(() => {}),
      api.agentsStatus().then((d) => set({ agentsStatusData: d })).catch(() => {}),
    ]);
  },
}));

// ── Countdown & Polling ──

let _cdTimer: ReturnType<typeof setInterval> | null = null;

export function startPolling() {
  if (_cdTimer) return;
  useStore.getState().loadAll();
  _cdTimer = setInterval(() => {
    useStore.getState().loadAll();
  }, 60000);
}

export function stopPolling() {
  if (_cdTimer) {
    clearInterval(_cdTimer);
    _cdTimer = null;
  }
}

// ── Utility ──

export function esc(s: string | undefined | null): string {
  if (!s) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function timeAgo(iso: string | undefined): string {
  if (!iso) return '';
  try {
    const d = new Date(iso.includes('T') ? iso : iso.replace(' ', 'T') + 'Z');
    if (isNaN(d.getTime())) return '';
    const diff = Date.now() - d.getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return '刚刚';
    if (mins < 60) return mins + '分钟前';
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return hrs + '小时前';
    return Math.floor(hrs / 24) + '天前';
  } catch {
    return '';
  }
}
