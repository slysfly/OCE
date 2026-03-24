#!/usr/bin/env python3
import http.server
import json
import socketserver
from pathlib import Path

PORT = 7892
AWARE_DIR = Path(__file__).parent
OCE_DATA_DIR = Path('/root/.openclaw/workspace-assistant/data')

class AwareHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(AWARE_DIR), **kwargs)
    
    def do_GET(self):
        if self.path == '/' or self.path == '':
            self.path = '/aware.html'
        
        if self.path == '/api/oce-status':
            self.handle_oce_status()
            return
        
        return super().do_GET()
    
    def handle_oce_status(self):
        try:
            live_file = OCE_DATA_DIR / 'live_status.json'
            agents = []
            tasks = []
            
            if live_file.exists():
                with open(live_file) as f:
                    live = json.load(f)
                    agents = live.get('agents', [])
                    tasks = live.get('tasks', [])
            
            total_agents = len(agents)
            busy_agents = sum(1 for a in agents if a.get('status') == 'busy')
            idle_agents = sum(1 for a in agents if a.get('status') == 'idle')
            total_tasks = len(tasks)
            doing_tasks = sum(1 for t in tasks if t.get('state') == 'Doing')
            done_tasks = sum(1 for t in tasks if t.get('state') == 'Done')
            pending_tasks = sum(1 for t in tasks if t.get('state') in ['Pending', 'Inbox'])
            
            result = {
                'agents': agents,
                'tasks': tasks,
                'stats': {
                    'agents': {'total': total_agents, 'busy': busy_agents, 'idle': idle_agents},
                    'tasks': {'total': total_tasks, 'doing': doing_tasks, 'done': done_tasks, 'pending': pending_tasks}
                }
            }
            
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(json.dumps(result, ensure_ascii=False).encode())
        except Exception as e:
            self.send_response(500)
            self.end_headers()
            self.wfile.write(f'{{"error": "{str(e)}"}}'.encode())
    
    def do_PUT(self):
        if self.path == '/data/aware.json':
            content_length = int(self.headers['Content-Length'])
            body = self.rfile.read(content_length)
            try:
                data_file = AWARE_DIR / 'data' / 'aware.json'
                data_file.parent.mkdir(exist_ok=True)
                with open(data_file, 'w') as f:
                    f.write(body.decode('utf-8'))
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(b'{"ok": true}')
            except Exception as e:
                self.send_response(500)
                self.end_headers()
                self.wfile.write(f'{{"error": "{str(e)}"}}'.encode())
        else:
            self.send_response(404)
            self.end_headers()

class ReuseAddrTCPServer(socketserver.TCPServer):
    allow_reuse_address = True

if __name__ == '__main__':
    with ReuseAddrTCPServer(('', PORT), AwareHandler) as httpd:
        print(f'🧠 OCE 自主感知系统启动 → http://0.0.0.0:{PORT}')
        httpd.serve_forever()
