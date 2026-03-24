#!/usr/bin/env python3
import json, pathlib, datetime, logging
from file_lock import atomic_json_write, atomic_json_read
from utils import read_json

log = logging.getLogger('refresh')
logging.basicConfig(level=logging.INFO, format='%(asctime)s [%(name)s] %(message)s', datefmt='%H:%M:%S')

BASE = pathlib.Path(__file__).parent.parent
# 优先使用 OpenClaw 实际数据目录，否则回退到本地 data 目录
OCLAW_DATA = pathlib.Path.home() / '.openclaw' / 'workspace-assistant' / 'data'
DATA = OCLAW_DATA if OCLAW_DATA.exists() else BASE / 'data'

# 部门ID到部门名称的映射（与store.ts中DEPTS的id一致）
DEPT_ID_TO_NAME = {
    'assistant': '助理',
    'product': '产品部',
    'architecture': '架构委员会',
    'tech': '技术部',
    'hr': '文档部',
    'finance': '数据部',
    'shichang': '开发部',
    'ops': '运维部',
    'legal': '安全部',
    'hr_hr': '人力资源部',
    'zaochao': '资讯中心',
    'xiaoshou': '销售部',
    'shichang': '市场部',
    'caigou': '采购部',
    'kefu': '客服部',
    'xingzheng': '项目管理部',
    'chanpin': '产品管理部',
    'jingying': '经营管理部',
    'pmo': '企业级PMO',
    'zixun': '咨询中心',
    'main': '助理',
}


def output_meta(path):
    p = pathlib.Path(path)
    if not p.exists():
        return {"exists": False, "lastModified": None}
    ts = datetime.datetime.fromtimestamp(p.stat().st_mtime).strftime('%Y-%m-%d %H:%M:%S')
    return {"exists": True, "lastModified": ts}


