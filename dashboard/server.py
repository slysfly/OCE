#!/usr/bin/env python3
"""
企业协作 · 看板本地 API 服务器
Port: 7891 (可通过 --port 修改)

Endpoints:
  GET  /                       → dashboard.html
  GET  /api/live-status        → data/live_status.json
  GET  /api/agent-config       → data/agent_config.json
  POST /api/set-model          → {agentId, model}
  GET  /api/model-change-log   → data/model_change_log.json
  GET  /api/last-result        → data/last_model_change_result.json
"""
import json, pathlib, subprocess, sys, threading, argparse, datetime, logging, re, os, time
import os
# 修复 PATH 问题，确保能找到 node
os.environ['PATH'] = '/root/.nvm/versions/node/v22.22.1/bin:' + os.environ.get('PATH', '')
from datetime import timedelta
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import urlparse
from urllib.request import Request, urlopen

# 引入文件锁工具，确保与其他脚本并发安全
scripts_dir = str(pathlib.Path(__file__).parent.parent / 'scripts')
sys.path.insert(0, scripts_dir)
from file_lock import atomic_json_read, atomic_json_write, atomic_json_update
from utils import validate_url, read_json, now_iso

def write_json(path, data):
    """Helper to write JSON file."""
    import json
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
from court_discuss import (
    create_session as cd_create, advance_discussion as cd_advance,
    get_session as cd_get, conclude_session as cd_conclude,
    list_sessions as cd_list, destroy_session as cd_destroy,
    get_fate_event as cd_fate, OFFICIAL_PROFILES as CD_PROFILES,
)

log = logging.getLogger('server')
logging.basicConfig(level=logging.INFO, format='%(asctime)s [%(name)s] %(message)s', datefmt='%H:%M:%S')

OCLAW_HOME = pathlib.Path.home() / '.openclaw'
MAX_REQUEST_BODY = 1 * 1024 * 1024  # 1 MB
ALLOWED_ORIGIN = None  # Set via --cors; None means restrict to localhost
_DEFAULT_ORIGINS = {
    'http://127.0.0.1:7891', 'http://localhost:7891',
    'http://127.0.0.1:5173', 'http://localhost:5173',  # Vite dev server
}
_SAFE_NAME_RE = re.compile(r'^[a-zA-Z0-9_\-\u4e00-\u9fff]+$')

BASE = pathlib.Path(__file__).parent
DIST = BASE / 'dist'          # React 构建产物 (npm run build)
# 优先使用 OpenClaw 实际数据目录，否则回退到本地 data 目录
OCLAW_DATA = pathlib.Path.home() / '.openclaw' / 'workspace-assistant' / 'data'
DATA = OCLAW_DATA if OCLAW_DATA.exists() else BASE.parent / "data"
SCRIPTS = BASE.parent / 'scripts'

# 静态资源 MIME 类型
_MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.js':   'application/javascript; charset=utf-8',
    '.css':  'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png':  'image/png',
    '.jpg':  'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif':  'image/gif',
    '.svg':  'image/svg+xml',
    '.ico':  'image/x-icon',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf':  'font/ttf',
    '.map':  'application/json',
}


def cors_headers(h):
    req_origin = h.headers.get('Origin', '')
    if ALLOWED_ORIGIN:
        origin = ALLOWED_ORIGIN
    elif req_origin in _DEFAULT_ORIGINS:
        origin = req_origin
    else:
        origin = 'http://127.0.0.1:7891'
    h.send_header('Access-Control-Allow-Origin', origin)
    h.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    h.send_header('Access-Control-Allow-Headers', 'Content-Type')


def load_tasks():
    return atomic_json_read(DATA / 'tasks_source.json', [])


def save_tasks(tasks):
    atomic_json_write(DATA / 'tasks_source.json', tasks)
    # Trigger refresh (异步，不阻塞，避免僵尸进程)
    def _refresh():
        try:
            subprocess.run(['python3', str(SCRIPTS / 'refresh_live_data.py')], timeout=30)
        except Exception as e:
            log.warning(f'refresh_live_data.py 触发失败: {e}')
    threading.Thread(target=_refresh, daemon=True).start()


def handle_task_action(task_id, action, reason):
    """Stop/cancel/resume a task from the dashboard."""
    tasks = load_tasks()
    task = next((t for t in tasks if t.get('id') == task_id), None)
    if not task:
        return {'ok': False, 'error': f'任务 {task_id} 不存在'}

    old_state = task.get('state', '')
    _ensure_scheduler(task)
    _scheduler_snapshot(task, f'task-action-before-{action}')

    if action == 'stop':
        task['state'] = 'Blocked'
        task['block'] = reason or '领导叫停'
        task['now'] = f'⏸️ 已暂停：{reason}'
    elif action == 'cancel':
        task['state'] = 'Cancelled'
        task['block'] = reason or '领导取消'
        task['now'] = f'🚫 已取消：{reason}'
    elif action == 'resume':
        # Resume to previous active state or Doing
        task['state'] = task.get('_prev_state', 'Doing')
        task['block'] = '无'
        task['now'] = f'▶️ 已恢复执行'

    if action in ('stop', 'cancel'):
        task['_prev_state'] = old_state  # Save for resume

    task.setdefault('flow_log', []).append({
        'at': now_iso(),
        'from': '领导',
        'to': task.get('org', ''),
        'remark': f'{"⏸️ 叫停" if action == "stop" else "🚫 取消" if action == "cancel" else "▶️ 恢复"}：{reason}'
    })

    if action == 'resume':
        _scheduler_mark_progress(task, f'恢复到 {task.get("state", "Doing")}')
    else:
        _scheduler_add_flow(task, f'领导{action}：{reason or "无"}')

    task['updatedAt'] = now_iso()

    save_tasks(tasks)
    if action == 'resume' and task.get('state') not in _TERMINAL_STATES:
        dispatch_for_state(task_id, task, task.get('state'), trigger='resume')
    label = {'stop': '已叫停', 'cancel': '已取消', 'resume': '已恢复'}[action]
    return {'ok': True, 'message': f'{task_id} {label}'}


def handle_archive_task(task_id, archived, archive_all_done=False):
    """Archive or unarchive a task, or batch-archive all Done/Cancelled tasks."""
    tasks = load_tasks()
    if archive_all_done:
        count = 0
        for t in tasks:
            if t.get('state') in ('Done', 'Cancelled') and not t.get('archived'):
                t['archived'] = True
                t['archivedAt'] = now_iso()
                count += 1
        save_tasks(tasks)
        return {'ok': True, 'message': f'{count} 道任务已归档', 'count': count}
    task = next((t for t in tasks if t.get('id') == task_id), None)
    if not task:
        return {'ok': False, 'error': f'任务 {task_id} 不存在'}
    task['archived'] = archived
    if archived:
        task['archivedAt'] = now_iso()
    else:
        task.pop('archivedAt', None)
    task['updatedAt'] = now_iso()
    save_tasks(tasks)
    label = '已归档' if archived else '已取消归档'
    return {'ok': True, 'message': f'{task_id} {label}'}


def update_task_todos(task_id, todos):
    """Update the todos list for a task."""
    tasks = load_tasks()
    task = next((t for t in tasks if t.get('id') == task_id), None)
    if not task:
        return {'ok': False, 'error': f'任务 {task_id} 不存在'}

    task['todos'] = todos
    task['updatedAt'] = now_iso()
    save_tasks(tasks)
    return {'ok': True, 'message': f'{task_id} todos 已更新'}


def read_skill_content(agent_id, skill_name):
    """Read SKILL.md content for a specific skill."""
    # 输入校验：防止路径遍历
    if not _SAFE_NAME_RE.match(agent_id) or not _SAFE_NAME_RE.match(skill_name):
        return {'ok': False, 'error': '参数含非法字符'}
    cfg = read_json(DATA / 'agent_config.json', {})
    agents = cfg.get('agents', [])
    ag = next((a for a in agents if a.get('id') == agent_id), None)
    if not ag:
        return {'ok': False, 'error': f'Agent {agent_id} 不存在'}
    sk = next((s for s in ag.get('skills', []) if s.get('name') == skill_name), None)
    if not sk:
        return {'ok': False, 'error': f'技能 {skill_name} 不存在'}
    skill_path = pathlib.Path(sk.get('path', '')).resolve()
    # 路径遍历保护：确保路径在 OCLAW_HOME 或项目目录下
    allowed_roots = (OCLAW_HOME.resolve(), BASE.parent.resolve())
    if not any(str(skill_path).startswith(str(root)) for root in allowed_roots):
        return {'ok': False, 'error': '路径不在允许的目录范围内'}
    if not skill_path.exists():
        return {'ok': True, 'name': skill_name, 'agent': agent_id, 'content': '(SKILL.md 文件不存在)', 'path': str(skill_path)}
    try:
        content = skill_path.read_text()
        return {'ok': True, 'name': skill_name, 'agent': agent_id, 'content': content, 'path': str(skill_path)}
    except Exception as e:
        return {'ok': False, 'error': str(e)}


def add_skill_to_agent(agent_id, skill_name, description, trigger=''):
    """Create a new skill for an agent with a standardised SKILL.md template."""
    if not _SAFE_NAME_RE.match(skill_name):
        return {'ok': False, 'error': f'skill_name 含非法字符: {skill_name}'}
    if not _SAFE_NAME_RE.match(agent_id):
        return {'ok': False, 'error': f'agentId 含非法字符: {agent_id}'}
    workspace = OCLAW_HOME / f'workspace-{agent_id}' / 'skills' / skill_name
    workspace.mkdir(parents=True, exist_ok=True)
    skill_md = workspace / 'SKILL.md'
    desc_line = description or skill_name
    trigger_section = f'\n## 触发条件\n{trigger}\n' if trigger else ''
    template = (f'---\n'
                f'name: {skill_name}\n'
                f'description: {desc_line}\n'
                f'---\n\n'
                f'# {skill_name}\n\n'
                f'{desc_line}\n'
                f'{trigger_section}\n'
                f'## 输入\n\n'
                f'<!-- 说明此技能接收什么输入 -->\n\n'
                f'## 处理流程\n\n'
                f'1. 步骤一\n'
                f'2. 步骤二\n\n'
                f'## 输出规范\n\n'
                f'<!-- 说明产出物格式与交付要求 -->\n\n'
                f'## 注意事项\n\n'
                f'- (在此补充约束、限制或特殊规则)\n')
    skill_md.write_text(template)
    # Re-sync agent config
    try:
        subprocess.run(['python3', str(SCRIPTS / 'sync_agent_config.py')], timeout=10)
    except Exception:
        pass
    return {'ok': True, 'message': f'技能 {skill_name} 已添加到 {agent_id}', 'path': str(skill_md)}


def add_remote_skill(agent_id, skill_name, source_url, description=''):
    """从远程 URL 或本地路径为 Agent 添加 skill SKILL.md 文件。
    
    支持的源：
    - HTTPS URLs: https://raw.gitfinancesercontent.com/...
    - 本地路径: /path/to/SKILL.md 或 file:///path/to/SKILL.md
    """
    # 输入校验
    if not _SAFE_NAME_RE.match(agent_id):
        return {'ok': False, 'error': f'agentId 含非法字符: {agent_id}'}
    if not _SAFE_NAME_RE.match(skill_name):
        return {'ok': False, 'error': f'skillName 含非法字符: {skill_name}'}
    if not source_url or not isinstance(source_url, str):
        return {'ok': False, 'error': 'sourceUrl 必须是有效的字符串'}
    
    source_url = source_url.strip()
    
    # 检查 Agent 是否存在
    cfg = read_json(DATA / 'agent_config.json', {})
    agents = cfg.get('agents', [])
    if not any(a.get('id') == agent_id for a in agents):
        return {'ok': False, 'error': f'Agent {agent_id} 不存在'}
    
    # 下载或读取文件内容
    try:
        if source_url.startswith('http://') or source_url.startswith('https://'):
            # HTTPS URL 校验
            if not validate_url(source_url, allowed_schemes=('https',)):
                return {'ok': False, 'error': 'URL 无效或不安全（仅支持 HTTPS）'}
            
            # 从 URL 下载，带超时保护
            req = Request(source_url, headers={'User-Agent': 'OpenClaw-SkillManager/1.0'})
            try:
                resp = urlopen(req, timeout=10)
                content = resp.read(10 * 1024 * 1024).decode('utf-8')  # 最多 10MB
                if len(content) > 10 * 1024 * 1024:
                    return {'ok': False, 'error': '文件过大（最大 10MB）'}
            except Exception as e:
                return {'ok': False, 'error': f'URL 无法访问: {str(e)[:100]}'}
        
        elif source_url.startswith('file://'):
            # file:// URL 格式
            local_path = pathlib.Path(source_url[7:])
            if not local_path.exists():
                return {'ok': False, 'error': f'本地文件不存在: {local_path}'}
            content = local_path.read_text()
        
        elif source_url.startswith('/') or source_url.startswith('.'):
            # 本地绝对或相对路径
            local_path = pathlib.Path(source_url).resolve()
            if not local_path.exists():
                return {'ok': False, 'error': f'本地文件不存在: {local_path}'}
            # 路径遍历防护
            allowed_roots = (OCLAW_HOME.resolve(), BASE.parent.resolve())
            if not any(str(local_path).startswith(str(root)) for root in allowed_roots):
                return {'ok': False, 'error': '路径不在允许的目录范围内'}
            content = local_path.read_text()
        
        else:
            return {'ok': False, 'error': '不支持的 URL 格式（仅支持 https://, file://, 或本地路径）'}
    except Exception as e:
        return {'ok': False, 'error': f'文件读取失败: {str(e)[:100]}'}
    
    # 基础验证：检查是否为 Markdown 且包含 YAML frontmatter
    if not content.startswith('---'):
        return {'ok': False, 'error': '文件格式无效（缺少 YAML frontmatter）'}
    
    # 验证 frontmatter 结构（先做字符串检查，再尝试 YAML 解析）
    parts = content.split('---', 2)
    if len(parts) < 3:
        return {'ok': False, 'error': '文件格式无效（YAML frontmatter 结构错误）'}
    if 'name:' not in content[:500]:
        return {'ok': False, 'error': '文件格式无效：frontmatter 缺少 name 字段'}
    try:
        import yaml
        yaml.safe_load(parts[1])  # 严格校验 YAML 语法
    except ImportError:
        pass  # PyYAML 未安装，跳过严格验证，字符串检查已通过
    except Exception as e:
        return {'ok': False, 'error': f'YAML 格式无效: {str(e)[:100]}'}
    
    # 创建本地目录
    workspace = OCLAW_HOME / f'workspace-{agent_id}' / 'skills' / skill_name
    workspace.mkdir(parents=True, exist_ok=True)
    skill_md = workspace / 'SKILL.md'
    
    # 写入 SKILL.md
    skill_md.write_text(content)
    
    # 保存源信息到 .source.json
    source_info = {
        'skillName': skill_name,
        'sourceUrl': source_url,
        'description': description,
        'addedAt': now_iso(),
        'lastUpdated': now_iso(),
        'checksum': _compute_checksum(content),
        'status': 'valid',
    }
    source_json = workspace / '.source.json'
    source_json.write_text(json.dumps(source_info, ensure_ascii=False, indent=2))
    
    # Re-sync agent config
    try:
        subprocess.run(['python3', str(SCRIPTS / 'sync_agent_config.py')], timeout=10)
    except Exception:
        pass
    
    return {
        'ok': True,
        'message': f'技能 {skill_name} 已从远程源添加到 {agent_id}',
        'skillName': skill_name,
        'agentId': agent_id,
        'source': source_url,
        'localPath': str(skill_md),
        'size': len(content),
        'addedAt': now_iso(),
    }


def get_remote_skills_list():
    """列表所有已添加的远程 skills 及其源信息"""
    remote_skills = []
    
    # 遍历所有 workspace
    for ws_dir in OCLAW_HOME.glob('workspace-*'):
        agent_id = ws_dir.name.replace('workspace-', '')
        skills_dir = ws_dir / 'skills'
        if not skills_dir.exists():
            continue
        
        for skill_dir in skills_dir.iterdir():
            if not skill_dir.is_dir():
                continue
            skill_name = skill_dir.name
            source_json = skill_dir / '.source.json'
            skill_md = skill_dir / 'SKILL.md'
            
            if not source_json.exists():
                # 本地创建的 skill，跳过
                continue
            
            try:
                source_info = json.loads(source_json.read_text())
                # 检查 SKILL.md 是否存在
                status = 'valid' if skill_md.exists() else 'not-found'
                remote_skills.append({
                    'skillName': skill_name,
                    'agentId': agent_id,
                    'sourceUrl': source_info.get('sourceUrl', ''),
                    'description': source_info.get('description', ''),
                    'localPath': str(skill_md),
                    'addedAt': source_info.get('addedAt', ''),
                    'lastUpdated': source_info.get('lastUpdated', ''),
                    'status': status,
                })
            except Exception:
                pass
    
    return {
        'ok': True,
        'remoteSkills': remote_skills,
        'count': len(remote_skills),
        'listedAt': now_iso(),
    }


def update_remote_skill(agent_id, skill_name):
    """更新已添加的远程 skill 为最新版本（重新从源 URL 下载）"""
    if not _SAFE_NAME_RE.match(agent_id):
        return {'ok': False, 'error': f'agentId 含非法字符: {agent_id}'}
    if not _SAFE_NAME_RE.match(skill_name):
        return {'ok': False, 'error': f'skillName 含非法字符: {skill_name}'}
    
    workspace = OCLAW_HOME / f'workspace-{agent_id}' / 'skills' / skill_name
    source_json = workspace / '.source.json'
    skill_md = workspace / 'SKILL.md'
    
    if not source_json.exists():
        return {'ok': False, 'error': f'技能 {skill_name} 不是远程 skill（无 .source.json）'}
    
    try:
        source_info = json.loads(source_json.read_text())
        source_url = source_info.get('sourceUrl', '')
        if not source_url:
            return {'ok': False, 'error': '源 URL 不存在'}
        
        # 重新下载
        result = add_remote_skill(agent_id, skill_name, source_url, 
                                  source_info.get('description', ''))
        if result['ok']:
            result['message'] = f'技能已更新'
            source_info_updated = json.loads(source_json.read_text())
            result['newVersion'] = source_info_updated.get('checksum', 'unknown')
        return result
    except Exception as e:
        return {'ok': False, 'error': f'更新失败: {str(e)[:100]}'}


def remove_remote_skill(agent_id, skill_name):
    """移除已添加的远程 skill"""
    if not _SAFE_NAME_RE.match(agent_id):
        return {'ok': False, 'error': f'agentId 含非法字符: {agent_id}'}
    if not _SAFE_NAME_RE.match(skill_name):
        return {'ok': False, 'error': f'skillName 含非法字符: {skill_name}'}
    
    workspace = OCLAW_HOME / f'workspace-{agent_id}' / 'skills' / skill_name
    if not workspace.exists():
        return {'ok': False, 'error': f'技能不存在: {skill_name}'}
    
    # 检查是否为远程 skill
    source_json = workspace / '.source.json'
    if not source_json.exists():
        return {'ok': False, 'error': f'技能 {skill_name} 不是远程 skill，无法通过此 API 移除'}
    
    try:
        # 删除整个 skill 目录
        import shutil
        shutil.rmtree(workspace)
        
        # Re-sync agent config
        try:
            subprocess.run(['python3', str(SCRIPTS / 'sync_agent_config.py')], timeout=10)
        except Exception:
            pass
        
        return {'ok': True, 'message': f'技能 {skill_name} 已从 {agent_id} 移除'}
    except Exception as e:
        return {'ok': False, 'error': f'移除失败: {str(e)[:100]}'}


