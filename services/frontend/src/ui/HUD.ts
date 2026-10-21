import { AIActionResponse } from '../ai/AIController';
import { TelemetryGraph } from './TelemetryGraph';

export class HUD {
  // Score elements
  private currentScoreEl: HTMLElement;
  private comboMultiplierEl: HTMLElement;
  private highScoreEl: HTMLElement;
  private manualHighScoreEl: HTMLElement;

  // Mode & Tactical Control elements
  private modeToggleBtn: HTMLElement;
  private modeTextEl: HTMLElement;
  private cameraModeBtn: HTMLElement;
  private cameraModeTextEl: HTMLElement;
  private simSpeedBtn: HTMLElement;
  private simSpeedTextEl: HTMLElement;
  private audioToggleBtn: HTMLElement;
  private audioToggleTextEl: HTMLElement;
  private fxToggleBtn: HTMLElement | null;
  private fxToggleTextEl: HTMLElement | null;
  private cockpitOverlayEl: HTMLElement | null;

  // AI Telemetry elements
  private sourceBadge: HTMLElement;
  private confidenceCircle: SVGCircleElement;
  private confidenceValEl: HTMLElement;
  private currentActionText: HTMLElement;
  private cbfShieldBadge: HTMLElement;
  private flapProbText: HTMLElement;
  private glideProbText: HTMLElement;
  private flapBar: HTMLElement;
  private glideBar: HTMLElement;
  private latencyValEl: HTMLElement;
  private deadReckoningValEl: HTMLElement;
  private worldSpeedValEl: HTMLElement;
  private hazardProbValEl: HTMLElement;
  private hazardBanner: HTMLElement;
  private eventToastEl: HTMLElement;
  private eventToastTextEl: HTMLElement;

  // Kinematic elements
  private fpsBadgeEl: HTMLElement;
  private connBadge: HTMLElement;
  private teleAltitudeEl: HTMLElement;
  private teleVelocityEl: HTMLElement;
  private teleDistanceEl: HTMLElement;
  private teleGapCenterEl: HTMLElement;

  // Modals
  private startOverlay: HTMLElement;
  private launchBtn: HTMLElement;
  private gameOverModal: HTMLElement;
  private restartBtn: HTMLElement;
  private modalFinalScoreEl: HTMLElement;
  private modalBestScoreEl: HTMLElement;
  private modalOrbsCountEl: HTMLElement;
  private modalAiDecisionsEl: HTMLElement;

  // Sparkline
  private telemetryGraph: TelemetryGraph;
  private aiDecisionCounter = 0;
  private toastTimeout: number | null = null;

  constructor() {
    this.currentScoreEl = document.getElementById('current-score')!;
    this.comboMultiplierEl = document.getElementById('combo-multiplier')!;
    this.highScoreEl = document.getElementById('high-score')!;
    this.manualHighScoreEl = document.getElementById('manual-high-score')!;

    this.modeToggleBtn = document.getElementById('toggle-mode-btn')!;
    this.modeTextEl = document.getElementById('mode-text')!;
    this.cameraModeBtn = document.getElementById('camera-mode-btn')!;
    this.cameraModeTextEl = document.getElementById('camera-mode-text')!;
    this.simSpeedBtn = document.getElementById('sim-speed-btn')!;
    this.simSpeedTextEl = document.getElementById('sim-speed-text')!;
    this.audioToggleBtn = document.getElementById('audio-toggle-btn')!;
    this.audioToggleTextEl = document.getElementById('audio-toggle-text')!;
    this.fxToggleBtn = document.getElementById('fx-toggle-btn');
    this.fxToggleTextEl = document.getElementById('fx-toggle-text');
    this.cockpitOverlayEl = document.getElementById('cockpit-hud-overlay');

    this.sourceBadge = document.getElementById('decision-source-badge')!;
    this.confidenceCircle = document.getElementById('confidence-circle') as unknown as SVGCircleElement;
    this.confidenceValEl = document.getElementById('confidence-val')!;
    this.currentActionText = document.getElementById('current-action-text')!;
    this.cbfShieldBadge = document.getElementById('cbf-shield-badge')!;
    this.flapProbText = document.getElementById('flap-prob-text')!;
    this.glideProbText = document.getElementById('glide-prob-text')!;
    this.flapBar = document.getElementById('flap-bar')!;
    this.glideBar = document.getElementById('glide-bar')!;
    this.latencyValEl = document.getElementById('inference-latency-val')!;
    this.deadReckoningValEl = document.getElementById('dead-reckoning-val')!;
    this.worldSpeedValEl = document.getElementById('world-speed-val')!;
    this.hazardProbValEl = document.getElementById('hazard-prob-val')!;
    this.hazardBanner = document.getElementById('hazard-banner')!;
    this.eventToastEl = document.getElementById('event-toast')!;
    this.eventToastTextEl = document.getElementById('event-toast-text')!;

    this.fpsBadgeEl = document.getElementById('fps-badge')!;
    this.connBadge = document.getElementById('connection-status-badge')!;
    this.teleAltitudeEl = document.getElementById('tele-altitude')!;
    this.teleVelocityEl = document.getElementById('tele-velocity')!;
    this.teleDistanceEl = document.getElementById('tele-distance')!;
    this.teleGapCenterEl = document.getElementById('tele-gap-center')!;

    this.startOverlay = document.getElementById('start-overlay')!;
    this.launchBtn = document.getElementById('launch-btn')!;
    this.gameOverModal = document.getElementById('game-over-modal')!;
    this.restartBtn = document.getElementById('restart-btn')!;
    this.modalFinalScoreEl = document.getElementById('modal-final-score')!;
    this.modalBestScoreEl = document.getElementById('modal-best-score')!;
    this.modalOrbsCountEl = document.getElementById('modal-orbs-count')!;
    this.modalAiDecisionsEl = document.getElementById('modal-ai-decisions')!;

    this.telemetryGraph = new TelemetryGraph('telemetry-graph-canvas');
  }

