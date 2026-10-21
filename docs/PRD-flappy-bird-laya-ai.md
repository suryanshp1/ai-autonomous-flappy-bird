# Product Requirement Document (PRD)
## 3D Flappy Bird with System 1 AI Player (Laya + Three.js + NestJS + Docker)

- **Document Version:** 1.0.0
- **Status:** Approved for Architecture Review
- **Author:** CTO & Chief System Architect
- **Target Release:** v1.0.0-alpha

---

## 1. Executive Summary & Vision

### 1.1 Objective
Design, build, and deploy a high-performance, containerized 3D Flappy Bird game where a real-time AI agent autonomously plays the game using **Laya** (`NandhaKishorM/laya`)—a sub-40ms, non-autoregressive "System 1" decision engine.

### 1.2 Core Innovation
Traditional game AI relies on reinforcement learning (RL) policies (PPO, DQN) or deterministic heuristics (PID controllers). In this project, we pioneer **Semantic System 1 Game Control**: converting physical spatial-temporal state vectors into structured state representations evaluated by a 421M parameter ModernBERT decision model in a single forward pass, streaming low-latency commands over WebSockets to a Three.js 3D rendering engine.

---

## 2. Product Requirements & Feature Specs

### 2.1 Functional Requirements (FR)

| ID | Feature | Description | Priority |
|---|---|---|---|
| **FR-01** | **3D Three.js Game World** | 3D rendering pipeline with stylized lighting, procedural obstacles, parallax background, and animated 3D bird model. | P0 |
| **FR-02** | **Deterministic Physics** | 60 FPS physics loop supporting gravity, flap impulse, terminal velocity, and AABB/bounding-sphere collision detection. | P0 |
| **FR-03** | **Dual Control Modes** | Seamless toggle between **Manual Mode** (User input: Space/Touch/Click) and **AI Autonomous Mode** (Laya-driven). | P0 |
| **FR-04** | **Laya System 1 Inference** | Game state serialization into typed decision questions (`choice`: "flap" vs "glide", `noul`: "emergency_flap"). | P0 |
| **FR-05** | **WebSocket Bridge** | NestJS bidirectional WebSocket gateway streaming state snapshots and returning actionable control commands. | P0 |
| **FR-06** | **AI Telemetry HUD** | Glassmorphic real-time overlay showing Laya confidence score, decision latency, probability distribution, and state telemetry. | P1 |
| **FR-07** | **Dead-Reckoning Compensator** | Predictive trajectory projection to nullify network + model inference latency (~35ms). | P1 |
| **FR-08** | **Session & Score Telemetry** | High-score tracking, session replay logging, and AI vs Human benchmarking stats. | P2 |

### 2.2 Non-Functional Requirements (NFR)

* **Rendering Latency & Framerate:** Solid 60 FPS (target frame time < 16.6ms) on modern desktop and mobile browsers.
* **AI Decision Latency:** End-to-end loop latency (State capture -> NestJS -> Laya -> Action execution) < 70ms on CPU, < 45ms on GPU/MPS.
* **Fault Tolerance:** If Laya fails or timeouts (> 100ms), fallback gracefully to an emergency safety heuristic to prevent immediate collision.
* **Portability:** 100% turnkey deployment via `docker compose up --build`.

---

## 3. System Architecture & Topology

### 3.1 Component Diagram

```
+-----------------------------------------------------------------------------------+
|                                 USER BROWSER                                      |
|                                                                                   |
|  +--------------------+    Input Toggle     +----------------------------------+  |
|  | Three.js Renderer  | <-----------------> | Glassmorphism HUD & Telemetry    |  |
|  | - 3D Scene / Pipes |                     | - Real-time Confidence Gauges    |  |
|  | - 60FPS Physics    |                     | - Latency & Decision Timeline    |  |
|  +---------+----------+                     +-----------------+----------------+  |
|            |                                                  |                   |
+------------|--------------------------------------------------|-------------------+
             | (WebSocket: State Tick @ 10-15Hz)                |
             v                                                  v
+-----------------------------------------------------------------------------------+
|                        NESTJS APPLICATION GATEWAY (Node.js)                       |
|                                                                                   |
|  +-----------------------------------------------------------------------------+  |
|  | Game Gateway (Socket.io / ws)                                               |  |
|  +-------------------------------------+---------------------------------------+  |
|                                        |                                          |
|                                        v                                          |
|  +-----------------------------------------------------------------------------+  |
|  | Trajectory Predictor & Dead-Reckoning Engine                                |  |
|  | (Projects bird state forward by inference window Delta_t)                   |  |
|  +-------------------------------------+---------------------------------------+  |
|                                        |                                          |
|                                        v                                          |
|  +-----------------------------------------------------------------------------+  |
|  | Laya Client Adapter & Prompt Formatter                                      |  |
|  | - Serializes state vector to semantic context                               |  |
|  | - Dispatches typed question payload ('choice' / 'noul')                     |  |
|  +-------------------------------------+---------------------------------------+  |
+----------------------------------------|------------------------------------------+
                                         | HTTP / Keep-Alive (Port 8000)
                                         v
+-----------------------------------------------------------------------------------+
|                        LAYA DECISION SERVICE (Python 3.11)                        |
|                                                                                   |
|  +-----------------------------------------------------------------------------+  |
|  | FastAPI / laya-serve (/v1/systemone/predict)                                |  |
|  +-------------------------------------+---------------------------------------+  |
|                                        |                                          |
|                                        v                                          |
|  +-----------------------------------------------------------------------------+  |
|  | Laya Router & Preloaded Model Checkpoint                                    |  |
|  | (ModernBERT-large 421M / mmBERT-base 322M)                                   |  |
|  | - Forward pass single evaluation: ~33ms                                     |  |
|  | - Returns: Choice ('flap' | 'glide') + Confidence (0.00 - 1.00)              |  |
|  +-----------------------------------------------------------------------------+  |
+-----------------------------------------------------------------------------------+
```

