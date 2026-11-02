"""Latch List local web app: an exit checklist with a small JSON API."""

from __future__ import annotations

import json
import os
import sqlite3
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

ROOT = Path(__file__).resolve().parent
STATIC = ROOT / "static"
DB_PATH = ROOT / "data" / "latchlist.db"
HOST = os.environ.get("LATCH_HOST", "127.0.0.1")
PORT = int(os.environ.get("LATCH_PORT", "8000"))

CONTEXTS = {
    "home": "Leaving home",
    "gym": "Gym bag",
    "errands": "Errands",
}
KINDS = {"carry", "stop", "remember"}
SEEDS = [
    ("Keys", "home", "carry", ""),
    ("Wallet", "home", "carry", ""),
    ("Water bottle", "home", "carry", ""),
    ("Return the library book", "errands", "stop", "Library"),
    ("Reusable bags", "errands", "carry", ""),
    ("Workout clothes", "gym", "carry", ""),
    ("Fill the bottle", "gym", "remember", ""),
]


def connect() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(DB_PATH, timeout=5)
    db.row_factory = sqlite3.Row
    db.execute("PRAGMA journal_mode=WAL")
    return db


def initialize() -> None:
    with connect() as db:
        db.execute("""
            CREATE TABLE IF NOT EXISTS items (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL CHECK(length(title) <= 90),
                context TEXT NOT NULL,
                kind TEXT NOT NULL,
                place TEXT NOT NULL DEFAULT '',
                done INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL
            )
        """)
        if db.execute("SELECT COUNT(*) FROM items").fetchone()[0] == 0:
            created = datetime.now(timezone.utc).isoformat()
            db.executemany(
                "INSERT INTO items(title, context, kind, place, done, created_at) VALUES (?, ?, ?, ?, 0, ?)",
                [(*seed, created) for seed in SEEDS],
            )


def row_dict(row: sqlite3.Row) -> dict:
    return {
        "id": row["id"], "title": row["title"], "context": row["context"],
        "kind": row["kind"], "place": row["place"], "done": bool(row["done"]),
        "created_at": row["created_at"],
    }