  public setScores(current: number, aiHigh: number, manualHigh: number, combo: number = 1): void {
    this.currentScoreEl.innerText = current.toString();
    this.highScoreEl.innerText = aiHigh.toString();
    this.manualHighScoreEl.innerText = manualHigh.toString();
    this.comboMultiplierEl.innerText = `x${combo}`;
  }

  public setMode(isAI: boolean): void {
    if (isAI) {
      this.modeToggleBtn.classList.remove('manual-active');
      this.modeToggleBtn.classList.add('ai-active');
      this.modeTextEl.innerText = 'AI AUTONOMOUS';
    } else {
      this.modeToggleBtn.classList.remove('ai-active');
      this.modeToggleBtn.classList.add('manual-active');
      this.modeTextEl.innerText = 'MANUAL PILOT';
    }
  }

  public setCameraLabel(label: string): void {
    this.cameraModeTextEl.innerText = label;
    if (this.cockpitOverlayEl) {
      if (label === 'FPV CAM' || label === 'CHASE CAM') {
        this.cockpitOverlayEl.classList.remove('hidden');
      } else {
        this.cockpitOverlayEl.classList.add('hidden');
      }
    }
  }

  public setFxStatus(enabled: boolean): void {
    if (this.fxToggleTextEl) {
      this.fxToggleTextEl.innerText = enabled ? 'FX: BLOOM' : 'FX: RAW';
    }
    if (this.fxToggleBtn) {
      this.fxToggleBtn.classList.toggle('fx-active', enabled);
    }
  }

  public setSimSpeedLabel(speed: number): void {
    this.simSpeedTextEl.innerText = `${speed.toFixed(1)}x`;
  }

  public setAudioMuted(muted: boolean): void {
    this.audioToggleTextEl.innerText = muted ? 'MUTED' : 'SFX ON';
  }

  public setConnectionStatus(online: boolean, rttMs?: number): void {
    if (online) {
      this.connBadge.className = 'conn-badge online';
      this.connBadge.innerText = rttMs ? `WS ${Math.round(rttMs)}ms` : 'ONLINE (WS)';
    } else {
      this.connBadge.className = 'conn-badge offline';
      this.connBadge.innerText = 'EDGE AUTOPILOT';
    }
  }

  public updateFps(fps: number): void {
    this.fpsBadgeEl.innerText = `${Math.round(fps)} FPS`;
  }

  public showToast(message: string): void {
    this.eventToastTextEl.innerText = message;
    this.eventToastEl.classList.remove('hidden');
    if (this.toastTimeout !== null) {
      clearTimeout(this.toastTimeout);
    }
    this.toastTimeout = window.setTimeout(() => {
      this.eventToastEl.classList.add('hidden');
    }, 1450);
  }

