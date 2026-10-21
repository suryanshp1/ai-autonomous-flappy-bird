export interface Vector3D {
  x: number;
  y: number;
  z: number;
}

export interface BirdState {
  position: Vector3D;
  velocity: Vector3D;
  rotation: number;
  alive: boolean;
  score: number;
}

export interface PipeObstacle {
  id: string;
  distanceX: number;     // Distance from bird to pipe center
  gapCenterY: number;    // Center of safe opening
  gapHeight: number;     // Vertical height of gap
  pipeWidth: number;
}

export interface GameTelemetryPayload {
  timestamp: number;
  tick: number;
  rttMs?: number;
  bird: BirdState;
  nextPipe: PipeObstacle;
  followingPipe?: PipeObstacle;
}
