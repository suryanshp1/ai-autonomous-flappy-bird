import { Physics } from './Physics';
import { PipeManager } from './PipeManager';
import { WorldRenderer } from './WorldRenderer';
import { AIController, AIActionResponse } from '../ai/AIController';
import { HUD } from '../ui/HUD';
import { SoundEngine } from '../audio/SoundEngine';

export enum GameState {
  READY,
  PLAYING,
  GAME_OVER,
}

export class GameEngine {
  private physics: Physics;
  private pipeManager: PipeManager;
  private renderer: WorldRenderer;
  private aiController: AIController;
  private hud: HUD;
  private sound: SoundEngine;

  private state: GameState = GameState.READY;
  public isAIMode = true;
  public timeScale = 1.0;

  private aiHighScore = 0;
  private manualHighScore = 0;

  private lastTime = 0;
  private fpsSmoothing = 60;
  private frameCounter = 0;
  private animationFrameId: number | null = null;

  constructor(container: HTMLElement) {
    this.physics = new Physics();
    this.pipeManager = new PipeManager();
    this.renderer = new WorldRenderer(container);
    this.hud = new HUD();
    this.sound = new SoundEngine();
    this.aiController = new AIController();

    // Load persistent high scores (AI vs Manual Pilot)
    const savedAiBest = localStorage.getItem('flappy_laya_high_score');
    const savedManualBest = localStorage.getItem('flappy_laya_manual_high_score');
    if (savedAiBest) {
      this.aiHighScore = parseInt(savedAiBest, 10) || 0;
    }
    if (savedManualBest) {
      this.manualHighScore = parseInt(savedManualBest, 10) || 0;
    }

    this.hud.setScores(0, this.aiHighScore, this.manualHighScore, 1);
    this.hud.setMode(this.isAIMode);
    this.hud.setAudioMuted(this.sound.isMuted);

    this.setupListeners();
    this.setupAISubscription();

    // Start render loop
    this.lastTime = performance.now();
    this.loop = this.loop.bind(this);
    this.animationFrameId = requestAnimationFrame(this.loop);
  }

