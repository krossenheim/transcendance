#!/usr/bin/env python3
"""
Simple blockchain explorer server with CORS proxy for Hardhat RPC
"""

import http.server
import socketserver
import urllib.request
import json
import os

PORT = 5100
RPC_URL = os.environ.get('RPC_URL', 'http://hardhat:8545')

class ExplorerHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        # Add CORS headers
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        super().end_headers()
    
    def do_OPTIONS(self):
        self.send_response(200)
        self.end_headers()
    
    def do_POST(self):
        # Proxy RPC requests to Hardhat node
        if self.path == '/rpc':
            try:
                content_length = int(self.headers['Content-Length'])
                post_data = self.rfile.read(content_length)
                
                req = urllib.request.Request(
                    RPC_URL,
                    data=post_data,
                    headers={'Content-Type': 'application/json'}
                )
                
                with urllib.request.urlopen(req, timeout=10) as response:
                    result = response.read()
                    
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(result)
            except Exception as e:
                self.send_response(500)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({'error': str(e)}).encode())
        else:
            self.send_response(404)
            self.end_headers()

os.chdir(os.path.dirname(os.path.abspath(__file__)))

with socketserver.TCPServer(("", PORT), ExplorerHandler) as httpd:
    print(f"🔗 Blockchain Explorer running at http://localhost:{PORT}")
    print(f"📡 Proxying RPC to {RPC_URL}")
    httpd.serve_forever()
