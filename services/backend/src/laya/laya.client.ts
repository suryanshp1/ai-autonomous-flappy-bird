import { Injectable, Logger } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';
import * as http from 'http';
import { ProjectedState } from './dead-reckoning.service';
import { AIActionResponse } from '../game/dtos/ai-action-response.dto';

@Injectable()
export class LayaClientService {
  private readonly logger = new Logger(LayaClientService.name);
  private readonly httpClient: AxiosInstance;
  private readonly serviceUrl: string;
  private readonly timeoutMs: number = 95;

  // Aligned Physics Constants for Control Barrier Function (CBF) Watchdog
  private readonly gravity = -14.0;
  private readonly flapImpulse = 5.4;
  private readonly birdRadius = 0.35;
  private readonly floorY = 0.5;
  private readonly ceilingY = 10.5;
  private readonly singleFlapRise = (5.4 * 5.4) / (2.0 * 14.0); // ~1.041m

  constructor() {
    this.serviceUrl = process.env.LAYA_SERVICE_URL || 'http://localhost:8000';
    this.httpClient = axios.create({
      baseURL: this.serviceUrl,
      timeout: this.timeoutMs,
      httpAgent: new http.Agent({ keepAlive: true, maxSockets: 32 }),
      headers: {
        'Content-Type': 'application/json',
      },
    });
    this.logger.log(
      `LayaClientService initialized targeting: ${this.serviceUrl} (Keep-Alive ON, timeout: ${this.timeoutMs}ms)`,
    );
  }

  async getDecision(
    projected: ProjectedState,
    tick: number,
  ): Promise<AIActionResponse> {
    const tStart = Date.now();

    const requestPayload = {
      tick,
      timestamp: tStart / 1000,
      state: {
        altitude: projected.altitude,
        vertical_velocity: projected.vertical_velocity,
        distance_to_gap: projected.distance_to_gap,
        gap_center_altitude: projected.gap_center_altitude,
        gap_height: projected.gap_height,
        next_gap_center_altitude: projected.next_gap_center_altitude,
        relative_altitude_to_gap: projected.relative_altitude_to_gap,
        urgency: projected.urgency,
      },
      questions: {
        action: {
          type: 'choice',
          instructions:
            'Determine the optimal pilot control action for the bird to safely clear the obstacle gap without colliding with the upper or lower boundary.',
          criteria: {
            flap: 'Bird is below the optimal flap line or sinking rapidly with downward velocity. Immediate lift required.',
            glide:
              'Bird has sufficient upward momentum or is floating comfortably within the upper half of the safe corridor.',
          },
        },
        critical_hazard: {
          type: 'noul',
          instructions:
            'Is the bird in imminent danger of crashing into the bottom barrier within the next 200 milliseconds?',
        },
      },
    };

    try {
      const response = await this.httpClient.post(
        '/v1/systemone/predict',
        requestPayload,
      );
      const data = response.data;
      const tElapsed = Date.now() - tStart;

      return {
        timestamp: data.timestamp || Date.now() / 1000,
        tick: data.tick ?? tick,
        action: data.action === 'flap' ? 'flap' : 'glide',
        confidence: data.confidence ?? 0.88,
        probabilities: data.probabilities ?? { flap: 0.5, glide: 0.5 },
        criticalHazard: Boolean(data.criticalHazard),
        hazardProbability: data.hazardProbability ?? 0.0,
        inferenceDurationMs: data.inferenceDurationMs ?? tElapsed,
        source: data.source ?? 'laya_model',
        safetyOverride: Boolean(data.safetyOverride),
        projectedState: {
          projectedAltitude: projected.altitude,
          projectedVelocityY: projected.vertical_velocity,
          deltaTSeconds: projected.deltaTSeconds,
        },
      };
    } catch (err: any) {
      const tElapsed = Date.now() - tStart;
      this.logger.debug(
        `Laya service call degraded (${err.message}) after ${tElapsed}ms. Executing CBF safety fallback.`,
      );
      return this.emergencyFallback(projected, tick, tElapsed);
    }
  }

  private emergencyFallback(
    projected: ProjectedState,
    tick: number,
    elapsedMs: number,
  ): AIActionResponse {
    const alt = projected.altitude;
    const vel = projected.vertical_velocity;
    const dist = projected.distance_to_gap;
    const gapY = projected.gap_center_altitude;
    const gapH = projected.gap_height || 3.2;
    const nextGapY = projected.next_gap_center_altitude;

    const targetY = gapY;
    const halfGap = gapH * 0.5;
    const safeBottom = gapY - halfGap + this.birdRadius + 0.18;
    const safeTop = gapY + halfGap - this.birdRadius - 0.18;

    const dtLookahead = 0.055;
    const yIfGlide =
      alt + vel * dtLookahead + 0.5 * this.gravity * dtLookahead * dtLookahead;
    const apexIfFlap = alt + this.singleFlapRise;
    const optimalFlapLine = targetY - 0.72;

    const ceilingBreachIfFlap =
      apexIfFlap > this.ceilingY - this.birdRadius - 0.15 ||
      (dist < 3.2 && dist >= -0.92 && apexIfFlap > safeTop);

    const floorImminent = yIfGlide <= this.floorY + this.birdRadius + 0.45;
    const belowCorridor =
      (yIfGlide <= optimalFlapLine && vel <= 0.4) || yIfGlide < safeBottom;

    const flapNeeded =
      floorImminent || (belowCorridor && !ceilingBreachIfFlap);

    const margin = yIfGlide - optimalFlapLine;
    const flapP = flapNeeded
      ? Number(
          Math.min(0.98, Math.max(0.75, 0.8 + Math.abs(Math.min(0, margin)) * 0.2)).toFixed(2),
        )
      : Number(
          (ceilingBreachIfFlap
            ? 0.04
            : Math.max(0.06, Math.min(0.32, 0.24 - margin * 0.14))
          ).toFixed(2),
        );
    const glideP = Number((1.0 - flapP).toFixed(2));

    return {
      timestamp: Date.now() / 1000,
      tick,
      action: flapNeeded ? 'flap' : 'glide',
      confidence: flapNeeded ? flapP : glideP,
      probabilities: { flap: flapP, glide: glideP },
      criticalHazard: floorImminent,
      hazardProbability: floorImminent ? 0.95 : 0.05,
      inferenceDurationMs: elapsedMs,
      source: 'fallback_heuristic',
      safetyOverride: false,
      projectedState: {
        projectedAltitude: projected.altitude,
        projectedVelocityY: projected.vertical_velocity,
        deltaTSeconds: projected.deltaTSeconds,
      },
    };
  }
}