  private setupListeners(): void {
    // HUD UI Buttons
    this.hud.bindEvents({
      onStart: () => {
        this.sound.playClick();
        this.startGame();
      },
      onRestart: () => {
        this.sound.playClick();
        this.restartGame();
      },
      onToggleMode: () => {
        this.sound.playClick();
        this.toggleMode();
      },
      onCycleCamera: () => {
        this.sound.playClick();
        const mode = this.renderer.cycleCameraMode();
        this.hud.setCameraLabel(mode);
      },
      onCycleSpeed: () => {
        this.sound.playClick();
        this.cycleTimeScale();
      },
      onToggleAudio: () => {
        const muted = this.sound.toggleMute();
        this.hud.setAudioMuted(muted);
      },
      onToggleFx: () => {
        this.sound.playClick();
        const fxOn = this.renderer.togglePostProcessing();
        this.hud.setFxStatus(fxOn);
        this.hud.showToast(fxOn ? 'HDR UNREAL BLOOM: ENABLED' : 'HDR UNREAL BLOOM: BYPASSED');
      },
    });

    // Keyboard events
    window.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        e.preventDefault();
        if (this.state === GameState.READY) {
          this.startGame();
        } else if (this.state === GameState.GAME_OVER) {
          this.restartGame();
        } else if (this.state === GameState.PLAYING && !this.isAIMode) {
          this.manualFlap();
        }
      } else if (e.code === 'KeyM') {
        this.toggleMode();
      } else if (e.code === 'KeyC') {
        const mode = this.renderer.cycleCameraMode();
        this.hud.setCameraLabel(mode);
      } else if (e.code === 'KeyV') {
        this.cycleTimeScale();
      } else if (e.code === 'KeyS') {
        const muted = this.sound.toggleMute();
        this.hud.setAudioMuted(muted);
      } else if (e.code === 'KeyT') {
        this.renderer.showTrajectory = !this.renderer.showTrajectory;
      } else if (e.code === 'KeyB') {
        const fxOn = this.renderer.togglePostProcessing();
        this.hud.setFxStatus(fxOn);
        this.hud.showToast(fxOn ? 'HDR UNREAL BLOOM: ENABLED' : 'HDR UNREAL BLOOM: BYPASSED');
      } else if (e.code === 'KeyR') {
        this.restartGame();
      }
    });

    // Mouse / Touch click on canvas
    window.addEventListener('pointerdown', (e: PointerEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest('button') || target.closest('.glass-panel')) {
        return; // UI click
      }

      if (this.state === GameState.READY) {
        this.startGame();
      } else if (this.state === GameState.GAME_OVER) {
        this.restartGame();
      } else if (this.state === GameState.PLAYING && !this.isAIMode) {
        this.manualFlap();
      }
    });
  }

  private cycleTimeScale(): void {
    if (this.timeScale === 1.0) {
      this.timeScale = 1.5;
    } else if (this.timeScale === 1.5) {
      this.timeScale = 2.0;
    } else {
      this.timeScale = 1.0;
    }
    this.hud.setSimSpeedLabel(this.timeScale);
    this.hud.showToast(`SIMULATION SPEED: ${this.timeScale.toFixed(1)}x`);
  }

  private setupAISubscription(): void {
    this.aiController.onConnectionChange((connected) => {
      this.hud.setConnectionStatus(connected, this.aiController.rttMs);
    });

    this.aiController.onDecision((decision: AIActionResponse) => {
      if (this.state !== GameState.PLAYING) return;

      // Apply instantaneous Client-Side Control Barrier Function (CBF) Safety Shield
      // to guarantee zero latency-induced upper-lip crashes or missed floor recoveries
      const nextPipe = this.pipeManager.getNextPipe();
      const followingPipe = this.pipeManager.getFollowingPipe();
      if (nextPipe) {
        const liveEnv = this.aiController.evaluateKinematicEnvelope({
          bird: {
            position: { x: 0, y: this.physics.y, z: 0 },
            velocity: { x: 0, y: this.physics.vy, z: this.physics.worldSpeed },
            rotation: this.physics.pitch,
            alive: this.physics.alive,
            score: this.physics.score,
          },
          nextPipe: {
            id: nextPipe.id,
            distanceX: nextPipe.z,
            gapCenterY: nextPipe.gapCenterY,
            gapHeight: nextPipe.gapHeight,
            pipeWidth: nextPipe.pipeRadius * 2,
          },
          followingPipe: followingPipe
            ? {
                id: followingPipe.id,
                distanceX: followingPipe.z,
                gapCenterY: followingPipe.gapCenterY,
                gapHeight: followingPipe.gapHeight,
                pipeWidth: followingPipe.pipeRadius * 2,
              }
            : undefined,
        });

        if (decision.action === 'flap' && liveEnv.ceilingBreachIfFlap && !liveEnv.floorImminent) {
          decision.action = 'glide';
          decision.safetyOverride = true;
        } else if (decision.action === 'glide' && liveEnv.mustFlap) {
          decision.action = 'flap';
          decision.safetyOverride = true;
        }
      }

      this.hud.updateAIDecision(decision);

      if (this.isAIMode && decision.action === 'flap') {
        const flapped = this.physics.flap();
        if (flapped) {
          this.renderer.triggerFlapAnimation();
          this.sound.playFlap(true);
        }
      }
    });
  }

  public startGame(): void {
    this.state = GameState.PLAYING;
    this.hud.showStartOverlay(false);
    this.hud.showGameOver(0, Math.max(this.aiHighScore, this.manualHighScore), 0, false);
  }

  public restartGame(): void {
    this.physics.reset();
    this.pipeManager.reset();
    this.hud.resetTelemetry();
    this.hud.setScores(0, this.aiHighScore, this.manualHighScore, 1);
    this.state = GameState.PLAYING;
    this.hud.showStartOverlay(false);
    this.hud.showGameOver(0, Math.max(this.aiHighScore, this.manualHighScore), 0, false);
  }

  public toggleMode(): void {
    this.isAIMode = !this.isAIMode;
    this.hud.setMode(this.isAIMode);
    this.hud.showToast(this.isAIMode ? 'AI AUTONOMOUS ENGAGED' : 'MANUAL PILOT ENGAGED');
  }

  private manualFlap(): void {
    const flapped = this.physics.flap();
    if (flapped) {
      this.renderer.triggerFlapAnimation();
      this.sound.playFlap(false);
    }
  }

  private updateHighScores(): void {
    if (this.isAIMode) {
      if (this.physics.score > this.aiHighScore) {
        this.aiHighScore = this.physics.score;
        localStorage.setItem('flappy_laya_high_score', this.aiHighScore.toString());
      }
    } else {
      if (this.physics.score > this.manualHighScore) {
        this.manualHighScore = this.physics.score;
        localStorage.setItem('flappy_laya_manual_high_score', this.manualHighScore.toString());
      }
    }
    this.hud.setScores(
      this.physics.score,
      this.aiHighScore,
      this.manualHighScore,
      this.physics.combo
    );
  }

  private loop(currentTime: number): void {
    const rawDt = Math.max(0.001, (currentTime - this.lastTime) / 1000.0);
    this.lastTime = currentTime;

    // Update FPS & RTT telemetry
    const instFps = 1.0 / rawDt;
    this.fpsSmoothing = 0.92 * this.fpsSmoothing + 0.08 * Math.min(120, instFps);
    this.frameCounter++;
    if (this.frameCounter % 15 === 0) {
      this.hud.updateFps(this.fpsSmoothing);
      this.hud.setConnectionStatus(this.aiController.isConnected, this.aiController.rttMs);
    }

    const simDt = Math.min(rawDt, 0.04) * this.timeScale;

    if (this.state === GameState.PLAYING) {
      // 1. Update Physics
      this.physics.update(simDt);

      // 2. Update Procedural Pipes & Orbs
      this.pipeManager.update(
        simDt,
        this.physics.worldSpeed,
        this.physics.y,
        ({ isNearMiss, isBullseye }) => {
          if (isBullseye) {
            this.physics.combo = Math.min(8, this.physics.combo + 1);
            this.physics.score += 2;
            this.hud.showToast(`+2 CENTER BULLSEYE! (x${this.physics.combo})`);
          } else if (isNearMiss) {
            this.physics.nearMisses++;
            this.physics.score += 2;
            this.sound.playNearMiss();
            this.hud.showToast('+2 TACTICAL NEAR-MISS BONUS!');
          } else {
            this.physics.score += 1;
          }
          this.sound.playScore(this.physics.combo);
          this.updateHighScores();
        }
      );

      // 3. Check Collectible Plasma Orbs
      this.physics.checkOrbCollisions(this.pipeManager.orbs, (orb) => {
        this.physics.combo = Math.min(8, this.physics.combo + 1);
        this.physics.score += 2;
        this.renderer.triggerOrbCollectBurst(orb.y, orb.z);
        this.sound.playOrbCollect();
        this.hud.showToast(`+2 PLASMA CORE COLLECTED (x${this.physics.combo})`);
        this.updateHighScores();
      });

      // 4. Collision Checks
      const collided = this.physics.checkPipeCollisions(this.pipeManager.pipes, 0);
      if (collided || !this.physics.alive) {
        this.state = GameState.GAME_OVER;
        this.renderer.triggerCollisionBurst();
        this.sound.playCollision();
        this.hud.showGameOver(
          this.physics.score,
          Math.max(this.aiHighScore, this.manualHighScore),
          this.physics.orbsCollected,
          true
        );
      }

      // 5. Stream Telemetry to AI Backend & Edge CBF
      const nextPipe = this.pipeManager.getNextPipe();
      const followingPipe = this.pipeManager.getFollowingPipe();

      if (nextPipe) {
        this.hud.updateKinematics(
          this.physics.y,
          this.physics.vy,
          nextPipe.z,
          nextPipe.gapCenterY,
          this.physics.worldSpeed
        );

        this.aiController.sendStateTick({
          bird: {
            position: { x: 0, y: this.physics.y, z: 0 },
            velocity: { x: 0, y: this.physics.vy, z: this.physics.worldSpeed },
            rotation: this.physics.pitch,
            alive: this.physics.alive,
            score: this.physics.score,
          },
          nextPipe: {
            id: nextPipe.id,
            distanceX: nextPipe.z,
            gapCenterY: nextPipe.gapCenterY,
            gapHeight: nextPipe.gapHeight,
            pipeWidth: nextPipe.pipeRadius * 2,
          },
          followingPipe: followingPipe
            ? {
                id: followingPipe.id,
                distanceX: followingPipe.z,
                gapCenterY: followingPipe.gapCenterY,
                gapHeight: followingPipe.gapHeight,
                pipeWidth: followingPipe.pipeRadius * 2,
              }
            : undefined,
        });
      }

      // 6. Update Predictive Trajectory Line in 3D scene
      const isHazard = this.physics.y < 1.55 || this.physics.vy < -3.5;
      this.renderer.updateTrajectory(
        this.physics.y,
        this.physics.vy,
        this.physics.gravity,
        this.physics.worldSpeed,
        isHazard
      );
    }

    // 7. Synchronize 3D visuals
    this.renderer.updatePipes(this.pipeManager.pipes, this.pipeManager.getNextPipe());
    this.renderer.updateOrbs(this.pipeManager.orbs);
    this.renderer.render(this.physics.getBirdState(), simDt);

    this.animationFrameId = requestAnimationFrame(this.loop);
  }

  public dispose(): void {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
    }
    this.renderer.dispose();
    this.aiController.disconnect();
  }
}
