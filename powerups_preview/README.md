# Powerup Preview

Simple preview page to visualize powerup shapes used by the game.

How to use

- Open `powerups_preview/index.html` in a browser, or run a static server from the `powerups_preview` directory:

```bash
cd powerups_preview
python3 -m http.server 8000
# then open http://localhost:8000 in your browser
```

- Use the select box to pick a single powerup or click "Show All" to see every icon.

Files

- `index.html` — page and UI
- `style.css` — small styles
- `preview.js` — canvas drawing routines for each powerup