class Handler(BaseHTTPRequestHandler):
    server_version = "LatchList/1.0"

    def log_message(self, _format: str, *_args) -> None:
        # Keep routine local request details out of the console.
        return

    def _headers(self, content_type: str, length: int = 0, cache: bool = False) -> None:
        self.send_header("Content-Type", content_type)
        if length:
            self.send_header("Content-Length", str(length))
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "no-referrer")
        self.send_header("Content-Security-Policy", "default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; img-src 'self' data:; base-uri 'none'; frame-ancestors 'none'")
        self.send_header("Cache-Control", "public, max-age=300" if cache else "no-store")

    def _json(self, payload: dict | list, status: int = 200) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self._headers("application/json; charset=utf-8", len(body))
        self.end_headers()
        self.wfile.write(body)

    def _body(self) -> dict:
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError as exc:
            raise ValueError("Invalid request length.") from exc
        if length < 1 or length > 16_384:
            raise ValueError("Request body is empty or too large.")
        try:
            data = json.loads(self.rfile.read(length))
        except (json.JSONDecodeError, UnicodeDecodeError) as exc:
            raise ValueError("Send a valid JSON object.") from exc
        if not isinstance(data, dict):
            raise ValueError("Send a JSON object.")
        return data

    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        if os.environ.get("LATCH_PUBLIC_DEMO") == "1" and parsed.path.startswith("/api/"):
            self._json({"error": "The public demo stores checklists in your browser."}, 404)
            return
        if parsed.path == "/api/contexts":
            self._json([{"id": key, "label": value} for key, value in CONTEXTS.items()])
            return
        if parsed.path == "/api/items":
            context = parse_qs(parsed.query).get("context", ["home"])[0]
            if context not in CONTEXTS:
                self._json({"error": "Unknown checklist context."}, 400)
                return
            with connect() as db:
                rows = db.execute(
                    "SELECT * FROM items WHERE context = ? ORDER BY done ASC, id ASC", (context,)
                ).fetchall()
            self._json([row_dict(row) for row in rows])
            return
        if parsed.path == "/api/health":
            self._json({"status": "ok", "storage": "local SQLite"})
            return
        if parsed.path == "/favicon.ico":
            self.send_response(204)
            self.end_headers()
            return
        self._static(parsed.path)

    def do_POST(self) -> None:
        if os.environ.get("LATCH_PUBLIC_DEMO") == "1":
            self._json({"error": "The public demo stores checklists in your browser."}, 404)
            return
        if urlparse(self.path).path != "/api/items":
            self._json({"error": "Route not found."}, 404)
            return
        try:
            data = self._body()
            title = data.get("title", "")
            context = data.get("context", "")
            kind = data.get("kind", "carry")
            place = data.get("place", "")
            if not isinstance(title, str) or not title.strip() or len(title.strip()) > 90:
                raise ValueError("Add a title between 1 and 90 characters.")
            if not isinstance(context, str) or context not in CONTEXTS:
                raise ValueError("Choose a valid checklist.")
            if not isinstance(kind, str) or kind not in KINDS:
                raise ValueError("Choose carry, stop, or remember.")
            if not isinstance(place, str) or len(place.strip()) > 50:
                raise ValueError("Place must be 50 characters or fewer.")
            if kind != "stop":
                place = ""
            with connect() as db:
                cursor = db.execute(
                    "INSERT INTO items(title, context, kind, place, created_at) VALUES (?, ?, ?, ?, ?)",
                    (title.strip(), context, kind, place.strip(), datetime.now(timezone.utc).isoformat()),
                )
                row = db.execute("SELECT * FROM items WHERE id = ?", (cursor.lastrowid,)).fetchone()
            self._json(row_dict(row), 201)
        except ValueError as exc:
            self._json({"error": str(exc)}, 400)
        except sqlite3.Error:
            self._json({"error": "Local storage is busy. Please retry."}, 503)

    def do_PATCH(self) -> None:
        if os.environ.get("LATCH_PUBLIC_DEMO") == "1":
            self._json({"error": "The public demo stores checklists in your browser."}, 404)
            return
        parts = urlparse(self.path).path.strip("/").split("/")
        if len(parts) != 3 or parts[:2] != ["api", "items"]:
            self._json({"error": "Route not found."}, 404)
            return
        try:
            item_id = int(parts[2])
            data = self._body()
            if not isinstance(data.get("done"), bool):
                raise ValueError("The done field must be true or false.")
            with connect() as db:
                cursor = db.execute("UPDATE items SET done = ? WHERE id = ?", (int(data["done"]), item_id))
                row = db.execute("SELECT * FROM items WHERE id = ?", (item_id,)).fetchone()
            if cursor.rowcount == 0 or row is None:
                self._json({"error": "Checklist item not found."}, 404)
                return
            self._json(row_dict(row))
        except ValueError as exc:
            self._json({"error": str(exc)}, 400)
        except sqlite3.Error:
            self._json({"error": "Local storage is busy. Please retry."}, 503)

    def do_DELETE(self) -> None:
        if os.environ.get("LATCH_PUBLIC_DEMO") == "1":
            self._json({"error": "The public demo stores checklists in your browser."}, 404)
            return
        parts = urlparse(self.path).path.strip("/").split("/")
        if len(parts) != 3 or parts[:2] != ["api", "items"]:
            self._json({"error": "Route not found."}, 404)
            return
        try:
            item_id = int(parts[2])
        except ValueError:
            self._json({"error": "Invalid item ID."}, 400)
            return
        with connect() as db:
            cursor = db.execute("DELETE FROM items WHERE id = ?", (item_id,))
        if cursor.rowcount == 0:
            self._json({"error": "Checklist item not found."}, 404)
            return
        self.send_response(204)
        self.end_headers()

    def _static(self, route: str) -> None:
        relative = "index.html" if route == "/" else route.lstrip("/")
        candidate = (STATIC / relative).resolve()
        try:
            candidate.relative_to(STATIC.resolve())
        except ValueError:
            self._json({"error": "File not found."}, 404)
            return
        if not candidate.is_file():
            self._json({"error": "File not found."}, 404)
            return
        content_types = {".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".svg": "image/svg+xml"}
        body = candidate.read_bytes()
        self.send_response(200)
        self._headers(content_types.get(candidate.suffix, "application/octet-stream"), len(body), cache=candidate.suffix in {".css", ".js"})
        self.end_headers()
        self.wfile.write(body)


def main() -> None:
    initialize()
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    print(f"Latch List is running at http://{HOST}:{PORT}")
    print("Your checklists are stored in data/latchlist.db on this computer.")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping Latch List.")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
