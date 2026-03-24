#!/bin/bash
# 服务监控脚本 - 每分钟检查关键服务状态

LOG_FILE="/tmp/service_monitor.log"
ALERT_FILE="/tmp/service_alerts.log"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" >> "$LOG_FILE"
}

alert() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] 🚨 $1" >> "$ALERT_FILE"
    # TODO: 发送飞书通知
}

# 检查 OpenClaw Gateway
check_gateway() {
    if ! pgrep -f "openclaw-gateway" > /dev/null; then
        alert "OpenClaw Gateway 进程不存在，尝试重启..."
        systemctl start openclaw-gateway 2>/dev/null || openclaw gateway start &
        return 1
    fi
    
    # 检查端口
    if ! ss -tlnp | grep -q ":37908"; then
        alert "OpenClaw Gateway 端口 37908 未监听"
        return 1
    fi
    
    log "✅ Gateway 正常"
    return 0
}

# 检查 Oce 服务
check_oce() {
    if ! systemctl is-active oce > /dev/null 2>&1; then
        alert "Oce 服务未运行，尝试重启..."
        systemctl restart oce
        return 1
    fi
    log "✅ Oce 正常"
    return 0
}

# 检查磁盘空间
check_disk() {
    local usage=$(df / | awk 'NR==2 {print $5}' | tr -d '%')
    if [ "$usage" -gt 90 ]; then
        alert "磁盘使用率 ${usage}%，超过阈值"
        return 1
    fi
    log "✅ 磁盘正常 (${usage}%)"
    return 0
}

# 检查内存
check_memory() {
    local free_mb=$(free -m | awk 'NR==2 {print $7}')
    if [ "$free_mb" -lt 100 ]; then
        alert "可用内存仅 ${free_mb}MB，低于阈值"
        return 1
    fi
    log "✅ 内存正常 (${free_mb}MB 可用)"
    return 0
}

# 主检查流程
main() {
    check_gateway
    check_oce
    check_disk
    check_memory
}

main
