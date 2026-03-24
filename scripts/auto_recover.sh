#!/bin/bash
# 自动恢复脚本 - 检测到服务异常时自动恢复

recover_gateway() {
    echo "[$(date)] 尝试恢复 Gateway..."
    # 先停止
    pkill -f "openclaw-gateway" 2>/dev/null
    sleep 2
    # 再启动
    cd /root && nohup openclaw gateway start > /tmp/gateway_restart.log 2>&1 &
    sleep 5
    # 验证
    if pgrep -f "openclaw-gateway" > /dev/null; then
        echo "[$(date)] ✅ Gateway 恢复成功"
        return 0
    else
        echo "[$(date)] ❌ Gateway 恢复失败"
        return 1
    fi
}

recover_oce() {
    echo "[$(date)] 尝试恢复 Oce..."
    systemctl restart oce
    sleep 3
    if systemctl is-active oce > /dev/null 2>&1; then
        echo "[$(date)] ✅ Oce 恢复成功"
        return 0
    else
        echo "[$(date)] ❌ Oce 恢复失败"
        return 1
    fi
}

# 根据参数执行恢复
case "$1" in
    gateway) recover_gateway ;;
    oce) recover_oce ;;
    all) recover_gateway && recover_oce ;;
    *) echo "用法: $0 {gateway|oce|all}" ;;
esac
