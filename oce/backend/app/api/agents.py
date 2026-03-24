"""Agents API — Agent 配置和状态查询。"""

import json
import logging
from pathlib import Path

from fastapi import APIRouter

log = logging.getLogger("oce.api.agents")
router = APIRouter()

# Agent 元信息（对应 agents/ 目录下的 SOUL.md）
AGENT_META = {
    "news": {"name": "资讯中心", "role": "每日新闻采集与简报", "icon": "📰"},
    "tech": {"name": "技术部", "role": "任务派发与执行协调", "icon": "📮"},
    "product": {"name": "产品部", "role": "起草任务方案与优先级", "icon": "📜"},
    "architecture": {"name": "架构委员会", "role": "审议与驳回机制", "icon": "🔍"},
    "docs": {"name": "文档部", "role": "文档/汇报/规范", "icon": "📝"},
    "data": {"name": "数据部", "role": "资源/预算/成本", "icon": "💰"},
    "ops": {"name": "运维部", "role": "工程交付与自动化", "icon": "🔧"},
    "security": {"name": "安全部", "role": "合规/审计/红线", "icon": "⚖️"},
    "dev": {"name": "开发部", "role": "应急与巡检", "icon": "⚔️"},
    "hr": {"name": "人力资源部", "role": "人事/培训/Agent管理", "icon": "👔"},
}


@router.get("")
async def list_agents():
    """列出所有可用 Agent。"""
    agents = []
    for agent_id, meta in AGENT_META.items():
        agents.append({
            "id": agent_id,
            **meta,
        })
    return {"agents": agents}


@router.get("/{agent_id}")
async def get_agent(agent_id: str):
    """获取 Agent 详情。"""
    meta = AGENT_META.get(agent_id)
    if not meta:
        return {"error": f"Agent '{agent_id}' not found"}, 404

    # 尝试读取 SOUL.md
    soul_path = Path(__file__).parents[4] / "agents" / agent_id / "SOUL.md"
    soul_content = ""
    if soul_path.exists():
        soul_content = soul_path.read_text(encoding="utf-8")[:2000]

    return {
        "id": agent_id,
        **meta,
        "soul_preview": soul_content,
    }


@router.get("/{agent_id}/config")
async def get_agent_config(agent_id: str):
    """获取 Agent 运行时配置。"""
    config_path = Path(__file__).parents[4] / "data" / "agent_config.json"
    if not config_path.exists():
        return {"agent_id": agent_id, "config": {}}

    try:
        configs = json.loads(config_path.read_text(encoding="utf-8"))
        agent_config = configs.get(agent_id, {})
        return {"agent_id": agent_id, "config": agent_config}
    except (json.JSONDecodeError, IOError):
        return {"agent_id": agent_id, "config": {}}
