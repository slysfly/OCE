#!/bin/bash
# 监控Dashboard服务

if ! pgrep -f "server.py --host" > /dev/null; then
    cd /root/oce-main/dashboard
    python3 server.py --host 0.0.0.0 --port 7891 >> /tmp/dashboard.log 2>&1
    echo "$(date): Dashboard服务已重启" >> /tmp/dashboard_monitor.log
fi