def _compute_checksum(content: str) -> str:
    """计算内容的简单校验和（SHA256 的前16字符）"""
    import hashlib
    return hashlib.sha256(content.encode()).hexdigest()[:16]


def push_to_feishu():
    """Push morning brief link to Feishu via webhook."""
    cfg = read_json(DATA / 'morning_brief_config.json', {})
    webhook = cfg.get('feishu_webhook', '').strip()
    if not webhook:
        return
    if not validate_url(webhook, allowed_schemes=('https',), allowed_domains=('open.feishu.cn', 'open.larksuite.com')):
        log.warning(f'飞书 Webhook URL 不合法: {webhook}')
        return
    brief = read_json(DATA / 'morning_brief.json', {})
    date_str = brief.get('date', '')
    total = sum(len(v) for v in (brief.get('categories') or {}).values())
    if not total:
        return
    cat_lines = []
    for cat, items in (brief.get('categories') or {}).items():
        if items:
            cat_lines.append(f'  {cat}: {len(items)} 条')
    summary = '\n'.join(cat_lines)
    date_fmt = date_str[:4] + '年' + date_str[4:6] + '月' + date_str[6:] + '日' if len(date_str) == 8 else date_str
    payload = json.dumps({
        'msg_type': 'interactive',
        'card': {
            'header': {'title': {'tag': 'plain_text', 'content': f'📰 天下要闻 · {date_fmt}'}, 'template': 'blue'},
            'elements': [
                {'tag': 'div', 'text': {'tag': 'lark_md', 'content': f'共 **{total}** 条要闻已更新\n{summary}'}},
                {'tag': 'action', 'actions': [{'tag': 'button', 'text': {'tag': 'plain_text', 'content': '🔗 查看完整简报'}, 'url': 'http://127.0.0.1:7891', 'type': 'primary'}]},
                {'tag': 'note', 'elements': [{'tag': 'plain_text', 'content': f"采集于 {brief.get('generated_at', '')}"}]}
            ]
        }
    }).encode()
    try:
        req = Request(webhook, data=payload, headers={'Content-Type': 'application/json'})
        resp = urlopen(req, timeout=10)
        print(f'[飞书] 推送成功 ({resp.status})')
    except Exception as e:
        print(f'[飞书] 推送失败: {e}', file=sys.stderr)


# 任务标题最低要求
_MIN_TITLE_LEN = 6
_JUNK_TITLES = {
    '?', '？', '好', '好的', '是', '否', '不', '不是', '对', '了解', '收到',
    '嗯', '哦', '知道了', '开启了么', '可以', '不行', '行', 'ok', 'yes', 'no',
    '你去开启', '测试', '试试', '看看',
}


def handle_create_task(title, org='产品部', official='产品总监', priority='normal', template_id='', params=None, target_dept=''):
    """从看板创建新任务（任务模板下发）。"""
    if not title or not title.strip():
        return {'ok': False, 'error': '任务标题不能为空'}
    title = title.strip()
    # 剥离 Conversation info 元数据
    title = re.split(r'\n*Conversation info\s*\(', title, maxsplit=1)[0].strip()
    title = re.split(r'\n*```', title, maxsplit=1)[0].strip()
    # 清理常见前缀: "分配:" "下发:" 等
    title = re.sub(r'^(分配|下发)[：:\uff1a]\s*', '', title)
    if len(title) > 100:
        title = title[:100] + '…'
    # 标题质量校验：防止闲聊被误建为任务
    if len(title) < _MIN_TITLE_LEN:
        return {'ok': False, 'error': f'标题过短（{len(title)}<{_MIN_TITLE_LEN}字），不像是任务'}
    if title.lower() in _JUNK_TITLES:
        return {'ok': False, 'error': f'「{title}」不是有效任务，请输入具体工作指令'}
    # 生成 task id: OCE-YYYYMMDD-NNN
    today = datetime.datetime.now().strftime('%Y%m%d')
    tasks = load_tasks()
    today_ids = [t['id'] for t in tasks if t.get('id', '').startswith(f'OCE-{today}-')]
    seq = 1
    if today_ids:
        nums = [int(tid.split('-')[-1]) for tid in today_ids if tid.split('-')[-1].isdigit()]
        seq = max(nums) + 1 if nums else 1
    task_id = f'OCE-{today}-{seq:03d}'
    # 正确流程起点：领导 -> 助理分拣
    # target_dept 记录模板建议的最终执行部门（仅供技术部派发参考）
    initial_org = '助理'
    new_task = {
        'id': task_id,
        'title': title,
        'official': official,
        'org': initial_org,
        'state': 'Assistant',
        'now': '等待助理接旨分拣',
        'eta': '-',
        'block': '无',
        'output': '',
        'ac': '',
        'priority': priority,
        'templateId': template_id,
        'templateParams': params or {},
        'flow_log': [{
            'at': now_iso(),
            'from': '领导',
            'to': initial_org,
            'remark': f'下发：{title}'
        }],
        'updatedAt': now_iso(),
    }
    if target_dept:
        new_task['targetDept'] = target_dept

    _ensure_scheduler(new_task)
    _scheduler_snapshot(new_task, 'create-task-initial')
    _scheduler_mark_progress(new_task, '任务创建')

    tasks.insert(0, new_task)
    save_tasks(tasks)
    log.info(f'创建任务: {task_id} | {title[:40]}')

    dispatch_for_state(task_id, new_task, 'Assistant', trigger='imperial-oce')

    return {'ok': True, 'taskId': task_id, 'message': f'任务 {task_id} 已分配，正在派发给助理'}


def handle_review_action(task_id, action, comment=''):
    """架构委员会审批：通过/驳回。"""
    tasks = load_tasks()
    task = next((t for t in tasks if t.get('id') == task_id), None)
    if not task:
        return {'ok': False, 'error': f'任务 {task_id} 不存在'}
    if task.get('state') not in ('Review', 'Architecture'):
        return {'ok': False, 'error': f'任务 {task_id} 当前状态为 {task.get("state")}，无法审批'}

    _ensure_scheduler(task)
    _scheduler_snapshot(task, f'review-before-{action}')

    if action == 'approve':
        if task['state'] == 'Architecture':
            task['state'] = 'Assigned'
            task['now'] = '架构委员会通过，移交技术部派发'
            remark = f'✅ 通过：{comment or "架构委员会审议通过"}'
            to_dept = '技术部'
        else:  # Review
            task['state'] = 'Done'
            task['now'] = '审批通过，任务完成'
            remark = f'✅ 审批通过：{comment or "审查通过"}'
            to_dept = '领导'
    elif action == 'reject':
        round_num = (task.get('review_round') or 0) + 1
        task['review_round'] = round_num
        task['state'] = 'Product'
        task['now'] = f'驳回退回产品部修订（第{round_num}轮）'
        remark = f'🚫 驳回：{comment or "需要修改"}'
        to_dept = '产品部'
    else:
        return {'ok': False, 'error': f'未知操作: {action}'}

    task.setdefault('flow_log', []).append({
        'at': now_iso(),
        'from': '架构委员会' if task.get('state') != 'Done' else '领导',
        'to': to_dept,
        'remark': remark
    })
    _scheduler_mark_progress(task, f'审议动作 {action} -> {task.get("state")}')
    task['updatedAt'] = now_iso()
    save_tasks(tasks)

    # 🚀 审批后自动派发对应 Agent
    new_state = task['state']
    if new_state not in ('Done',):
        dispatch_for_state(task_id, task, new_state)

    label = '已通过' if action == 'approve' else '已驳回'
    dispatched = ' (已自动派发 Agent)' if new_state != 'Done' else ''
    return {'ok': True, 'message': f'{task_id} {label}{dispatched}'}


# ══ Agent 在线状态检测 ══
_AGENT_DEPTS = [
    {'id':'assistant',   'label':'助理',  'emoji':'🤴', 'role':'助理',     'rank':'CEO特助', 'headcount': 1, 'name': '陈明', 'gender': '男', 'personality': '结果导向'},
    {'id':'product','label':'产品部','emoji':'📜', 'role':'产品总监',   'rank':'VP级', 'headcount': 2, 'name': '王建国', 'gender': '男', 'personality': '善于沟通'},
    {'id':'architecture',  'label':'架构委员会','emoji':'🔍', 'role':'架构师主席',     'rank':'VP级', 'headcount': 2, 'name': '李志远', 'gender': '男', 'personality': '幽默风趣'},
    {'id':'tech','label':'技术部','emoji':'📮', 'role':'技术总监',   'rank':'VP级', 'headcount': 2, 'name': '张丽华', 'gender': '女', 'personality': '严谨细致'},
    {'id':'data',    'label':'数据部',  'emoji':'💰', 'role':'数据总监', 'rank':'总监级', 'headcount': 2, 'name': '周雪梅', 'gender': '女', 'personality': '结果导向'},
    {'id':'docs',    'label':'文档部',  'emoji':'📝', 'role':'文档总监', 'rank':'总监级', 'headcount': 2, 'name': '刘芳', 'gender': '女', 'personality': '雷厉风行'},
    {'id':'dev',  'label':'开发部',  'emoji':'⚔️', 'role':'开发总监', 'rank':'总监级', 'headcount': 4, 'name': '赵强', 'gender': '男', 'personality': '专注高效'},
    {'id':'security',  'label':'安全部',  'emoji':'⚖️', 'role':'安全总监', 'rank':'总监级', 'headcount': 2, 'name': '孙伟', 'gender': '男', 'personality': '雷厉风行'},
    {'id':'ops',  'label':'运维部',  'emoji':'🔧', 'role':'运维总监', 'rank':'总监级', 'headcount': 3, 'name': '吴军', 'gender': '男', 'personality': '雷厉风行'},
    {'id':'hr', 'label':'人力资源部',  'emoji':'👔', 'role':'HR总监', 'rank':'总监级', 'headcount': 2, 'name': '郑婷', 'gender': '女', 'personality': '专注高效'},
    {'id':'news', 'label':'资讯中心','emoji':'📰', 'role':'资讯专员',   'rank':'高级经理级', 'headcount': 1, 'name': '冯涛', 'gender': '男', 'personality': '创新意识'},
    {'id':'sales', 'label':'销售部','emoji':'💼', 'role':'销售总监',   'rank':'总监级', 'headcount': 3, 'name': '林志伟', 'gender': '男', 'personality': '善于沟通'},
    {'id':'marketing', 'label':'市场部','emoji':'📢', 'role':'市场总监',   'rank':'总监级', 'headcount': 2, 'name': '黄晓梅', 'gender': '女', 'personality': '创新意识'},
    {'id':'procurement', 'label':'采购部','emoji':'🛒', 'role':'采购总监',   'rank':'总监级', 'headcount': 2, 'name': '许志强', 'gender': '男', 'personality': '结果导向'},
    {'id':'support', 'label':'客服部','emoji':'🎧', 'role':'客服总监',   'rank':'总监级', 'headcount': 4, 'name': '周晓燕', 'gender': '女', 'personality': '热情耐心'},
    {'id':'pm', 'label':'项目管理部','emoji':'📋', 'role':'项目总监',   'rank':'VP级', 'headcount': 5, 'name': '张明', 'gender': '男', 'personality': '结果导向'},
    {'id':'product_mgmt', 'label':'产品管理部','emoji':'🎯', 'role':'产品总监',   'rank':'VP级', 'headcount': 5, 'name': '李娜', 'gender': '女', 'personality': '善于沟通'},
    {'id':'operations', 'label':'经营管理部','emoji':'📈', 'role':'COO',   'rank':'VP级', 'headcount': 5, 'name': '王强', 'gender': '男', 'personality': '严谨细致'},
    {'id':'pmo', 'label':'企业级PMO','emoji':'🎪', 'role':'PMO经理',   'rank':'总监级', 'headcount': 8, 'name': '赵敏', 'gender': '女', 'personality': '专注高效'},
    {'id':'consulting', 'label':'咨询中心','emoji':'💡', 'role':'中心主任',   'rank':'VP级', 'headcount': 15, 'name': '陈磊', 'gender': '男', 'personality': '创新意识'},
    {'id':'main', 'label':'总助','emoji':'🤴', 'role':'总助',   'rank':'CEO特助', 'headcount': 1, 'name': '陈明', 'gender': '男', 'personality': '结果导向'},
]

