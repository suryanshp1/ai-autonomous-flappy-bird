# Headless Blender MCP (`sandraschi/blender-mcp`) 3D Asset Pipeline & Next-Gen Graphics Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrate headless `sandraschi/blender-mcp` to generate high-detail Cyberpunk PBR `.glb` 3D assets (`mecha_bird.glb`, `cyber_pipe.glb`, `plasma_orb.glb`, `cyber_city.glb`) and upgrade the Three.js renderer and HUD with `GLTFLoader`, `UnrealBloomPass` post-processing, `RoomEnvironment` PBR metallic reflections, parallax megastructures, and tactical cockpit aesthetics.

**Architecture:** We install Blender headlessly alongside `sandraschi/blender-mcp`, configure `.mcp.json` for MCP integration, and execute a deterministic headless `blender-mcp` generation pipeline (`scripts/generate_assets_via_blender_mcp.py`) that invokes `blender_mcp`'s `BlenderExecutor` (`execute_script` / `export`) to author and export four multi-part PBR `.glb` assets into `services/frontend/public/models/`. On the frontend, `WorldRenderer.ts` loads and pools these `.glb` hierarchies asynchronously with zero-GC cloning, binds sub-mesh rigs (`LeftWing`, `RightWing`, `ThrusterCore`, `CollarGlow`, `Core`, `InnerRing`, `OuterRing`), renders through a Three.js `EffectComposer` (`RenderPass` + `UnrealBloomPass` + `OutputPass`) with `PMREMGenerator` IBL reflections, and pairs with an upgraded tactical sci-fi HUD in `HUD.ts` and `style.css`.

**Tech Stack:** Blender 4.x (`--background` headless), `sandraschi/blender-mcp` (FastMCP + `BlenderExecutor`), Python 3.11+, Three.js `0.160.0` (`GLTFLoader`, `EffectComposer`, `UnrealBloomPass`, `RoomEnvironment`), TypeScript `5.3.3`, Vite `5.0.12`.

## Global Constraints

- Collision parity with `Physics.ts`: `birdRadius = 0.35`, `pipeRadius = 0.55`, `gapHeight = 3.2`, `floorY = 0.5`, `ceilingY = 10.5`.
- Headless execution must work without opening a GUI window (`blender -b` via `sandraschi/blender-mcp`).
- Zero-GC runtime loop in `WorldRenderer.ts`: all `.glb` models must be loaded once and cloned/pooled without per-frame allocations.

---

### Task 1: Install Headless Blender & `sandraschi/blender-mcp` + Configure MCP Server

**Files:**
- Create: `.mcp.json`
- Create: `scripts/generate_assets_via_blender_mcp.py`
- Create: `scripts/test_glb_assets.py`

**Interfaces:**
- Produces:
  - `services/frontend/public/models/mecha_bird.glb`
  - `services/frontend/public/models/cyber_pipe.glb`
  - `services/frontend/public/models/plasma_orb.glb`
  - `services/frontend/public/models/cyber_city.glb`
  - `docs/blender_assets_render.png`

- [x] **Step 1: Install Blender & clone `sandraschi/blender-mcp`**
- [x] **Step 2: Write `scripts/test_glb_assets.py` to verify generated `.glb` binary headers, node hierarchies, and material counts**
- [x] **Step 3: Write `scripts/generate_assets_via_blender_mcp.py` using `sandraschi/blender-mcp` headless `BlenderExecutor` to construct and export the 4 PBR `.glb` assets and preview render**
- [x] **Step 4: Run `scripts/generate_assets_via_blender_mcp.py` and verify `pytest scripts/test_glb_assets.py` passes**

---

### Task 2: Upgrade Three.js `WorldRenderer.ts` with `GLTFLoader`, `EffectComposer` (`UnrealBloomPass`), `RoomEnvironment` IBL, and Parallax Megastructures

**Files:**
- Modify: `services/frontend/src/engine/WorldRenderer.ts`
- Modify: `services/frontend/src/engine/GameEngine.ts`

**Interfaces:**
- Consumes: `/models/mecha_bird.glb`, `/models/cyber_pipe.glb`, `/models/plasma_orb.glb`, `/models/cyber_city.glb`
- Produces:
  - `WorldRenderer.togglePostProcessing(): boolean`
  - `WorldRenderer.triggerOrbCollectBurst(y: number, z: number): void`
  - `WorldRenderer.postProcessingEnabled: boolean`

- [x] **Step 1: Upgrade `WorldRenderer.ts` with IBL (`RoomEnvironment`), `EffectComposer` + `UnrealBloomPass` + `OutputPass`, asynchronous `GLTFLoader` asset pooling, parallax cyberpunk megastructures, cyber-trench floor plates, shockwave rings, and speed-streak particles**
- [x] **Step 2: Connect `KeyB` / HUD FX toggle and orb-collect shockwaves in `GameEngine.ts`**
- [x] **Step 3: Run `npm run build` in `services/frontend` to verify zero TypeScript/Vite errors**

---

### Task 3: Upgrade Tactical Cyberpunk HUD & Cockpit Overlay (`HUD.ts`, `index.html`, `style.css`)

**Files:**
- Modify: `services/frontend/index.html`
- Modify: `services/frontend/src/ui/HUD.ts`
- Modify: `services/frontend/src/style.css`

**Interfaces:**
- Consumes: `WorldRenderer.togglePostProcessing()`, `CameraMode`
- Produces:
  - `HUD.setFxStatus(enabled: boolean): void`
  - Cockpit HUD pitch-ladder & target reticle framing when in `FPV CAM` or `CHASE CAM`
  - `FX: ULTRA` toggle button in header controls

- [x] **Step 1: Add cockpit HUD overlay, scanline/vignette layer, and `FX: BLOOM` button to `index.html`, `HUD.ts`, and `style.css`**
- [x] **Step 2: Build and verify in live browser with headless Playwright/Chromium screenshot verification**
