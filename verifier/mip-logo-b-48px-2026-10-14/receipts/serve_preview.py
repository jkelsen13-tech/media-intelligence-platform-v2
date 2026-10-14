import json, mimetypes, os, secrets, threading
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from pathlib import Path
from urllib.parse import unquote, urlsplit

root=Path(__file__).resolve().parent
dist=(root/'checkout/dist').resolve()
base='/media-intelligence-platform-v2/'
token=secrets.token_hex(24)
class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        print(fmt % args, flush=True)
    def do_POST(self):
        if self.path!='/__task_shutdown' or self.headers.get('X-MIP-Task-Token')!=token:
            self.send_error(403); return
        self.send_response(200); self.end_headers(); self.wfile.write(b'Stopping task preview')
        threading.Thread(target=self.server.shutdown,daemon=True).start()
    def do_GET(self):
        path=unquote(urlsplit(self.path).path)
        if not path.startswith(base): self.send_error(404); return
        relative=path[len(base):]
        target=(dist/relative).resolve()
        if not target.is_relative_to(dist): self.send_error(403); return
        if not relative or target.is_dir(): target=dist/'index.html'
        if not target.is_file(): self.send_error(404); return
        data=target.read_bytes()
        self.send_response(200)
        self.send_header('Content-Type',mimetypes.guess_type(target.name)[0] or 'application/octet-stream')
        self.send_header('Content-Length',str(len(data)))
        self.send_header('Cache-Control','no-store')
        self.send_header('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; font-src 'self' data:; worker-src 'self' blob:; object-src 'none'; base-uri 'self'")
        self.end_headers(); self.wfile.write(data)
server=ThreadingHTTPServer(('127.0.0.1',4178),Handler)
(root/'server-session.json').write_text(json.dumps({'pid':os.getpid(),'port':4178,'token':token,'directory':str(dist),'binding':'127.0.0.1','data':'bundled synthetic demo only; Supabase build env absent'})+'\n')
print('MIP temporary preview ready on http://127.0.0.1:4178'+base,flush=True)
server.serve_forever()
server.server_close()
print('MIP temporary preview stopped',flush=True)