# ══ 部门员工配置 (含工资) ══
_DEPT_EMPLOYEES = {
    'product': [
        {'id': 'pm_liuxiao', 'name': '刘晓', 'gender': '男', 'role': '高级产品经理', 'level': 'P8', 'personality': '结果导向', 'base_salary': 35000, 'performance_bonus': 15000, 'department': '产品部'},
        {'id': 'pm_wangjing', 'name': '王晶', 'gender': '女', 'role': '产品经理', 'level': 'P7', 'personality': '踏实靠谱', 'base_salary': 28000, 'performance_bonus': 12000, 'department': '产品部'},
    ],
    'architecture': [
        {'id': 'arch_zhangwei', 'name': '张伟', 'gender': '男', 'role': '首席架构师', 'level': 'P8', 'personality': '善于沟通', 'base_salary': 40000, 'performance_bonus': 18000, 'department': '架构委员会'},
        {'id': 'arch_lichao', 'name': '李超', 'gender': '男', 'role': '资深架构师', 'level': 'P7', 'personality': '创新意识', 'base_salary': 32000, 'performance_bonus': 14000, 'department': '架构委员会'},
    ],
    'tech': [
        {'id': 'pm_manager_zhou', 'name': '周强', 'gender': '男', 'role': '项目总监', 'level': 'P8', 'personality': '踏实靠谱', 'base_salary': 38000, 'performance_bonus': 16000, 'department': '技术部'},
        {'id': 'pm_manager_li', 'name': '李娜', 'gender': '女', 'role': '项目经理', 'level': 'P6', 'personality': '严谨细致', 'base_salary': 25000, 'performance_bonus': 10000, 'department': '技术部'},
    ],
    'dev': [
        {'id': 'dev_zhangsan', 'name': '张三', 'gender': '男', 'role': '资深开发工程师', 'level': 'P7', 'personality': '理性客观', 'base_salary': 32000, 'performance_bonus': 14000, 'department': '开发部'},
        {'id': 'dev_lisi', 'name': '李四', 'gender': '男', 'role': '高级开发工程师', 'level': 'P6', 'personality': '团队精神', 'base_salary': 26000, 'performance_bonus': 11000, 'department': '开发部'},
        {'id': 'dev_wangwu', 'name': '王五', 'gender': '男', 'role': '开发工程师', 'level': 'P5', 'personality': '严谨细致', 'base_salary': 20000, 'performance_bonus': 8000, 'department': '开发部'},
        {'id': 'dev_zhaoliu', 'name': '赵六', 'gender': '女', 'role': '初级开发工程师', 'level': 'P4', 'personality': '踏实靠谱', 'base_salary': 12000, 'performance_bonus': 5000, 'department': '开发部'},
    ],
    'security': [
        {'id': 'sec_gaofeng', 'name': '高峰', 'gender': '男', 'role': '安全专家', 'level': 'P7', 'personality': '踏实靠谱', 'base_salary': 30000, 'performance_bonus': 13000, 'department': '安全部'},
        {'id': 'sec_sunli', 'name': '孙丽', 'gender': '女', 'role': '合规专员', 'level': 'P5', 'personality': '热情主动', 'base_salary': 18000, 'performance_bonus': 7000, 'department': '安全部'},
    ],
    'ops': [
        {'id': 'ops_chenjun', 'name': '陈军', 'gender': '男', 'role': '运维专家', 'level': 'P7', 'personality': '踏实靠谱', 'base_salary': 30000, 'performance_bonus': 13000, 'department': '运维部'},
        {'id': 'ops_yangming', 'name': '杨明', 'gender': '男', 'role': 'SRE工程师', 'level': 'P6', 'personality': '严谨细致', 'base_salary': 25000, 'performance_bonus': 10000, 'department': '运维部'},
        {'id': 'ops_wanghui', 'name': '王辉', 'gender': '男', 'role': 'DevOps工程师', 'level': 'P5', 'personality': '专注高效', 'base_salary': 20000, 'performance_bonus': 8000, 'department': '运维部'},
    ],
    'docs': [
        {'id': 'doc_liuxiang', 'name': '刘翔', 'gender': '男', 'role': '技术写作专家', 'level': 'P6', 'personality': '思维活跃', 'base_salary': 24000, 'performance_bonus': 9000, 'department': '文档部'},
        {'id': 'doc_zhangli', 'name': '张力', 'gender': '女', 'role': '文档工程师', 'level': 'P5', 'personality': '乐观开朗', 'base_salary': 18000, 'performance_bonus': 7000, 'department': '文档部'},
    ],
    'data': [
        {'id': 'fin_liuxiu', 'name': '刘秀', 'gender': '女', 'role': '高级财务分析师', 'level': 'P7', 'personality': '耐心负责', 'base_salary': 30000, 'performance_bonus': 13000, 'department': '财务部'},
        {'id': 'fin_wangqiang', 'name': '王强', 'gender': '男', 'role': '会计专员', 'level': 'P5', 'personality': '结果导向', 'base_salary': 18000, 'performance_bonus': 7000, 'department': '财务部'},
    ],
    'hr': [
        {'id': 'hr_liming', 'name': '李明', 'gender': '男', 'role': 'HR经理', 'level': 'P6', 'personality': '善于沟通', 'base_salary': 26000, 'performance_bonus': 11000, 'department': '人力资源部'},
        {'id': 'hr_zhangying', 'name': '张颖', 'gender': '女', 'role': '招聘专员', 'level': 'P5', 'personality': '热情主动', 'base_salary': 18000, 'performance_bonus': 7000, 'department': '人力资源部'},
    ],
    'pm': [
        {'id': 'admin_liqiang', 'name': '李强', 'gender': '男', 'role': '行政经理', 'level': 'P6', 'personality': '严谨细致', 'base_salary': 24000, 'performance_bonus': 9000, 'department': '行政部'},
        {'id': 'admin_sunyan', 'name': '孙燕', 'gender': '女', 'role': '行政专员', 'level': 'P4', 'personality': '踏实靠谱', 'base_salary': 12000, 'performance_bonus': 5000, 'department': '行政部'},
    ],
    'sales': [
        {'id': 'sales_linzhi', 'name': '林志', 'gender': '男', 'role': '销售经理', 'level': 'P7', 'personality': '善于沟通', 'base_salary': 25000, 'performance_bonus': 20000, 'department': '销售部'},
        {'id': 'sales_wangmei', 'name': '王梅', 'gender': '女', 'role': '商务专员', 'level': 'P5', 'personality': '热情主动', 'base_salary': 18000, 'performance_bonus': 12000, 'department': '销售部'},
        {'id': 'sales_zhouqiang', 'name': '周强', 'gender': '男', 'role': '客户经理', 'level': 'P5', 'personality': '结果导向', 'base_salary': 18000, 'performance_bonus': 15000, 'department': '销售部'},
    ],
    'marketing': [
        {'id': 'mkt_huangxiao', 'name': '黄晓', 'gender': '女', 'role': '市场经理', 'level': 'P7', 'personality': '创新意识', 'base_salary': 28000, 'performance_bonus': 12000, 'department': '市场部'},
        {'id': 'mkt_liujun', 'name': '刘军', 'gender': '男', 'role': '品牌专员', 'level': 'P5', 'personality': '思维活跃', 'base_salary': 20000, 'performance_bonus': 8000, 'department': '市场部'},
    ],
    'procurement': [
        {'id': 'proc_liu', 'name': '刘明', 'gender': '男', 'role': '采购经理', 'level': 'P6', 'personality': '严谨细致', 'base_salary': 22000, 'performance_bonus': 10000, 'department': '采购部'},
        {'id': 'proc_zhang', 'name': '张伟', 'gender': '男', 'role': '采购专员', 'level': 'P5', 'personality': '踏实靠谱', 'base_salary': 18000, 'performance_bonus': 7000, 'department': '采购部'},
    ],
    'support': [
        {'id': 'kefu_zhangli', 'name': '张丽', 'gender': '女', 'role': '客服经理', 'level': 'P6', 'personality': '热情耐心', 'base_salary': 20000, 'performance_bonus': 8000, 'department': '客服部'},
        {'id': 'kefu_wangqiang', 'name': '王强', 'gender': '男', 'role': '客服专员', 'level': 'P4', 'personality': '善于沟通', 'base_salary': 12000, 'performance_bonus': 5000, 'department': '客服部'},
        {'id': 'kefu_liuxia', 'name': '刘霞', 'gender': '女', 'role': '客服专员', 'level': 'P4', 'personality': '服务意识强', 'base_salary': 12000, 'performance_bonus': 5000, 'department': '客服部'},
        {'id': 'kefu_chenming', 'name': '陈明', 'gender': '男', 'role': '客服专员', 'level': 'P4', 'personality': '耐心细致', 'base_salary': 12000, 'performance_bonus': 5000, 'department': '客服部'},
    ],
    'pm': [
        {'id': 'pm_manager_zhang', 'name': '张明', 'gender': '男', 'role': '项目经理', 'level': 'P6', 'personality': '结果导向', 'base_salary': 25000, 'performance_bonus': 10000, 'department': '项目管理部'},
        {'id': 'pm_manager_li', 'name': '李娜', 'gender': '女', 'role': '项目经理', 'level': 'P6', 'personality': '严谨细致', 'base_salary': 24000, 'performance_bonus': 10000, 'department': '项目管理部'},
        {'id': 'pm_manager_wang', 'name': '王强', 'gender': '男', 'role': '项目经理', 'level': 'P6', 'personality': '善于沟通', 'base_salary': 24000, 'performance_bonus': 10000, 'department': '项目管理部'},
        {'id': 'pm_manager_zhao', 'name': '赵敏', 'gender': '女', 'role': '项目助理', 'level': 'P5', 'personality': '踏实靠谱', 'base_salary': 18000, 'performance_bonus': 7000, 'department': '项目管理部'},
        {'id': 'pm_manager_sun', 'name': '孙伟', 'gender': '男', 'role': '项目助理', 'level': 'P5', 'personality': '专注高效', 'base_salary': 18000, 'performance_bonus': 7000, 'department': '项目管理部'},
    ],
    'product_mgmt': [
        {'id': 'product_liuxiao', 'name': '刘晓', 'gender': '男', 'role': '高级产品经理', 'level': 'P8', 'personality': '结果导向', 'base_salary': 35000, 'performance_bonus': 15000, 'department': '产品管理部'},
        {'id': 'product_wangjing', 'name': '王晶', 'gender': '女', 'role': '产品经理', 'level': 'P7', 'personality': '创新意识', 'base_salary': 28000, 'performance_bonus': 12000, 'department': '产品管理部'},
        {'id': 'product_zhangli', 'name': '张力', 'gender': '男', 'role': '产品经理', 'level': 'P7', 'personality': '善于沟通', 'base_salary': 28000, 'performance_bonus': 12000, 'department': '产品管理部'},
        {'id': 'product_sunna', 'name': '孙娜', 'gender': '女', 'role': '产品专员', 'level': 'P6', 'personality': '踏实靠谱', 'base_salary': 22000, 'performance_bonus': 9000, 'department': '产品管理部'},
        {'id': 'product_chenming', 'name': '陈明', 'gender': '男', 'role': '产品专员', 'level': 'P6', 'personality': '严谨细致', 'base_salary': 22000, 'performance_bonus': 9000, 'department': '产品管理部'},
    ],
    'operations': [
        {'id': 'ops_wangqiang', 'name': '王强', 'gender': '男', 'role': 'COO', 'level': 'P9', 'personality': '结果导向', 'base_salary': 50000, 'performance_bonus': 30000, 'department': '经营管理部'},
        {'id': 'ops_liuhua', 'name': '刘华', 'gender': '女', 'role': '经营分析师', 'level': 'P7', 'personality': '严谨细致', 'base_salary': 28000, 'performance_bonus': 12000, 'department': '经营管理部'},
        {'id': 'ops_zhangwei', 'name': '张伟', 'gender': '男', 'role': '经营分析师', 'level': 'P7', 'personality': '数据敏感', 'base_salary': 28000, 'performance_bonus': 12000, 'department': '经营管理部'},
        {'id': 'ops_sunyan', 'name': '孙燕', 'gender': '女', 'role': '运营专员', 'level': 'P6', 'personality': '善于沟通', 'base_salary': 22000, 'performance_bonus': 9000, 'department': '经营管理部'},
        {'id': 'ops_liming', 'name': '李明', 'gender': '男', 'role': '运营专员', 'level': 'P6', 'personality': '专注高效', 'base_salary': 22000, 'performance_bonus': 9000, 'department': '经营管理部'},
    ],
    'pmo': [
        {'id': 'pmo_zhaomin', 'name': '赵敏', 'gender': '女', 'role': 'PMO经理', 'level': 'P8', 'personality': '严谨细致', 'base_salary': 35000, 'performance_bonus': 15000, 'department': '企业级PMO'},
        {'id': 'pmo_zhangli', 'name': '张力', 'gender': '男', 'role': 'PMO专员', 'level': 'P6', 'personality': '结果导向', 'base_salary': 25000, 'performance_bonus': 10000, 'department': '企业级PMO'},
        {'id': 'pmo_wangjing', 'name': '王晶', 'gender': '女', 'role': 'PMO专员', 'level': 'P6', 'personality': '善于沟通', 'base_salary': 24000, 'performance_bonus': 10000, 'department': '企业级PMO'},
        {'id': 'pmo_liuxiao', 'name': '刘晓', 'gender': '男', 'role': '质量经理', 'level': 'P7', 'personality': '踏实靠谱', 'base_salary': 28000, 'performance_bonus': 12000, 'department': '企业级PMO'},
        {'id': 'pmo_sunlei', 'name': '孙磊', 'gender': '男', 'role': '质量专员', 'level': 'P6', 'personality': '专注高效', 'base_salary': 22000, 'performance_bonus': 9000, 'department': '企业级PMO'},
        {'id': 'pmo_chenting', 'name': '陈婷', 'gender': '女', 'role': '质量专员', 'level': 'P6', 'personality': '严谨细致', 'base_salary': 22000, 'performance_bonus': 9000, 'department': '企业级PMO'},
        {'id': 'pmo_zhouqiang', 'name': '周强', 'gender': '男', 'role': '流程优化专员', 'level': 'P6', 'personality': '创新意识', 'base_salary': 22000, 'performance_bonus': 9000, 'department': '企业级PMO'},
        {'id': 'pmo_wangmei', 'name': '王梅', 'gender': '女', 'role': '流程优化专员', 'level': 'P6', 'personality': '善于沟通', 'base_salary': 22000, 'performance_bonus': 9000, 'department': '企业级PMO'},
    ],
    'consulting': [
        {'id': 'consult_chenlei', 'name': '陈磊', 'gender': '男', 'role': '中心主任', 'level': 'P9', 'personality': '创新意识', 'base_salary': 50000, 'performance_bonus': 30000, 'department': '咨询中心'},
        {'id': 'consult_liuxiao', 'name': '刘晓', 'gender': '男', 'role': '专家级咨询师', 'level': 'P8', 'personality': '结果导向', 'base_salary': 40000, 'performance_bonus': 20000, 'department': '咨询中心'},
        {'id': 'consult_wangjing', 'name': '王晶', 'gender': '女', 'role': '高级咨询师', 'level': 'P7', 'personality': '善于沟通', 'base_salary': 32000, 'performance_bonus': 15000, 'department': '咨询中心'},
        {'id': 'consult_zhangwei', 'name': '张伟', 'gender': '男', 'role': '高级咨询师', 'level': 'P7', 'personality': '严谨细致', 'base_salary': 32000, 'performance_bonus': 15000, 'department': '咨询中心'},
        {'id': 'consult_lichao', 'name': '李超', 'gender': '男', 'role': '中级咨询师', 'level': 'P6', 'personality': '思维活跃', 'base_salary': 25000, 'performance_bonus': 10000, 'department': '咨询中心'},
        {'id': 'consult_zhaomin', 'name': '赵敏', 'gender': '女', 'role': '中级咨询师', 'level': 'P6', 'personality': '热情主动', 'base_salary': 24000, 'performance_bonus': 10000, 'department': '咨询中心'},
        {'id': 'consult_sunyan', 'name': '孙燕', 'gender': '女', 'role': '中级咨询师', 'level': 'P6', 'personality': '踏实靠谱', 'base_salary': 24000, 'performance_bonus': 10000, 'department': '咨询中心'},
        {'id': 'consult_liuning', 'name': '刘宁', 'gender': '男', 'role': '初级咨询师', 'level': 'P5', 'personality': '学习能力强', 'base_salary': 18000, 'performance_bonus': 7000, 'department': '咨询中心'},
        {'id': 'consult_wanghua', 'name': '王华', 'gender': '女', 'role': '初级咨询师', 'level': 'P5', 'personality': '服务意识强', 'base_salary': 18000, 'performance_bonus': 7000, 'department': '咨询中心'},
        {'id': 'consult_zhangli', 'name': '张力', 'gender': '男', 'role': '初级咨询师', 'level': 'P5', 'personality': '专注高效', 'base_salary': 18000, 'performance_bonus': 7000, 'department': '咨询中心'},
    ],
    'news': [
        {'id': 'news_fengtao', 'name': '冯涛', 'gender': '男', 'role': '资讯专员', 'level': 'P6', 'personality': '创新意识', 'base_salary': 22000, 'performance_bonus': 9000, 'department': '资讯中心'},
    ],
    'main': [
        {'id': 'assistant_chenming', 'name': '陈明', 'gender': '男', 'role': '总助', 'level': 'P7', 'personality': '结果导向', 'base_salary': 30000, 'performance_bonus': 15000, 'department': '总经办'},
    ],
}


def _check_gateway_alive():
    """检测 Gateway 进程是否在运行。"""
    try:
        result = subprocess.run(['pgrep', '-f', 'openclaw-gateway'],
                                capture_output=True, text=True, timeout=5)
        return result.returncode == 0
    except Exception:
        return False


def _check_gateway_probe():
    """通过 HTTP probe 检测 Gateway 是否响应。"""
    try:
        from urllib.request import urlopen
        from urllib.error import URLError, HTTPError
        # 从 openclaw.json 读取实际端口
        cfg_path = OCLAW_HOME / 'openclaw.json'
        port = 37908  # 默认端口
        if cfg_path.exists():
            try:
                cfg = json.loads(cfg_path.read_text())
                port = cfg.get('port', port)
            except Exception:
                pass
        # Gateway 是 WebSocket 服务，根路径可能返回 404，但能连接就说明在运行
        try:
            resp = urlopen(f'http://127.0.0.1:{port}/', timeout=3)
            return resp.status == 200
        except HTTPError as e:
            # 404 也算正常，说明 Gateway 在运行
            return e.code in (200, 404)
    except Exception:
        return False


def _get_agent_session_status(agent_id):
    """读取 Agent 的 sessions.json 获取活跃状态。
    返回: (last_active_ts_ms, session_count, is_busy)
    """
    sessions_file = OCLAW_HOME / 'agents' / agent_id / 'sessions' / 'sessions.json'
    if not sessions_file.exists():
        return 0, 0, False
    try:
        data = json.loads(sessions_file.read_text())
        if not isinstance(data, dict):
            return 0, 0, False
        session_count = len(data)
        last_ts = 0
        for v in data.values():
            ts = v.get('updatedAt', 0)
            if isinstance(ts, (int, float)) and ts > last_ts:
                last_ts = ts
        now_ms = int(datetime.datetime.now().timestamp() * 1000)
        age_ms = now_ms - last_ts if last_ts else 9999999999
        is_busy = age_ms <= 2 * 60 * 1000  # 2分钟内视为正在工作
        return last_ts, session_count, is_busy
    except Exception:
        return 0, 0, False


def _check_agent_process(agent_id):
    """检测是否有该 Agent 的 openclaw-agent 进程正在运行。"""
    try:
        result = subprocess.run(
            ['pgrep', '-f', f'openclaw.*--agent.*{agent_id}'],
            capture_output=True, text=True, timeout=5
        )
        return result.returncode == 0
    except Exception:
        return False


def _check_agent_workspace(agent_id):
    """检查 Agent 工作空间是否存在。"""
    ws = OCLAW_HOME / f'workspace-{agent_id}'
    return ws.is_dir()


def get_agents_status():
    """获取所有 Agent 的在线状态。
    返回各 Agent 的:
    - status: 'running' | 'idle' | 'available' | 'unconfigured'
    - lastActive: 最后活跃时间
    - sessions: 会话数
    - hasWorkspace: 工作空间是否存在
    - processAlive: 是否有进程在运行
    
    7x24小时在线机制：所有已配置的Agent始终保持idle或running状态，永不离线
    
    数据源：从 agent_config.json 动态读取，确保与成员总览、COO视角同步
    """
    gateway_alive = _check_gateway_alive()
    gateway_probe = _check_gateway_probe() if gateway_alive else False

    agents = []
    seen_ids = set()
    
    # 从 agent_config.json 动态读取 Agent 配置
    agent_config = read_json(DATA / 'agent_config.json', {})
    config_agents = agent_config.get('agents', [])
    
    # 如果配置文件为空，回退到硬编码
    depts_to_use = config_agents if config_agents else _AGENT_DEPTS
    
    for dept in depts_to_use:
        # 兼容两种配置格式
        aid = dept.get('id', '')
        if aid in seen_ids or aid == 'main':  # 跳过 main（与 assistant 重复）
            continue
        seen_ids.add(aid)

        has_workspace = _check_agent_workspace(aid)
        last_ts, sess_count, is_busy = _get_agent_session_status(aid)
        process_alive = _check_agent_process(aid)

        # 7x24小时在线机制：已配置的Agent永不离线
        if not has_workspace:
            status = 'unconfigured'
            status_label = '❌ 未配置'
        elif process_alive or is_busy:
            status = 'running'
            status_label = '🟢 运行中'
        else:
            # 所有已配置的Agent保持在线（idle或available）
            # 根据最后活跃时间判断是idle还是available
            if last_ts > 0:
                now_ms = int(datetime.datetime.now().timestamp() * 1000)
                age_ms = now_ms - last_ts
                if age_ms <= 10 * 60 * 1000:  # 10分钟内活跃
                    status = 'available'
                    status_label = '🟢 待命'
                elif age_ms <= 3600 * 1000:  # 1小时内
                    status = 'idle'
                    status_label = '🟡 待命'
                else:
                    status = 'idle'
                    status_label = '⚪ 待命'  # 即使长时间未活跃也保持待命
            else:
                status = 'available'  # 新Agent默认为available
                status_label = '🟢 待命'

        # 格式化最后活跃时间
        last_active_str = None
        if last_ts > 0:
            try:
                last_active_str = datetime.datetime.fromtimestamp(
                    last_ts / 1000
                ).strftime('%m-%d %H:%M')
            except Exception:
                pass

        agents.append({
            'id': aid,
            'label': dept['label'],
            'emoji': dept['emoji'],
            'role': dept['role'],
            'status': status,
            'statusLabel': status_label,
            'lastActive': last_active_str,
            'lastActiveTs': last_ts,
            'sessions': sess_count,
            'hasWorkspace': has_workspace,
            'processAlive': process_alive,
        })

    return {
        'ok': True,
        'gateway': {
            'alive': gateway_alive,
            'probe': gateway_probe,
            'status': '🟢 运行中' if gateway_probe else ('🟡 进程在但无响应' if gateway_alive else '🔴 未启动'),
        },
        'agents': agents,
        'checkedAt': now_iso(),
    }


def wake_agent(agent_id, message=''):
    """唤醒指定 Agent，发送一条心跳/唤醒消息。"""
    if not _SAFE_NAME_RE.match(agent_id):
        return {'ok': False, 'error': f'agent_id 非法: {agent_id}'}
    if not _check_agent_workspace(agent_id):
        return {'ok': False, 'error': f'{agent_id} 工作空间不存在，请先配置'}
    if not _check_gateway_alive():
        return {'ok': False, 'error': 'Gateway 未启动，请先运行 openclaw gateway start'}

    # agent_id 直接作为 runtime_id（openclaw agents list 中的注册名）
    runtime_id = agent_id
    msg = message or f'🔔 系统心跳检测 — 请回复 OK 确认在线。当前时间: {now_iso()}'

    def do_wake():
        try:
            cmd = ['openclaw', 'agent', '--agent', runtime_id, '-m', msg, '--timeout', '120']
            log.info(f'🔔 唤醒 {agent_id}...')
            # 带重试（最多2次）
            for attempt in range(1, 3):
                result = subprocess.run(cmd, capture_output=True, text=True, timeout=130)
                if result.returncode == 0:
                    log.info(f'✅ {agent_id} 已唤醒')
                    return
                err_msg = result.stderr[:200] if result.stderr else result.stdout[:200]
                log.warning(f'⚠️ {agent_id} 唤醒失败(第{attempt}次): {err_msg}')
                if attempt < 2:
                    import time
                    time.sleep(5)
            log.error(f'❌ {agent_id} 唤醒最终失败')
        except subprocess.TimeoutExpired:
            log.error(f'❌ {agent_id} 唤醒超时(130s)')
        except Exception as e:
            log.warning(f'⚠️ {agent_id} 唤醒异常: {e}')
    threading.Thread(target=do_wake, daemon=True).start()

    return {'ok': True, 'message': f'{agent_id} 唤醒指令已发出，约10-30秒后生效'}


# ══ Agent 实时活动读取 ══

# 状态 → agent_id 映射
_STATE_AGENT_MAP = {
    'Assistant': 'assistant',
    'Product': 'zhongshu',
    'Architecture': 'shangshu',
    'Assigned': 'zhongshu',  # 默认分配给产品部
    'Review': 'menxia',
    'Pending': 'zhongshu',
    'Done': 'assistant',
}
_ORG_AGENT_MAP = {
    '文档部': 'gongbu', '数据部': 'xingbu', '开发部': 'zhongshu',
    '安全部': 'zaochao', '运维部': 'bingbu', '人力资源部': 'libu_hr',
    '产品部': 'zhongshu', '架构委员会': 'shangshu', '技术部': 'zhongshu',
    '财务部': 'hubu', '运营部': 'shichang', '采购部': 'caigou',
    '咨询中心': 'taizi', '企业级PMO': 'pmo', '经营管理部': 'zhongshu',
    '产品管理部': 'chanpin', '项目管理部': 'pmo', '助理': 'assistant',
}

