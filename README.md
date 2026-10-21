# 3D Flappy Bird with System 1 AI Autonomous Player (Laya + Three.js + NestJS)

An ultra-responsive, containerized 3D Flappy Bird experience driven by a non-autoregressive **System 1 Decision Engine** powered by **Laya** (`NandhaKishorM/laya`) paired with a **Control Barrier Function (CBF) Kinematic Safety Envelope**.

![Flappy Laya 3D Architecture](docs/architecture.png)

---

## ⚡ Highlights

* **Sub-40ms System 1 AI + CBF Safety Shield:** Combines single-pass ModernBERT semantic routing (`Laya`) with a deterministic Control Barrier Function (CBF) envelope that mathematically prevents upper-pipe ceiling breaches and floor crashes.
* **Adaptive RTT Dead-Reckoning Compensation:** Projects bird kinematics (`g = -14.0 m/s²`, `v_flap = 5.4 m/s`) forward by measured WebSocket RTT + EMA inference latency (`Δt`), with multi-pipe lookahead target blending.
* **Three.js Zero-GC 3D Pipeline:** Shared geometry/material pooling, dynamic oscillating sci-fi conduits, collectible plasma data cores, holographic AI lock-on reticle, emerald gate-pass shaders, and 3 camera perspectives (`ISO CAM`, `CHASE CAM`, `FPV CAM`).
* **Procedural Web Audio Synthesizer:** Zero-dependency Web Audio API synth engine generating thruster sweeps, harmonic combo chimes, plasma orb triads, near-miss arcs, and sub-bass impact drops.
* **Zero-Downtime Edge CBF Autopilot:** Seamlessly falls back to a client-side 60 FPS kinematic CBF controller if the WebSocket gateway or Python service is offline.
* **Cyberpunk Glassmorphic HUD:** Real-time confidence gauge, probability split bars, live WS RTT & FPS counters, safe-corridor envelope sparkline, and separate `AI BEST` vs `PILOT BEST` leaderboards.

---

## 🏗️ Architecture

```
+-----------------------------------------------------------------------------------+
|                                 USER BROWSER                                      |
|                                                                                   |
|  +--------------------+    Input / Audio    +----------------------------------+  |
|  | Three.js Renderer  | <-----------------> | Glassmorphism HUD & Synth Audio  |  |
|  | - Iso/Chase/FPV Cam|                     | - Confidence & CBF Shield Status |  |
|  | - 60FPS Physics    |                     | - Safe-Corridor Envelope Graph   |  |
|  +---------+----------+                     +-----------------+----------------+  |
|            |                                                  ^                   |
|            v (Client CBF Shield & Edge Fallback)              |                   |
+------------|--------------------------------------------------|-------------------+
             | (WebSocket: State Tick + RTT @ 18Hz)             |
             v                                                  |
+-----------------------------------------------------------------------------------+
|                        NESTJS APPLICATION GATEWAY (Node.js)                       |
|                                                                                   |
|  +-----------------------------------------------------------------------------+  |
|  | Game Gateway (Socket.io + Live RTT Ping/Pong)                               |  |
|  +-------------------------------------+---------------------------------------+  |
|                                        |                                          |
|                                        v                                          |
|  +-----------------------------------------------------------------------------+  |
|  | Adaptive Dead-Reckoning & Multi-Pipe Lookahead Compensator                  |  |
|  | (Projects bird state forward by 0.5 * RTT + EMA_Inference_Ms)               |  |
|  +-------------------------------------+---------------------------------------+  |
|                                        |                                          |
|                                        v                                          |
|  +-----------------------------------------------------------------------------+  |
|  | Laya Client Adapter (HTTP Keep-Alive Pool) & CBF Safety Watchdog            |  |
|  +-------------------------------------+---------------------------------------+  |
+----------------------------------------|------------------------------------------+
                                         | HTTP Keep-Alive (Port 8000)
                                         v
+-----------------------------------------------------------------------------------+
|                        LAYA DECISION SERVICE (Python 3.11)                        |
|                                                                                   |
|  +-----------------------------------------------------------------------------+  |
|  | FastAPI (/v1/systemone/predict)                                             |  |
|  +-------------------------------------+---------------------------------------+  |
|                                        |                                          |
|                                        v                                          |
|  +-----------------------------------------------------------------------------+  |
|  | Laya Router Checkpoint (ModernBERT 421M / mmBERT 322M) + CBF Verification   |  |
|  | Single forward pass returning: choice + confidence + hazard + cbf_override  |  |
|  +-----------------------------------------------------------------------------+  |
+-----------------------------------------------------------------------------------+
```

---

## 🚀 Quickstart with Docker Compose

To build and start all 3 services in one command:

```bash
docker compose up --build
```

Then open your browser:
* **Frontend Web Application:** [http://localhost:5173](http://localhost:5173)
* **Backend Gateway & Health:** [http://localhost:3000/health](http://localhost:3000/health)
* **Laya Decision API Docs:** [http://localhost:8000/docs](http://localhost:8000/docs)

---

## 💻 Local Development Setup

### 1. AI Decision Service (Python 3.11)
```bash
cd services/ai-engine
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python app.py
```

### 2. Backend Gateway (NestJS)
```bash
cd services/backend
npm install
npm run start:dev
```

### 3. Frontend Web App (Three.js + Vite)
```bash
cd services/frontend
npm install
npm run dev
```

---

## 🎮 Controls

* **`SPACE` / `CLICK` / `TAP`:** Flap thrusters (Manual mode) / Start / Restart
* **`M`:** Switch between AI Autonomous Mode and Manual Pilot Mode
* **`C`:** Cycle 3D Camera Perspective (`ISO CAM` / `CHASE CAM` / `FPV CAM`)
* **`V`:** Cycle Simulation Time-Scale (`1.0x` / `1.5x` / `2.0x`)
* **`T`:** Toggle 3D Predictive Trajectory Projection & Target Reticle
* **`S`:** Mute / Unmute Procedural Web Audio Synthesizer
* **`R`:** Instant Mission Restart
