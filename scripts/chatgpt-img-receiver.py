#!/usr/bin/env python3
"""
ChatGPT image downloader — receives images POSTed from Chrome JS.
Usage:
  1. python3 chatgpt-img-receiver.py --port 18924 --outdir /path/to/output
  2. In Chrome JS: fetch image URL, POST blob to http://localhost:18924/save?name=filename.png
  3. Server saves to outdir/filename.png, returns JSON confirmation.
"""
import http.server
import json
import os
import sys
import argparse
from urllib.parse import urlparse, parse_qs

class Handler(http.server.BaseHTTPRequestHandler):
    outdir = "."

    def do_POST(self):
        parsed = urlparse(self.path)
        if parsed.path != "/save":
            self.send_response(404)
            self.end_headers()
            return

        params = parse_qs(parsed.query)
        name = params.get("name", ["image.png"])[0]
        # Sanitize filename
        name = os.path.basename(name)

        content_length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(content_length)

        out_path = os.path.join(self.outdir, name)
        with open(out_path, "wb") as f:
            f.write(body)

        resp = json.dumps({"ok": True, "path": out_path, "bytes": len(body)})
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(resp.encode())
        print(f"Saved: {out_path} ({len(body)} bytes)", flush=True)

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Allow-Private-Network", "true")
        self.end_headers()

    def log_message(self, format, *args):
        pass  # Suppress default logging

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=18924)
    parser.add_argument("--outdir", default=".")
    args = parser.parse_args()

    os.makedirs(args.outdir, exist_ok=True)
    Handler.outdir = args.outdir

    server = http.server.HTTPServer(("127.0.0.1", args.port), Handler)
    print(f"Listening on 127.0.0.1:{args.port}, saving to {args.outdir}", flush=True)
    server.serve_forever()
