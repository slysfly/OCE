#!/usr/bin/env python3
"""
任务巡检脚本 - 每3分钟检查一次任务状态，自动催促卡住的任务
"""
import json
import subprocess
from datetime import datetime, timedelta
from pathlib import Path

DATA = Path('/root/.openclaw/workspace-assistant/data')
PATROL_INTERVAL_MINUTES = 3
TASK_TIMEOUT_MINUTES = 30  # 30分钟未更新视为卡住

def load_tasks():
    """加载任务数据"""
    tasks_file = DATA / 'tasks_source.json'
    if tasks_file.exists():
        with open(tasks_file, 'r', encoding='utf-8') as f:
            return json.load(f)
    return []

def check_stuck_tasks(tasks):
    """检查卡住的任务"""
    now = datetime.now()
    stuck = []
    
    for t in tasks:
        state = t.get('state', '')
        # 只检查进行中的状态
        if state not in ['Doing', 'Assigned', 'Product', 'Tech', 'Review']:
            continue
        
        updated = t.get('updated_at') or t.get('updatedAt') or t.get('created_at')
        if updated:
            try:
                # 处理时间格式
                updated = updated.replace('Z', '+00:00')
                if '+' not in updated[-6:]:
                    updated = updated + '+00:00'
                dt = datetime.fromisoformat(updated)
                age = (now - dt.replace(tzinfo=None)).total_seconds() / 60
                
                if age > TASK_TIMEOUT_MINUTES:
                    stuck.append({
                        'id': t.get('id'),
                        'title': t.get('title'),
                        'state': state,
                        'age_minutes': int(age),
                        'updated': updated
                    })
            except Exception as e:
                print(f"[警告] 时间解析失败: {t.get('id')} - {e}")
    
    return stuck

def send_reminder(task):
    """发送催促提醒"""
    task_id = task['id']
    title = task['title']
    age = task['age_minutes']
    
    # 使用 kanban_update.py 发送进度更新
    cmd = [
        'python3', 
        '/root/oce-main/scripts/kanban_update.py',
        'progress',
        task_id,
        f'⚠️ 任务已{age}分钟未更新，请尽快处理',
        '巡检催促🔄'
    ]
    
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=10)
        print(f"[催促] {task_id}: {title[:30]} | 已{age}分钟未更新")
        return True
    except Exception as e:
        print(f"[错误] 催促失败: {task_id} - {e}")
        return False

def patrol():
    """执行巡检"""
    print(f"\n{'='*50}")
    print(f"[巡检] {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"{'='*50}")
    
    # 加载任务
    tasks = load_tasks()
    print(f"[信息] 加载 {len(tasks)} 个任务")
    
    # 检查卡住的任务
    stuck = check_stuck_tasks(tasks)
    
    if stuck:
        print(f"\n[警告] 发现 {len(stuck)} 个卡住的任务:")
        for t in stuck:
            print(f"  - {t['id']}: {t['title'][:30]} | {t['age_minutes']}分钟前")
            send_reminder(t)
    else:
        print("[正常] 无卡住任务")
    
    # 统计任务状态
    states = {}
    for t in tasks:
        s = t.get('state', 'Unknown')
        states[s] = states.get(s, 0) + 1
    
    print(f"\n[统计] 任务状态分布:")
    for s, c in sorted(states.items(), key=lambda x: -x[1]):
        print(f"  {s}: {c}个")
    
    return len(stuck)

if __name__ == '__main__':
    patrol()
