export interface BirdState {
  y: number;
  vy: number;
  pitch: number;
  alive: boolean;
  score: number;
  combo: number;
}

export interface PipeBounds {
  id: string;
  z: number;             // World Z position
  baseGapCenterY: number;
  gapCenterY: number;    // Current center of opening
  gapHeight: number;     // Vertical gap height
  pipeRadius: number;    // Radius of conduit column
  passed: boolean;
  oscillationAmp: number;
  oscillationSpeed: number;
  oscillationPhase: number;
}

export interface OrbBounds {
  id: string;
  z: number;
  y: number;
  radius: number;
  collected: boolean;
  phase: number;
}

export class Physics {
  // World parameters
  public readonly gravity = -14.0;          // m/s^2 downwards
  public readonly flapImpulse = 5.4;        // m/s upward impulse
  public readonly terminalVelocity = -10.0; // max fall speed
  public readonly maxAscent = 7.0;          // max upward speed
  public readonly baseWorldSpeed = 3.6;     // m/s baseline forward speed
  public readonly maxWorldSpeed = 5.2;      // m/s max speed at high score
  public readonly birdRadius = 0.35;        // collision bounding radius

  public readonly floorY = 0.5;
  public readonly ceilingY = 10.5;

  public y = 5.0;
  public vy = 0.0;
  public pitch = 0.0;
  public alive = true;
  public score = 0;
  public combo = 1;
  public orbsCollected = 0;
  public nearMisses = 0;

  private lastFlapTime = -1;
  private readonly minFlapIntervalSec = 0.075; // 75ms debounce guard
  private simClock = 0;

  constructor() {
    this.reset();
  }

  public get worldSpeed(): number {
    // Smoothly scale speed up to maxWorldSpeed as score progresses
    const boost = Math.min(1.6, Math.floor(this.score / 5) * 0.12);
    return Number((this.baseWorldSpeed + boost).toFixed(2));
  }

  public reset(): void {
    this.y = 5.0;
    this.vy = 0.0;
    this.pitch = 0.0;
    this.alive = true;
    this.score = 0;
    this.combo = 1;
    this.orbsCollected = 0;
    this.nearMisses = 0;
    this.lastFlapTime = -1;
    this.simClock = 0;
  }

  public flap(): boolean {
    if (!this.alive) return false;
    if (this.simClock - this.lastFlapTime < this.minFlapIntervalSec) {
      return false;
    }
    this.lastFlapTime = this.simClock;
    this.vy = this.flapImpulse;
    return true;
  }

  public update(dt: number): void {
    if (!this.alive) return;

    // Clamp dt to avoid physics tunnelling on tab switch
    const clampedDt = Math.min(dt, 0.05);
    this.simClock += clampedDt;

    // Kinematic integration
    this.vy += this.gravity * clampedDt;
    if (this.vy < this.terminalVelocity) {
      this.vy = this.terminalVelocity;
    }
    if (this.vy > this.maxAscent) {
      this.vy = this.maxAscent;
    }

    this.y += this.vy * clampedDt;

    // Floor and ceiling collisions
    if (this.y - this.birdRadius <= this.floorY) {
      this.y = this.floorY + this.birdRadius;
      this.vy = 0;
      this.alive = false;
    } else if (this.y + this.birdRadius >= this.ceilingY) {
      this.y = this.ceilingY - this.birdRadius;
      this.vy = 0;
      this.alive = false;
    }

    // Dynamic pitch angle (tilt up during ascent, dive down during fall)
    const targetPitch = Math.max(-0.9, Math.min(0.5, this.vy * 0.12));
    this.pitch += (targetPitch - this.pitch) * Math.min(1.0, clampedDt * 10.0);
  }

  public checkPipeCollisions(pipes: PipeBounds[], birdZ: number = 0): boolean {
    if (!this.alive) return false;

    for (const pipe of pipes) {
      const deltaZ = Math.abs(pipe.z - birdZ);
      const collisionThresholdZ = pipe.pipeRadius + this.birdRadius;

      if (deltaZ < collisionThresholdZ) {
        const halfGap = pipe.gapHeight / 2;
        const gapTop = pipe.gapCenterY + halfGap;
        const gapBottom = pipe.gapCenterY - halfGap;

        if (
          this.y + this.birdRadius >= gapTop ||
          this.y - this.birdRadius <= gapBottom
        ) {
          this.alive = false;
          return true;
        }
      }
    }
    return false;
  }

  public checkOrbCollisions(orbs: OrbBounds[], onCollect: (orb: OrbBounds) => void): void {
    if (!this.alive) return;

    for (const orb of orbs) {
      if (orb.collected) continue;
      const dz = orb.z;
      const dy = this.y - orb.y;
      const distSq = dz * dz + dy * dy;
      const hitRadius = this.birdRadius + orb.radius + 0.18;
      if (distSq <= hitRadius * hitRadius) {
        orb.collected = true;
        this.orbsCollected++;
        onCollect(orb);
      }
    }
  }

  public getBirdState(): BirdState {
    return {
      y: this.y,
      vy: this.vy,
      pitch: this.pitch,
      alive: this.alive,
      score: this.score,
      combo: this.combo,
    };
  }
}
