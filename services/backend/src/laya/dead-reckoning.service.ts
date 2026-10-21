import { Injectable, Logger } from '@nestjs/common';
import { GameTelemetryPayload } from '../game/dtos/game-telemetry.dto';

export interface ProjectedState {
  altitude: number;
  vertical_velocity: number;
  distance_to_gap: number;
  gap_center_altitude: number;
  gap_height: number;
  next_gap_center_altitude?: number;
  relative_altitude_to_gap: number;
  urgency: 'nominal' | 'low_descent' | 'high_descent' | 'critical_hazard';
  deltaTSeconds: number;
}

@Injectable()
export class DeadReckoningService {
  private readonly logger = new Logger(DeadReckoningService.name);

  // Synchronized simulation constants (matched to Frontend Physics.ts)
  private readonly defaultGravity = -14.0;      // m/s^2
  private readonly terminalVelocity = -10.0;    // m/s
  private readonly maxAscent = 7.0;             // m/s
  private readonly defaultWorldSpeed = 3.6;     // horizontal pipe approach speed m/s
  private readonly defaultInferenceWindow = 0.038; // 38ms baseline latency projection

  /**
   * Projects kinematic state forward by estimated round-trip + inference latency window (Delta t)
   */
  projectForward(
    telemetry: GameTelemetryPayload,
    customLatencySeconds?: number,
  ): ProjectedState {
    // Clamp adaptive projection window between 15ms and 110ms
    const rawDt = customLatencySeconds ?? this.defaultInferenceWindow;
    const dt = Math.max(0.015, Math.min(0.11, rawDt));

    const bird = telemetry.bird;
    const nextPipe = telemetry.nextPipe;
    const followingPipe = telemetry.followingPipe;

    const currentY = bird.position.y;
    const currentVy = bird.velocity.y;
    const worldSpeed = bird.velocity.z > 0 ? bird.velocity.z : this.defaultWorldSpeed;

    // Kinematic forward projection:
    // v_f = clamp(v_0 + g * dt)
    // y_f = y_0 + v_0 * dt + 0.5 * g * dt^2
    const projectedVy = Math.max(
      this.terminalVelocity,
      Math.min(this.maxAscent, currentVy + this.defaultGravity * dt),
    );
    const projectedY = Math.max(
      0.85,
      Math.min(10.15, currentY + currentVy * dt + 0.5 * this.defaultGravity * dt * dt),
    );

    // Projected horizontal distance to gap
    const currentDist = nextPipe?.distanceX ?? 5.0;
    const projectedDist = Math.max(-0.5, currentDist - worldSpeed * dt);

    const gapCenterY = nextPipe?.gapCenterY ?? 5.0;
    const gapHeight = nextPipe?.gapHeight ?? 3.2;
    const relativeAlt = projectedY - gapCenterY;

    // Assess urgency class
    let urgency: 'nominal' | 'low_descent' | 'high_descent' | 'critical_hazard' = 'nominal';
    if (projectedY < 1.45 || (projectedVy < -3.2 && relativeAlt < -0.3)) {
      urgency = 'critical_hazard';
    } else if (projectedVy < -1.8 || relativeAlt < -0.55) {
      urgency = 'high_descent';
    } else if (projectedVy < -0.4) {
      urgency = 'low_descent';
    }

    return {
      altitude: Number(projectedY.toFixed(3)),
      vertical_velocity: Number(projectedVy.toFixed(3)),
      distance_to_gap: Number(projectedDist.toFixed(3)),
      gap_center_altitude: Number(gapCenterY.toFixed(3)),
      gap_height: Number(gapHeight.toFixed(2)),
      next_gap_center_altitude:
        followingPipe?.gapCenterY !== undefined
          ? Number(followingPipe.gapCenterY.toFixed(3))
          : undefined,
      relative_altitude_to_gap: Number(relativeAlt.toFixed(3)),
      urgency,
      deltaTSeconds: Number(dt.toFixed(4)),
    };
  }
}
