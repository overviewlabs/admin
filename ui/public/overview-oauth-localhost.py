#!/usr/bin/env python3
"""Temporary localhost OAuth callback relay for https://overviewlabs.ai.

Run on the computer whose browser is signing in. No dependencies or credentials.
Only the callback is relayed; tokens are exchanged and stored by WHOXOS.
"""
import http.server
import re
import selectors
import socket
import time
import urllib.parse

CALLBACK = "https://overviewlabs.ai/api/tools/oauth/callback"
PORT = 8765


def callback_location(path, host):
    if host not in (f"localhost:{PORT}", f"127.0.0.1:{PORT}", f"[::1]:{PORT}"):
        raise ValueError("Invalid host")
    url = urllib.parse.urlsplit(path)
    if url.scheme or url.netloc or url.path != "/callback" or len(path) > 16384:
        raise ValueError("Invalid callback path")
    query = urllib.parse.parse_qs(url.query, keep_blank_values=True, max_num_fields=12)
    state = query.get("state", [])
    if len(state) != 1 or not re.fullmatch(r"whox-local-v1\.[A-Za-z0-9_-]{43}\.[A-Za-z0-9_-]{32,128}", state[0]):
        raise ValueError("Start a new localhost sign-in from WHOXOS")
    if bool(query.get("code")) == bool(query.get("error")):
        raise ValueError("Expected one OAuth outcome")
    allowed = {}
    for key in ("state", "code", "error", "iss"):
        if key in query:
            if len(query[key]) != 1 or not query[key][0]:
                raise ValueError("Invalid callback parameters")
            allowed[key] = query[key][0]
    return CALLBACK + "?" + urllib.parse.urlencode(allowed)


class Handler(http.server.BaseHTTPRequestHandler):
    def log_message(self, *_):
        pass  # Authorization codes and state must never enter access logs.

    def setup(self):
        super().setup()
        self.connection.settimeout(5)

    def do_GET(self):
        try:
            location = callback_location(self.path, self.headers.get("Host", ""))
        except ValueError:
            self.send_response(400)
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(b"Start sign-in from WHOXOS using Connect through localhost.")
            return
        self.send_response(303)
        self.send_header("Location", location)
        self.send_header("Cache-Control", "no-store")
        self.send_header("Referrer-Policy", "no-referrer")
        self.send_header("Content-Length", "0")
        self.end_headers()
        print("Callback returned to WHOXOS. Finish in your browser; Control-C stops this helper.", flush=True)


class IPv6Server(http.server.ThreadingHTTPServer):
    address_family = socket.AF_INET6


def main():
    servers = []
    try:
        # Explicit loopback addresses only. Serve IPv4 and IPv6 because Safari
        # may resolve localhost to either; never bind 0.0.0.0 or ::.
        servers.append(http.server.ThreadingHTTPServer(("127.0.0.1", PORT), Handler))
        if socket.has_ipv6:
            try:
                servers.append(IPv6Server(("::1", PORT), Handler))
            except OSError as error:
                # An occupied IPv6 port could deliver the callback elsewhere.
                # Only tolerate platforms without IPv6 loopback support.
                import errno
                if error.errno not in (errno.EAFNOSUPPORT, errno.EADDRNOTAVAIL):
                    raise
        with selectors.DefaultSelector() as selector:
            for server in servers:
                selector.register(server, selectors.EVENT_READ)
            print("Ready: http://localhost:8765/callback", flush=True)
            print("In WHOXOS, choose Sign in with localhost. This helper stops after 15 minutes.", flush=True)
            deadline = time.monotonic() + 15 * 60
            while time.monotonic() < deadline:
                for key, _ in selector.select(timeout=1):
                    key.fileobj.handle_request()
    except KeyboardInterrupt:
        pass
    except OSError:
        raise SystemExit("Cannot listen on localhost:8765. Close the other app using that port and try again.")
    finally:
        for server in servers:
            server.server_close()


if __name__ == "__main__":
    main()
