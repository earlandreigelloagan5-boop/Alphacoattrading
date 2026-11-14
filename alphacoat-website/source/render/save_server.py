"""Tiny local helper: serves label.html and saves the label images it draws.

Usage: python save_server.py <port>
Files are served from this folder; anything POSTed to /save/<name> is written to ./textures/<name>.
Only used while making artwork. It is not part of the website.
"""
import http.server
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "textures")
os.makedirs(OUT, exist_ok=True)


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=HERE, **kwargs)

    def do_POST(self):
        name = os.path.basename(self.path)
        if not self.path.startswith("/save/") or not name.endswith(".png"):
            self.send_error(400)
            return
        length = int(self.headers.get("Content-Length", "0"))
        with open(os.path.join(OUT, name), "wb") as fh:
            fh.write(self.rfile.read(length))
        self.send_response(200)
        self.end_headers()
        self.wfile.write(b"saved")


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 4174
    http.server.ThreadingHTTPServer(("127.0.0.1", port), Handler).serve_forever()