def main():
    # 使用 officials_stats.json（与 sync_officials_stats.py 统一）
    officials_data = read_json(DATA / 'officials_stats.json', {})
    officials = officials_data.get('officials', []) if isinstance(officials_data, dict) else officials_data
    # 任务源优先：tasks_source.json（可对接外部系统同步写入）
    tasks = atomic_json_read(DATA / 'tasks_source.json', [])
    if not tasks:
        tasks = read_json(DATA / 'tasks.json', [])

    sync_status = read_json(DATA / 'sync_status.json', {})

    org_map = {}
    for o in officials:
        label = o.get('label', o.get('name', ''))
        if label:
            org_map[label] = label

    # 创建部门名称到部门领导ID的映射
    dept_leader_map = {}  # dept_name -> leader_id
    dept_staff_map = {}   # dept_name -> [staff_ids]
    
    for o in officials:
        org = o.get('org', '')
        if org:
            if org not in dept_staff_map:
                dept_staff_map[org] = []
            dept_staff_map[org].append(o.get('id'))
    
    # 每个部门的第一个员工是领导
    for org, staff_ids in dept_staff_map.items():
        if staff_ids:
            dept_leader_map[org] = staff_ids[0]

    # 统计每个员工正在执行的任务
    agent_running_tasks = {}  # staff_id -> [task_ids]
    
    now_ts = datetime.datetime.now(datetime.timezone.utc)
    for t in tasks:
        t['org'] = t.get('org') or org_map.get(t.get('official', ''), '')
        t['outputMeta'] = output_meta(t.get('output', ''))

        # 心跳时效检测：对 Doing/Assigned 状态的任务标注活跃度
        if t.get('state') in ('Doing', 'Assigned', 'Review'):
            updated_raw = t.get('updatedAt') or t.get('sourceMeta', {}).get('updatedAt')
            age_sec = None
            if updated_raw:
                try:
                    if isinstance(updated_raw, (int, float)):
                        updated_dt = datetime.datetime.fromtimestamp(updated_raw / 1000, tz=datetime.timezone.utc)
                    else:
                        updated_dt = datetime.datetime.fromisoformat(str(updated_raw).replace('Z', '+00:00'))
                        # 确保时区aware
                        if updated_dt.tzinfo is None:
                            updated_dt = updated_dt.replace(tzinfo=datetime.timezone.utc)
                    age_sec = (now_ts - updated_dt).total_seconds()
                except Exception:
                    pass
            if age_sec is None:
                t['heartbeat'] = {'status': 'unknown', 'label': '⚪ 未知', 'ageSec': None}
            elif age_sec < 180:
                t['heartbeat'] = {'status': 'active', 'label': f'🟢 活跃 {int(age_sec//60)}分钟前', 'ageSec': int(age_sec)}
            elif age_sec < 600:
                t['heartbeat'] = {'status': 'warn', 'label': f'🟡 可能停滞 {int(age_sec//60)}分钟前', 'ageSec': int(age_sec)}
            else:
                t['heartbeat'] = {'status': 'stalled', 'label': f'🔴 已停滞 {int(age_sec//60)}分钟', 'ageSec': int(age_sec)}
            
            # 记录正在执行任务的agent
            # 优先检查actualExecutor（下属员工），其次使用部门领导
            scheduler = t.get('scheduler', {})
            actual_executor = scheduler.get('actualExecutor')
            
            if actual_executor and actual_executor.get('id'):
                # 有具体执行人（下属员工）
                executor_id = actual_executor['id']
                if executor_id not in agent_running_tasks:
                    agent_running_tasks[executor_id] = []
                agent_running_tasks[executor_id].append(t.get('id'))
            else:
                # 使用部门领导
                progress_log = t.get('progress_log', [])
                if progress_log:
                    last_log = progress_log[-1]
                    agent_id = last_log.get('agent', '')  # 如 'product'
                    
                    # 将部门ID映射到部门领导ID
                    dept_name = DEPT_ID_TO_NAME.get(agent_id, agent_id)
                    leader_id = dept_leader_map.get(dept_name)
                    
                    if leader_id:
                        if leader_id not in agent_running_tasks:
                            agent_running_tasks[leader_id] = []
                        agent_running_tasks[leader_id].append(t.get('id'))
        else:
            t['heartbeat'] = None

    # 更新员工状态
    for off in officials:
        off_id = off.get('id', '')
        if off_id in agent_running_tasks:
            # 正在执行任务
            off['status'] = 'running'
            off['running_tasks'] = agent_running_tasks[off_id]
            off['status_label'] = f"🔄 执行中 ({len(agent_running_tasks[off_id])}个任务)"
        else:
            # 空闲
            off['status'] = 'idle'
            off['running_tasks'] = []
            off['status_label'] = '待命'

    today_str = datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%d')
    def _is_today_done(t):
        if t.get('state') != 'Done':
            return False
        ua = t.get('updatedAt', '')
        if isinstance(ua, str) and ua[:10] == today_str:
            return True
        # fallback: outputMeta lastModified
        lm = t.get('outputMeta', {}).get('lastModified', '')
        if isinstance(lm, str) and lm[:10] == today_str:
            return True
        return False
    today_done = sum(1 for t in tasks if _is_today_done(t))
    total_done = sum(1 for t in tasks if t.get('state') == 'Done')
    in_progress = sum(1 for t in tasks if t.get('state') in ['Doing', 'Review', 'Next', 'Blocked'])
    blocked = sum(1 for t in tasks if t.get('state') == 'Blocked')

    history = []
    for t in tasks:
        if t.get('state') == 'Done':
            lm = t.get('outputMeta', {}).get('lastModified')
            history.append({
                'at': lm or '未知',
                'official': t.get('official'),
                'task': t.get('title'),
                'out': t.get('output'),
                'qa': '通过' if t.get('outputMeta', {}).get('exists') else '待补成果'
            })

    payload = {
        'generatedAt': datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
        'taskSource': 'tasks_source.json' if (DATA / 'tasks_source.json').exists() else 'tasks.json',
        'officials': officials,
        'tasks': tasks,
        'history': history,
        'metrics': {
            'officialCount': len(officials),
            'todayDone': today_done,
            'totalDone': total_done,
            'inProgress': in_progress,
            'blocked': blocked
        },
        'syncStatus': sync_status,
        'health': {
            'syncOk': bool(sync_status.get('ok', False)),
            'syncLatencyMs': sync_status.get('durationMs'),
            'missingFieldCount': len(sync_status.get('missingFields', {})),
        }
    }

    atomic_json_write(DATA / 'live_status.json', payload)
    
    # 同时更新officials_stats.json中的状态
    officials_data['officials'] = officials
    atomic_json_write(DATA / 'officials_stats.json', officials_data)
    
    # 更新轻量预压缩文件（用于API快速响应）
    import gzip
    light_tasks = []
    for t in tasks:
        light_tasks.append({
            'id': t.get('id'),
            'title': t.get('title'),
            'state': t.get('state'),
            'org': t.get('org'),
            'official': t.get('official'),
            'priority': t.get('priority'),
            'created_at': t.get('created_at') or t.get('createdAt'),
            'updated_at': t.get('updated_at') or t.get('updatedAt'),
            'flow_log': t.get('flow_log', []),
        })
    light_data = {'tasks': light_tasks, 'generatedAt': datetime.datetime.now().isoformat()}
    with gzip.open(DATA / 'tasks_light.json.gz', 'wt', encoding='utf-8') as f:
        json.dump(light_data, f, ensure_ascii=False)
    
    log.info(f'updated live_status.json ({len(tasks)} tasks, {len(agent_running_tasks)} agents running)')
    log.info(f'updated tasks_light.json.gz ({len(light_tasks)} tasks)')


if __name__ == '__main__':
    main()
