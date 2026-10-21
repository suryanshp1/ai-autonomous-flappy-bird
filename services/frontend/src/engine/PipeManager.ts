import { PipeBounds, OrbBounds } from './Physics';

export interface PipePassEvent {
  pipe: PipeBounds;
  isNearMiss: boolean;
  isBullseye: boolean;
}

export class PipeManager {
  public pipes: PipeBounds[] = [];
  public orbs: OrbBounds[] = [];
  public readonly pipeSpacing = 8.0;       // Distance between successive pipes
  public readonly defaultGapHeight = 3.2;  // Vertical gap height
  public readonly pipeRadius = 0.55;       // Conduit radius
  public readonly birdRadius = 0.35;       // Bird collision radius
  public readonly spawnDistanceZ = 32.0;   // Distance ahead where pipes spawn
  public readonly recycleDistanceZ = -8.0; // Distance behind bird where pipes are recycled

  private nextId = 1;
  private elapsedTime = 0;

  constructor() {
    this.reset();
  }

  public reset(): void {
    this.pipes = [];
    this.orbs = [];
    this.nextId = 1;
    this.elapsedTime = 0;

    // Pre-populate initial pipe course ahead of bird (Z = 0 is bird position)
    for (let i = 1; i <= 5; i++) {
      const z = i * this.pipeSpacing + 4.0;
      this.spawnPipeAt(z, i);
    }
  }

  private spawnPipeAt(z: number, sequenceIndex: number = this.nextId): PipeBounds {
    const minCenter = 3.2;
    const maxCenter = 6.8;
    const baseGapCenterY = Number(
      (minCenter + Math.random() * (maxCenter - minCenter)).toFixed(2)
    );

    // Enable gentle vertical oscillation on select pipes after sequence 8
    const shouldOscillate = sequenceIndex >= 8 && sequenceIndex % 2 === 0;
    const oscillationAmp = shouldOscillate ? Number((0.22 + Math.random() * 0.12).toFixed(2)) : 0;
    const oscillationSpeed = shouldOscillate ? Number((0.75 + Math.random() * 0.25).toFixed(2)) : 0;
    const oscillationPhase = Number((Math.random() * Math.PI * 2).toFixed(2));

    const id = `pipe-${this.nextId++}`;
    const pipe: PipeBounds = {
      id,
      z,
      baseGapCenterY,
      gapCenterY: baseGapCenterY,
      gapHeight: this.defaultGapHeight,
      pipeRadius: this.pipeRadius,
      passed: false,
      oscillationAmp,
      oscillationSpeed,
      oscillationPhase,
    };
    this.pipes.push(pipe);

    // Spawn a collectible Plasma Data Orb inside or between every 2nd pipe corridor
    if (sequenceIndex % 2 === 0) {
      this.orbs.push({
        id: `orb-${id}`,
        z: z,
        y: baseGapCenterY,
        radius: 0.28,
        collected: false,
        phase: oscillationPhase,
      });
    }

    return pipe;
  }

  public update(
    dt: number,
    speed: number,
    birdY: number,
    onScore: (event: PipePassEvent) => void
  ): void {
    const clampedDt = Math.min(dt, 0.05);
    this.elapsedTime += clampedDt;
    const moveDist = speed * clampedDt;

    // Shift all pipes backward along Z & update dynamic oscillation
    for (const pipe of this.pipes) {
      pipe.z -= moveDist;

      if (pipe.oscillationAmp > 0) {
        const offset =
          Math.sin(this.elapsedTime * pipe.oscillationSpeed + pipe.oscillationPhase) *
          pipe.oscillationAmp;
        pipe.gapCenterY = Number(
          Math.max(2.8, Math.min(7.4, pipe.baseGapCenterY + offset)).toFixed(3)
        );
      }

      // Score increment when bird clears the pipe center
      if (!pipe.passed && pipe.z <= 0) {
        pipe.passed = true;
        const deviation = Math.abs(birdY - pipe.gapCenterY);
        const halfGap = pipe.gapHeight * 0.5;
        const clearanceMargin = halfGap - this.birdRadius - deviation;
        const isNearMiss = clearanceMargin > 0 && clearanceMargin < 0.32;
        const isBullseye = deviation < 0.25;
        onScore({ pipe, isNearMiss, isBullseye });
      }
    }

    // Update collectible orbs
    for (const orb of this.orbs) {
      orb.z -= moveDist;
      orb.phase += clampedDt * 3.5;
    }

    // Recycle pipes and orbs that scrolled out of view
    this.pipes = this.pipes.filter((pipe) => pipe.z > this.recycleDistanceZ);
    this.orbs = this.orbs.filter((orb) => orb.z > this.recycleDistanceZ && !orb.collected);

    // Keep spawn stream active
    const furthestZ = this.pipes.reduce((max, p) => Math.max(max, p.z), 0);
    if (furthestZ < this.spawnDistanceZ) {
      this.spawnPipeAt(furthestZ + this.pipeSpacing, this.nextId);
    }
  }

  public getNextPipe(): PipeBounds | null {
    // Keep tracking pipe until bird's trailing edge is completely past the pipe's trailing edge
    const clearanceZ = -(this.pipeRadius + this.birdRadius);
    const ahead = this.pipes.filter((p) => p.z >= clearanceZ);
    ahead.sort((a, b) => a.z - b.z);
    return ahead[0] || null;
  }

  public getFollowingPipe(): PipeBounds | null {
    const clearanceZ = -(this.pipeRadius + this.birdRadius);
    const ahead = this.pipes.filter((p) => p.z >= clearanceZ);
    ahead.sort((a, b) => a.z - b.z);
    return ahead[1] || null;
  }
}
