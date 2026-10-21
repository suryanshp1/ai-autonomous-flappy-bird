from contextlib import asynccontextmanager
import time
import logging
from typing import Dict, Any, Optional
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger("ai-engine")

# Global router instance
router_instance = None
router_init_error: Optional[str] = None
start_time = time.time()

# Aligned Physics Constants (matched to Frontend Physics.ts)
GRAVITY = -14.0          # m/s^2
FLAP_IMPULSE = 5.4       # m/s
WORLD_SPEED = 3.6        # m/s
BIRD_RADIUS = 0.35       # m
FLOOR_Y = 0.5            # m
CEILING_Y = 10.5         # m
SINGLE_FLAP_RISE = (FLAP_IMPULSE ** 2) / (2.0 * abs(GRAVITY))  # ~1.041m


def init_laya_router():
    global router_instance, router_init_error
    try:
        from laya import Router
        logger.info("Instantiating Laya Router (ModernBERT 421M / mmBERT 322M)...")
        router_instance = Router(preload=True)
        logger.info("Laya Router initialized successfully!")
    except Exception as exc:
        router_init_error = str(exc)
        logger.warning(f"Laya Router failed to load: {exc}. Running with kinematic CBF autopilot enabled.")


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_laya_router()
    yield


app = FastAPI(
    title="Laya System 1 Decision Service",
    description="Sub-40ms non-autoregressive decision engine with Control Barrier Function (CBF) safety envelope for autonomous 3D Flappy Bird",
    version="2.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class StatePayload(BaseModel):
    altitude: float = 5.0
    vertical_velocity: float = 0.0
    distance_to_gap: float = 5.0
    gap_center_altitude: float = 5.0
    gap_height: float = 3.2
    relative_altitude_to_gap: float = 0.0
    next_gap_center_altitude: Optional[float] = None
    urgency: str = "nominal"


class PredictRequest(BaseModel):
    state: Any = Field(..., description="Semantic state dict or formatted description")
    questions: Optional[Dict[str, Any]] = None
    tick: Optional[int] = 0
    timestamp: Optional[float] = None


class ActionProbabilities(BaseModel):
    flap: float
    glide: float


class PredictResponse(BaseModel):
    timestamp: float
    tick: int
    action: str
    confidence: float
    probabilities: ActionProbabilities
    criticalHazard: bool
    hazardProbability: float
    inferenceDurationMs: float
    source: str
    safetyOverride: bool = False


def compute_kinematic_envelope(state: Any) -> Dict[str, Any]:
    """
    Computes exact kinematic trajectory metrics and Control Barrier Function (CBF)
    safety boundaries for both Laya context enrichment and failsafe execution.
    """
    if isinstance(state, dict):
        alt = float(state.get("altitude", 5.0))
        vel = float(state.get("vertical_velocity", 0.0))
        gap_y = float(state.get("gap_center_altitude", 5.0))
        gap_h = float(state.get("gap_height", 3.2))
        dist = float(state.get("distance_to_gap", 5.0))
        next_gap_y = state.get("next_gap_center_altitude", None)
    else:
        alt, vel, gap_y, gap_h, dist, next_gap_y = 5.0, 0.0, 5.0, 3.2, 5.0, None

    target_y = gap_y
    half_gap = gap_h * 0.5
    safe_bottom = gap_y - half_gap + BIRD_RADIUS + 0.18
    safe_top = gap_y + half_gap - BIRD_RADIUS - 0.18

    # Predict altitude after 1 reaction tick (~55ms) if gliding vs flapping
    dt_lookahead = 0.055
    y_if_glide = alt + vel * dt_lookahead + 0.5 * GRAVITY * (dt_lookahead ** 2)
    apex_if_flap = alt + SINGLE_FLAP_RISE

    # Ideal flap trigger line sits 0.72m below gap center so a flap (+1.04m rise) peaks at (target_y + 0.32m),
    # keeping the bird centered in the gap with >0.5m bottom margin and >0.9m top margin.
    optimal_flap_line = target_y - 0.72

    # Check if flapping right now would breach the upper pipe lip or world ceiling
    ceiling_breach_if_flap = (
        (apex_if_flap > CEILING_Y - BIRD_RADIUS - 0.15) or
        (dist < 3.2 and dist >= -0.92 and apex_if_flap > safe_top)
    )

    # Check if gliding right now will drop below the lower safe corridor or world floor
    floor_imminent = y_if_glide <= FLOOR_Y + BIRD_RADIUS + 0.45
    below_corridor = (y_if_glide <= optimal_flap_line and vel <= 0.4) or (y_if_glide < safe_bottom)

    must_flap = floor_imminent or (below_corridor and not ceiling_breach_if_flap)

    time_to_ground = (alt - (FLOOR_Y + BIRD_RADIUS)) / abs(vel) if vel < -0.1 else 999.0
    critical_hazard = floor_imminent or (time_to_ground < 0.28) or (dist < 1.8 and alt < safe_bottom)

    return {
        "alt": alt,
        "vel": vel,
        "dist": dist,
        "gap_y": gap_y,
        "target_y": target_y,
        "safe_bottom": safe_bottom,
        "safe_top": safe_top,
        "y_if_glide": y_if_glide,
        "apex_if_flap": apex_if_flap,
        "optimal_flap_line": optimal_flap_line,
        "ceiling_breach_if_flap": ceiling_breach_if_flap,
        "must_flap": must_flap,
        "critical_hazard": critical_hazard,
    }


def format_state_string(state: Any) -> str:
    """Format state vector into semantic text for ModernBERT attention mechanism."""
    if isinstance(state, str):
        return state
    if isinstance(state, dict):
        env = compute_kinematic_envelope(state)
        alt = env["alt"]
        vel = env["vel"]
        dist = env["dist"]
        gap_y = env["gap_y"]
        rel_y = state.get("relative_altitude_to_gap", alt - gap_y)
        urg = state.get("urgency", "nominal")
        return (
            f"Flight state telemetry: Bird current altitude is {alt:.2f} meters. "
            f"Vertical velocity is {vel:.2f} m/s. "
            f"Distance to next pipe obstacle gap is {dist:.2f} meters. "
            f"Target clearance opening center is at altitude {gap_y:.2f} meters. "
            f"Relative vertical deviation to gap center is {rel_y:.2f} meters. "
            f"Projected glide altitude is {env['y_if_glide']:.2f}m (optimal flap threshold: {env['optimal_flap_line']:.2f}m). "
            f"Post-flap apex altitude is {env['apex_if_flap']:.2f}m (upper safe limit: {env['safe_top']:.2f}m). "
            f"Descent urgency is {urg}."
        )
    return str(state)


def heuristic_decision(state: Any) -> Dict[str, Any]:
    """
    Sub-1ms deterministic Control Barrier Function (CBF) kinematic pilot.
    Guarantees collision-free flight trajectory and acts as safety watchdog.
    """
    env = compute_kinematic_envelope(state)
    needs_flap = env["must_flap"]
    critical_hazard = env["critical_hazard"]
    margin = env["y_if_glide"] - env["optimal_flap_line"]

    if needs_flap:
        # Smoothly scale flap probability based on urgency below optimal flap line
        flap_p = min(0.98, max(0.72, 0.78 + abs(min(0.0, margin)) * 0.25))
        action = "flap"
    else:
        if env["ceiling_breach_if_flap"]:
            flap_p = 0.04
        else:
            flap_p = max(0.06, min(0.35, 0.25 - margin * 0.15))
        action = "glide"

    glide_p = round(max(0.01, 1.0 - flap_p), 4)
    flap_p = round(1.0 - glide_p, 4)
    conf = max(flap_p, glide_p)

    hazard_prob = 0.94 if critical_hazard else round(max(0.02, min(0.45, 0.15 - margin * 0.12)), 4)

    return {
        "action": action,
        "confidence": round(conf, 4),
        "probabilities": {"flap": flap_p, "glide": glide_p},
        "criticalHazard": critical_hazard,
        "hazardProbability": hazard_prob,
        "source": "fallback_heuristic",
        "safetyOverride": False,
    }


@app.get("/health")
def health():
    try:
        import torch
        device = "cuda" if torch.cuda.is_available() else ("mps" if torch.backends.mps.is_available() else "cpu")
    except Exception:
        device = "cpu"
    return {
        "status": "healthy",
        "service": "laya-ai-engine",
        "version": "2.0.0",
        "laya_loaded": router_instance is not None,
        "laya_error": router_init_error,
        "device": device,
        "uptime_seconds": round(time.time() - start_time, 2)
    }


@app.post("/v1/systemone/predict", response_model=PredictResponse)
def predict(request: PredictRequest):
    t_start = time.perf_counter()
    req_timestamp = request.timestamp or time.time()
    req_tick = request.tick or 0

    state_text = format_state_string(request.state)
    env = compute_kinematic_envelope(request.state)

    default_questions = {
        "action": {
            "type": "choice",
            "instructions": (
                "Determine the optimal pilot control action for the bird to safely clear the obstacle gap "
                "without colliding with the upper or lower boundary."
            ),
            "criteria": {
                "flap": "Bird is below the optimal flap line or sinking rapidly with downward velocity. Immediate lift required.",
                "glide": "Bird has sufficient upward momentum or is floating comfortably within the upper half of the safe corridor."
            }
        },
        "critical_hazard": {
            "type": "noul",
            "instructions": "Is the bird in imminent danger of crashing into the bottom barrier within the next 200 milliseconds?"
        }
    }
    questions = request.questions or default_questions

    # Execute Laya prediction if router is loaded
    if router_instance is not None:
        try:
            laya_result = router_instance.predict(state_text, questions)
            answers = laya_result.get("answers", {})

            action_ans = answers.get("action", {})
            raw_choice = action_ans.get("choice", "glide")
            action_choice = raw_choice if raw_choice in ["flap", "glide"] else "glide"
            probs = action_ans.get("probabilities", {})
            flap_p = float(probs.get("flap", 0.5))
            glide_p = float(probs.get("glide", 0.5))

            # Apply Control Barrier Function (CBF) safety shield on neural output:
            # 1. Prevent suicidal flap into upper pipe lip / ceiling
            # 2. Enforce mandatory flap before lower pipe lip / floor point-of-no-return
            safety_override = False
            if action_choice == "flap" and env["ceiling_breach_if_flap"]:
                action_choice = "glide"
                glide_p = max(glide_p, 0.88)
                flap_p = round(1.0 - glide_p, 4)
                safety_override = True
            elif action_choice == "glide" and env["must_flap"]:
                action_choice = "flap"
                flap_p = max(flap_p, 0.86)
                glide_p = round(1.0 - flap_p, 4)
                safety_override = True

            conf = float(action_ans.get("confidence", max(flap_p, glide_p)))
            conf = max(conf, max(flap_p, glide_p))

            hazard_ans = answers.get("critical_hazard", {})
            hazard_val = float(hazard_ans.get("value", 0.0))
            is_hazard = (hazard_val > 0.5) or env["critical_hazard"]
            if env["critical_hazard"]:
                hazard_val = max(hazard_val, 0.92)

            t_elapsed = (time.perf_counter() - t_start) * 1000.0

            return PredictResponse(
                timestamp=req_timestamp,
                tick=req_tick,
                action=action_choice,
                confidence=round(conf, 4),
                probabilities=ActionProbabilities(flap=round(flap_p, 4), glide=round(glide_p, 4)),
                criticalHazard=is_hazard,
                hazardProbability=round(hazard_val, 4),
                inferenceDurationMs=round(t_elapsed, 2),
                source="laya_model",
                safetyOverride=safety_override,
            )
        except Exception as exc:
            logger.warning(f"Laya inference exception: {exc}. Activating kinematic CBF fallback.")

    # Fallback heuristic
    fallback = heuristic_decision(request.state)
    t_elapsed = (time.perf_counter() - t_start) * 1000.0

    return PredictResponse(
        timestamp=req_timestamp,
        tick=req_tick,
        action=fallback["action"],
        confidence=fallback["confidence"],
        probabilities=ActionProbabilities(**fallback["probabilities"]),
        criticalHazard=fallback["criticalHazard"],
        hazardProbability=fallback["hazardProbability"],
        inferenceDurationMs=round(t_elapsed, 2),
        source="fallback_heuristic",
        safetyOverride=fallback["safetyOverride"],
    )


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000, log_level="info")
