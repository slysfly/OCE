#!/usr/bin/env python3
"""同步各成员统计数据 → data/officials_stats.json"""
import json, pathlib, datetime, logging
from file_lock import atomic_json_write

log = logging.getLogger('officials')
logging.basicConfig(level=logging.INFO, format='%(asctime)s [%(name)s] %(message)s', datefmt='%H:%M:%S')

BASE = pathlib.Path(__file__).resolve().parent.parent
OCLAW_DATA = pathlib.Path.home() / '.openclaw' / 'workspace-assistant' / 'data'
DATA = OCLAW_DATA if OCLAW_DATA.exists() else BASE / 'data'
AGENTS_ROOT = pathlib.Path.home() / '.openclaw' / 'agents'
OPENCLAW_CFG = pathlib.Path.home() / '.openclaw' / 'openclaw.json'

# Anthropic 定价（每1M token，美元）
MODEL_PRICING = {
    'anthropic/claude-sonnet-4-6':  {'in':3.0, 'out':15.0, 'cr':0.30, 'cw':3.75},
    'anthropic/claude-opus-4-5':    {'in':15.0,'out':75.0, 'cr':1.50, 'cw':18.75},
    'anthropic/claude-haiku-3-5':   {'in':0.8, 'out':4.0,  'cr':0.08, 'cw':1.0},
    'openai/gpt-4o':                {'in':2.5, 'out':10.0, 'cr':1.25, 'cw':0},
    'openai/gpt-4o-mini':           {'in':0.15,'out':0.6,  'cr':0.075,'cw':0},
    'google/gemini-2.0-flash':      {'in':0.075,'out':0.3, 'cr':0,    'cw':0},
    'google/gemini-2.5-pro':        {'in':1.25,'out':10.0, 'cr':0,    'cw':0},
}

OFFICIALS = [
    {'id':'assistant',   'label':'助理',  'role':'助理',    'emoji':'🤴','rank':'CEO特助', 'headcount': 1, 'name': '陈明', 'gender': '男', 'personality': '结果导向'},
    {'id':'product','label':'产品部','role':'产品总监',  'emoji':'📜','rank':'VP级', 'headcount': 2, 'name': '王建国', 'gender': '男', 'personality': '善于沟通'},
    {'id':'architecture',  'label':'架构委员会','role':'架构师主席',    'emoji':'🔍','rank':'VP级', 'headcount': 2, 'name': '李志远', 'gender': '男', 'personality': '幽默风趣'},
    {'id':'tech','label':'技术部','role':'技术总监',  'emoji':'📮','rank':'VP级', 'headcount': 2, 'name': '张丽华', 'gender': '女', 'personality': '严谨细致'},
    {'id':'hr',    'label':'文档部',  'role':'文档总监','emoji':'📝','rank':'总监级', 'headcount': 2, 'name': '刘芳', 'gender': '女', 'personality': '雷厉风行'},
    {'id':'finance',    'label':'财务部',  'role':'财务总监','emoji':'💰','rank':'总监级', 'headcount': 2, 'name': '周雪梅', 'gender': '女', 'personality': '结果导向'},
    {'id':'shichang',  'label':'开发部',  'role':'开发总监','emoji':'⚔️','rank':'总监级', 'headcount': 4, 'name': '赵强', 'gender': '男', 'personality': '专注高效'},
    {'id':'legal',  'label':'安全部',  'role':'安全总监','emoji':'⚖️','rank':'总监级', 'headcount': 2, 'name': '孙伟', 'gender': '男', 'personality': '雷厉风行'},
    {'id':'ops',  'label':'运维部',  'role':'运维总监','emoji':'🔧','rank':'总监级', 'headcount': 3, 'name': '吴军', 'gender': '男', 'personality': '雷厉风行'},
    {'id':'hr_hr', 'label':'人力资源部',  'role':'HR总监','emoji':'👔','rank':'总监级', 'headcount': 2, 'name': '郑婷', 'gender': '女', 'personality': '专注高效'},
    {'id':'xingzheng', 'label':'行政部',  'role':'行政总监','emoji':'🏢','rank':'总监级', 'headcount': 2, 'name': '钱敏', 'gender': '女', 'personality': '理性客观'},
    {'id':'xiaoshou', 'label':'销售部',  'role':'销售总监','emoji':'💼','rank':'总监级', 'headcount': 3, 'name': '林志伟', 'gender': '男', 'personality': '善于沟通'},
    {'id':'shichang', 'label':'市场部',  'role':'市场总监','emoji':'📢','rank':'总监级', 'headcount': 2, 'name': '黄晓梅', 'gender': '女', 'personality': '创新意识'},
    {'id':'caigou', 'label':'采购部',  'role':'采购总监','emoji':'🛒','rank':'总监级', 'headcount': 2, 'name': '许志强', 'gender': '男', 'personality': '结果导向'},
    {'id':'kefu', 'label':'客服部',  'role':'客服总监','emoji':'🎧','rank':'总监级', 'headcount': 4, 'name': '周晓燕', 'gender': '女', 'personality': '热情耐心'},
    {'id':'zaochao', 'label':'资讯中心','role':'资讯专员',  'emoji':'📰','rank':'高级经理级', 'headcount': 1, 'name': '冯涛', 'gender': '男', 'personality': '创新意识'},
]