---

## 4. Data Models & API Contracts

### 4.1 Game State Packet (Client -> NestJS)
```typescript
export interface BirdState {
  position: { x: number; y: number; z: number };
  velocity: { x: number; y: number; z: number };
  rotation: number;
  alive: boolean;
  score: number;
}

export interface PipeObstacle {
  id: string;
  distanceX: number;     // Distance from bird to pipe leading edge
  gapCenterY: number;    // Center of safe opening
  gapHeight: number;     // Vertical height of gap (e.g. 3.2 units)
  pipeWidth: number;
}

export interface GameTelemetryPayload {
  timestamp: number;
  tick: number;
  bird: BirdState;
  nextPipe: PipeObstacle;
  followingPipe?: PipeObstacle;
}
```

### 4.2 Laya Semantic State & Question Schema (NestJS -> Laya)
```json
{
  "state": {
    "altitude": 4.15,
    "vertical_velocity": -1.82,
    "distance_to_gap": 6.4,
    "gap_center_altitude": 5.2,
    "relative_altitude_to_gap": -1.05,
    "urgency": "high_descent"
  },
  "questions": {
    "action": {
      "type": "choice",
      "instructions": "Determine the optimal pilot control action for the bird to safely clear the obstacle gap without colliding with the upper or lower boundary.",
      "criteria": {
        "flap": "Bird is below the gap safety line or sinking rapidly with downward velocity. Immediate lift required.",
        "glide": "Bird has sufficient upward momentum or is floating comfortably within the upper half of the safe corridor."
      }
    },
    "critical_hazard": {
      "type": "noul",
      "instructions": "Is the bird in imminent danger of crashing into the bottom barrier within the next 200 milliseconds?"
    }
  }
}
```

### 4.3 Action Decision Packet (NestJS -> Client)
```typescript
export interface AIActionResponse {
  timestamp: number;
  tick: number;
  action: 'flap' | 'glide';
  confidence: number;
  probabilities: { flap: number; glide: number };
  criticalHazard: boolean;
  hazardProbability: number;
  inferenceDurationMs: number;
  source: 'laya_model' | 'fallback_heuristic';
}
```

---

## 5. Technology Stack & Directory Layout

### 5.1 Tech Stack Matrix
* **Frontend:** TypeScript 5.x, Three.js (r160+), Vite, Tailwind/Vanilla CSS (Glassmorphism), Socket.io-client.
* **Backend:** NestJS 10, `@nestjs/websockets`, `@nestjs/platform-socket.io`, RxJS, Axios/Fetch.
* **AI Engine:** Python 3.11, `laya==0.4.12`, PyTorch (CPU or MPS/CUDA), FastAPI / Uvicorn.
* **Orchestration:** Docker Compose v2 with multi-stage builds.

### 5.2 Repository Structure
```
jev-flappy-bird/
├── docker-compose.yml
├── .env.example
├── docs/
│   └── PRD-flappy-bird-laya-ai.md
├── services/
│   ├── ai-engine/
│   │   ├── Dockerfile
│   │   ├── requirements.txt
│   │   ├── app.py
│   │   └── preload_models.py
│   ├── backend/
│   │   ├── Dockerfile
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── main.ts
│   │       ├── app.module.ts
│   │       ├── game/
│   │       │   ├── game.gateway.ts
│   │       │   ├── game.service.ts
│   │       │   └── dtos/
│   │       └── laya/
│   │           ├── laya.client.ts
│   │           └── dead-reckoning.service.ts
│   └── frontend/
│       ├── Dockerfile
│       ├── package.json
│       ├── vite.config.ts
│       ├── index.html
│       └── src/
│           ├── main.ts
│           ├── engine/
│           │   ├── GameEngine.ts
│           │   ├── Physics.ts
│           │   ├── WorldRenderer.ts
│           │   └── PipeManager.ts
│           ├── ai/
│           │   └── AIController.ts
│           └── ui/
│               ├── HUD.ts
│               └── TelemetryGraph.ts
```

---

## 6. Milestones & Delivery Roadmap

* **Phase 1: Foundation & Contracts (Days 1-2):** Repository setup, Docker Compose scaffolding, NestJS WebSocket gateway, Laya container with baseline test.
* **Phase 2: 3D Game World & Physics (Days 3-4):** Three.js pipeline, animated voxel/stylized bird, infinite procedural pipes, collision detection, manual playability.
* **Phase 3: AI Bridge & System 1 Integration (Days 5-6):** State serialization, Laya prompt tuning, dead-reckoning latency compensation, autonomous flight loop.
* **Phase 4: Telemetry UI & Polish (Day 7):** Glassmorphism dashboard, real-time probability charts, fallback watchdog, smoke testing.
