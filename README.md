# Remember

An interactive, full-screen installation about searching for personal memories scattered across digital platforms, devices, caches and cloud services.

The visitor remembers saving something, but may no longer know where it is or whether it still exists. The work uses a dark forensic archive interface, a generated memory map, and a printed or saved Memory Receipt.

## Run locally

This project has no backend. Serve the folder with any static server.

From this directory:

```bash
python3 -m http.server 8765
```

Then open:

**http://127.0.0.1:8765/**

A modern browser is required (Web Audio API, p5.js canvas, print dialogue).

Designed primarily for **1920 × 1080** and **2440 × 1080**, with responsive layout for other sizes. Mouse, touchscreen and keyboard are supported.

## Privacy

- No names, phone numbers or passwords are requested.
- No connection is made to WeChat, QQ, cloud or browser accounts.
- Archive nodes are fictional.
- Visitor input exists only in temporary browser memory.
- Input is cleared on Finish, Search Again, inactivity reset, or page refresh.
- Nothing is written to `localStorage`.

## Files

| File | Role |
| --- | --- |
| `index.html` | Structure and scene markup |
| `style.css` | Archive interface, print layout |
| `script.js` | Application state, scene flow, p5.js map |
| `data.js` | Clues, fictional nodes, weighted outcomes |
| `audio.js` | Web Audio (noise, search, print, archive) |
| `receipt.js` | Receipt render, print and save-as-image |

Sound starts only after visitor interaction. Quiet white noise is generated in the browser; no copyrighted audio is used.

## Testing shortcuts

These keys are hidden from the public interface:

- `1`–`9` move between scenes
- `C` Complete Memory
- `F` Fragmented Memory
- `S` Similar Memory
- `I` Inaccessible Memory
- `V` cycle sub-results
- `R` reset to Scene 01
