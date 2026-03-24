#!/usr/bin/env python3
"""
看板数据刷新脚本
- 每天8时至22时：每5秒刷新一次
- 其他时间：每30秒刷新一次
"""
import json
import time
import subprocess
from datetime import datetime
from pathlib import Path

DATA_DIR = Path('/root/.openclaw/workspace-assistant/data')
REFRESH_SCRIPT = '/root/oce-main/scripts/refresh_live_data.py'
LOG_FILE = '/tmp/kanban_refresh.log'

def is_peak_hours():
    """判断是否在高峰时段（8:00-22:00）"""
    now = datetime.now()
    return 8 <= now.hour < 22

def refresh_kanban():
    """刷新看板数据"""
    try:
        result = subprocess.run(
            ['python3', REFRESH_SCRIPT],
            capture_output=True,
            text=True,
            timeout=30
        )
        if result.returncode == 0:
            print(f"[{datetime.now().strftime('%H:%M:%S')}] ✅ 看板数据已刷新")
        else:
            print(f"[{datetime.now().strftime('%H:%M:%S')}] ⚠️ 刷新失败: {result.stderr}")
    except Exception as e:
        print(f"[{datetime.now().strftime('%H:%M:%S')}] ❌ 错误: {e}")

def main():
    print(f"=== 看板刷新服务启动 ===")
    print(f"高峰时段 (8:00-22:00): 每5秒刷新")
    print(f"非高峰时段: 每30秒刷新")
    print(f"========================\n")
    
    while True:
        # 刷新数据
        refresh_kanban()
        
        # 根据时段决定间隔
        if is_peak_hours():
            interval = 5
        else:
            interval = 30
        
        time.sleep(interval)

if __name__ == '__main__':
    main()
