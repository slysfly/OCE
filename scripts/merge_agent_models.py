#!/usr/bin/env python3
"""
将OpenClaw配置中的大模型信息合并到officials_stats.json
"""
import json
from pathlib import Path

DATA_DIR = Path('/root/.openclaw/workspace-assistant/data')

def merge_agent_models():
    # 读取配置
    with open(DATA_DIR / 'agent_config.json', 'r') as f:
        config = json.load(f)
    
    with open(DATA_DIR / 'officials_stats.json', 'r') as f:
        stats = json.load(f)
    
    # 构建模型映射
    model_map = {}
    for agent in config.get('agents', []):
        model_map[agent['id']] = agent.get('model', config.get('defaultModel', 'unknown'))
    
    default_model = config.get('defaultModel', 'unknown')
    
    # 更新每个official的模型信息
    for official in stats.get('officials', []):
        agent_id = official.get('id', '')
        # 将staff_xxx格式转换为对应的agent_id
        # staff_001 -> product 等
        model = model_map.get(agent_id, default_model)
        official['model'] = model
        # 简化显示
        if '/' in model:
            official['model_short'] = model.split('/')[-1]
        else:
            official['model_short'] = model[:20]
    
    # 保存
    with open(DATA_DIR / 'officials_stats.json', 'w') as f:
        json.dump(stats, f, indent=2, ensure_ascii=False)
    
    print(f"已更新 {len(stats.get('officials', []))} 个员工的模型信息")
    print(f"默认模型: {default_model}")

if __name__ == '__main__':
    merge_agent_models()
