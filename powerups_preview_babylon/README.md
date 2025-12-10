# Powerups 3D Preview (BabylonJS)

This is a small standalone preview to visualize powerups in 3D using BabylonJS.

Files

- `index.html` — preview page that loads BabylonJS and `scene.js`.
- `style.css` — layout and canvas styling.
- `scene.js` — creates the Babylon scene and builds simple 3D shapes for each powerup.

Run

Open the file directly in a browser (works in many cases) or run a quick static server from the directory:

```bash
cd powerups_preview_babylon
python3 -m http.server 8000
# open http://localhost:8000
```

Notes

- The preview draws simple procedural meshes (boxes, spheres, cones) as placeholders for actual game models.
- If you want the preview to use your in-game assets, I can wire it to load glTF/OBJ models from your project.
- I can also add movement/animation to better demonstrate effects (e.g. bouncing ball, speed trails).
