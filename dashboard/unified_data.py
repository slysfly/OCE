"""
统一数据源管理
所有板块（资金管理、COO视角、Agent池、成员总览、部门调度、技能配置）都从这里获取数据
"""
import json
from pathlib import Path

DATA = Path('/root/.openclaw/workspace-assistant/data')

def get_unified_data():
    """获取统一数据源"""
    # 1. 加载基础数据
    officials_stats = read_json(DATA / 'officials_stats.json', {})
    live_status = read_json(DATA / 'live_status.json', {})
    
    officials = officials_stats.get('officials', [])
    employees = officials_stats.get('employees', [])
    tasks = live_status.get('tasks', [])
    
    # 2. 计算各部门的任务分配（基于任务中的org和official字段）
    dept_tasks = {}  # {部门名: [任务列表]}
    official_tasks = {}  # {角色名: 任务数}
    
    for t in tasks:
        if t.get('archived'):
            continue
        state = t.get('state', '')
        if state in ('Done', 'Cancelled'):
            continue
        
        org = t.get('org', '')
        official = t.get('official', '')
        
        if org:
            if org not in dept_tasks:
                dept_tasks[org] = []
            dept_tasks[org].append(t)
        
        if official:
            official_tasks[official] = official_tasks.get(official, 0) + 1
    
    # 3. 更新每个官员/员工的状态
    for off in officials:
        dept = off.get('label', '')
        role = off.get('role', '')
        active_tasks = len(dept_tasks.get(dept, []))
        off['active_tasks'] = active_tasks
        off['status'] = 'busy' if active_tasks > 0 else 'idle'
        off['tasks_active'] = active_tasks
    
    for emp in employees:
        dept = emp.get('label', '')
        active_tasks = len(dept_tasks.get(dept, []))
        emp['active_tasks'] = active_tasks
        emp['status'] = 'busy' if active_tasks > 0 else 'idle'
    
    # 4. 计算汇总统计
    idle_count = sum(1 for e in employees if e.get('status') == 'idle')
    busy_count = sum(1 for e in employees if e.get('status') == 'busy')
    
    total_cost = sum(o.get('cost_cny', 0) for o in officials)
    total_cost += sum(e.get('cost_cny', 0) for e in employees)
    
    return {
        'officials': officials,
        'employees': employees,
        'tasks': tasks,
        'dept_tasks': dept_tasks,
        'totals': {
            'total_employees': len(employees),
            'total_departments': len(officials),
            'idle_agents': idle_count,
            'busy_agents': busy_count,
            'offline_agents': 0,
            'cost_cny': round(total_cost, 2),
            'tasks_done': sum(1 for t in tasks if t.get('state') == 'Done'),
            'tasks_active': sum(1 for t in tasks if t.get('state') not in ('Done', 'Cancelled')),
        }
    }

def read_json(path, default=None):
    """读取JSON文件"""
    try:
        with open(path) as f:
            return json.load(f)
    except:
        return default or {}

def save_officials_stats(data):
    """保存到officials_stats.json"""
    with open(DATA / 'officials_stats.json', 'w') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

# 运行时自动同步
if __name__ == '__main__':
    data = get_unified_data()
    save_officials_stats({
        'officials': data['officials'],
        'employees': data['employees'],
        'totals': data['totals']
    })
    print(f"已同步: {len(data['officials'])}个部门, {len(data['employees'])}个员工")
    print(f"忙: {data['totals']['busy_agents']}, 闲: {data['totals']['idle_agents']}")
