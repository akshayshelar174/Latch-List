# Latch List

**Make the door do the remembering.**

Latch List helps with a small everyday problem: leaving home and realizing later that you forgot the keys, a return, a bottle, or the one thing you meant to do on the way. Keep a short checklist for each kind of leaving, then tap things ready as you prepare.

## What makes it different

One item can be a thing to **take**, a **stop** to make, or something to **remember**. Stop reminders can include a place, so “return parcel” sits beside the post office rather than disappearing into a generic task list. The app works without location access or an account.

## Run it

Requires Python 3.10 or later. There are no third-party Python packages.

```powershell
python app.py
```

Open [http://127.0.0.1:8000](http://127.0.0.1:8000). Press `Ctrl+C` in the server window to stop it. Your checklist data is stored locally in `data/latchlist.db`.

To choose another local port:

```powershell
$env:LATCH_PORT = "8080"
python app.py
```

## Backend

The Python `ThreadingHTTPServer` serves the static site and provides a JSON API backed by SQLite:

- `GET /api/health`
- `GET /api/contexts`
- `GET /api/items?context=home`
- `POST /api/items`
- `PATCH /api/items/{id}`
- `DELETE /api/items/{id}`

New item example:

```json
{
  "title": "Return the library book",
  "context": "errands",
  "kind": "stop",
  "place": "Library"
}
```

The server binds to `127.0.0.1` by default, so the app is for local use. Data remains in the local SQLite database; the app does not collect location or send checklist contents to an external service.

## Structure

- `app.py` — local Python server, REST endpoints, validation, SQLite storage
- `static/index.html` — accessible page structure
- `static/style.css` — responsive visual design
- `static/app.js` — checklist interactions and API calls
- `data/` — local database created on first run; excluded from Git
