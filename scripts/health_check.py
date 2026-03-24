#!/usr/bin/env python3
"""
健康检查服务 - 提供HTTP端点供外部监控
"""
import json
import subprocess
import urllib.request
from http.server import HTTPServer, BaseHTTPRequestHandler

class HealthHandler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        pass  # 静默日志
    
    def do_GET(self):
        if self.path == '/health':
            self.check_health()
        elif self.path == '/ready':
            self.check_ready()
        else:
            self.send_error(404)
    
    def check_health(self):
        """存活检查"""
        result = {
            'status': 'healthy',
            'services': {}
        }
        
        # 检查 Gateway
        try:
            import socket
            s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            s.settimeout(2)
            s.connect(('127.0.0.1', 37908))
            s.close()
            result['services']['gateway'] = 'up'
        except:
            result['services']['gateway'] = 'down'
            result['status'] = 'unhealthy'
        
        # 检查 Oce
        try:
            resp = urllib.request.urlopen('http://127.0.0.1:7891/api/live-status', timeout=2)
            result['services']['oce'] = 'up' if resp.status == 200 else 'down'
        except:
            result['services']['oce'] = 'down'
            result['status'] = 'unhealthy'
        
        # 检查磁盘
        df = subprocess.run(['df', '/'], capture_output=True, text=True)
        usage = int(df.stdout.split('\n')[1].split()[4].replace('%', ''))
        result['disk_usage'] = f'{usage}%'
        if usage > 90:
            result['status'] = 'unhealthy'
        
        # 检查内存
        free_out = subprocess.run(['free', '-m'], capture_output=True, text=True)
        free_mb = int(free_out.stdout.split('\n')[1].split()[6])
        result['free_memory_mb'] = free_mb
        if free_mb < 100:
            result['status'] = 'unhealthy'
        
        status_code = 200 if result['status'] == 'healthy' else 503
        self.send_response(status_code)
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        self.wfile.write(json.dumps(result, indent=2).encode())
    
    def check_ready(self):
        """就绪检查"""
        try:
            resp = urllib.request.urlopen('http://127.0.0.1:7891/api/live-status', timeout=2)
            if resp.status == 200:
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(b'{"ready": true}')
                return
        except:
            pass
        
        self.send_response(503)
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        self.wfile.write(b'{"ready": false}')

if __name__ == '__main__':
    server = HTTPServer(('0.0.0.0', 7892), HealthHandler)
    print('健康检查服务启动在端口 7892')
    server.serve_forever()