_TERMINAL_STATES = {'Done', 'Cancelled'}

# ===== 并发任务处理配置 =====
_MAX_CONCURRENT_DISPATCHES = 200  # 最大并发派发数  # 最大并发派发数
_DISPATCH_QUEUE = []  # 待派发队列
_ACTIVE_DISPATCHES = {}  # 正在派发的任务 {'task_id': {'agent_id': 'xxx', 'start_time': ...}}


def _parse_iso(ts):
    if not ts or not isinstance(ts, str):
        return None
    try:
        return datetime.datetime.fromisoformat(ts.replace('Z', '+00:00'))
    except Exception:
        return None


def _ensure_scheduler(task):
    sched = task.setdefault('_scheduler', {})
    if not isinstance(sched, dict):
        sched = {}
        task['_scheduler'] = sched
    sched.setdefault('enabled', True)
    sched.setdefault('stallThresholdSec', 600)
    sched.setdefault('maxRetry', 2)
    sched.setdefault('retryCount', 0)
    sched.setdefault('escalationLevel', 0)
    sched.setdefault('autoRollback', True)
    if not sched.get('lastProgressAt'):
        sched['lastProgressAt'] = task.get('updatedAt') or now_iso()
    if 'stallSince' not in sched:
        sched['stallSince'] = None
    if 'lastDispatchStatus' not in sched:
        sched['lastDispatchStatus'] = 'idle'
    if 'snapshot' not in sched:
        sched['snapshot'] = {
            'state': task.get('state', ''),
            'org': task.get('org', ''),
            'now': task.get('now', ''),
            'savedAt': now_iso(),
            'note': 'init',
        }
    return sched


def _scheduler_add_flow(task, remark, to=''):
    task.setdefault('flow_log', []).append({
        'at': now_iso(),
        'from': '助理调度',
        'to': to or task.get('org', ''),
        'remark': f'🧭 {remark}'
    })


def _scheduler_snapshot(task, note=''):
    sched = _ensure_scheduler(task)
    sched['snapshot'] = {
        'state': task.get('state', ''),
        'org': task.get('org', ''),
        'now': task.get('now', ''),
        'savedAt': now_iso(),
        'note': note or 'snapshot',
    }


def _scheduler_mark_progress(task, note=''):
    sched = _ensure_scheduler(task)
    sched['lastProgressAt'] = now_iso()
    sched['stallSince'] = None
    sched['retryCount'] = 0
    sched['escalationLevel'] = 0
    sched['lastEscalatedAt'] = None
    if note:
        _scheduler_add_flow(task, f'进展确认：{note}')


def _update_task_scheduler(task_id, updater):
    tasks = load_tasks()
    task = next((t for t in tasks if t.get('id') == task_id), None)
    if not task:
        return False
    sched = _ensure_scheduler(task)
    updater(task, sched)
    task['updatedAt'] = now_iso()
    save_tasks(tasks)
    return True


def get_scheduler_state(task_id):
    tasks = load_tasks()
    task = next((t for t in tasks if t.get('id') == task_id), None)
    if not task:
        return {'ok': False, 'error': f'任务 {task_id} 不存在'}
    sched = _ensure_scheduler(task)
    last_progress = _parse_iso(sched.get('lastProgressAt') or task.get('updatedAt'))
    now_dt = datetime.datetime.now(datetime.timezone.utc)
    stalled_sec = 0
    if last_progress:
        stalled_sec = max(0, int((now_dt - last_progress).total_seconds()))
    return {
        'ok': True,
        'taskId': task_id,
        'state': task.get('state', ''),
        'org': task.get('org', ''),
        'scheduler': sched,
        'stalledSec': stalled_sec,
        'checkedAt': now_iso(),
    }


def handle_scheduler_retry(task_id, reason=''):
    tasks = load_tasks()
    task = next((t for t in tasks if t.get('id') == task_id), None)
    if not task:
        return {'ok': False, 'error': f'任务 {task_id} 不存在'}
    state = task.get('state', '')
    if state in _TERMINAL_STATES or state == 'Blocked':
        return {'ok': False, 'error': f'任务 {task_id} 当前状态 {state} 不支持重试'}

    sched = _ensure_scheduler(task)
    sched['retryCount'] = int(sched.get('retryCount') or 0) + 1
    sched['lastRetryAt'] = now_iso()
    sched['lastDispatchTrigger'] = 'assistant-retry'
    _scheduler_add_flow(task, f'触发重试第{sched["retryCount"]}次：{reason or "超时未推进"}')
    task['updatedAt'] = now_iso()
    save_tasks(tasks)

    dispatch_for_state(task_id, task, state, trigger='assistant-retry')
    return {'ok': True, 'message': f'{task_id} 已触发重试派发', 'retryCount': sched['retryCount']}


def handle_scheduler_escalate(task_id, reason=''):
    tasks = load_tasks()
    task = next((t for t in tasks if t.get('id') == task_id), None)
    if not task:
        return {'ok': False, 'error': f'任务 {task_id} 不存在'}
    state = task.get('state', '')
    if state in _TERMINAL_STATES:
        return {'ok': False, 'error': f'任务 {task_id} 已结束，无需升级'}

    sched = _ensure_scheduler(task)
    current_level = int(sched.get('escalationLevel') or 0)
    next_level = min(current_level + 1, 2)
    target = 'architecture' if next_level == 1 else 'tech'
    target_label = '架构委员会' if next_level == 1 else '技术部'

    sched['escalationLevel'] = next_level
    sched['lastEscalatedAt'] = now_iso()
    _scheduler_add_flow(task, f'升级到{target_label}协调：{reason or "任务停滞"}', to=target_label)
    task['updatedAt'] = now_iso()
    save_tasks(tasks)

    msg = (
        f'🧭 助理调度升级通知\n'
        f'任务ID: {task_id}\n'
        f'当前状态: {state}\n'
        f'停滞处理: 请你介入协调推进\n'
        f'原因: {reason or "任务超过阈值未推进"}\n'
        f'⚠️ 看板已有任务，请勿重复创建。'
    )
    wake_agent(target, msg)

    return {'ok': True, 'message': f'{task_id} 已升级至{target_label}', 'escalationLevel': next_level}


def handle_scheduler_rollback(task_id, reason=''):
    tasks = load_tasks()
    task = next((t for t in tasks if t.get('id') == task_id), None)
    if not task:
        return {'ok': False, 'error': f'任务 {task_id} 不存在'}
    sched = _ensure_scheduler(task)
    snapshot = sched.get('snapshot') or {}
    snap_state = snapshot.get('state')
    if not snap_state:
        return {'ok': False, 'error': f'任务 {task_id} 无可用回滚快照'}

    old_state = task.get('state', '')
    task['state'] = snap_state
    task['org'] = snapshot.get('org', task.get('org', ''))
    task['now'] = f'↩️ 助理调度自动回滚：{reason or "恢复到上个稳定节点"}'
    task['block'] = '无'
    sched['retryCount'] = 0
    sched['escalationLevel'] = 0
    sched['stallSince'] = None
    sched['lastProgressAt'] = now_iso()
    _scheduler_add_flow(task, f'执行回滚：{old_state} → {snap_state}，原因：{reason or "停滞恢复"}')
    task['updatedAt'] = now_iso()
    save_tasks(tasks)

    if snap_state not in _TERMINAL_STATES:
        dispatch_for_state(task_id, task, snap_state, trigger='assistant-rollback')

    return {'ok': True, 'message': f'{task_id} 已回滚到 {snap_state}'}


def handle_scheduler_scan(threshold_sec=600):
    threshold_sec = max(60, int(threshold_sec or 600))
    tasks = load_tasks()
    now_dt = datetime.datetime.now(datetime.timezone.utc)
    pending_retries = []
    pending_escalates = []
    pending_rollbacks = []
    actions = []
    changed = False

    for task in tasks:
        task_id = task.get('id', '')
        state = task.get('state', '')
        if not task_id or state in _TERMINAL_STATES or task.get('archived'):
            continue
        if state == 'Blocked':
            continue

        sched = _ensure_scheduler(task)
        task_threshold = int(sched.get('stallThresholdSec') or threshold_sec)
        last_progress = _parse_iso(sched.get('lastProgressAt') or task.get('updatedAt'))
        if not last_progress:
            continue
        stalled_sec = max(0, int((now_dt - last_progress).total_seconds()))
        if stalled_sec < task_threshold:
            continue

        if not sched.get('stallSince'):
            sched['stallSince'] = now_iso()
            changed = True

        retry_count = int(sched.get('retryCount') or 0)
        max_retry = max(0, int(sched.get('maxRetry') or 1))
        level = int(sched.get('escalationLevel') or 0)

        if retry_count < max_retry:
            sched['retryCount'] = retry_count + 1
            sched['lastRetryAt'] = now_iso()
            sched['lastDispatchTrigger'] = 'assistant-scan-retry'
            _scheduler_add_flow(task, f'停滞{stalled_sec}秒，触发自动重试第{sched["retryCount"]}次')
            pending_retries.append((task_id, state))
            actions.append({'taskId': task_id, 'action': 'retry', 'stalledSec': stalled_sec})
            changed = True
            continue

        if level < 2:
            next_level = level + 1
            target = 'architecture' if next_level == 1 else 'tech'
            target_label = '架构委员会' if next_level == 1 else '技术部'
            sched['escalationLevel'] = next_level
            sched['lastEscalatedAt'] = now_iso()
            _scheduler_add_flow(task, f'停滞{stalled_sec}秒，升级至{target_label}协调', to=target_label)
            pending_escalates.append((task_id, state, target, target_label, stalled_sec))
            actions.append({'taskId': task_id, 'action': 'escalate', 'to': target_label, 'stalledSec': stalled_sec})
            changed = True
            continue

        if sched.get('autoRollback', True):
            snapshot = sched.get('snapshot') or {}
            snap_state = snapshot.get('state')
            if snap_state and snap_state != state:
                old_state = state
                task['state'] = snap_state
                task['org'] = snapshot.get('org', task.get('org', ''))
                task['now'] = '↩️ 助理调度自动回滚到稳定节点'
                task['block'] = '无'
                sched['retryCount'] = 0
                sched['escalationLevel'] = 0
                sched['stallSince'] = None
                sched['lastProgressAt'] = now_iso()
                _scheduler_add_flow(task, f'连续停滞，自动回滚：{old_state} → {snap_state}')
                pending_rollbacks.append((task_id, snap_state))
                actions.append({'taskId': task_id, 'action': 'rollback', 'toState': snap_state})
                changed = True

    if changed:
        save_tasks(tasks)

    for task_id, state in pending_retries:
        retry_task = next((t for t in tasks if t.get('id') == task_id), None)
        if retry_task:
            dispatch_for_state(task_id, retry_task, state, trigger='assistant-scan-retry')

    for task_id, state, target, target_label, stalled_sec in pending_escalates:
        msg = (
            f'🧭 助理调度升级通知\n'
            f'任务ID: {task_id}\n'
            f'当前状态: {state}\n'
            f'已停滞: {stalled_sec} 秒\n'
            f'请立即介入协调推进\n'
            f'⚠️ 看板已有任务，请勿重复创建。'
        )
        wake_agent(target, msg)

    for task_id, state in pending_rollbacks:
        rollback_task = next((t for t in tasks if t.get('id') == task_id), None)
        if rollback_task and state not in _TERMINAL_STATES:
            dispatch_for_state(task_id, rollback_task, state, trigger='assistant-auto-rollback')

    return {
        'ok': True,
        'thresholdSec': threshold_sec,
        'actions': actions,
        'count': len(actions),
        'checkedAt': now_iso(),
    }


def _startup_recover_queued_dispatches():
    """服务启动后扫描 lastDispatchStatus=queued 的任务，重新派发。
    解决：kill -9 重启导致派发线程中断、任务永久卡住的问题。"""
    tasks = load_tasks()
    recovered = 0
    for task in tasks:
        task_id = task.get('id', '')
        state = task.get('state', '')
        if not task_id or state in _TERMINAL_STATES or task.get('archived'):
            continue
        sched = task.get('_scheduler') or {}
        if sched.get('lastDispatchStatus') == 'queued':
            log.info(f'🔄 启动恢复: {task_id} 状态={state} 上次派发未完成，重新派发')
            sched['lastDispatchTrigger'] = 'startup-recovery'
            dispatch_for_state(task_id, task, state, trigger='startup-recovery')
            recovered += 1
    if recovered:
        log.info(f'✅ 启动恢复完成: 重新派发 {recovered} 个任务')
    else:
        log.info(f'✅ 启动恢复: 无需恢复')


def handle_repair_flow_order():
    """修复历史任务中首条流转为“领导->产品部”的错序问题。"""
    tasks = load_tasks()
    fixed = 0
    fixed_ids = []

    for task in tasks:
        task_id = task.get('id', '')
        if not task_id.startswith('OCE-'):
            continue
        flow_log = task.get('flow_log') or []
        if not flow_log:
            continue

        first = flow_log[0]
        if first.get('from') != '领导' or first.get('to') != '产品部':
            continue

        first['to'] = '助理'
        remark = first.get('remark', '')
        if isinstance(remark, str) and remark.startswith('下发：'):
            first['remark'] = remark

        if task.get('state') == 'Product' and task.get('org') == '产品部' and len(flow_log) == 1:
            task['state'] = 'Assistant'
            task['org'] = '助理'
            task['now'] = '等待助理接旨分拣'

        task['updatedAt'] = now_iso()
        fixed += 1
        fixed_ids.append(task_id)

    if fixed:
        save_tasks(tasks)

    return {
        'ok': True,
        'count': fixed,
        'taskIds': fixed_ids[:80],
        'more': max(0, fixed - 80),
        'checkedAt': now_iso(),
    }


def _collect_message_text(msg):
    """收集消息中的可检索文本，用于 task_id/关键词过滤。"""
    parts = []
    for c in msg.get('content', []) or []:
        ctype = c.get('type')
        if ctype == 'text' and c.get('text'):
            parts.append(str(c.get('text', '')))
        elif ctype == 'thinking' and c.get('thinking'):
            parts.append(str(c.get('thinking', '')))
        elif ctype == 'tool_use':
            parts.append(json.dumps(c.get('input', {}), ensure_ascii=False))
    details = msg.get('details') or {}
    for key in ('output', 'stdout', 'stderr', 'message'):
        val = details.get(key)
        if isinstance(val, str) and val:
            parts.append(val)
    return ''.join(parts)


def _parse_activity_entry(item):
    """将 session jsonl 的 message 统一解析成看板活动条目。"""
    msg = item.get('message') or {}
    role = str(msg.get('role', '')).strip().lower()
    ts = item.get('timestamp', '')

    if role == 'assistant':
        text = ''
        thinking = ''
        tool_calls = []
        for c in msg.get('content', []) or []:
            if c.get('type') == 'text' and c.get('text') and not text:
                text = str(c.get('text', '')).strip()
            elif c.get('type') == 'thinking' and c.get('thinking') and not thinking:
                thinking = str(c.get('thinking', '')).strip()[:200]
            elif c.get('type') == 'tool_use':
                tool_calls.append({
                    'name': c.get('name', ''),
                    'input_preview': json.dumps(c.get('input', {}), ensure_ascii=False)[:100]
                })
        if not (text or thinking or tool_calls):
            return None
        entry = {'at': ts, 'kind': 'assistant'}
        if text:
            entry['text'] = text[:300]
        if thinking:
            entry['thinking'] = thinking
        if tool_calls:
            entry['tools'] = tool_calls
        return entry

    if role in ('toolresult', 'tool_result'):
        details = msg.get('details') or {}
        code = details.get('exitCode')
        if code is None:
            code = details.get('code', details.get('status'))
        output = ''
        for c in msg.get('content', []) or []:
            if c.get('type') == 'text' and c.get('text'):
                output = str(c.get('text', '')).strip()[:200]
                break
        if not output:
            for key in ('output', 'stdout', 'stderr', 'message'):
                val = details.get(key)
                if isinstance(val, str) and val.strip():
                    output = val.strip()[:200]
                    break

        entry = {
            'at': ts,
            'kind': 'tool_result',
            'tool': msg.get('toolName', msg.get('name', '')),
            'exitCode': code,
            'output': output,
        }
        duration_ms = details.get('durationMs')
        if isinstance(duration_ms, (int, float)):
            entry['durationMs'] = int(duration_ms)
        return entry

    if role == 'user':
        text = ''
        for c in msg.get('content', []) or []:
            if c.get('type') == 'text' and c.get('text'):
                text = str(c.get('text', '')).strip()
                break
        if not text:
            return None
        return {'at': ts, 'kind': 'user', 'text': text[:200]}

    return None


def get_agent_activity(agent_id, limit=30, task_id=None):
    """从 Agent 的 session jsonl 读取最近活动。
    如果 task_id 不为空，只返回提及该 task_id 的相关条目。
    """
    sessions_dir = OCLAW_HOME / 'agents' / agent_id / 'sessions'
    if not sessions_dir.exists():
        return []

    # 扫描所有 jsonl（按修改时间倒序），优先最新
    jsonl_files = sorted(sessions_dir.glob('*.jsonl'), key=lambda f: f.stat().st_mtime, reverse=True)
    if not jsonl_files:
        return []

    entries = []
    # 如果需要按 task_id 过滤，可能需要扫描多个文件
    files_to_scan = jsonl_files[:3] if task_id else jsonl_files[:1]

    for session_file in files_to_scan:
        try:
            lines = session_file.read_text(errors='ignore').splitlines()
        except Exception:
            continue

        # 正向扫描以保持时间顺序；如果有 task_id，收集提及 task_id 的条目
        for ln in lines:
            try:
                item = json.loads(ln)
            except Exception:
                continue
            msg = item.get('message') or {}
            all_text = _collect_message_text(msg)

            # task_id 过滤：只保留提及 task_id 的条目
            if task_id and task_id not in all_text:
                continue
            entry = _parse_activity_entry(item)
            if entry:
                entries.append(entry)

            if len(entries) >= limit:
                break
        if len(entries) >= limit:
            break

    # 只保留最后 limit 条
    return entries[-limit:]


def _extract_keywords(title):
    """从任务标题中提取有意义的关键词（用于 session 内容匹配）。"""
    stop = {'的', '了', '在', '是', '有', '和', '与', '或', '一个', '一篇', '关于', '进行',
            '写', '做', '请', '把', '给', '用', '要', '需要', '面向', '风格', '包含',
            '出', '个', '不', '可以', '应该', '如何', '怎么', '什么', '这个', '那个'}
    # 提取英文词
    en_words = re.findall(r'[a-zA-Z][\w.-]{1,}', title)
    # 提取 2-4 字中文词组（更短的颗粒度）
    cn_words = re.findall(r'[\u4e00-\u9fff]{2,4}', title)
    all_words = en_words + cn_words
    kws = [w for w in all_words if w not in stop and len(w) >= 2]
    # 去重保序
    seen = set()
    unique = []
    for w in kws:
        if w.lower() not in seen:
            seen.add(w.lower())
            unique.append(w)
    return unique[:8]  # 最多 8 个关键词


