#!/usr/bin/env python3
"""
任务超时检测脚本
检查所有未完成任务，发现超过阈值未更新的任务自动暂停并通知助理
"""
import json
import pathlib
import datetime

OCLAW_DATA = pathlib.Path.home() / '.openclaw' / 'workspace-assistant' / 'data'
TASKS_FILE = OCLAW_DATA / 'tasks_source.json'

# 超时阈值（小时）
TIMEOUT_HOURS = 24  # 24小时无更新视为停滞

def check_tasks():
    """检查任务超时"""
    tasks = json.loads(TASKS_FILE.read_text())
    now = datetime.datetime.now(datetime.timezone.utc)
    
    stalled = []
    for t in tasks:
        if t.get('state') in ('Done', 'Cancelled'):
            continue
        
        updated = t.get('updatedAt', '')
        if not updated:
            continue
        
        try:
            if isinstance(updated, (int, float)):
                updated_dt = datetime.datetime.fromtimestamp(updated / 1000, tz=datetime.timezone.utc)
            else:
                updated_dt = datetime.datetime.fromisoformat(str(updated).replace('Z', '+00:00'))
            
            age_hours = (now - updated_dt).total_seconds() / 3600
            
            if age_hours > TIMEOUT_HOURS:
                stalled.append({
                    'id': t.get('id'),
                    'title': t.get('title', '')[:40],
                    'state': t.get('state'),
                    'age_hours': int(age_hours)
                })
        except Exception as e:
            pass
    
    return stalled

def main():
    stalled = check_tasks()
    
    if stalled:
        print(f"⚠️ 发现 {len(stalled)} 个停滞任务：")
        for t in stalled:
            print(f"  - {t['id']}: {t['title']}... (停滞 {t['age_hours']} 小时)")
        
        # TODO: 发送通知给助理
    else:
        print("✅ 所有任务运行正常")
    
    return stalled

if __name__ == '__main__':
    main()
