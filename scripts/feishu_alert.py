#!/usr/bin/env python3
"""
飞书告警脚本
"""
import json
import urllib.request
import sys

def send_alert(message):
    """发送告警消息给领导"""
    user_id = 'ou_fe49a4c1bdb31e094165fd68bf161009'
    try:
        url = 'http://127.0.0.1:37908/v7o4qt/api/message'
        data = {
            'to': user_id,
            'message': f"🚨 系统告警\n\n{message}",
            'channel': 'feishu'
        }
        req = urllib.request.Request(
            url,
            data=json.dumps(data).encode('utf-8'),
            headers={'Content-Type': 'application/json'}
        )
        urllib.request.urlopen(req, timeout=10)
        return True
    except Exception as e:
        print(f'发送告警失败: {e}')
        return False

if __name__ == '__main__':
    if len(sys.argv) > 1:
        send_alert(' '.join(sys.argv[1:]))
    else:
        # 测试告警
        send_alert('【测试】这是运维告警测试消息')