def get_agent_activity_by_keywords(agent_id, keywords, limit=20):
    """从 agent session 中按关键词匹配获取活动条目。
    找到包含关键词的 session 文件，只读该文件的活动。
    """
    sessions_dir = OCLAW_HOME / 'agents' / agent_id / 'sessions'
    if not sessions_dir.exists():
        return []

    jsonl_files = sorted(sessions_dir.glob('*.jsonl'), key=lambda f: f.stat().st_mtime, reverse=True)
    if not jsonl_files:
        return []

    # 找到包含关键词的 session 文件
    target_file = None
    for sf in jsonl_files[:5]:
        try:
            content = sf.read_text(errors='ignore')
        except Exception:
            continue
        hits = sum(1 for kw in keywords if kw.lower() in content.lower())
        if hits >= min(2, len(keywords)):
            target_file = sf
            break

    if not target_file:
        return []

    # 解析 session 文件，按 user 消息分割为对话段
    # 找到包含关键词的对话段，只返回该段的活动
    try:
        lines = target_file.read_text(errors='ignore').splitlines()
    except Exception:
        return []

    # 第一遍：找到关键词匹配的 user 消息位置
    user_msg_indices = []  # (line_index, user_text)
    for i, ln in enumerate(lines):
        try:
            item = json.loads(ln)
        except Exception:
            continue
        msg = item.get('message') or {}
        if msg.get('role') == 'user':
            text = ''
            for c in msg.get('content', []):
                if c.get('type') == 'text' and c.get('text'):
                    text += c['text']
            user_msg_indices.append((i, text))

    # 找到与关键词匹配度最高的 user 消息
    best_idx = -1
    best_hits = 0
    for line_idx, utext in user_msg_indices:
        hits = sum(1 for kw in keywords if kw.lower() in utext.lower())
        if hits > best_hits:
            best_hits = hits
            best_idx = line_idx

    # 确定对话段的行范围：从匹配的 user 消息到下一个 user 消息之前
    if best_idx >= 0 and best_hits >= min(2, len(keywords)):
        # 找下一个 user 消息的位置
        next_user_idx = len(lines)
        for line_idx, _ in user_msg_indices:
            if line_idx > best_idx:
                next_user_idx = line_idx
                break
        start_line = best_idx
        end_line = next_user_idx
    else:
        # 没找到匹配的对话段，返回空
        return []

    # 第二遍：只解析对话段内的行
    entries = []
    for ln in lines[start_line:end_line]:
        try:
            item = json.loads(ln)
        except Exception:
            continue
        entry = _parse_activity_entry(item)
        if entry:
            entries.append(entry)

    return entries[-limit:]


def get_agent_latest_segment(agent_id, limit=20):
    """获取 Agent 最新一轮对话段（最后一条 user 消息起的所有内容）。
    用于活跃任务没有精确匹配时，展示 Agent 的实时工作状态。
    """
    sessions_dir = OCLAW_HOME / 'agents' / agent_id / 'sessions'
    if not sessions_dir.exists():
        return []

    jsonl_files = sorted(sessions_dir.glob('*.jsonl'),
                         key=lambda f: f.stat().st_mtime, reverse=True)
    if not jsonl_files:
        return []

    # 读取最新的 session 文件
    target_file = jsonl_files[0]
    try:
        lines = target_file.read_text(errors='ignore').splitlines()
    except Exception:
        return []

    # 找到最后一条 user 消息的行号
    last_user_idx = -1
    for i, ln in enumerate(lines):
        try:
            item = json.loads(ln)
        except Exception:
            continue
        msg = item.get('message') or {}
        if msg.get('role') == 'user':
            last_user_idx = i

    if last_user_idx < 0:
        return []

    # 从最后一条 user 消息开始，解析到文件末尾
    entries = []
    for ln in lines[last_user_idx:]:
        try:
            item = json.loads(ln)
        except Exception:
            continue
        entry = _parse_activity_entry(item)
        if entry:
            entries.append(entry)

    return entries[-limit:]


def _compute_phase_durations(flow_log):
    """从 flow_log 计算每个阶段的停留时长。"""
    if not flow_log or len(flow_log) < 1:
        return []
    phases = []
    for i, fl in enumerate(flow_log):
        start_at = fl.get('at', '')
        to_dept = fl.get('to', '')
        remark = fl.get('remark', '')
        # 下一阶段的起始时间就是本阶段的结束时间
        if i + 1 < len(flow_log):
            end_at = flow_log[i + 1].get('at', '')
            ongoing = False
        else:
            end_at = now_iso()
            ongoing = True
        # 计算时长
        dur_sec = 0
        try:
            from_dt = datetime.datetime.fromisoformat(start_at.replace('Z', '+00:00'))
            to_dt = datetime.datetime.fromisoformat(end_at.replace('Z', '+00:00'))
            dur_sec = max(0, int((to_dt - from_dt).total_seconds()))
        except Exception:
            pass
        # 人类可读时长
        if dur_sec < 60:
            dur_text = f'{dur_sec}秒'
        elif dur_sec < 3600:
            dur_text = f'{dur_sec // 60}分{dur_sec % 60}秒'
        elif dur_sec < 86400:
            h, rem = divmod(dur_sec, 3600)
            dur_text = f'{h}小时{rem // 60}分'
        else:
            d, rem = divmod(dur_sec, 86400)
            dur_text = f'{d}天{rem // 3600}小时'
        phases.append({
            'phase': to_dept,
            'from': start_at,
            'to': end_at,
            'durationSec': dur_sec,
            'durationText': dur_text,
            'ongoing': ongoing,
            'remark': remark,
        })
    return phases


def _compute_todos_summary(todos):
    """计算 todos 完成率汇总。"""
    if not todos:
        return None
    total = len(todos)
    completed = sum(1 for t in todos if t.get('status') == 'completed')
    in_progress = sum(1 for t in todos if t.get('status') == 'in-progress')
    not_started = total - completed - in_progress
    percent = round(completed / total * 100) if total else 0
    return {
        'total': total,
        'completed': completed,
        'inProgress': in_progress,
        'notStarted': not_started,
        'percent': percent,
    }


def _compute_todos_diff(prev_todos, curr_todos):
    """计算两个 todos 快照之间的差异。"""
    prev_map = {str(t.get('id', '')): t for t in (prev_todos or [])}
    curr_map = {str(t.get('id', '')): t for t in (curr_todos or [])}
    changed, added, removed = [], [], []
    for tid, ct in curr_map.items():
        if tid in prev_map:
            pt = prev_map[tid]
            if pt.get('status') != ct.get('status'):
                changed.append({
                    'id': tid, 'title': ct.get('title', ''),
                    'from': pt.get('status', ''), 'to': ct.get('status', ''),
                })
        else:
            added.append({'id': tid, 'title': ct.get('title', '')})
    for tid, pt in prev_map.items():
        if tid not in curr_map:
            removed.append({'id': tid, 'title': pt.get('title', '')})
    if not changed and not added and not removed:
        return None
    return {'changed': changed, 'added': added, 'removed': removed}


def get_task_activity(task_id):
    """获取任务的实时进展数据。
    数据来源：
    1. 任务自身的 now / todos / flow_log 字段（由 Agent 通过 progress 命令主动上报）
    2. Agent session JSONL 中的对话日志（thinking / tool_result / user，用于展示思考过程）

    增强字段:
    - taskMeta: 任务元信息 (title/state/org/output/block/priority/reviewRound/archived)
    - phaseDurations: 各阶段停留时长
    - todosSummary: todos 完成率汇总
    - resourceSummary: Agent 资源消耗汇总 (tokens/cost/elapsed)
    - activity 条目中 progress/todos 保留 state/org 快照
    - activity 中 todos 条目含 diff 字段
    """
    tasks = load_tasks()
    task = next((t for t in tasks if t.get('id') == task_id), None)
    if not task:
        return {'ok': False, 'error': f'任务 {task_id} 不存在'}

    state = task.get('state', '')
    org = task.get('org', '')
    now_text = task.get('now', '')
    todos = task.get('todos', [])
    updated_at = task.get('updatedAt', '')

    # ── 任务元信息 ──
    task_meta = {
        'title': task.get('title', ''),
        'state': state,
        'org': org,
        'output': task.get('output', ''),
        'block': task.get('block', ''),
        'priority': task.get('priority', 'normal'),
        'reviewRound': task.get('review_round', 0),
        'archived': task.get('archived', False),
    }

    # 当前负责 Agent（兼容旧逻辑）
    agent_id = _STATE_AGENT_MAP.get(state)
    if agent_id is None and state in ('Doing', 'Next'):
        agent_id = _ORG_AGENT_MAP.get(org)

    # ── 构建活动条目列表（flow_log + progress_log）──
    activity = []
    flow_log = task.get('flow_log', [])

    # 1. flow_log 转为活动条目
    for fl in flow_log:
        activity.append({
            'at': fl.get('at', ''),
            'kind': 'flow',
            'from': fl.get('from', ''),
            'to': fl.get('to', ''),
            'remark': fl.get('remark', ''),
        })

    progress_log = task.get('progress_log', [])
    related_agents = set()

    # 资源消耗累加
    total_tokens = 0
    total_cost = 0.0
    total_elapsed = 0
    has_resource_data = False

    # 用于 todos diff 计算
    prev_todos_snapshot = None

    if progress_log:
        # 2. 多 Agent 实时进展日志（每条 progress 都保留自己的 todo 快照）
        for pl in progress_log:
            p_at = pl.get('at', '')
            p_agent = pl.get('agent', '')
            p_text = pl.get('text', '')
            p_todos = pl.get('todos', [])
            p_state = pl.get('state', '')
            p_org = pl.get('org', '')
            if p_agent:
                related_agents.add(p_agent)
            # 累加资源消耗
            if pl.get('tokens'):
                total_tokens += pl['tokens']
                has_resource_data = True
            if pl.get('cost'):
                total_cost += pl['cost']
                has_resource_data = True
            if pl.get('elapsed'):
                total_elapsed += pl['elapsed']
                has_resource_data = True
            if p_text:
                entry = {
                    'at': p_at,
                    'kind': 'progress',
                    'text': p_text,
                    'agent': p_agent,
                    'agentLabel': pl.get('agentLabel', ''),
                    'state': p_state,
                    'org': p_org,
                }
                # 单条资源数据
                if pl.get('tokens'):
                    entry['tokens'] = pl['tokens']
                if pl.get('cost'):
                    entry['cost'] = pl['cost']
                if pl.get('elapsed'):
                    entry['elapsed'] = pl['elapsed']
                activity.append(entry)
            if p_todos:
                todos_entry = {
                    'at': p_at,
                    'kind': 'todos',
                    'items': p_todos,
                    'agent': p_agent,
                    'agentLabel': pl.get('agentLabel', ''),
                    'state': p_state,
                    'org': p_org,
                }
                # 计算 diff
                diff = _compute_todos_diff(prev_todos_snapshot, p_todos)
                if diff:
                    todos_entry['diff'] = diff
                activity.append(todos_entry)
                prev_todos_snapshot = p_todos

        # 仅当无法通过状态确定 Agent 时，才回退到最后一次上报的 Agent
        if not agent_id:
            last_pl = progress_log[-1]
            if last_pl.get('agent'):
                agent_id = last_pl.get('agent')
    else:
        # 兼容旧数据：仅使用 now/todos
        if now_text:
            activity.append({
                'at': updated_at,
                'kind': 'progress',
                'text': now_text,
                'agent': agent_id or '',
                'state': state,
                'org': org,
            })
        if todos:
            activity.append({
                'at': updated_at,
                'kind': 'todos',
                'items': todos,
                'agent': agent_id or '',
                'state': state,
                'org': org,
            })

    # 按时间排序，保证流转/进展穿插正确
    activity.sort(key=lambda x: x.get('at', ''))

    if agent_id:
        related_agents.add(agent_id)

    # ── 融合 Agent Session 活动（thinking / tool_result / user）──
    # 从 session JSONL 中提取 Agent 的思考过程和工具调用记录
    try:
        session_entries = []
        # 活跃任务：尝试按 task_id 精确匹配
        if state not in ('Done', 'Cancelled'):
            if agent_id:
                entries = get_agent_activity(agent_id, limit=30, task_id=task_id)
                session_entries.extend(entries)
            # 也从其他相关 Agent 获取
            for ra in related_agents:
                if ra != agent_id:
                    entries = get_agent_activity(ra, limit=20, task_id=task_id)
                    session_entries.extend(entries)
        else:
            # 已完成任务：基于关键词匹配
            title = task.get('title', '')
            keywords = _extract_keywords(title)
            if keywords:
                agents_to_scan = list(related_agents) if related_agents else ([agent_id] if agent_id else [])
                for ra in agents_to_scan[:5]:
                    entries = get_agent_activity_by_keywords(ra, keywords, limit=15)
                    session_entries.extend(entries)
        # 去重（通过 at+kind 去重避免重复）
        existing_keys = {(a.get('at', ''), a.get('kind', '')) for a in activity}
        for se in session_entries:
            key = (se.get('at', ''), se.get('kind', ''))
            if key not in existing_keys:
                activity.append(se)
                existing_keys.add(key)
        # 重新排序
        activity.sort(key=lambda x: x.get('at', ''))
    except Exception as e:
        log.warning(f'Session JSONL 融合失败 (task={task_id}): {e}')

    # ── 阶段耗时统计 ──
    phase_durations = _compute_phase_durations(flow_log)

    # ── Todos 汇总 ──
    todos_summary = _compute_todos_summary(todos)

    # ── 总耗时（首条 flow_log 到最后一条/当前） ──
    total_duration = None
    if flow_log:
        try:
            first_at = datetime.datetime.fromisoformat(flow_log[0].get('at', '').replace('Z', '+00:00'))
            if state in ('Done', 'Cancelled') and len(flow_log) >= 2:
                last_at = datetime.datetime.fromisoformat(flow_log[-1].get('at', '').replace('Z', '+00:00'))
            else:
                last_at = datetime.datetime.now(datetime.timezone.utc)
            dur = max(0, int((last_at - first_at).total_seconds()))
            if dur < 60:
                total_duration = f'{dur}秒'
            elif dur < 3600:
                total_duration = f'{dur // 60}分{dur % 60}秒'
            elif dur < 86400:
                h, rem = divmod(dur, 3600)
                total_duration = f'{h}小时{rem // 60}分'
            else:
                d, rem = divmod(dur, 86400)
                total_duration = f'{d}天{rem // 3600}小时'
        except Exception:
            pass

    result = {
        'ok': True,
        'taskId': task_id,
        'taskMeta': task_meta,
        'agentId': agent_id,
        'agentLabel': _STATE_LABELS.get(state, state),
        'lastActive': updated_at[:19].replace('T', ' ') if updated_at else None,
        'activity': activity,
        'activitySource': 'progress+session',
        'relatedAgents': sorted(list(related_agents)),
        'phaseDurations': phase_durations,
        'totalDuration': total_duration,
    }
    if todos_summary:
        result['todosSummary'] = todos_summary
    if has_resource_data:
        result['resourceSummary'] = {
            'totalTokens': total_tokens,
            'totalCost': round(total_cost, 4),
            'totalElapsedSec': total_elapsed,
        }
    return result


# 状态推进顺序（手动推进用）
_STATE_FLOW = {
    'Pending':  ('Assistant', '领导', '助理', '待处理任务转交助理分拣'),
    'Assistant':    ('Product', '助理', '产品部', '助理分拣完毕，转产品部起草'),
    'Product': ('Architecture', '产品部', '架构委员会', '产品部方案提交架构委员会审议'),
    'Architecture':   ('Assigned', '架构委员会', '技术部', '架构委员会通过，转技术部派发'),
    'Assigned': ('Doing', '技术部', '各部门', '技术部开始派发执行'),
    'Next':     ('Doing', '技术部', '各部门', '待执行任务开始执行'),
    'Doing':    ('Review', '各部门', '技术部', '各部完成，进入汇总'),
    'Review':   ('Done', '技术部', '助理', '全流程完成，汇报助理转报领导'),
}
_STATE_LABELS = {
    'Pending': '待处理', 'Assistant': '助理', 'Product': '产品部', 'Architecture': '架构委员会',
    'Assigned': '技术部', 'Next': '待执行', 'Doing': '执行中', 'Review': '审查', 'Done': '完成',
}


# 部门轮询索引（每个部门的下一个候选人）
_dept_robin_index = {}

def find_available_employee(dept_name, priority='balanced'):
    """
    智能查找部门中可用的员工（非领导）。
    
    优化策略：
    1. 轮询分配 - 避免总是分配给同一个人
    2. 任务数量加权 - 优先分配给任务少的员工
    3. 负载均衡 - 综合考虑状态和任务数
    
    Args:
        dept_name: 部门名称（如'技术部'）
        priority: 'balanced'(均衡) / 'speed'(速度优先) / 'load'(负载优先)
    
    Returns:
        dict: 可用员工信息 {'id': 'staff_xxx', 'name': '张三'} 或 None
    """
    global _dept_robin_index
    
    try:
        officials_data = read_json(DATA / 'officials_stats.json', {})
        officials = officials_data.get('officials', [])
        employees = officials_data.get('employees', [])
        
        # 从employees列表获取该部门的员工（label=部门名）
        dept_staff = [e for e in employees if e.get('label') == dept_name]
        if not dept_staff:
            return None
        
        # 部门领导从officials获取
        dept_leader = next((o for o in officials if o.get('label') == dept_name), None)
        leader_id = dept_leader.get('id') if dept_leader else None
        
        # 过滤掉领导，获取下属员工
        subordinates = [e for e in dept_staff if e.get('id') != leader_id]
        if not subordinates:
            return None
        
        # ===== 策略1：轮询分配 =====
        if dept_name not in _dept_robin_index:
            _dept_robin_index[dept_name] = 0
        
        # 初始化轮询索引
        robin_idx = _dept_robin_index[dept_name]
        
        # ===== 策略2：按任务数量排序 =====
        # 计算每个员工的任务数（包括活跃任务）
        for emp in subordinates:
            emp['_task_count'] = emp.get('tasks_active', 0)
        
        # ===== 策略3：根据优先级选择 =====
        if priority == 'speed':
            # 速度优先：只看空闲状态，不看任务数
            available = [o for o in subordinates if o.get('status') == 'idle']
            if not available:
                return None  # 让领导执行
            # 轮询选择
            chosen = available[robin_idx % len(available)]
        elif priority == 'load':
            # 负载优先：按任务数升序，任务少的先来
            sorted_by_load = sorted(subordinates, key=lambda x: x.get('_task_count', 0))
            chosen = sorted_by_load[0]  # 选任务最少的
        else:
            # balanced 均衡模式（默认）
            # 优先选空闲的，如果都有任务，选任务最少的
            idle = [o for o in subordinates if o.get('status') == 'idle']
            
            if idle:
                # 有空闲员工，轮询选择
                chosen = idle[robin_idx % len(idle)]
            else:
                # 都忙碌，选任务最少的
                sorted_by_load = sorted(subordinates, key=lambda x: x.get('_task_count', 0))
                chosen = sorted_by_load[0]
        
        # 更新轮询索引
        _dept_robin_index[dept_name] = (robin_idx + 1) % max(1, len(subordinates))
        
        return {'id': chosen.get('id'), 'name': chosen.get('name'), 'tasks': chosen.get('_task_count', 0)}
        
    except Exception as e:
        log.warning(f'查找可用员工失败: {e}')
        return None


