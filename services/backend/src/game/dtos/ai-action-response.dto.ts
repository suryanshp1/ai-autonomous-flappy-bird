export interface ActionProbabilities {
  flap: number;
  glide: number;
}

export interface AIActionResponse {
  timestamp: number;
  tick: number;
  action: 'flap' | 'glide';
  confidence: number;
  probabilities: ActionProbabilities;
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
