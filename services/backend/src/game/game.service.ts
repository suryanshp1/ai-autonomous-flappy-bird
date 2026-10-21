import { Injectable, Logger } from '@nestjs/common';
import { GameTelemetryPayload } from './dtos/game-telemetry.dto';
import { AIActionResponse } from './dtos/ai-action-response.dto';
import { DeadReckoningService } from '../laya/dead-reckoning.service';
import { LayaClientService } from '../laya/laya.client';

export interface GameMetrics {
  totalTicksProcessed: number;
  totalFlapDecisions: number;
  totalGlideDecisions: number;
  layaModelDecisions: number;
  fallbackDecisions: number;
  safetyOverrides: number;
  avgInferenceLatencyMs: number;
  highScore: number;
}

@Injectable()
export class GameService {
  private readonly logger = new Logger(GameService.name);

  private metrics: GameMetrics = {
    totalTicksProcessed: 0,
    totalFlapDecisions: 0,
    totalGlideDecisions: 0,
    layaModelDecisions: 0,
    fallbackDecisions: 0,
    safetyOverrides: 0,
    avgInferenceLatencyMs: 0,
    highScore: 0,
  };

  private latencySum: number = 0;
  private emaInferenceMs: number = 28.0; // Exponential moving average of inference duration

  constructor(
    private readonly deadReckoningService: DeadReckoningService,
    private readonly layaClientService: LayaClientService,
  ) {}

  async processGameTick(telemetry: GameTelemetryPayload): Promise<AIActionResponse> {
    this.metrics.totalTicksProcessed++;

    if (telemetry.bird?.score > this.metrics.highScore) {
      this.metrics.highScore = telemetry.bird.score;
    }

    // 1. Compute dynamic dead-reckoning window: (0.5 * client RTT + EMA inference latency)
    const halfRttSec = telemetry.rttMs ? (telemetry.rttMs * 0.5) / 1000.0 : 0.008;
    const adaptiveDeltaT = halfRttSec + this.emaInferenceMs / 1000.0;

    // 2. Apply dead-reckoning projection
    const projected = this.deadReckoningService.projectForward(telemetry, adaptiveDeltaT);

    // 3. Fetch System 1 decision via Laya or CBF safety watchdog
    const decision = await this.layaClientService.getDecision(projected, telemetry.tick);

    // 4. Update EMA & telemetry metrics
    this.emaInferenceMs = 0.85 * this.emaInferenceMs + 0.15 * decision.inferenceDurationMs;

    if (decision.action === 'flap') {
      this.metrics.totalFlapDecisions++;
    } else {
      this.metrics.totalGlideDecisions++;
    }

    if (decision.source === 'laya_model') {
      this.metrics.layaModelDecisions++;
    } else {
      this.metrics.fallbackDecisions++;
    }

    if (decision.safetyOverride) {
      this.metrics.safetyOverrides++;
    }

    this.latencySum += decision.inferenceDurationMs;
    this.metrics.avgInferenceLatencyMs = Number(
      (this.latencySum / this.metrics.totalTicksProcessed).toFixed(2),
    );

    return decision;
  }

  getMetrics(): GameMetrics {
    return { ...this.metrics };
  }

  resetMetrics(): void {
    this.metrics.totalTicksProcessed = 0;
    this.metrics.totalFlapDecisions = 0;
    this.metrics.totalGlideDecisions = 0;
    this.metrics.layaModelDecisions = 0;
    this.metrics.fallbackDecisions = 0;
    this.metrics.safetyOverrides = 0;
    this.metrics.avgInferenceLatencyMs = 0;
    this.latencySum = 0;
  }
}