def _parallel_dispatch_worker():
    """并行处理派发队列中的任务"""
    global _DISPATCH_QUEUE, _ACTIVE_DISPATCHES
    
    while _DISPATCH_QUEUE and len(_ACTIVE_DISPATCHES) < _MAX_CONCURRENT_DISPATCHES:
        task_info = _DISPATCH_QUEUE.pop(0)
        task_id = task_info['task_id']
        task = task_info['task']
        new_state = task_info['state']
        trigger = task_info['trigger']
        
        # 实际派发
        _do_real_dispatch(task_id, task, new_state, trigger)
        
        _ACTIVE_DISPATCHES[task_id] = {'start_time': now_iso()}


def _do_real_dispatch(task_id, task, new_state, trigger):
    """实际执行派发的核心逻辑"""
    # ... 这里是派发的核心代码
    pass


def dispatch_for_state(task_id, task, new_state, trigger='state-transition'):
    """推进/审批后自动派发对应 Agent（后台异步，不阻塞响应）。"""
    agent_id = _STATE_AGENT_MAP.get(new_state)
    target_dept = task.get('org', '')
    
    # Doing/Next状态：检查是否有空闲下属
    actual_executor = None  # 实际执行人
    if new_state in ('Doing', 'Next') and target_dept:
        # 查找空闲下属
        available_emp = find_available_employee(target_dept)
        if available_emp:
            actual_executor = available_emp
            log.info(f'📌 {task_id} 分配给下属 {available_emp["name"]} ({available_emp["id"]})')
        else:
            log.info(f'📌 {task_id} 无空闲下属，由部门领导执行')
    
    if agent_id is None and new_state in ('Doing', 'Next'):
        agent_id = _ORG_AGENT_MAP.get(target_dept)
    if not agent_id:
        log.info(f'ℹ️ {task_id} 新状态 {new_state} 无对应 Agent，跳过自动派发')
        return

    _update_task_scheduler(task_id, lambda t, s: (
        s.update({
            'lastDispatchAt': now_iso(),
            'lastDispatchStatus': 'queued',
            'lastDispatchAgent': agent_id,
            'lastDispatchTrigger': trigger,
            'actualExecutor': actual_executor,  # 记录实际执行人
        }),
        _scheduler_add_flow(t, f'已入队派发：{new_state} → {agent_id}（{trigger}）' + (f' → {actual_executor["name"]}' if actual_executor else ''), to=_STATE_LABELS.get(new_state, new_state))
    ))

    title = task.get('title', '(无标题)')

    # Done 状态特殊处理：助理汇报领导
    if new_state == 'Done':
        msg = (
            f'🎉 任务已完成，请汇报领导\n'
            f'任务ID: {task_id}\n'
            f'任务: {title}\n'
            f'状态: ✅ 已完成\n'
            f'\n'
            f'请立即在飞书中向领导汇报任务完成情况，内容包括：\n'
            f'1. 任务摘要\n'
            f'2. 主要产出\n'
            f'3. 后续建议（如有）\n'
            f'\n'
            f'⚠️ 这是最终环节，请务必回复领导。'
        )
    else:
        # 根据 agent_id 构造针对性消息
        _msgs = {
            'assistant': (
                f'📜 领导任务需要你处理\n'
                f'任务ID: {task_id}\n'
                f'任务: {title}\n'
                f'⚠️ 看板已有此任务，请勿重复创建。直接用 kanban_update.py 更新状态。\n'
                f'请立即转交产品部起草执行方案。'
            ),
            'product': (
                f'📜 任务已到产品部，请起草方案\n'
                f'任务ID: {task_id}\n'
                f'任务: {title}\n'
                f'⚠️ 看板已有此任务记录，请勿重复创建。直接用 kanban_update.py state 更新状态。\n'
                f'请立即起草执行方案，走完完整协作流程（产品规划→架构评审→技术派发→各部门执行）。'
            ),
            'architecture': (
                f'📋 产品部方案提交审议\n'
                f'任务ID: {task_id}\n'
                f'任务: {title}\n'
                f'⚠️ 看板已有此任务，请勿重复创建。\n'
                f'请审议产品部方案，给出通过或驳回意见。'
            ),
            'tech': (
                f'📮 架构委员会已通过，请派发执行\n'
                f'任务ID: {task_id}\n'
                f'任务: {title}\n'
                f'{"建议派发部门: " + target_dept if target_dept else ""}\n'
                f'⚠️ 看板已有此任务，请勿重复创建。\n'
                f'请分析方案并派发给各部门执行。'
            ),
        }
        msg = _msgs.get(agent_id, (
            f'📌 请处理任务\n'
            f'任务ID: {task_id}\n'
            f'任务: {title}\n'
            f'⚠️ 看板已有此任务，请勿重复创建。直接用 kanban_update.py 更新状态。'
        ))

    def _do_dispatch():
        try:
            if not _check_gateway_alive():
                log.warning(f'⚠️ {task_id} 自动派发跳过: Gateway 未启动')
                _update_task_scheduler(task_id, lambda t, s: s.update({
                    'lastDispatchAt': now_iso(),
                    'lastDispatchStatus': 'gateway-offline',
                    'lastDispatchAgent': agent_id,
                    'lastDispatchTrigger': trigger,
                }))
                return
            cmd = ['openclaw', 'agent', '--agent', agent_id, '-m', msg,
                   '--deliver', '--channel', 'feishu', '--timeout', '300']
            max_retries = 2
            err = ''
            for attempt in range(1, max_retries + 1):
                log.info(f'🔄 自动派发 {task_id} → {agent_id} (第{attempt}次)...')
                result = subprocess.run(cmd, capture_output=True, text=True, timeout=310)
                if result.returncode == 0:
                    log.info(f'✅ {task_id} 自动派发成功 → {agent_id}')
                    _update_task_scheduler(task_id, lambda t, s: (
                        s.update({
                            'lastDispatchAt': now_iso(),
                            'lastDispatchStatus': 'success',
                            'lastDispatchAgent': agent_id,
                            'lastDispatchTrigger': trigger,
                            'lastDispatchError': '',
                        }),
                        _scheduler_add_flow(t, f'派发成功：{agent_id}（{trigger}）', to=t.get('org', ''))
                    ))
                    return
                err = result.stderr[:200] if result.stderr else result.stdout[:200]
                log.warning(f'⚠️ {task_id} 自动派发失败(第{attempt}次): {err}')
                if attempt < max_retries:
                    import time
                    time.sleep(5)
            log.error(f'❌ {task_id} 自动派发最终失败 → {agent_id}')
            _update_task_scheduler(task_id, lambda t, s: (
                s.update({
                    'lastDispatchAt': now_iso(),
                    'lastDispatchStatus': 'failed',
                    'lastDispatchAgent': agent_id,
                    'lastDispatchTrigger': trigger,
                    'lastDispatchError': err,
                }),
                _scheduler_add_flow(t, f'派发失败：{agent_id}（{trigger}）', to=t.get('org', ''))
            ))
        except subprocess.TimeoutExpired:
            log.error(f'❌ {task_id} 自动派发超时 → {agent_id}')
            _update_task_scheduler(task_id, lambda t, s: (
                s.update({
                    'lastDispatchAt': now_iso(),
                    'lastDispatchStatus': 'timeout',
                    'lastDispatchAgent': agent_id,
                    'lastDispatchTrigger': trigger,
                    'lastDispatchError': 'timeout',
                }),
                _scheduler_add_flow(t, f'派发超时：{agent_id}（{trigger}）', to=t.get('org', ''))
            ))
        except Exception as e:
            log.warning(f'⚠️ {task_id} 自动派发异常: {e}')
            _update_task_scheduler(task_id, lambda t, s: (
                s.update({
                    'lastDispatchAt': now_iso(),
                    'lastDispatchStatus': 'error',
                    'lastDispatchAgent': agent_id,
                    'lastDispatchTrigger': trigger,
                    'lastDispatchError': str(e)[:200],
                }),
                _scheduler_add_flow(t, f'派发异常：{agent_id}（{trigger}）', to=t.get('org', ''))
            ))

    threading.Thread(target=_do_dispatch, daemon=True).start()
    log.info(f'🚀 {task_id} 推进后自动派发 → {agent_id}')


def handle_advance_state(task_id, comment=''):
    """手动推进任务到下一阶段（解卡用），推进后自动派发对应 Agent。"""
    tasks = load_tasks()
    task = next((t for t in tasks if t.get('id') == task_id), None)
    if not task:
        return {'ok': False, 'error': f'任务 {task_id} 不存在'}
    cur = task.get('state', '')
    if cur not in _STATE_FLOW:
        return {'ok': False, 'error': f'任务 {task_id} 状态为 {cur}，无法推进'}
    _ensure_scheduler(task)
    _scheduler_snapshot(task, f'advance-before-{cur}')
    next_state, from_dept, to_dept, default_remark = _STATE_FLOW[cur]
    remark = comment or default_remark

    task['state'] = next_state
    task['now'] = f'⬇️ 手动推进：{remark}'
    task.setdefault('flow_log', []).append({
        'at': now_iso(),
        'from': from_dept,
        'to': to_dept,
        'remark': f'⬇️ 手动推进：{remark}'
    })
    _scheduler_mark_progress(task, f'手动推进 {cur} -> {next_state}')
    
    # Done 状态时自动完成所有 todos
    if next_state == 'Done':
        for item in task.get('todos', []):
            item['status'] = 'completed'
        task['now'] = '✅ 任务已完成，已向领导汇报'
    
    task['updatedAt'] = now_iso()
    save_tasks(tasks)

    # 🚀 推进后自动派发对应 Agent
    # Done 状态时派发给助理，让助理汇报领导
    dispatch_for_state(task_id, task, next_state)

    from_label = _STATE_LABELS.get(cur, cur)
    to_label = _STATE_LABELS.get(next_state, next_state)
    dispatched = ' (已自动派发 Agent)'
    return {'ok': True, 'message': f'{task_id} {from_label} → {to_label}{dispatched}'}