def rj(p, d):
    try: return json.loads(pathlib.Path(p).read_text())
    except Exception: return d


# Pre-load openclaw config once (avoid re-reading per agent)
_OPENCLAW_CACHE = None

def _load_openclaw_cfg():
    global _OPENCLAW_CACHE
    if _OPENCLAW_CACHE is None:
        _OPENCLAW_CACHE = rj(OPENCLAW_CFG, {})
    return _OPENCLAW_CACHE


def normalize_model(model_value, fallback='anthropic/claude-sonnet-4-6'):
    if isinstance(model_value, str) and model_value:
        return model_value
    if isinstance(model_value, dict):
        return model_value.get('primary') or model_value.get('id') or fallback
    return fallback

def get_model(agent_id):
    cfg = _load_openclaw_cfg()
    default = normalize_model(cfg.get('agents',{}).get('defaults',{}).get('model',{}), 'anthropic/claude-sonnet-4-6')
    for a in cfg.get('agents',{}).get('list',[]):
        if a.get('id') == agent_id:
            return normalize_model(a.get('model', default), default)
    # 兼容历史：助理曾使用 main 作为运行时 id
    if agent_id == 'assistant':
        for a in cfg.get('agents',{}).get('list',[]):
            if a.get('id') == 'main':
                return normalize_model(a.get('model', default), default)
    return default

def scan_agent(agent_id):
    """从 sessions.json 读取 token 统计（累计所有 session）"""
    sj = AGENTS_ROOT / agent_id / 'sessions' / 'sessions.json'
    if not sj.exists() and agent_id == 'assistant':
        sj = AGENTS_ROOT / 'main' / 'sessions' / 'sessions.json'
    if not sj.exists():
        return {'tokens_in':0,'tokens_out':0,'cache_read':0,'cache_write':0,'sessions':0,'last_active':None,'messages':0}
    
    data = rj(sj, {})
    tin = tout = cr = cw = 0
    last_ts = None
    
    for sid, v in data.items():
        tin += v.get('inputTokens', 0) or 0
        tout += v.get('outputTokens', 0) or 0
        cr  += v.get('cacheRead', 0) or 0
        cw  += v.get('cacheWrite', 0) or 0
        ts = v.get('updatedAt')
        if ts:
            try:
                t = datetime.datetime.fromtimestamp(ts/1000) if isinstance(ts,int) else datetime.datetime.fromisoformat(ts.replace('Z','+00:00'))
                if last_ts is None or t > last_ts: last_ts = t
            except Exception: pass
    
    # Estimate message count from most recent session JSONL
    msg_count = 0
    if data:
        try:
            sf_key = max(data.keys(), key=lambda k: data[k].get('updatedAt',0) or 0, default=None)
        except Exception:
            sf_key = None
    else:
        sf_key = None
    if sf_key and data[sf_key].get('sessionFile'):
        sf = AGENTS_ROOT / agent_id / 'sessions' / pathlib.Path(data[sf_key]['sessionFile']).name
        try:
            lines = sf.read_text(errors='ignore').splitlines()
            for ln in lines:
                try:
                    e = json.loads(ln)
                    if e.get('type') == 'message' and e.get('message',{}).get('role') == 'assistant':
                        msg_count += 1
                except Exception: pass
        except Exception: pass

    return {
        'tokens_in': tin, 'tokens_out': tout,
        'cache_read': cr, 'cache_write': cw,
        'sessions': len(data),
        'last_active': last_ts.strftime('%Y-%m-%d %H:%M') if last_ts else None,
        'messages': msg_count,
    }

