import { io, Socket } from 'socket.io-client';

export interface AIActionResponse {
  timestamp: number;
  tick: number;
  action: 'flap' | 'glide';
  confidence: number;
  probabilities: { flap: number; glide: number };
  criticalHazard: boolean;
  hazardProbability: number;
  inferenceDurationMs: number;
  source: 'laya_model' | 'fallback_heuristic' | 'edge_cbf';
  safetyOverride?: boolean;
  projectedState?: {
    projectedAltitude: number;
    projectedVelocityY: number;
    deltaTSeconds: number;
  };
}

export interface TelemetryTickPayload {
  timestamp: number;
  tick: number;
  rttMs?: number;
  bird: {
    position: { x: number; y: number; z: number };
    velocity: { x: number; y: number; z: number };
    rotation: number;
    alive: boolean;
    score: number;
  };
  nextPipe: {
    id: string;
    distanceX: number;
    gapCenterY: number;
    gapHeight: number;
    pipeWidth: number;
  };
  followingPipe?: {
    id: string;
    distanceX: number;
    gapCenterY: number;
    gapHeight: number;
    pipeWidth: number;
  };
}

export class AIController {
  private socket: Socket | null = null;
  public isConnected = false;
  public rttMs = 12.0;

  private onDecisionCallback: ((decision: AIActionResponse) => void) | null = null;
  private onConnectionChangeCallback: ((connected: boolean) => void) | null = null;

  private tickCounter = 0;
  private lastTickSentTime = 0;
  private lastRemoteDecisionTime = 0;
  private pingTimer: number | null = null;
  private readonly tickIntervalMs = 55; // ~18Hz streaming frequency

  // Physics constants for Client-Side Control Barrier Function (CBF) Shield
  private readonly gravity = -14.0;
  private readonly flapImpulse = 5.4;
  private readonly birdRadius = 0.35;
  private readonly floorY = 0.5;
  private readonly ceilingY = 10.5;
  private readonly singleFlapRise = (5.4 * 5.4) / (2.0 * 14.0); // ~1.041m

  constructor(serverUrl?: string) {
    const wsUrl =
      serverUrl ||
      (window.location.port === '5173'
        ? `${window.location.protocol}//${window.location.hostname}:3000`
        : window.location.origin);

    console.log(`[AIController] Connecting WebSocket to: ${wsUrl}`);
    this.socket = io(wsUrl, {
      transports: ['websocket', 'polling'],
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
    });

    this.socket.on('connect', () => {
      this.isConnected = true;
      console.log(`[AIController] Connected to gateway! ID: ${this.socket?.id}`);
      this.onConnectionChangeCallback?.(true);
      this.sendPing();
    });

    this.socket.on('disconnect', () => {
      this.isConnected = false;
      console.warn('[AIController] Disconnected from gateway — Edge CBF Autopilot active');
      this.onConnectionChangeCallback?.(false);
    });

    this.socket.on('pong', (data: { clientTimestamp: number; serverTimestamp: number }) => {
      if (data?.clientTimestamp) {
        const measuredRtt = Math.max(1, performance.now() - data.clientTimestamp);
        this.rttMs = Number((0.7 * this.rttMs + 0.3 * measuredRtt).toFixed(1));
      }
    });

    this.socket.on('action_decision', (decision: AIActionResponse) => {
      this.lastRemoteDecisionTime = performance.now();
      this.onDecisionCallback?.(decision);
    });

    // Periodic RTT ping every 2 seconds
    this.pingTimer = window.setInterval(() => this.sendPing(), 2000);
  }

  private sendPing(): void {
    if (this.isConnected && this.socket) {
      this.socket.emit('ping', { clientTimestamp: performance.now() });
    }
  }

  public onDecision(callback: (decision: AIActionResponse) => void): void {
    this.onDecisionCallback = callback;
  }

  public onConnectionChange(callback: (connected: boolean) => void): void {
    this.onConnectionChangeCallback = callback;
  }

