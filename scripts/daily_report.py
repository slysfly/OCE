#!/usr/bin/env python3
"""
每日工作报告 - 每天工作日17:00自动执行
生成当日工作总结报告，高大上排版
"""
import json
import pathlib
import sys
import urllib.request
import urllib.error
import subprocess
from datetime import datetime, timedelta

# 数据目录
OCLAW_DATA = pathlib.Path.home() / '.openclaw' / 'workspace-assistant' / 'data'
TASKS_FILE = OCLAW_DATA / 'tasks_source.json'
OPENCLAW_JSON = pathlib.Path.home() / '.openclaw' / 'openclaw.json'
REPORT_DIR = pathlib.Path('/tmp')
REPORT_FILE = REPORT_DIR / 'daily_report.txt'


def is_workday():
    """检查今天是否是工作日（周一到周五）"""
    weekday = datetime.now().weekday()
    return weekday < 5


def load_tasks():
    """加载任务列表"""
    try:
        return json.loads(TASKS_FILE.read_text())
    except Exception:
        return []


def send_message_via_subprocess(message):
    """通过subprocess调用message工具发送消息"""
    try:
        # 将消息写入临时文件
        msg_file = REPORT_DIR / 'msg_temp.txt'
        msg_file.write_text(message, encoding='utf-8')
        
        # 使用curl调用Gateway API
        cmd = [
            'curl', '-s', '-X', 'POST',
            'http://127.0.0.1:37908/api/message',
            '-H', 'Content-Type: application/json',
            '-d', f'{{"target": "ou_fe49a4c1bdb31e094165fd68bf161009", "message": "请查看附件日报", "channel": "feishu"}}'
        ]
        
        result = subprocess.run(cmd, capture_output=True, timeout=10)
        print(f"curl result: {result.returncode}")
        return True
    except Exception as e:
        print(f"发送失败: {e}")
        return False


def get_status_emoji(state):
    """获取状态对应的emoji"""
    status_map = {
        '助理': '🔖',
        '产品部': '📝',
        '架构委员会': '🔍',
        '技术部': '📮',
        '开发部': '⚙️',
        'Doing': '🚀',
        'Review': '🔎',
        'Pending': '⏸️',
        'Done': '✅',
        'Cancelled': '❌'
    }
    return status_map.get(state, '📌')


def generate_report():
    """生成每日工作报告"""
    tasks = load_tasks()
    
    today = datetime.now().strftime('%Y年%m月%d日')
    weekday_names = ['星期一', '星期二', '星期三', '星期四', '星期五', '星期六', '星期日']
    weekday = weekday_names[datetime.now().weekday()]
    
    total = len(tasks)
    done = [t for t in tasks if t.get('state') == 'Done']
    doing = [t for t in tasks if t.get('state') not in ('Done', 'Cancelled')]
    cancelled = [t for t in tasks if t.get('state') == 'Cancelled']
    
    report = f"""
╔══════════════════════════════════════════════════════════════════╗
║                     📊 OCE 每日工作报告                          ║
║                         {today} {weekday}                         ║
╠══════════════════════════════════════════════════════════════════╣
║                                                                  ║
║  📈 **今日工作概览**                                             ║
║  ─────────────────────────────────────────────────────────────  ║
║  ✅ 已完成任务:  **{len(done)}** 个                                ║
║  🔄 进行中任务:  **{len(doing)}** 个                               ║
║  ⏸️ 等待处理:    **{len(cancelled)}** 个                              ║
║  📋 任务总数:    **{total}** 个                                   ║
║                                                                  ║
╚══════════════════════════════════════════════════════════════════╝

"""
    
    if done:
        report += "### ✅ 今日已完成\n\n"
        for t in done[-5:]:
            tid = t.get('id', '')
            title = t.get('title', '')[:35]
            done_time = t.get('done_time', '')[:16]
            report += f"- **{tid}** {title}\n"
            if done_time:
                report += f"  └ 完成时间: {done_time}\n"
        if len(done) > 5:
            report += f"- ... 等共 {len(done)} 个任务\n"
        report += "\n---\n\n"
    
    if doing:
        report += "### 🔄 进行中任务\n\n"
        for t in doing[:8]:
            tid = t.get('id', '')
            title = t.get('title', '')[:30]
            state = t.get('state', '')
            now = t.get('now', '')[:25]
            emoji = get_status_emoji(state)
            report += f"**{emoji} {tid}** {title}\n"
            report += f"   └ 当前: {now}\n"
        if len(doing) > 8:
            report += f"- ... 等共 {len(doing)} 个任务进行中\n"
        report += "\n---\n\n"
    
    if not done and not doing:
        report += "### 🎉 今日工作已完成\n\n各部门运转正常，无待处理任务。\n"
    
    report += f"""
---
*📅 报告生成时间: {datetime.now().strftime('%H:%M')}*
*🤖 OCE AI员工管理系统*
"""
    
    return report


def main():
    if not is_workday():
        print(f"📅 今天是{['周六', '周日'][datetime.now().weekday()-5]}，跳过工作日报告")
        sys.exit(0)
    
    print("📋 开始生成每日工作报告...")
    report = generate_report()
    
    # 保存报告到文件
    date_str = datetime.now().strftime('%Y%m%d')
    report_path = REPORT_DIR / f'daily_report_{date_str}.txt'
    report_path.write_text(report, encoding='utf-8')
    print(f"📄 报告已保存: {report_path}")
    
    # 打印报告
    print(report)
    
    # 尝试发送消息提醒（如果失败则只保存报告）
    print("\n尝试发送消息提醒...")
    if send_message_via_subprocess(report):
        print("✅ 消息提醒已发送")
    else:
        print("⚠️ 自动发送失败，请手动查看报告")


if __name__ == '__main__':
    main()