class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        # 只记录 4xx/5xx 错误请求
        if args and len(args) >= 1:
            status = str(args[0]) if args else ''
            if status.startswith('4') or status.startswith('5'):
                log.warning(f'{self.client_address[0]} {fmt % args}')

    def handle_error(self):
        pass  # 静默处理连接错误，避免 BrokenPipe 崩溃

    def handle(self):
        try:
            super().handle()
        except (BrokenPipeError, ConnectionResetError):
            pass  # 客户端断开连接，忽略

    def do_OPTIONS(self):
        self.send_response(200)
        cors_headers(self)
        self.end_headers()

    def send_json(self, data, code=200, compress=True):
        try:
            body = json.dumps(data, ensure_ascii=False).encode()
            
            # 对大响应进行 gzip 压缩（> 10KB）
            if compress and len(body) > 10240:
                import gzip
                body = gzip.compress(body)
                self.send_response(code)
                self.send_header('Content-Type', 'application/json; charset=utf-8')
                self.send_header('Content-Encoding', 'gzip')
                self.send_header('Content-Length', str(len(body)))
            else:
                self.send_response(code)
                self.send_header('Content-Type', 'application/json; charset=utf-8')
                self.send_header('Content-Length', str(len(body)))
            
            cors_headers(self)
            self.end_headers()
            self.wfile.write(body)
        except (BrokenPipeError, ConnectionResetError):
            pass

    def send_file(self, path: pathlib.Path, mime='text/html; charset=utf-8', encoding=None):
        if not path.exists():
            self.send_error(404)
            return
        try:
            body = path.read_bytes()
            self.send_response(200)
            self.send_header('Content-Type', mime)
            self.send_header('Content-Length', str(len(body)))
            if encoding:
                self.send_header('Content-Encoding', encoding)
                # 设置长期缓存（1年）
                self.send_header('Cache-Control', 'public, max-age=31536000')
            cors_headers(self)
            self.end_headers()
            self.wfile.write(body)
        except (BrokenPipeError, ConnectionResetError):
            pass

    def _serve_static(self, rel_path):
        """从 dist/ 目录提供静态文件，支持gzip预压缩。"""
        safe = rel_path.replace('\\', '/').lstrip('/')
        if '..' in safe:
            self.send_error(403)
            return True
        
        # 检查客户端是否支持gzip
        accept_encoding = self.headers.get('Accept-Encoding', '')
        supports_gzip = 'gzip' in accept_encoding.lower()
        
        fp = DIST / safe
        gz_fp = DIST / (safe + '.gz')
        
        # 优先使用预压缩的gzip文件
        if supports_gzip and gz_fp.is_file():
            mime = _MIME_TYPES.get(fp.suffix.lower(), 'application/octet-stream')
            self.send_file(gz_fp, mime, encoding='gzip')
            return True
        elif fp.is_file():
            mime = _MIME_TYPES.get(fp.suffix.lower(), 'application/octet-stream')
            self.send_file(fp, mime)
            return True
        return False

    def do_GET(self):
        p = urlparse(self.path).path.rstrip('/')
        if p in ('', '/dashboard'):
            self.send_file(DIST / 'index.html')
        elif p == '/dashboard.html':
            self.send_file(BASE / 'dashboard.html')
        elif p == '/healthz':
            checks = {'dataDir': DATA.is_dir(), 'tasksReadable': (DATA / 'tasks_source.json').exists()}
            checks['dataWritable'] = os.access(str(DATA), os.W_OK)
            all_ok = all(checks.values())
            self.send_json({'status': 'ok' if all_ok else 'degraded', 'ts': now_iso(), 'checks': checks})
        elif p == '/api/live-status':
            self.send_json(read_json(DATA / 'live_status.json'))
        elif p == '/api/live-status-light':
            # 极致优化：直接返回预压缩的轻量数据（22KB vs 14MB）
            now = time.time()
            if not hasattr(self, '_light_cache') or now - getattr(self, '_light_cache_ts', 0) > 60:
                # 尝试读取预压缩文件
                light_path = DATA / 'tasks_light.json.gz'
                if light_path.exists():
                    import gzip
                    with gzip.open(light_path, 'rt', encoding='utf-8') as f:
                        self._light_cache = json.load(f)
                        self._light_cache['syncStatus'] = {'ok': True, 'ts': now}
                else:
                    # 降级：从原始文件提取
                    tasks = read_json(DATA / 'tasks_source.json', [])
                    light_tasks = [{'id': t.get('id'), 'title': t.get('title'), 'state': t.get('state'), 'org': t.get('org'), 'official': t.get('official'), 'priority': t.get('priority')} for t in tasks]
                    self._light_cache = {'tasks': light_tasks, 'syncStatus': {'ok': True, 'ts': now}}
                self._light_cache_ts = now
            self.send_json(self._light_cache)
        elif p == '/api/agent-config':
            self.send_json(read_json(DATA / 'agent_config.json'))
        elif p == '/api/model-change-log':
            self.send_json(read_json(DATA / 'model_change_log.json', []))
        elif p == '/api/last-result':
            self.send_json(read_json(DATA / 'last_model_change_result.json', {}))
        elif p == '/api/officials-stats':
            # 统一数据源：结合officials_stats.json + live_status.json
            now = time.time()
            if not hasattr(self, '_officials_stats_cache') or now - getattr(self, '_officials_stats_cache_ts', 0) > 5:
                # 1. 获取基础员工数据
                stats = read_json(DATA / 'officials_stats.json', {})
                officials = stats.get('officials', [])
                employees = stats.get('employees', [])
                
                # 2. 获取实际任务分配
                live_data = read_json(DATA / 'live_status.json', {})
                tasks = live_data.get('tasks', [])
                
                # 3. 统计每个员工的任务数
                official_tasks = {}
                dept_tasks = {}  # 新增：按部门统计
                for t in tasks:
                    if t.get('archived'):
                        continue
                    state = t.get('state', '')
                    if state in ('Done', 'Cancelled'):
                        continue
                    official = t.get('official', '')
                    org = t.get('org', '')  # 新增：获取org字段
                    if official:
                        official_tasks[official] = official_tasks.get(official, 0) + 1
                    if org:
                        dept_tasks[org] = dept_tasks.get(org, 0) + 1
                
                # 3. 任务分发逻辑：总监分配给员工，员工忙则总监自己干
                # 重置状态
                for off in officials:
                    off['status'] = 'idle'
                    off['tasks_active'] = 0
                for emp in employees:
                    emp['status'] = 'idle'
                    emp['tasks_active'] = 0
                
                # 按部门分发任务
                for dept, task_count in dept_tasks.items():
                    # 找员工
                    emps = [e for e in employees if e.get('label') == dept]
                    # 找总监
                    manager = next((o for o in officials if o.get('label') == dept), None)
                    
                    if not emps:
                        # 无员工，总监自己干
                        if manager:
                            manager['status'] = 'busy'
                            manager['tasks_active'] = task_count
                    else:
                        # 有员工，先分配给员工
                        idle_emps = [e for e in emps if e.get('status') == 'idle']
                        if len(idle_emps) >= task_count:
                            for i in range(task_count):
                                idle_emps[i]['status'] = 'busy'
                                idle_emps[i]['tasks_active'] = 1
                        else:
                            # 员工不够，部分给员工，剩余总监干
                            busy_count = len(idle_emps)
                            for i in range(busy_count):
                                idle_emps[i]['status'] = 'busy'
                                idle_emps[i]['tasks_active'] = 1
                            if manager:
                                manager['status'] = 'busy'
                                manager['tasks_active'] = task_count - busy_count
                
                # 4. 官员状态已在步骤3任务分发时更新，直接使用
                # 5. 员工状态已在步骤3任务分发时更新，直接使用
                
                # 6. 重新统计（包括官员和员工）
                # 官员状态已在步骤4更新，员工在步骤5更新
                idle_count = sum(1 for e in employees if e.get('status') == 'idle')
                busy_count = sum(1 for e in employees if e.get('status') == 'busy')
                # 加上官员
                idle_count += sum(1 for o in officials if o.get('status') == 'idle')
                busy_count += sum(1 for o in officials if o.get('status') == 'busy')
                
                # 计算总成本
                total_cost = sum(o.get('cost_cny', 0) for o in officials)
                total_cost += sum(e.get('cost_cny', 0) for e in employees)
                total_tasks_done = sum(o.get('tasks_done', 0) for o in officials) + sum(e.get('tasks_done', 0) for e in employees)
                
                stats['totals'] = {
                    'total_employees': len(employees),
                    'total_departments': len(officials),
                    'idle_agents': idle_count,
                    'busy_agents': busy_count,
                    'offline_agents': 0,
                    'cost_cny': round(total_cost, 2),
                    'tasks_done': total_tasks_done,
                }
                
                self._officials_stats_cache = stats
                self._officials_stats_cache_ts = now
            self.send_json(self._officials_stats_cache)
        # ── 项目管理 API ──
        elif p == '/api/projects':
            # 简化处理，直接返回项目数据（不关联任务）
            now = time.time()
            if not hasattr(self, '_projects_cache') or now - getattr(self, '_projects_cache_ts', 0) > 60:
                projects_data = read_json(DATA / 'projects.json', {'projects': [], 'resourceRequests': []})
                self._projects_cache = projects_data
                self._projects_cache_ts = now
            self.send_json(self._projects_cache)
        # ── Agent池管理 API ──
        elif p == '/api/agent-pool/status':
            # 从 live_status.json 获取实际任务分配，计算每个Agent的忙碌状态
            try:
                # 加载 officials_stats.json 获取Agent基本信息
                stats = read_json(DATA / 'officials_stats.json', {})
                officials = stats.get('officials', [])
                employees = stats.get('employees', [])
                totals = stats.get('totals', {})
                
                # 加载 live_status.json 获取实际任务分配
                live_data = read_json(DATA / 'live_status.json', {})
                tasks = live_data.get('tasks', [])
                
                # 统计每个部门的活跃任务数（排除Done和Cancelled状态）
                dept_tasks = {}
                for t in tasks:
                    if t.get('archived'):
                        continue
                    state = t.get('state', '')
                    if state in ['Done', 'Cancelled']:
                        continue
                    org = t.get('org', '')
                    if org:
                        dept_tasks[org] = dept_tasks.get(org, 0) + 1
                
                # 任务分发逻辑：总监分配给员工，员工忙则总监自己干
                # 重置状态
                for off in officials:
                    off['status'] = 'idle'
                    off['tasks_active'] = 0
                for emp in employees:
                    emp['status'] = 'idle'
                    emp['tasks_active'] = 0
                
                # 按部门分发任务
                for dept, task_count in dept_tasks.items():
                    emps = [e for e in employees if e.get('label') == dept]
                    manager = next((o for o in officials if o.get('label') == dept), None)
                    
                    if not emps:
                        if manager:
                            manager['status'] = 'busy'
                            manager['tasks_active'] = task_count
                    else:
                        idle_emps = [e for e in emps if e.get('status') == 'idle']
                        if len(idle_emps) >= task_count:
                            for i in range(task_count):
                                idle_emps[i]['status'] = 'busy'
                                idle_emps[i]['tasks_active'] = 1
                        else:
                            busy_count = len(idle_emps)
                            for i in range(busy_count):
                                idle_emps[i]['status'] = 'busy'
                                idle_emps[i]['tasks_active'] = 1
                            if manager:
                                manager['status'] = 'busy'
                                manager['tasks_active'] = task_count - busy_count
                
                # 构建 AgentPoolPanel 需要的格式（使用分发后的状态）
                departments = {}
                assistant_pool = []
                
                # 1. 处理部门领导 - 直接使用已更新的状态
                for off in officials:
                    dept_id = off.get('id', '')
                    dept_label = off.get('label', '')
                    
                    # 直接使用分发后的状态
                    status = off.get('status', 'idle')
                    active_tasks = off.get('tasks_active', 0)
                    
                    # 助理（label为"助理"或id以assistant_开头）放入 assistant_pool
                    if dept_label == '助理' or dept_id.startswith('assistant'):
                        assistant_pool.append({
                            'id': dept_id,
                            'label': off.get('name', '') or off.get('label', ''),
                            'emoji': off.get('emoji', '🤖'),
                            'role': off.get('role', ''),
                            'status': status,
                            'tasks': active_tasks,
                            'total': off.get('tasks_done', 0) + active_tasks,
                        })
                        continue
                    
                    # 初始化部门
                    if dept_id not in departments:
                        departments[dept_id] = {
                            'label': dept_label,
                            'emoji': off.get('emoji', '🏢'),
                            'managers': [],
                            'employees': []
                        }
                    
                    # 部门领导作为manager
                    departments[dept_id]['managers'].append({
                        'id': dept_id,
                        'label': off.get('role', '部门领导'),
                        'emoji': off.get('emoji', '👤'),
                        'status': status,
                        'tasks': active_tasks,
                        'total': off.get('tasks_done', 0) + active_tasks,
                        'role': off.get('role', ''),
                    })
                
                # 2. 处理员工（按部门分组）- 直接使用分发后的状态
                for emp in employees:
                    emp_dept = emp.get('label', '')  # 员工所属部门
                    
                    # 直接使用分发后的状态
                    status = emp.get('status', 'idle')
                    active_tasks = emp.get('tasks_active', 0)
                    
                    # 查找对应的部门ID
                    dept_id_for_emp = None
                    for off in officials:
                        if off.get('label') == emp_dept:
                            dept_id_for_emp = off.get('id')
                            break
                    
                    if not dept_id_for_emp:
                        continue
                    
                    if dept_id_for_emp not in departments:
                        departments[dept_id_for_emp] = {
                            'label': emp_dept,
                            'emoji': '🏢',
                            'managers': [],
                            'employees': []
                        }
                    
                    departments[dept_id_for_emp]['employees'].append({
                        'id': emp.get('id', ''),
                        'label': emp.get('name', ''),
                        'emoji': '👤',
                        'status': status,
                        'tasks': active_tasks,
                        'total': emp.get('tasks_done', 0) + active_tasks,
                        'role': emp.get('role', ''),
                    })
                
                self.send_json({
                    'ok': True,
                    'assistant_pool': assistant_pool,
                    'departments': departments,
                    'totals': {
                        'idle_agents': sum(1 for d in departments.values() if all(e.get('status')=='idle' for e in d.get('employees',[])+d.get('managers',[]))), 'busy_agents': sum(1 for d in departments.values() if any(e.get('status')=='busy' for e in d.get('employees',[])+d.get('managers',[]))),
                        'total_agents': totals.get('total_employees', len(employees)),
                        'total_departments': totals.get('total_departments', len(officials)),
                    }
                })
            except Exception as e:
                log.warning(f"[agent-pool/status] 错误: {e}")
                import traceback
                traceback.print_exc()
                self.send_json({'ok': False, 'error': str(e)}, 500)
        elif p == '/api/agent-pool/statistics':
            # 统一数据源：从 live_status.json 计算实际任务分配
            try:
                # 获取基础员工数据
                stats = read_json(DATA / 'officials_stats.json', {})
                employees = stats.get('employees', [])
                officials = stats.get('officials', [])
                
                # 获取实际任务分配
                live_data = read_json(DATA / 'live_status.json', {})
                tasks = live_data.get('tasks', [])
                
                # 统计任务数
                official_tasks = {}
                for t in tasks:
                    if t.get('archived'):
                        continue
                    state = t.get('state', '')
                    if state in ('Done', 'Cancelled'):
                        continue
                    official = t.get('official', '')
                    official_tasks[official] = official_tasks.get(official, 0) + 1
                
                # 更新员工状态
                for emp in employees:
                    emp_label = emp.get('label', '')
                    matched_role = None
                    for off in officials:
                        if off.get('label') == emp_label:
                            matched_role = off.get('role', '')
                            break
                    task_count = official_tasks.get(matched_role, 0)
                    emp['status'] = 'busy' if task_count > 0 else 'idle'
                
                idle_count = sum(1 for e in employees if e.get('status') == 'idle')
                busy_count = sum(1 for e in employees if e.get('status') == 'busy')
                total_tasks = sum(e.get('tasks_active', 0) for e in employees)
                
                self.send_json({
                    'ok': True,
                    'total_agents': len(employees),
                    'idle_agents': idle_count,
                    'busy_agents': busy_count,
                    'total_tasks_assigned': total_tasks,
                    'current_tasks': total_tasks,
                    'departments': len(officials),
                })
            except Exception as e:
                self.send_json({'ok': False, 'error': str(e)}, 500)
        elif p == '/api/assistant-pool':
            # 获取助理池状态
            try:
                import sys
                sys.path.insert(0, '/root/.openclaw/workspace-assistant/data')
                from agent_router import get_pool_manager
                manager = get_pool_manager()
                self.send_json({'ok': True, 'assistants': manager.get_assistant_pool_status()})
            except Exception as e:
                self.send_json({'ok': False, 'error': str(e)}, 500)
        elif p.startswith('/api/projects/'):
            project_id = p.replace('/api/projects/', '')
            data = read_json(DATA / 'projects.json', {'projects': [], 'resourceRequests': []})
            project = next((pr for pr in data.get('projects', []) if pr.get('project_id') == project_id), None)
            if project:
                self.send_json({'ok': True, 'project': project})
            else:
                self.send_json({'ok': False, 'error': 'Project not found'}, 404)
        elif p == '/api/resources/pending':
            data = read_json(DATA / 'projects.json', {'projects': [], 'resourceRequests': []})
            pending = [r for r in data.get('resourceRequests', []) if r.get('status') == 'pending']
            self.send_json({'ok': True, 'requests': pending})
        elif p == '/api/staff/load':
            data = read_json(DATA / 'officials_stats.json', {})
            staff_load = []
            for off in data.get('officials', []):
                staff_load.append({
                    'id': off.get('id'),
                    'name': off.get('name'),
                    'dept': off.get('org'),
                    'role': off.get('role'),
                    'load': off.get('load_percentage', 0),
                    'status': off.get('status', 'available'),
                    'current_projects': off.get('current_projects', [])
                })
            self.send_json({'ok': True, 'staff': staff_load})
        elif p == '/api/staff/available':
            data = read_json(DATA / 'officials_stats.json', {})
            available = [off for off in data.get('officials', []) if off.get('load_percentage', 0) < 80]
            self.send_json({'ok': True, 'staff': available})
        elif p == '/api/morning-brief':
            self.send_json(read_json(DATA / 'morning_brief.json', {}))
        elif p == '/api/morning-config':
            self.send_json(read_json(DATA / 'morning_brief_config.json', {
                'categories': [
                    {'name': '政治', 'enabled': True},
                    {'name': '军事', 'enabled': True},
                    {'name': '经济', 'enabled': True},
                    {'name': 'AI大模型', 'enabled': True},
                ],
                'keywords': [], 'custom_feeds': [], 'feishu_webhook': '',
            }))
        elif p.startswith('/api/morning-brief/'):
            date = p.split('/')[-1]
            # 标准化日期格式为 YYYYMMDD（兼容 YYYY-MM-DD 输入）
            date_clean = date.replace('-', '')
            if not date_clean.isdigit() or len(date_clean) != 8:
                self.send_json({'ok': False, 'error': f'日期格式无效: {date}，请使用 YYYYMMDD'}, 400)
                return
            self.send_json(read_json(DATA / f'morning_brief_{date_clean}.json', {}))
        elif p == '/api/remote-skills-list':
            self.send_json(get_remote_skills_list())
        elif p.startswith('/api/skill-content/'):
            # /api/skill-content/{agentId}/{skillName}
            parts = p.replace('/api/skill-content/', '').split('/', 1)
            if len(parts) == 2:
                self.send_json(read_skill_content(parts[0], parts[1]))
            else:
                self.send_json({'ok': False, 'error': 'Usage: /api/skill-content/{agentId}/{skillName}'}, 400)
        elif p.startswith('/api/task-activity/'):
            task_id = p.replace('/api/task-activity/', '')
            if not task_id:
                self.send_json({'ok': False, 'error': 'task_id required'}, 400)
            else:
                self.send_json(get_task_activity(task_id))
        elif p.startswith('/api/scheduler-state/'):
            task_id = p.replace('/api/scheduler-state/', '')
            if not task_id:
                self.send_json({'ok': False, 'error': 'task_id required'}, 400)
            else:
                self.send_json(get_scheduler_state(task_id))
        elif p == '/api/agents-status':
            # 统一数据源 + 任务分发逻辑：总监分配给员工，员工忙则总监自己干
            try:
                stats = read_json(DATA / 'officials_stats.json', {})
                officials = stats.get('officials', [])
                employees = stats.get('employees', [])
                
                live_data = read_json(DATA / 'live_status.json', {})
                tasks = live_data.get('tasks', [])
                
                # 统计任务分配
                dept_tasks = {}
                for t in tasks:
                    if t.get('archived'):
                        continue
                    if t.get('state') in ('Done', 'Cancelled'):
                        continue
                    org = t.get('org', '')
                    if org:
                        dept_tasks[org] = dept_tasks.get(org, 0) + 1
                
                # 任务分发逻辑：总监分配给员工，员工忙则总监自己干
                for off in officials:
                    off['status'] = 'idle'
                    off['tasks_active'] = 0
                for emp in employees:
                    emp['status'] = 'idle'
                    emp['tasks_active'] = 0
                
                for dept, task_count in dept_tasks.items():
                    emps = [e for e in employees if e.get('label') == dept]
                    manager = next((o for o in officials if o.get('label') == dept), None)
                    
                    if not emps:
                        if manager:
                            manager['status'] = 'running'
                            manager['tasks_active'] = task_count
                    else:
                        idle_emps = [e for e in emps if e.get('status') == 'idle']
                        if len(idle_emps) >= task_count:
                            for i in range(task_count):
                                idle_emps[i]['status'] = 'running'
                                idle_emps[i]['tasks_active'] = 1
                        else:
                            busy_count = len(idle_emps)
                            for i in range(busy_count):
                                idle_emps[i]['status'] = 'running'
                                idle_emps[i]['tasks_active'] = 1
                            if manager:
                                manager['status'] = 'running'
                                manager['tasks_active'] = task_count - busy_count
                
                agents = []
                
                # 部门官员
                for off in officials:
                    status = off.get('status', 'idle')
                    task_count = off.get('tasks_active', 0)
                    
                    agents.append({
                        'id': off.get('id', ''),
                        'name': off.get('name', '') or off.get('role', ''),
                        'emoji': off.get('emoji', ''),
                        'status': status,
                        'level': 'manager',
                        'org': off.get('label', ''),
                        'task_count': task_count
                    })
                
                # 员工（使用分发后的状态）
                for emp in employees:
                    status = emp.get('status', 'idle')
                    task_count = emp.get('tasks_active', 0)
                    agents.append({
                        'id': emp.get('id', ''),
                        'name': emp.get('name', ''),
                        'emoji': emp.get('emoji', '👤'),
                        'status': status,
                        'level': 'employee',
                        'org': emp.get('label', ''),
                        'task_count': task_count
                    })
                
                running = sum(1 for a in agents if a['status'] == 'running')
                idle = sum(1 for a in agents if a['status'] == 'idle')
                
                self.send_json({
                    'ok': True,
                    'agents': agents,
                    'running': running,
                    'idle': idle,
                    'total': len(agents),
                    'gateway': {'alive': True, 'probe': True}
                })
            except Exception as e:
                log.warning(f"[agents-status] 获取Agent池状态失败: {e}")
                import traceback
                traceback.print_exc()
                self.send_json(get_agents_status())  # 回退到原函数
        elif p.startswith('/api/agent-activity/'):
            agent_id = p.replace('/api/agent-activity/', '')
            if not agent_id or not _SAFE_NAME_RE.match(agent_id):
                self.send_json({'ok': False, 'error': 'invalid agent_id'}, 400)
            else:
                self.send_json({'ok': True, 'agentId': agent_id, 'activity': get_agent_activity(agent_id)})
        # ── 会议讨论 ──
        elif p == '/api/court-discuss/list':
            self.send_json({'ok': True, 'sessions': cd_list()})
        elif p == '/api/court-discuss/officials':
            self.send_json({'ok': True, 'officials': CD_PROFILES})
        elif p.startswith('/api/court-discuss/session/'):
            sid = p.replace('/api/court-discuss/session/', '')
            data = cd_get(sid)
            self.send_json(data if data else {'ok': False, 'error': 'session not found'}, 200 if data else 404)
        elif p == '/api/court-discuss/fate':
            self.send_json({'ok': True, 'event': cd_fate()})
        elif self._serve_static(p):
            pass  # 已由 _serve_static 处理 (JS/CSS/图片等)
        else:
            # SPA fallback：非 /api/ 路径返回 index.html
            if not p.startswith('/api/'):
                idx = DIST / 'index.html'
                if idx.exists():
                    self.send_file(idx)
                    return
            self.send_error(404)

    def do_POST(self):
        p = urlparse(self.path).path.rstrip('/')
        length = int(self.headers.get('Content-Length', 0))
        if length > MAX_REQUEST_BODY:
            self.send_json({'ok': False, 'error': f'Request body too large (max {MAX_REQUEST_BODY} bytes)'}, 413)
            return
        raw = self.rfile.read(length) if length else b''
        try:
            body = json.loads(raw) if raw else {}
        except Exception:
            self.send_json({'ok': False, 'error': 'invalid JSON'}, 400)
            return

        if p == '/api/morning-config':
            # 字段校验
            if not isinstance(body, dict):
                self.send_json({'ok': False, 'error': '请求体必须是 JSON 对象'}, 400)
                return
            allowed_keys = {'categories', 'keywords', 'custom_feeds', 'feishu_webhook'}
            unknown = set(body.keys()) - allowed_keys
            if unknown:
                self.send_json({'ok': False, 'error': f'未知字段: {", ".join(unknown)}'}, 400)
                return
            if 'categories' in body and not isinstance(body['categories'], list):
                self.send_json({'ok': False, 'error': 'categories 必须是数组'}, 400)
                return
            if 'keywords' in body and not isinstance(body['keywords'], list):
                self.send_json({'ok': False, 'error': 'keywords 必须是数组'}, 400)
                return
            # 飞书 Webhook 校验
            webhook = body.get('feishu_webhook', '').strip()
            if webhook and not validate_url(webhook, allowed_schemes=('https',), allowed_domains=('open.feishu.cn', 'open.larksuite.com')):
                self.send_json({'ok': False, 'error': '飞书 Webhook URL 无效，仅支持 https://open.feishu.cn 或 open.larksuite.com 域名'}, 400)
                return
            cfg_path = DATA / 'morning_brief_config.json'
            cfg_path.write_text(json.dumps(body, ensure_ascii=False, indent=2))
            self.send_json({'ok': True, 'message': '订阅配置已保存'})
            return

        if p == '/api/scheduler-scan':
            threshold_sec = body.get('thresholdSec', 180)
            try:
                result = handle_scheduler_scan(threshold_sec)
                self.send_json(result)
            except Exception as e:
                self.send_json({'ok': False, 'error': f'scheduler scan failed: {e}'}, 500)
            return

        if p == '/api/repair-flow-order':
            try:
                self.send_json(handle_repair_flow_order())
            except Exception as e:
                self.send_json({'ok': False, 'error': f'repair flow order failed: {e}'}, 500)
            return

        if p == '/api/scheduler-retry':
            task_id = body.get('taskId', '').strip()
            reason = body.get('reason', '').strip()
            if not task_id:
                self.send_json({'ok': False, 'error': 'taskId required'}, 400)
                return
            self.send_json(handle_scheduler_retry(task_id, reason))
            return

        if p == '/api/scheduler-escalate':
            task_id = body.get('taskId', '').strip()
            reason = body.get('reason', '').strip()
            if not task_id:
                self.send_json({'ok': False, 'error': 'taskId required'}, 400)
                return
            self.send_json(handle_scheduler_escalate(task_id, reason))
            return

        if p == '/api/scheduler-rollback':
            task_id = body.get('taskId', '').strip()
            reason = body.get('reason', '').strip()
            if not task_id:
                self.send_json({'ok': False, 'error': 'taskId required'}, 400)
                return
            self.send_json(handle_scheduler_rollback(task_id, reason))
            return

        if p == '/api/morning-brief/refresh':
            force = body.get('force', True)  # 从看板手动触发默认强制
            def do_refresh():
                try:
                    cmd = ['python3', str(SCRIPTS / 'fetch_morning_news.py')]
                    if force:
                        cmd.append('--force')
                    subprocess.run(cmd, timeout=120)
                    push_to_feishu()
                except Exception as e:
                    print(f'[refresh error] {e}', file=sys.stderr)
            threading.Thread(target=do_refresh, daemon=True).start()
            self.send_json({'ok': True, 'message': '采集已触发，约30-60秒后刷新'})
            return

        if p == '/api/add-skill':
            agent_id = body.get('agentId', '').strip()
            skill_name = body.get('skillName', body.get('name', '')).strip()
            desc = body.get('description', '').strip() or skill_name
            trigger = body.get('trigger', '').strip()
            if not agent_id or not skill_name:
                self.send_json({'ok': False, 'error': 'agentId and skillName required'}, 400)
                return
            result = add_skill_to_agent(agent_id, skill_name, desc, trigger)
            self.send_json(result)
            return

        if p == '/api/add-remote-skill':
            agent_id = body.get('agentId', '').strip()
            skill_name = body.get('skillName', '').strip()
            source_url = body.get('sourceUrl', '').strip()
            description = body.get('description', '').strip()
            if not agent_id or not skill_name or not source_url:
                self.send_json({'ok': False, 'error': 'agentId, skillName, and sourceUrl required'}, 400)
                return
            result = add_remote_skill(agent_id, skill_name, source_url, description)
            self.send_json(result)
            return

        if p == '/api/remote-skills-list':
            result = get_remote_skills_list()
            self.send_json(result)
            return

        if p == '/api/update-remote-skill':
            agent_id = body.get('agentId', '').strip()
            skill_name = body.get('skillName', '').strip()
            if not agent_id or not skill_name:
                self.send_json({'ok': False, 'error': 'agentId and skillName required'}, 400)
                return
            result = update_remote_skill(agent_id, skill_name)
            self.send_json(result)
            return

        if p == '/api/remove-remote-skill':
            agent_id = body.get('agentId', '').strip()
            skill_name = body.get('skillName', '').strip()
            if not agent_id or not skill_name:
                self.send_json({'ok': False, 'error': 'agentId and skillName required'}, 400)
                return
            result = remove_remote_skill(agent_id, skill_name)
            self.send_json(result)
            return

        if p == '/api/task-action':
            task_id = body.get('taskId', '').strip()
            action = body.get('action', '').strip()  # stop, cancel, resume
            reason = body.get('reason', '').strip() or f'领导从看板{action}'
            if not task_id or action not in ('stop', 'cancel', 'resume'):
                self.send_json({'ok': False, 'error': 'taskId and action(stop/cancel/resume) required'}, 400)
                return
            result = handle_task_action(task_id, action, reason)
            self.send_json(result)
            return

        if p == '/api/archive-task':
            task_id = body.get('taskId', '').strip() if body.get('taskId') else ''
            archived = body.get('archived', True)
            archive_all = body.get('archiveAllDone', False)
            if not task_id and not archive_all:
                self.send_json({'ok': False, 'error': 'taskId or archiveAllDone required'}, 400)
                return
            result = handle_archive_task(task_id, archived, archive_all)
            self.send_json(result)
            return

        if p == '/api/task-todos':
            task_id = body.get('taskId', '').strip()
            todos = body.get('todos', [])  # [{id, title, status}]
            if not task_id:
                self.send_json({'ok': False, 'error': 'taskId required'}, 400)
                return
            # todos 输入校验
            if not isinstance(todos, list) or len(todos) > 200:
                self.send_json({'ok': False, 'error': 'todos must be a list (max 200 items)'}, 400)
                return
            valid_statuses = {'not-started', 'in-progress', 'completed'}
            for td in todos:
                if not isinstance(td, dict) or 'id' not in td or 'title' not in td:
                    self.send_json({'ok': False, 'error': 'each todo must have id and title'}, 400)
                    return
                if td.get('status', 'not-started') not in valid_statuses:
                    td['status'] = 'not-started'
            result = update_task_todos(task_id, todos)
            self.send_json(result)
            return

        if p == '/api/create-task':
            title = body.get('title', '').strip()
            org = body.get('org', '产品部').strip()
            official = body.get('official', '产品总监').strip()
            priority = body.get('priority', 'normal').strip()
            template_id = body.get('templateId', '')
            params = body.get('params', {})
            if not title:
                self.send_json({'ok': False, 'error': 'title required'}, 400)
                return
            target_dept = body.get('targetDept', '').strip()
            result = handle_create_task(title, org, official, priority, template_id, params, target_dept)
            self.send_json(result)
            return

        if p == '/api/review-action':
            task_id = body.get('taskId', '').strip()
            action = body.get('action', '').strip()  # approve, reject
            comment = body.get('comment', '').strip()
            if not task_id or action not in ('approve', 'reject'):
                self.send_json({'ok': False, 'error': 'taskId and action(approve/reject) required'}, 400)
                return
            result = handle_review_action(task_id, action, comment)
            self.send_json(result)
            return

        if p == '/api/advance-state':
            task_id = body.get('taskId', '').strip()
            comment = body.get('comment', '').strip()
            if not task_id:
                self.send_json({'ok': False, 'error': 'taskId required'}, 400)
                return
            result = handle_advance_state(task_id, comment)
            self.send_json(result)
            return

        if p == '/api/dispatch-agent':
            task_id = body.get('taskId', '').strip()
            state = body.get('state', '').strip()
            if not task_id:
                self.send_json({'ok': False, 'error': 'taskId required'}, 400)
                return
            tasks = load_tasks()
            task = next((t for t in tasks if t.get('id') == task_id), None)
            if not task:
                self.send_json({'ok': False, 'error': f'任务 {task_id} 不存在'}, 404)
                return
            # 调用 dispatch_for_state 派发 Agent
            dispatch_for_state(task_id, task, state or task.get('state'), trigger='kanban-state-update')
            self.send_json({'ok': True, 'message': f'已派发任务 {task_id} 对应 Agent'})
            return

        if p == '/api/agent-wake':
            agent_id = body.get('agentId', '').strip()
            message = body.get('message', '').strip()
            if not agent_id:
                self.send_json({'ok': False, 'error': 'agentId required'}, 400)
                return
            result = wake_agent(agent_id, message)
            self.send_json(result)
            return

        if p == '/api/set-model':
            agent_id = body.get('agentId', '').strip()
            model = body.get('model', '').strip()
            if not agent_id or not model:
                self.send_json({'ok': False, 'error': 'agentId and model required'}, 400)
                return

            # Write to pending (atomic)
            pending_path = DATA / 'pending_model_changes.json'
            def update_pending(current):
                current = [x for x in current if x.get('agentId') != agent_id]
                current.append({'agentId': agent_id, 'model': model})
                return current
            atomic_json_update(pending_path, update_pending, [])

            # Async apply
            def apply_async():
                try:
                    subprocess.run(['python3', str(SCRIPTS / 'apply_model_changes.py')], timeout=30)
                    subprocess.run(['python3', str(SCRIPTS / 'sync_agent_config.py')], timeout=10)
                except Exception as e:
                    print(f'[apply error] {e}', file=sys.stderr)

            threading.Thread(target=apply_async, daemon=True).start()
            self.send_json({'ok': True, 'message': f'Queued: {agent_id} → {model}'})

        # ── 会议讨论 POST ──
        elif p == '/api/court-discuss/start':
            topic = body.get('topic', '').strip()
            officials = body.get('officials', [])
            task_id = body.get('taskId', '').strip()
            if not topic:
                self.send_json({'ok': False, 'error': 'topic required'}, 400)
                return
            if not officials or not isinstance(officials, list):
                self.send_json({'ok': False, 'error': 'officials list required'}, 400)
                return
            # 校验成员 ID - 支持多种格式：ID、中文部门名、role名
            # 获取所有有效的成员标识
            valid_ids = set(CD_PROFILES.keys())
            
            # 建立中文部门名到ID的映射
            name_to_id = {}
            for k, v in CD_PROFILES.items():
                name_to_id[v.get('name', '')] = k
                name_to_id[v.get('role', '')] = k
                # 也添加部门label映射
                for dept in ['技术部', '产品部', '开发部', '运维部', '助理', '财务部', '人力资源部', '安全部', '数据部', '运营部', '市场部', '采购部', '文档部', '咨询中心', '项目管理部', '产品管理部', '经营管理部', '企业级PMO', '架构委员会', '领导']:
                    if dept in v.get('role', '') or dept in v.get('name', ''):
                        name_to_id[dept] = k
            
            # 也添加部门名称和role作为有效标识
            for k, v in CD_PROFILES.items():
                valid_ids.add(v.get('name', ''))
                valid_ids.add(v.get('role', ''))
                valid_ids.add(k)
                # 添加中文部门名
                for dept in ['技术部', '产品部', '开发部', '运维部', '助理', '财务部', '人力资源部', '安全部', '数据部', '运营部', '市场部', '采购部', '文档部', '咨询中心', '项目管理部', '产品管理部', '经营管理部', '企业级PMO', '架构委员会', '领导']:
                    if dept in v.get('role', '') or dept in v.get('name', ''):
                        valid_ids.add(dept)
            
            # 过滤出有效的成员
            valid_officials = []
            for o in officials:
                if isinstance(o, str):
                    # 尝试将中文名称转换为ID
                    mapped_id = name_to_id.get(o, o)
                    if mapped_id in valid_ids:
                        valid_officials.append(mapped_id)
                    elif o in valid_ids:
                        valid_officials.append(o)
                elif isinstance(o, dict):
                    label = o.get('label', '')
                    name = o.get('name', '')
                    role = o.get('role', '')
                    # 优先使用label转换为ID
                    mapped_id = name_to_id.get(label, name_to_id.get(name, name_to_id.get(role, '')))
                    if mapped_id and mapped_id in valid_ids:
                        valid_officials.append(mapped_id)
                    elif label in valid_ids:
                        valid_officials.append(label)
                    elif name in valid_ids:
                        valid_officials.append(name)
                    elif role in valid_ids:
                        valid_officials.append(role)
            
            # 如果没有有效成员但原始选择数>=2，也允许通过
            if len(valid_officials) < 2 and len(officials) >= 2:
                valid_officials = officials[:2]  # 使用原始选择
            
            if len(valid_officials) < 2:
                self.send_json({'ok': False, 'error': '至少选择2位成员'}, 400)
                return
            
            # 使用过滤后的有效成员列表
            self.send_json(cd_create(topic, valid_officials, task_id))

        elif p == '/api/court-discuss/advance':
            sid = body.get('sessionId', '').strip()
            user_msg = body.get('userMessage', '').strip() or None
            decree = body.get('decree', '').strip() or None
            if not sid:
                self.send_json({'ok': False, 'error': 'sessionId required'}, 400)
                return
            self.send_json(cd_advance(sid, user_msg, decree))

        elif p == '/api/court-discuss/conclude':
            sid = body.get('sessionId', '').strip()
            if not sid:
                self.send_json({'ok': False, 'error': 'sessionId required'}, 400)
                return
            self.send_json(cd_conclude(sid))

        elif p == '/api/court-discuss/destroy':
            sid = body.get('sessionId', '').strip()
            if sid:
                cd_destroy(sid)
            self.send_json({'ok': True})

        # ── 项目管理 POST ──
        elif p == '/api/projects/create':
            name = body.get('name', '').strip()
            requester = body.get('requester', '助理').strip()
            description = body.get('description', '').strip()
            if not name:
                self.send_json({'ok': False, 'error': 'name required'}, 400)
                return
            result = create_project(name, requester, description)
            self.send_json(result)

        elif p == '/api/projects/resource-request':
            project_id = body.get('projectId', '').strip()
            dept = body.get('dept', '').strip()
            role = body.get('role', '').strip()
            count = body.get('count', 1)
            if not project_id or not dept:
                self.send_json({'ok': False, 'error': 'projectId and dept required'}, 400)
                return
            result = create_resource_request(project_id, dept, role, count)
            self.send_json(result)

        elif p == '/api/resources/respond':
            request_id = body.get('requestId', '').strip()
            status = body.get('status', '').strip()  # approved, rejected, escalated
            staff_id = body.get('staffId', '').strip()  # 批准时分配的人员
            solution = body.get('solution', '').strip()  # 拒绝时的解决方案
            if not request_id or status not in ('approved', 'rejected', 'escalated'):
                self.send_json({'ok': False, 'error': 'requestId and status(approved/rejected/escalated) required'}, 400)
                return
            result = respond_resource_request(request_id, status, staff_id, solution)
            self.send_json(result)

        elif p == '/api/projects/update-status':
            project_id = body.get('projectId', '').strip()
            status = body.get('status', '').strip()  # planning, resource_gathering, executing, completed
            if not project_id or not status:
                self.send_json({'ok': False, 'error': 'projectId and status required'}, 400)
                return
            result = update_project_status(project_id, status)
            self.send_json(result)

        else:
            self.send_error(404)