  public updateAIDecision(decision: AIActionResponse): void {
    this.aiDecisionCounter++;

    // 1. Source Badge
    if (decision.source === 'laya_model') {
      this.sourceBadge.className = 'source-badge laya';
      this.sourceBadge.innerText = 'LAYA SYSTEM 1';
    } else if (decision.source === 'edge_cbf') {
      this.sourceBadge.className = 'source-badge fallback';
      this.sourceBadge.innerText = 'EDGE CBF PILOT';
    } else {
      this.sourceBadge.className = 'source-badge fallback';
      this.sourceBadge.innerText = 'CBF WATCHDOG';
    }

    // 2. CBF Safety Shield status
    if (decision.safetyOverride) {
      this.cbfShieldBadge.className = 'cbf-badge override';
      this.cbfShieldBadge.innerText = 'CBF OVERRIDE';
    } else {
      this.cbfShieldBadge.className = 'cbf-badge';
      this.cbfShieldBadge.innerText = 'CBF ARMED';
    }

    // 3. Confidence Circle (Circumference = 2 * PI * 42 ≈ 263.89)
    const confPct = Math.round(decision.confidence * 100);
    this.confidenceValEl.innerText = `${confPct}%`;
    const circumference = 263.89;
    const offset = circumference * (1 - Math.max(0, Math.min(1, decision.confidence)));
    this.confidenceCircle.style.strokeDashoffset = offset.toString();

    // 4. Action Text & Probabilities
    const isFlap = decision.action === 'flap';
    this.currentActionText.innerText = isFlap ? 'FLAP' : 'GLIDE';
    this.currentActionText.className = isFlap
      ? 'status-action flap-glow'
      : 'status-action glide-glow';

    const flapPct = Math.round((decision.probabilities?.flap ?? 0.5) * 100);
    const glidePct = 100 - flapPct;
    this.flapProbText.innerText = `${flapPct}%`;
    this.glideProbText.innerText = `${glidePct}%`;
    this.flapBar.style.width = `${flapPct}%`;
    this.glideBar.style.width = `${glidePct}%`;

    // 5. Latency, Dead-Reckoning & Hazard
    this.latencyValEl.innerText = `${decision.inferenceDurationMs.toFixed(1)} ms`;
    if (decision.projectedState?.deltaTSeconds !== undefined) {
      const dtMs = Math.round(decision.projectedState.deltaTSeconds * 1000);
      this.deadReckoningValEl.innerText = `Δt +${dtMs}ms`;
    }
    this.hazardProbValEl.innerText = (decision.hazardProbability ?? 0.0).toFixed(2);

    if (decision.criticalHazard) {
      this.hazardBanner.classList.remove('hidden');
    } else {
      this.hazardBanner.classList.add('hidden');
    }
  }

  public updateKinematics(
    alt: number,
    vel: number,
    dist: number,
    gapCenter: number,
    worldSpeed: number
  ): void {
    this.teleAltitudeEl.innerText = `${alt.toFixed(2)} m`;
    this.teleVelocityEl.innerText = `${vel.toFixed(2)} m/s`;
    this.teleDistanceEl.innerText = `${Math.max(0, dist).toFixed(2)} m`;
    this.teleGapCenterEl.innerText = `${gapCenter.toFixed(2)} m`;
    this.worldSpeedValEl.innerText = `${worldSpeed.toFixed(1)} m/s`;

    this.telemetryGraph.pushSample(alt, gapCenter);
  }

  public showStartOverlay(show: boolean): void {
    if (show) {
      this.startOverlay.classList.remove('hidden');
    } else {
      this.startOverlay.classList.add('hidden');
    }
  }

  public showGameOver(
    finalScore: number,
    bestScore: number,
    orbsCollected: number,
    show: boolean
  ): void {
    if (show) {
      this.modalFinalScoreEl.innerText = finalScore.toString();
      this.modalBestScoreEl.innerText = bestScore.toString();
      this.modalOrbsCountEl.innerText = orbsCollected.toString();
      this.modalAiDecisionsEl.innerText = this.aiDecisionCounter.toString();
      this.gameOverModal.classList.remove('hidden');
      this.hazardBanner.classList.add('hidden');
    } else {
      this.gameOverModal.classList.add('hidden');
    }
  }

  public bindEvents(handlers: {
    onStart: () => void;
    onRestart: () => void;
    onToggleMode: () => void;
    onCycleCamera: () => void;
    onCycleSpeed: () => void;
    onToggleAudio: () => void;
    onToggleFx?: () => void;
  }): void {
    this.launchBtn.addEventListener('click', handlers.onStart);
    this.restartBtn.addEventListener('click', handlers.onRestart);
    this.modeToggleBtn.addEventListener('click', handlers.onToggleMode);
    this.cameraModeBtn.addEventListener('click', handlers.onCycleCamera);
    this.simSpeedBtn.addEventListener('click', handlers.onCycleSpeed);
    this.audioToggleBtn.addEventListener('click', handlers.onToggleAudio);
    if (this.fxToggleBtn && handlers.onToggleFx) {
      this.fxToggleBtn.addEventListener('click', handlers.onToggleFx);
    }
  }

  public resetTelemetry(): void {
    this.aiDecisionCounter = 0;
    this.telemetryGraph.reset();
    this.hazardBanner.classList.add('hidden');
  }
}
