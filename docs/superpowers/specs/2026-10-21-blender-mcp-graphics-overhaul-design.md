# Headless Blender MCP (`sandraschi/blender-mcp`) 3D Asset Pipeline & Next-Gen Graphics Overhaul — Design Spec

**Date:** 2026-10-21  
**Project:** 3D Flappy Bird with System 1 AI Autonomous Player (`jev-flappy-bird`)  
**Status:** Approved

---

## 1. Objective

Upgrade **Flappy Laya 3D** from basic Three.js primitive geometries into a real, production-grade **Cyberpunk Mecha-Avian 3D Game** by integrating [`sandraschi/blender-mcp`](https://github.com/sandraschi/blender-mcp) in **headless mode** to author and export PBR `.glb` 3D assets, combined with an upgraded Three.js rendering pipeline (`GLTFLoader`, `EffectComposer` + `UnrealBloomPass`, `PMREMGenerator` + `RoomEnvironment` IBL metallic reflections, dynamic thruster/shockwave VFX, parallax cyberpunk cityscape megastructures, and a tactical cockpit HUD).

---

## 2. Headless `sandraschi/blender-mcp` Pipeline Architecture

### 2.1 Tooling & Server Setup
- **Blender Engine:** Headless Blender (`BLENDER_EXECUTABLE=/Applications/Blender.app/Contents/MacOS/Blender`, run with `--background` / `-b`).
- **MCP Server:** [`sandraschi/blender-mcp`](https://github.com/sandraschi/blender-mcp) cloned and installed in `tools/blender-mcp` (and configured via `.mcp.json` for MCP clients), invoking `blender-mcp`'s headless executor (`BlenderExecutor` / `blender_script_execute` / `blender_export`).
- **Reproducible Asset Build Script:** `scripts/generate_assets_via_blender_mcp.py` drives the `sandraschi/blender-mcp` headless execution engine to build and export all 4 `.glb` assets into `services/frontend/public/models/` and render a verification showcase image (`docs/blender_assets_render.png`).

### 2.2 3D Asset Specifications (`services/frontend/public/models/`)
All assets use `1 Blender Unit = 1.0 Meter` to preserve 1:1 kinematic parity with `Physics.ts` (`birdRadius = 0.35`, `pipeRadius = 0.55`, `gapHeight = 3.2`, `floorY = 0.5`, `ceilingY = 10.5`):

1. **`mecha_bird.glb` (Cyberpunk Mecha-Falcon Drone)**
   - **Root Hierarchy:**
     - `Chassis`: Aerodynamic stealth fuselage with beveled armor plates, intake vents, dorsal stabilizer fin, armored beak, and glowing cyan cockpit canopy (`Visor`) + side power strips. Fits within `r = 0.35m` collision sphere.
     - `LeftWing` (pivot at `x = -0.18, y = 0.04, z = 0.0`): Swept multi-feathered cybernetic wing with dark titanium frame and glowing violet/cyan energy blades.
     - `RightWing` (pivot at `x = +0.18, y = 0.04, z = 0.0`): Mirrored articulated cybernetic wing.
     - `Thruster` (at `z = -0.48`): Vector-thrust exhaust nozzle with glowing inner plasma core (`ThrusterCore`) that dynamically pulses on flap.
2. **`cyber_pipe.glb` (Industrial Reactor Conduit Column & Collar)**
   - **Root Hierarchy:**
     - `ConduitColumn`: 12.0m tall (`y ∈ [0, 12.0]`), `r = 0.52m` octagonal hard-surface industrial reactor column with recessed armor grooves, external structural ribs, hazard chevrons, and vertical emissive plasma strips.
     - `CollarAssembly`: Heavy mechanical containment ring at `y = 0` (`r = 0.65m`) with 8 clamping claws and a high-emission inner plasma ring (`CollarGlow`) whose material switches between **Neon Cyan** (active) and **Neon Emerald** (passed).
3. **`plasma_orb.glb` (Quantum Data Core Collectible)**
   - **Root Hierarchy:**
     - `Core`: Faceted icosahedral golden-amber energy crystal (`r = 0.20m`) with high emissive intensity.
     - `InnerRing`: Tilted cyan gimbal ring (`r = 0.29m`) with tech notches.
     - `OuterRing`: Counter-rotating purple/cyan containment ring (`r = 0.36m`) with 4 stabilizer nodes.
4. **`cyber_city.glb` (Modular Cyberpunk Megastructure & Trench Segment)**
   - **Root Hierarchy:**
     - `Megastructure`: Procedural sci-fi skyscraper cluster with emissive neon window grids, rooftop antennas, and holo-billboard frames for deep-background parallax silhouettes (`x = ±14..28m`).
     - `TrenchPlate`: Detailed metallic cyber-trench floor/ceiling deck grating segment.

---

## 3. Three.js Next-Gen Rendering & VFX Overhaul (`WorldRenderer.ts`)

1. **PBR Image-Based Lighting (IBL):**
   - Use `THREE.PMREMGenerator` + `RoomEnvironment` to generate a realistic metallic reflection environment map (`scene.environment`) so Blender's metallic PBR materials (`metalness: 0.85`, `roughness: 0.2`) exhibit realistic specular highlights.
2. **HDR Post-Processing (`EffectComposer`):**
   - `RenderPass` → `UnrealBloomPass` (selective high-threshold bloom on emissive materials: visor, thruster, pipe collars, plasma orbs, city neon) → `OutputPass`.
   - Includes a runtime toggle (`KeyB` or HUD button `FX: ULTRA / FAST`) to adjust post-processing quality without dropping below 60 FPS.
3. **Zero-GC GLTF Instance Cloning & Rig Binding:**
   - Load `mecha_bird.glb`, `cyber_pipe.glb`, `plasma_orb.glb`, and `cyber_city.glb` asynchronously via `GLTFLoader`.
   - Maintain instant procedural fallback meshes during the initial `<150ms` load, then hot-swap the bird rig (`LeftWing`, `RightWing`, `ThrusterCore`), pipe instances (`CollarGlow`), orb gimbals (`Core`, `InnerRing`, `OuterRing`), and scrolling parallax city blocks.
4. **Dynamic Visual Effects:**
   - **Wing & Thruster Articulation:** Smooth flap kinematics, roll/bank micro-stabilization, and thruster core flare scaling on flap impulse.
   - **Dual-Color Particle & Shockwave System:** Expanding cyan/emerald plasma shockwave rings when flapping or collecting orbs, plus high-velocity speed streaks in `CHASE` and `FPV` camera modes.
   - **Parallax Cyberpunk Horizon:** Scrolling left/right megastructure towers and cyber-trench floor plates with moving neon light strips.

---

## 4. Tactical Cockpit HUD & Aesthetic Polish (`HUD.ts` & `style.css`)

1. **Diegetic Sci-Fi Cockpit Framing:**
   - Subtle CRT/holo scanlines, radial vignette, and corner HUD reticle brackets.
   - Chamfered cybernetic glass cards with animated neon border accents and real-time bloom/graphics quality toggle (`B` key / `FX: BLOOM` button).
2. **FPV Cockpit Overlay:**
   - When switching to `FPV CAM`, display a translucent fighter-jet HUD pitch ladder and target lock indicator.

---

## 5. Verification Criteria

- Headless `sandraschi/blender-mcp` generates valid `.glb` binaries (`mecha_bird.glb`, `cyber_pipe.glb`, `plasma_orb.glb`, `cyber_city.glb`) in `services/frontend/public/models/`.
- Frontend TypeScript (`tsc && vite build`) compiles cleanly with zero errors.
- Game runs at 60 FPS in browser with full PBR materials, bloom post-processing, animated Blender models, intact AI CBF safety shield, and verified visual screenshots.