def main():
    parser = argparse.ArgumentParser(description='企业协作看板服务器')
    parser.add_argument('--port', type=int, default=7891)
    parser.add_argument('--host', default='0.0.0.0')
    parser.add_argument('--cors', default=None, help='Allowed CORS origin (default: reflect request Origin header)')
    args = parser.parse_args()

    global ALLOWED_ORIGIN
    ALLOWED_ORIGIN = args.cors

    server = HTTPServer((args.host, args.port), Handler)
    log.info(f'企业协作看板启动 → http://{args.host}:{args.port}')
    print(f'   按 Ctrl+C 停止')

    # 启动恢复：重新派发上次被 kill 中断的 queued 任务
    threading.Timer(3.0, _startup_recover_queued_dispatches).start()

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print('\n已停止')


# 项目ID计数器
_project_id_counter = 0

def generate_project_id():
    """生成项目ID"""
    global _project_id_counter
    _project_id_counter += 1
    now = datetime.datetime.now()
    return f"PRJ-{now.strftime('%Y%m%d')}-{_project_id_counter:03d}"

def create_project(name, requester, description=''):
    """创建项目"""
    data = read_json(DATA / 'projects.json', {'projects': [], 'resourceRequests': []})
    project_id = generate_project_id()
    project = {
        'project_id': project_id,
        'name': name,
        'description': description,
        'requester': requester,
        'manager': None,  # 待分配项目经理
        'status': 'planning',
        'members': [],
        'resource_requests': [],
        'created_at': now_iso(),
        'updated_at': now_iso()
    }
    data['projects'].append(project)
    atomic_json_write(DATA / 'projects.json', data)
    
    return {'ok': True, 'projectId': project_id, 'project': project}

def create_resource_request(project_id, dept, role, count=1):
    """创建资源申请"""
    data = read_json(DATA / 'projects.json', {'projects': [], 'resourceRequests': []})
    
    # 验证项目存在
    project = next((p for p in data['projects'] if p['project_id'] == project_id), None)
    if not project:
        return {'ok': False, 'error': 'Project not found'}
    
    request_id = f"REQ-{datetime.datetime.now().strftime('%Y%m%d')}-{len(data['resourceRequests'])+1:03d}"
    request = {
        'request_id': request_id,
        'project_id': project_id,
        'project_name': project['name'],
        'from_dept': '项目管理部',
        'to_dept': dept,
        'required_role': role,
        'count': count,
        'status': 'pending',
        'staff_id': None,
        'solution': None,
        'escalated_to': None,
        'created_at': now_iso(),
        'remind_at': None,  # 3h后提醒
        'escalate_at': None  # 5h后上报
    }
    
    # 计算提醒和上报时间
    now = datetime.datetime.now()
    request['remind_at'] = (now + timedelta(hours=3)).isoformat()
    request['escalate_at'] = (now + timedelta(hours=5)).isoformat()
    
    data['resourceRequests'].append(request)
    if project_id not in project.get('resource_requests', []):
        project.setdefault('resource_requests', []).append(request_id)
    atomic_json_write(DATA / 'projects.json', data)
    
    return {'ok': True, 'requestId': request_id, 'request': request}

def respond_resource_request(request_id, status, staff_id=None, solution=None):
    """响应资源申请"""
    data = read_json(DATA / 'projects.json', {'projects': [], 'resourceRequests': []})
    
    request = next((r for r in data['resourceRequests'] if r['request_id'] == request_id), None)
    if not request:
        return {'ok': False, 'error': 'Request not found'}
    
    request['status'] = status
    request['updated_at'] = now_iso()
    
    if status == 'approved':
        if not staff_id:
            return {'ok': False, 'error': 'staffId required for approval'}
        request['staff_id'] = staff_id
        
        # 更新项目成员
        project = next((p for p in data['projects'] if p['project_id'] == request['project_id']), None)
        if project:
            project['members'].append({
                'staff_id': staff_id,
                'dept': request['to_dept'],
                'role': request['required_role']
            })
            project['updated_at'] = now_iso()
            atomic_json_write(DATA / 'projects.json', data)
            
            # 更新人员负载
            update_staff_load(staff_id, project['project_id'], 'add')
            return {'ok': True, 'message': f'已批准，{staff_id} 加入项目 {project["project_id"]}'}
    
    elif status == 'rejected':
        if not solution:
            return {'ok': False, 'error': 'solution required for rejection'}
        request['solution'] = solution
        
    elif status == 'escalated':
        request['escalated_to'] = '助理'
        request['solution'] = solution or '资源不足，申请协助'
    
    atomic_json_write(DATA / 'projects.json', data)
    return {'ok': True, 'request': request}

def update_staff_load(staff_id, project_id, action):
    """更新人员负载"""
    data = read_json(DATA / 'officials_stats.json', {})
    
    for off in data.get('officials', []):
        if off.get('id') == staff_id:
            if action == 'add':
                if project_id not in off.get('current_projects', []):
                    off.setdefault('current_projects', []).append(project_id)
            elif action == 'remove':
                off['current_projects'] = [p for p in off.get('current_projects', []) if p != project_id]
            
            # 重新计算负载
            max_p = off.get('max_projects', 5)
            current_p = len(off.get('current_projects', []))
            off['load_percentage'] = int((current_p / max_p) * 100) if max_p > 0 else 0
            
            # 更新状态
            if off['load_percentage'] >= 100:
                off['status'] = 'overloaded'
            elif off['load_percentage'] >= 80:
                off['status'] = 'busy'
            else:
                off['status'] = 'available'
            
            break
    
    atomic_json_write(DATA / 'officials_stats.json', data)

def update_project_status(project_id, status):
    """更新项目状态"""
    data = read_json(DATA / 'projects.json', {'projects': [], 'resourceRequests': []})
    
    project = next((p for p in data['projects'] if p['project_id'] == project_id), None)
    if not project:
        return {'ok': False, 'error': 'Project not found'}
    
    project['status'] = status
    project['updated_at'] = now_iso()
    atomic_json_write(DATA / 'projects.json', data)
    
    return {'ok': True, 'project': project}

def check_resource_request_timeouts():
    """检查资源申请超时"""
    data = read_json(DATA / 'projects.json', {'projects': [], 'resourceRequests': []})
    now = datetime.datetime.now()
    
    for req in data.get('resourceRequests', []):
        if req.get('status') != 'pending':
            continue
        
        # 检查是否需要提醒
        remind_at = req.get('remind_at')
        if remind_at:
            remind_time = datetime.datetime.fromisoformat(remind_at.replace('Z', '+00:00'))
            if now >= remind_time and not req.get('reminded'):
                req['reminded'] = True
                # TODO: 发送提醒通知
                print(f"[提醒] 资源申请 {req['request_id']} 已3小时未响应")
        
        # 检查是否需要上报
        escalate_at = req.get('escalate_at')
        if escalate_at:
            escalate_time = datetime.datetime.fromisoformat(escalate_at.replace('Z', '+00:00'))
            if now >= escalate_time:
                req['status'] = 'escalated'
                req['escalated_to'] = '助理'
                req['solution'] = '超时未响应，自动上报助理'
                print(f"[上报] 资源申请 {req['request_id']} 已5小时未响应，上报助理")
    
    atomic_json_write(DATA / 'projects.json', data)

if __name__ == '__main__':
    main()
