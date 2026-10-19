# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Vanilla JS Tetris (HTML5 Canvas). No `package.json`, no build, no linter, no tests. The README and UI text are in Spanish; keep user-facing strings in Spanish.

## Running

Open `index.html` directly, or serve statically (e.g. `python -m http.server 8000`) and visit `http://localhost:8000`.

## Architecture

Three files: `index.html` (DOM + canvases), `style.css`, and `game.js` (all logic, loaded as a plain script with `'use strict'`; everything is module-level globals).

- **Global mutable state** in `game.js` (`board`, `current`, `next`, `score`, `lines`, `level`, `paused`, `gameOver`, `dropInterval`, `dropAccum`, `animId`…) is declared in one `let` and reset by `init()`. The restart button calls `init()` again, so any new state must be reset there.
- **Board**: `ROWS × COLS` matrix of `0` or a piece-type index 1–12 (1–7 standard, 8–10 pentominoes +/U/Y, 11 single 1×1 awarded for the next spawn after a Tetris via `rewardPending`, 12 hollow 3×3). `randomPiece` rolls the special types by chance; `makePiece(type)` builds any piece. That same index keys into both `COLORS` and `PIECES` (index 0 is `null` in each), and shape cells hold their own type index, so they can be merged into the board directly.
- **Flow**: `loop` (rAF) → gravity → `lockPiece` (`merge` → `clearLines` → `spawn`). `spawn` calls `endGame` if the new piece collides immediately. Soft drop, hard drop and keyboard input all funnel through the same `collide`/`lockPiece` path.
- **Pause/game over** both cancel the rAF loop (`cancelAnimationFrame(animId)`) and reuse the same `#overlay` element; resuming restarts `loop` manually.
- **Skins**: `SKINS` (retro/neon/pastel/pixel) in `game.js`; `drawBlock` keeps retro inline and delegates to `SKINS[skin].draw` otherwise. `setSkin()` sets `data-skin` on `<html>` (CSS styles the canvas backgrounds and may override `--grid`), persists `tetris-skin`, and redraws. Skin state lives outside `init()`.
- **Rotation**: `rotateCW` plus a simple kick list `[0,-1,1,-2,2]` in `tryRotate` (horizontal only, not SRS).

## Gotchas

- Canvas size is hard-coded in `index.html` (`#board` 300×600, `#next-canvas` 120×120). Changing `COLS`, `ROWS` or `BLOCK` in `game.js` requires updating the canvas `width`/`height` to `COLS*BLOCK` × `ROWS*BLOCK`.
- The `keydown` handler calls `updateHUD()` after every key, and `drawNext` hardcodes a 4×4 preview grid with block size 30.
- Speed formula: `dropInterval = max(100, 1000 - (level-1)*90)`; level = `floor(lines/10)+1`; scoring uses `LINE_SCORES * level` (+1/row soft drop, +2/row hard drop).