def scan_assistant_sessions():
    """扫描助理会话文件（JSONL）中的token使用量"""
    sessions_dir = AGENTS_ROOT / 'assistant' / 'sessions'
    if not sessions_dir.exists():
        sessions_dir = AGENTS_ROOT / 'assistant' / 'sessions'
    if not sessions_dir.exists():
        return {'tokens_in': 0, 'tokens_out': 0, 'cache_read': 0, 'cache_write': 0, 'messages': 0}
    
    total_in = total_out = total_cr = total_cw = 0
    msg_count = 0
    
    for jsonl_file in sessions_dir.glob('*.jsonl'):
        try:
            for line in jsonl_file.read_text(errors='ignore').splitlines():
                try:
                    d = json.loads(line)
                    if d.get('type') == 'message':
                        usage = d.get('message', {}).get('usage', {})
                        if usage:
                            total_in += usage.get('input', 0)
                            total_out += usage.get('output', 0)
                            total_cr += usage.get('cacheRead', 0)
                            total_cw += usage.get('cacheWrite', 0)
                            if d.get('message', {}).get('role') == 'assistant':
                                msg_count += 1
                except Exception:
                    pass
        except Exception:
            pass
    
    return {
        'tokens_in': total_in,
        'tokens_out': total_out,
        'cache_read': total_cr,
        'cache_write': total_cw,
        'messages': msg_count,
    }

def calc_cost(s, model):
    p = MODEL_PRICING.get(model, MODEL_PRICING['anthropic/claude-sonnet-4-6'])
    usd = (s['tokens_in']/1e6*p['in'] + s['tokens_out']/1e6*p['out']
         + s['cache_read']/1e6*p['cr'] + s['cache_write']/1e6*p['cw'])
    return round(usd, 4)

def get_task_stats(org_label, tasks, official_name=None):
    # 如果提供了员工姓名，统计该员工的任务
    if official_name:
        done = [t for t in tasks if t.get('state')=='Done' and t.get('official')==official_name]
        active = [t for t in tasks if t.get('state') in ('Doing','Review','Assigned') and t.get('official')==official_name]
    else:
        done = [t for t in tasks if t.get('state')=='Done' and t.get('org')==org_label]
        active = [t for t in tasks if t.get('state') in ('Doing','Review','Assigned') and t.get('org')==org_label]
    fl = sum(1 for t in tasks for f in t.get('flow_log',[])
             if f.get('from')==org_label or f.get('to')==org_label)
    # 参与的任务（OCE）列表
    participated = []
    for t in tasks:
        if not t['id'].startswith('OCE'): continue
        for f in t.get('flow_log',[]):
            if f.get('from')==org_label or f.get('to')==org_label:
                if t['id'] not in [x['id'] for x in participated]:
                    participated.append({'id':t['id'],'title':t.get('title',''),'state':t.get('state','')})
                break
    return {'tasks_done':len(done),'tasks_active':len(active),
            'flow_participations':fl,'participated_oces':participated}

def get_hb(agent_id, live_tasks):
    for t in live_tasks:
        if t.get('sourceMeta',{}).get('agentId')==agent_id and t.get('heartbeat'):
            return t['heartbeat']
    return {'status':'idle','label':'⚪ 待命','ageSec':None}