  /**
   * Client-side Control Barrier Function (CBF) safety envelope evaluator.
   * Used both as a real-time safety shield on remote decisions and as an
   * offline/edge autonomous pilot when WebSocket is disconnected or delayed.
   */
  public evaluateKinematicEnvelope(payload: Omit<TelemetryTickPayload, 'tick' | 'timestamp'>) {
    const alt = payload.bird.position.y;
    const vel = payload.bird.velocity.y;
    const dist = payload.nextPipe.distanceX;
    const gapY = payload.nextPipe.gapCenterY;
    const gapH = payload.nextPipe.gapHeight || 3.2;
    const nextGapY = payload.followingPipe?.gapCenterY;

    const targetY = gapY;
    const halfGap = gapH * 0.5;
    const safeBottom = gapY - halfGap + this.birdRadius + 0.18;
    const safeTop = gapY + halfGap - this.birdRadius - 0.18;

    const dtLookahead = 0.055;
    const yIfGlide = alt + vel * dtLookahead + 0.5 * this.gravity * dtLookahead * dtLookahead;
    const apexIfFlap = alt + this.singleFlapRise;

    // Optimal flap line sits 0.72m below target center so singleFlapRise (+1.04m) peaks at +0.32m
    const optimalFlapLine = targetY - 0.72;

    const ceilingBreachIfFlap =
      apexIfFlap > this.ceilingY - this.birdRadius - 0.15 ||
      (dist < 3.2 && dist >= -0.92 && apexIfFlap > safeTop);

    const floorImminent = yIfGlide <= this.floorY + this.birdRadius + 0.45;
    const belowCorridor =
      (yIfGlide <= optimalFlapLine && vel <= 0.4) ||
      (dist < 3.0 && dist >= -0.92 && yIfGlide < safeBottom);

    const mustFlap =
      floorImminent || (belowCorridor && !ceilingBreachIfFlap);

    return {
      alt,
      vel,
      dist,
      targetY,
      yIfGlide,
      apexIfFlap,
      optimalFlapLine,
      safeBottom,
      safeTop,
      ceilingBreachIfFlap,
      floorImminent,
      mustFlap,
    };
  }

  public sendStateTick(payload: Omit<TelemetryTickPayload, 'tick' | 'timestamp'>): void {
    const now = performance.now();
    if (now - this.lastTickSentTime < this.tickIntervalMs) {
      return;
    }
    this.lastTickSentTime = now;
    this.tickCounter++;

    // If connected to NestJS Gateway, stream telemetry over WebSocket
    if (this.isConnected && this.socket) {
      const fullPayload: TelemetryTickPayload = {
        ...payload,
        tick: this.tickCounter,
        timestamp: Date.now() / 1000,
        rttMs: this.rttMs,
      };
      this.socket.emit('state_tick', fullPayload);
    }

    // If offline or remote packet is delayed >120ms, execute zero-latency Edge CBF Autopilot
    const remoteStale = now - this.lastRemoteDecisionTime > 120;
    if (!this.isConnected || remoteStale) {
      const t0 = performance.now();
      const env = this.evaluateKinematicEnvelope(payload);
      const margin = env.yIfGlide - env.optimalFlapLine;
      const flapP = env.mustFlap
        ? Number(Math.min(0.98, Math.max(0.76, 0.82 + Math.abs(Math.min(0, margin)) * 0.2)).toFixed(2))
        : Number((env.ceilingBreachIfFlap ? 0.03 : Math.max(0.05, Math.min(0.32, 0.22 - margin * 0.14))).toFixed(2));
      const glideP = Number((1.0 - flapP).toFixed(2));
      const elapsed = Math.max(0.2, performance.now() - t0);

      const edgeDecision: AIActionResponse = {
        timestamp: Date.now() / 1000,
        tick: this.tickCounter,
        action: env.mustFlap ? 'flap' : 'glide',
        confidence: env.mustFlap ? flapP : glideP,
        probabilities: { flap: flapP, glide: glideP },
        criticalHazard: env.floorImminent,
        hazardProbability: env.floorImminent ? 0.94 : 0.04,
        inferenceDurationMs: elapsed,
        source: 'edge_cbf',
        safetyOverride: false,
        projectedState: {
          projectedAltitude: Number(env.yIfGlide.toFixed(3)),
          projectedVelocityY: Number(env.vel.toFixed(3)),
          deltaTSeconds: 0.016,
        },
      };
      this.onDecisionCallback?.(edgeDecision);
    }
  }

  public disconnect(): void {
    if (this.pingTimer !== null) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }
}