def main():
    tasks = rj(DATA/'tasks_source.json', [])
    live  = rj(DATA/'live_status.json', {})
    live_tasks = live.get('tasks', [])
    
    # 优先从 agent_pool_config.json 获取所有员工（权威来源）
    agent_pool = rj(DATA / 'agent_pool_config.json', {})
    pool_officials = []
    
    # 从 assistant_pool 获取
    asst_pool = agent_pool.get('assistant_pool', {})
    for a in asst_pool.get('agents', []):
        pool_officials.append({
            'id': a.get('id'),
            'label': a.get('label'),
            'name': a.get('label'),
            'gender': a.get('gender'),
            'personality': a.get('personality'),
            'rank': a.get('rank'),
            'emoji': a.get('emoji', '🧑💼'),
            'role': a.get('role', '助理'),
            'org': a.get('org', '助理'),
            'skills': a.get('skills', []),
            'status': a.get('status', 'idle'),
        })
    
    # 从 department_pools 获取
    for dept_id, dept in agent_pool.get('department_pools', {}).items():
        for m in dept.get('managers', []):
            pool_officials.append({
                'id': m.get('id'),
                'label': m.get('label'),
                'name': m.get('label'),
                'gender': m.get('gender'),
                'personality': m.get('personality'),
                'rank': m.get('rank'),
                'emoji': m.get('emoji', '🧑💼'),
                'role': m.get('role', '负责人'),
                'org': m.get('org', dept.get('label', '')),
                'skills': m.get('skills', []),
                'status': m.get('status', 'idle'),
            })
        for e in dept.get('employees', []):
            pool_officials.append({
                'id': e.get('id'),
                'label': e.get('label'),
                'name': e.get('label'),
                'gender': e.get('gender'),
                'personality': e.get('personality'),
                'rank': e.get('rank'),
                'emoji': e.get('emoji', '🧑💼'),
                'role': e.get('role', '员工'),
                'org': e.get('org', dept.get('label', '')),
                'skills': e.get('skills', []),
                'status': e.get('status', 'idle'),
            })
    
    # 如果 agent_pool_config 有数据则使用，否则回退到 live_status 或 OFFICIALS
    if pool_officials:
        officials_to_sync = pool_officials
    elif live.get('officials'):
        officials_to_sync = live['officials']
    else:
        officials_to_sync = OFFICIALS

    result = []
    
    # 预先扫描助理会话（用户与助理的通信）- 只统计一次
    assistant_session_stats = scan_assistant_sessions()
    assistant_session_applied = False
    
    for off in officials_to_sync:
        off_id = off.get('id', '')
        off_name = off.get('name', off.get('label', ''))
        model = get_model(off_id)
        ss = scan_agent(off_id)
        ts = get_task_stats(off.get('org', ''), tasks, off_name)
        hb = get_hb(off_id, live_tasks)
        
        # 如果是助理角色，只给第一个助理累加用户与助理的会话token（避免重复计算）
        if (off.get('org') == '助理' or off.get('role') == '助理') and not assistant_session_applied:
            ss['tokens_in'] += assistant_session_stats['tokens_in']
            ss['tokens_out'] += assistant_session_stats['tokens_out']
            ss['cache_read'] += assistant_session_stats['cache_read']
            ss['cache_write'] += assistant_session_stats['cache_write']
            ss['messages'] += assistant_session_stats['messages']
            assistant_session_applied = True
        
        cost_usd = calc_cost(ss, model)

        result.append({
            **off,
            'model': model,
            'model_short': model.split('/')[-1] if isinstance(model, str) and '/' in model else str(model),
            'sessions': ss['sessions'],
            'tokens_in': ss['tokens_in'],
            'tokens_out': ss['tokens_out'],
            'cache_read': ss['cache_read'],
            'cache_write': ss['cache_write'],
            'tokens_total': ss['tokens_in'] + ss['tokens_out'],
            'messages': ss['messages'],
            'cost_usd': cost_usd,
            'cost_cny': round(cost_usd * 7.25, 2),
            'last_active': ss['last_active'],
            'heartbeat': hb,
            'tasks_done': ts['tasks_done'],
            'tasks_active': ts['tasks_active'],
            'flow_participations': ts['flow_participations'],
            'participated_oces': ts['participated_oces'],
            'merit_score': ts['tasks_done']*10 + ts['flow_participations']*2 + min(ss['sessions'],20),
        })

    result.sort(key=lambda x: x['merit_score'], reverse=True)
    for i, r in enumerate(result): r['merit_rank'] = i+1

    totals = {
        'tokens_total': sum(r['tokens_total'] for r in result),
        'cache_total':  sum(r['cache_read']+r['cache_write'] for r in result),
        'cost_usd':     round(sum(r['cost_usd'] for r in result), 2),
        'cost_cny':     round(sum(r['cost_cny'] for r in result), 2),
        'tasks_done':   sum(r['tasks_done'] for r in result),
    }
    top = max(result, key=lambda x: x['merit_score'], default={})

    payload = {
        'generatedAt': datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
        'officials': result,
        'totals': totals,
        'top_official': top.get('label',''),
    }
    atomic_json_write(DATA/'officials_stats.json', payload)
    log.info(f'{len(result)} officials | cost=¥{totals["cost_cny"]} | top={top.get("label","")}')

if __name__ == '__main__':
    main()
