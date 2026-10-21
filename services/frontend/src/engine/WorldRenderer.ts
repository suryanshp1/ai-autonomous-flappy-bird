import * as THREE from 'three';
import { BirdState, PipeBounds, OrbBounds } from './Physics';

export enum CameraMode {
  SIDE_ISO = 'ISO CAM',
  CHASE = 'CHASE CAM',
  COCKPIT = 'FPV CAM',
}

export class WorldRenderer {
  public scene: THREE.Scene;
  public camera: THREE.PerspectiveCamera;
  public renderer: THREE.WebGLRenderer;

  // Scene objects
  private birdGroup: THREE.Group;
  private birdBody!: THREE.Mesh;
  private leftWing!: THREE.Group;
  private rightWing!: THREE.Group;
  private thrusterParticles!: THREE.Points;
  private thrusterGeo!: THREE.BufferGeometry;
  private particlePositions!: Float32Array;
  private particleVelocities!: Float32Array;
  private particleLifetimes!: Float32Array;
  private readonly maxParticles = 120;

  // Pipe & Orb visualization caches
  private pipeMeshMap: Map<string, THREE.Group> = new Map();
  private orbMeshMap: Map<string, THREE.Group> = new Map();

  // Holographic AI Target Lock Reticle
  private targetReticle!: THREE.Group;

  // Environment & Materials
  private gridGround!: THREE.GridHelper;
  private ceilingGrid!: THREE.GridHelper;
  private trajectoryLine!: THREE.Line;
  private trajectoryMat!: THREE.LineDashedMaterial;
  private trajectoryGeo!: THREE.BufferGeometry;
  public showTrajectory = true;
  public cameraMode: CameraMode = CameraMode.SIDE_ISO;

  // Shared Geometries & Materials for zero-GC pipe/orb pooling
  private sharedColumnGeo: THREE.CylinderGeometry;
  private sharedCollarGeo: THREE.TorusGeometry;
  private sharedColumnMat: THREE.MeshStandardMaterial;
  private sharedActiveCollarMat: THREE.MeshStandardMaterial;
  private sharedPassedCollarMat: THREE.MeshStandardMaterial;
  private sharedOrbCoreGeo: THREE.OctahedronGeometry;
  private sharedOrbRingGeo: THREE.TorusGeometry;
  private sharedOrbMat: THREE.MeshStandardMaterial;

  // Animation & FX state
  private wingFlapProgress = 0;
  private shakeIntensity = 0;
  private elapsedClock = 0;

  constructor(container: HTMLElement) {
    // 1. Scene setup
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x06080d);
    this.scene.fog = new THREE.FogExp2(0x06080d, 0.032);

    // 2. Camera setup
    this.camera = new THREE.PerspectiveCamera(
      54,
      window.innerWidth / window.innerHeight,
      0.1,
      110
    );
    this.camera.position.set(-6.8, 5.5, -4.5);
    this.camera.lookAt(0, 5.0, 5.5);

    // 3. Renderer setup
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.2;
    container.appendChild(this.renderer.domElement);

    // 4. Shared Geometries & Materials
    this.sharedColumnGeo = new THREE.CylinderGeometry(0.55, 0.55, 12.0, 16);
    this.sharedCollarGeo = new THREE.TorusGeometry(0.64, 0.065, 10, 24);
    this.sharedCollarGeo.rotateX(Math.PI / 2);

    this.sharedColumnMat = new THREE.MeshStandardMaterial({
      color: 0x131b28,
      metalness: 0.85,
      roughness: 0.25,
      flatShading: true,
    });
    this.sharedActiveCollarMat = new THREE.MeshStandardMaterial({
      color: 0x00f0ff,
      emissive: 0x00f0ff,
      emissiveIntensity: 2.4,
      roughness: 0.15,
    });
    this.sharedPassedCollarMat = new THREE.MeshStandardMaterial({
      color: 0x00ff88,
      emissive: 0x00ff88,
      emissiveIntensity: 2.8,
      roughness: 0.15,
    });

    this.sharedOrbCoreGeo = new THREE.OctahedronGeometry(0.22, 0);
    this.sharedOrbRingGeo = new THREE.TorusGeometry(0.32, 0.025, 8, 20);
    this.sharedOrbMat = new THREE.MeshStandardMaterial({
      color: 0xffb703,
      emissive: 0xff9e00,
      emissiveIntensity: 3.0,
      metalness: 0.5,
      roughness: 0.1,
    });

    // 5. Lighting & Environment
    this.setupLighting();
    this.setupEnvironment();

    // 6. Bird Mesh Model
    this.birdGroup = this.createBirdModel();
    this.scene.add(this.birdGroup);

    // 7. AI Target Reticle, Particle Thruster & Trajectory Line
    this.setupTargetReticle();
    this.setupThruster();
    this.setupTrajectoryLine();

    // 8. Resize Listener
    window.addEventListener('resize', () => this.onWindowResize());
  }

  private setupLighting(): void {
    const ambientLight = new THREE.AmbientLight(0x253246, 1.35);
    this.scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xdff4ff, 2.5);
    dirLight.position.set(-8, 15, -5);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 1024;
    dirLight.shadow.mapSize.height = 1024;
    dirLight.shadow.camera.near = 0.5;
    dirLight.shadow.camera.far = 42;
    dirLight.shadow.camera.left = -12;
    dirLight.shadow.camera.right = 12;
    dirLight.shadow.camera.top = 15;
    dirLight.shadow.camera.bottom = -5;
    this.scene.add(dirLight);

    const hemiLight = new THREE.HemisphereLight(0x00f0ff, 0x9d4edd, 0.45);
    this.scene.add(hemiLight);
  }

  private setupEnvironment(): void {
    // Scrolling cyber grid floor (at Y = 0.5)
    this.gridGround = new THREE.GridHelper(90, 90, 0x00f0ff, 0x192538);
    this.gridGround.position.set(0, 0.5, 12);
    this.scene.add(this.gridGround);

    // Subtle upper containment grid (at Y = 10.5)
    this.ceilingGrid = new THREE.GridHelper(90, 45, 0x9d4edd, 0x121826);
    this.ceilingGrid.position.set(0, 10.5, 12);
    this.scene.add(this.ceilingGrid);

    // Cyber stars & warp dust background
    const starCount = 360;
    const starGeo = new THREE.BufferGeometry();
    const starCoords = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount * 3; i += 3) {
      starCoords[i] = (Math.random() - 0.5) * 85;
      starCoords[i + 1] = Math.random() * 22 + 0.8;
      starCoords[i + 2] = (Math.random() - 0.5) * 85;
    }
    starGeo.setAttribute('position', new THREE.BufferAttribute(starCoords, 3));
    const starMat = new THREE.PointsMaterial({
      color: 0x00f0ff,
      size: 0.13,
      transparent: true,
      opacity: 0.65,
    });
    const starField = new THREE.Points(starGeo, starMat);
    this.scene.add(starField);
  }

  private createBirdModel(): THREE.Group {
    const group = new THREE.Group();

    // Fuselage / Main Body
    const bodyGeo = new THREE.ConeGeometry(0.38, 0.95, 6);
    bodyGeo.rotateX(Math.PI / 2);
    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0x1c2b3d,
      metalness: 0.78,
      roughness: 0.22,
      flatShading: true,
    });
    this.birdBody = new THREE.Mesh(bodyGeo, bodyMat);
    this.birdBody.castShadow = true;
    group.add(this.birdBody);

    // Glowing Cyber Visor
    const visorGeo = new THREE.BoxGeometry(0.28, 0.14, 0.34);
    const visorMat = new THREE.MeshStandardMaterial({
      color: 0x00f0ff,
      emissive: 0x00f0ff,
      emissiveIntensity: 3.0,
      metalness: 0.9,
      roughness: 0.1,
    });
    const visor = new THREE.Mesh(visorGeo, visorMat);
    visor.position.set(0, 0.08, 0.22);
    group.add(visor);

    // Articulated Wings (Left and Right)
    const wingShape = new THREE.BufferGeometry();
    const wingVertices = new Float32Array([
      0, 0, -0.2,
      -0.68, 0.05, 0.0,
      0, 0, 0.26,
    ]);
    wingShape.setAttribute('position', new THREE.BufferAttribute(wingVertices, 3));
    wingShape.computeVertexNormals();

    const wingMat = new THREE.MeshStandardMaterial({
      color: 0x9d4edd,
      emissive: 0x6a1b9a,
      emissiveIntensity: 0.85,
      side: THREE.DoubleSide,
      flatShading: true,
    });

    this.leftWing = new THREE.Group();
    this.leftWing.position.set(-0.18, 0.05, 0);
    this.leftWing.add(new THREE.Mesh(wingShape, wingMat));
    group.add(this.leftWing);

    this.rightWing = new THREE.Group();
    this.rightWing.position.set(0.18, 0.05, 0);
    const rightMesh = new THREE.Mesh(wingShape, wingMat);
    rightMesh.scale.set(-1, 1, 1);
    this.rightWing.add(rightMesh);
    group.add(this.rightWing);

    // Glowing Thruster Ring at tail
    const ringGeo = new THREE.TorusGeometry(0.15, 0.04, 8, 16);
    const ringMat = new THREE.MeshStandardMaterial({
      color: 0x00f0ff,
      emissive: 0x00f0ff,
      emissiveIntensity: 3.8,
    });
    const thrusterRing = new THREE.Mesh(ringGeo, ringMat);
    thrusterRing.position.set(0, 0, -0.48);
    group.add(thrusterRing);

    return group;
  }

  private setupTargetReticle(): void {
    this.targetReticle = new THREE.Group();
    const ringGeo = new THREE.RingGeometry(0.38, 0.44, 24);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x00ff88,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.45,
    });
    const ringMesh = new THREE.Mesh(ringGeo, ringMat);
    this.targetReticle.add(ringMesh);
    this.scene.add(this.targetReticle);
  }

  private setupThruster(): void {
    this.thrusterGeo = new THREE.BufferGeometry();
    this.particlePositions = new Float32Array(this.maxParticles * 3);
    this.particleVelocities = new Float32Array(this.maxParticles * 3);
    this.particleLifetimes = new Float32Array(this.maxParticles);

    for (let i = 0; i < this.maxParticles; i++) {
      this.particleLifetimes[i] = -1;
      this.particlePositions[i * 3 + 1] = -999;
    }

    this.thrusterGeo.setAttribute(
      'position',
      new THREE.BufferAttribute(this.particlePositions, 3)
    );
    const pMat = new THREE.PointsMaterial({
      color: 0x00f0ff,
      size: 0.17,
      transparent: true,
      opacity: 0.88,
      blending: THREE.AdditiveBlending,
    });
    this.thrusterParticles = new THREE.Points(this.thrusterGeo, pMat);
    this.scene.add(this.thrusterParticles);
  }

  private setupTrajectoryLine(): void {
    const pointCount = 30;
    const positions = new Float32Array(pointCount * 3);
    this.trajectoryGeo = new THREE.BufferGeometry();
    this.trajectoryGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    this.trajectoryMat = new THREE.LineDashedMaterial({
      color: 0x00f0ff,
      dashSize: 0.3,
      gapSize: 0.18,
      linewidth: 2,
      transparent: true,
      opacity: 0.85,
    });
    this.trajectoryLine = new THREE.Line(this.trajectoryGeo, this.trajectoryMat);
    this.trajectoryLine.computeLineDistances();
    this.scene.add(this.trajectoryLine);
  }

  public cycleCameraMode(): CameraMode {
    if (this.cameraMode === CameraMode.SIDE_ISO) {
      this.cameraMode = CameraMode.CHASE;
    } else if (this.cameraMode === CameraMode.CHASE) {
      this.cameraMode = CameraMode.COCKPIT;
    } else {
      this.cameraMode = CameraMode.SIDE_ISO;
    }
    return this.cameraMode;
  }

  public triggerFlapAnimation(): void {
    this.wingFlapProgress = 1.0;

    // Emit directed thruster particle burst
    for (let i = 0; i < 16; i++) {
      const idx = Math.floor(Math.random() * this.maxParticles);
      this.particlePositions[idx * 3] = this.birdGroup.position.x + (Math.random() - 0.5) * 0.16;
      this.particlePositions[idx * 3 + 1] = this.birdGroup.position.y - 0.08;
      this.particlePositions[idx * 3 + 2] = this.birdGroup.position.z - 0.48 - Math.random() * 0.25;

      this.particleVelocities[idx * 3] = (Math.random() - 0.5) * 0.8;
      this.particleVelocities[idx * 3 + 1] = -1.5 - Math.random() * 1.2;
      this.particleVelocities[idx * 3 + 2] = -5.5 - Math.random() * 2.5;
      this.particleLifetimes[idx] = 0.38 + Math.random() * 0.2;
    }
    this.thrusterGeo.attributes.position.needsUpdate = true;
  }

  public triggerCollisionBurst(): void {
    this.shakeIntensity = 0.42;

    for (let i = 0; i < this.maxParticles; i++) {
      this.particlePositions[i * 3] = this.birdGroup.position.x;
      this.particlePositions[i * 3 + 1] = this.birdGroup.position.y;
      this.particlePositions[i * 3 + 2] = this.birdGroup.position.z;

      this.particleVelocities[i * 3] = (Math.random() - 0.5) * 8.0;
      this.particleVelocities[i * 3 + 1] = (Math.random() - 0.5) * 8.0;
      this.particleVelocities[i * 3 + 2] = (Math.random() - 0.5) * 8.0;
      this.particleLifetimes[i] = 0.55 + Math.random() * 0.35;
    }
    this.thrusterGeo.attributes.position.needsUpdate = true;
  }

  public updatePipes(pipes: PipeBounds[], nextPipe?: PipeBounds | null): void {
    const activeIds = new Set<string>();

    for (const pipe of pipes) {
      activeIds.add(pipe.id);
      let meshGroup = this.pipeMeshMap.get(pipe.id);

      if (!meshGroup) {
        meshGroup = this.createPipeMesh(pipe);
        this.pipeMeshMap.set(pipe.id, meshGroup);
        this.scene.add(meshGroup);
      }

      // Position group directly at (0, gapCenterY, z) — supports dynamic vertical oscillation at zero GC cost
      meshGroup.position.set(0, pipe.gapCenterY, pipe.z);

      // Switch collar glow material to Neon Emerald once bird clears the pipe
      if (pipe.passed && !meshGroup.userData.markedPassed) {
        meshGroup.userData.markedPassed = true;
        const bottomCollar = meshGroup.userData.bottomCollar as THREE.Mesh;
        const topCollar = meshGroup.userData.topCollar as THREE.Mesh;
        if (bottomCollar && topCollar) {
          bottomCollar.material = this.sharedPassedCollarMat;
          topCollar.material = this.sharedPassedCollarMat;
        }
      }
    }

    // Clean up recycled pipes
    for (const [id, meshGroup] of this.pipeMeshMap.entries()) {
      if (!activeIds.has(id)) {
        this.scene.remove(meshGroup);
        this.pipeMeshMap.delete(id);
      }
    }

    // Update 3D Holographic AI Target Lock Reticle
    if (nextPipe && this.showTrajectory) {
      this.targetReticle.visible = true;
      this.targetReticle.position.set(0, nextPipe.gapCenterY, nextPipe.z);
    } else {
      this.targetReticle.visible = false;
    }
  }

  public updateOrbs(orbs: OrbBounds[]): void {
    const activeIds = new Set<string>();

    for (const orb of orbs) {
      if (orb.collected) continue;
      activeIds.add(orb.id);
      let orbGroup = this.orbMeshMap.get(orb.id);

      if (!orbGroup) {
        orbGroup = new THREE.Group();
        const core = new THREE.Mesh(this.sharedOrbCoreGeo, this.sharedOrbMat);
        const ring = new THREE.Mesh(this.sharedOrbRingGeo, this.sharedActiveCollarMat);
        orbGroup.add(core);
        orbGroup.add(ring);
        this.orbMeshMap.set(orb.id, orbGroup);
        this.scene.add(orbGroup);
      }

      const bobOffset = Math.sin(orb.phase) * 0.14;
      orbGroup.position.set(0, orb.y + bobOffset, orb.z);
      orbGroup.rotation.y = orb.phase * 1.2;
      orbGroup.rotation.z = orb.phase * 0.7;
    }

    for (const [id, orbGroup] of this.orbMeshMap.entries()) {
      if (!activeIds.has(id)) {
        this.scene.remove(orbGroup);
        this.orbMeshMap.delete(id);
      }
    }
  }

  /**
   * Builds a pipe conduit group centered around Y = 0 (the gap center).
   */
  private createPipeMesh(pipe: PipeBounds): THREE.Group {
    const group = new THREE.Group();
    const halfGap = pipe.gapHeight / 2;
    const colLength = 12.0;

    // 1. Bottom Pipe Column (top edge sits at -halfGap)
    const bottomCol = new THREE.Mesh(this.sharedColumnGeo, this.sharedColumnMat);
    bottomCol.position.set(0, -halfGap - colLength / 2, 0);
    bottomCol.castShadow = true;
    bottomCol.receiveShadow = true;
    group.add(bottomCol);

    // Bottom Glowing Collar Lip
    const bottomCollar = new THREE.Mesh(this.sharedCollarGeo, this.sharedActiveCollarMat);
    bottomCollar.position.set(0, -halfGap, 0);
    group.add(bottomCollar);

    // 2. Top Pipe Column (bottom edge sits at +halfGap)
    const topCol = new THREE.Mesh(this.sharedColumnGeo, this.sharedColumnMat);
    topCol.position.set(0, halfGap + colLength / 2, 0);
    topCol.castShadow = true;
    topCol.receiveShadow = true;
    group.add(topCol);

    // Top Glowing Collar Lip
    const topCollar = new THREE.Mesh(this.sharedCollarGeo, this.sharedActiveCollarMat);
    topCollar.position.set(0, halfGap, 0);
    group.add(topCollar);

    group.userData = {
      bottomCollar,
      topCollar,
      markedPassed: false,
    };

    return group;
  }

  public updateTrajectory(
    currentY: number,
    currentVy: number,
    gravity: number,
    worldSpeed: number,
    isHazard: boolean = false
  ): void {
    if (!this.showTrajectory) {
      this.trajectoryLine.visible = false;
      return;
    }
    this.trajectoryLine.visible = true;
    this.trajectoryMat.color.setHex(isHazard ? 0xff0055 : 0x00f0ff);

    const pointCount = 30;
    const positions = this.trajectoryGeo.attributes.position.array as Float32Array;
    const dt = 0.045;

    for (let i = 0; i < pointCount; i++) {
      const t = i * dt;
      const z = t * worldSpeed;
      const y = Math.max(0.5, Math.min(10.5, currentY + currentVy * t + 0.5 * gravity * t * t));

      positions[i * 3] = 0;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = z;
    }
    this.trajectoryGeo.attributes.position.needsUpdate = true;
    this.trajectoryLine.computeLineDistances();
  }

  public render(birdState: BirdState, dt: number): void {
    const clampedDt = Math.min(dt, 0.05);
    this.elapsedClock += clampedDt;

    // 1. Update bird spatial position & rotation
    this.birdGroup.position.set(0, birdState.y, 0);
    this.birdGroup.rotation.x = -birdState.pitch;
    this.birdGroup.visible = this.cameraMode !== CameraMode.COCKPIT;

    // 2. Wing animation
    if (this.wingFlapProgress > 0) {
      this.wingFlapProgress -= clampedDt * 4.8;
      const angle = Math.sin(this.wingFlapProgress * Math.PI) * 0.72;
      this.leftWing.rotation.z = angle;
      this.rightWing.rotation.z = -angle;
    } else {
      const idleHover = Math.sin(this.elapsedClock * 4.0) * 0.06;
      this.leftWing.rotation.z = idleHover;
      this.rightWing.rotation.z = -idleHover;
    }

    // 3. Rotate target reticle
    if (this.targetReticle.visible) {
      this.targetReticle.rotation.z += clampedDt * 1.8;
    }

    // 4. Update thruster & explosion particles
    for (let i = 0; i < this.maxParticles; i++) {
      if (this.particleLifetimes[i] > 0) {
        this.particleLifetimes[i] -= clampedDt;
        this.particlePositions[i * 3] += this.particleVelocities[i * 3] * clampedDt;
        this.particlePositions[i * 3 + 1] += this.particleVelocities[i * 3 + 1] * clampedDt;
        this.particlePositions[i * 3 + 2] += this.particleVelocities[i * 3 + 2] * clampedDt;
      } else {
        this.particlePositions[i * 3 + 1] = -999;
      }
    }
    this.thrusterGeo.attributes.position.needsUpdate = true;

    // 5. Parallax ground & ceiling scroll
    this.gridGround.position.z = (this.gridGround.position.z - clampedDt * 3.8) % 2.0;
    this.ceilingGrid.position.z = this.gridGround.position.z;

    // 6. Multi-mode Camera Tracking + Impact Shake
    let targetPos = new THREE.Vector3(-6.8, 5.0 + (birdState.y - 5.0) * 0.28, -4.5);
    let lookTarget = new THREE.Vector3(0, 5.0 + (birdState.y - 5.0) * 0.15, 5.5);

    if (this.cameraMode === CameraMode.CHASE) {
      targetPos.set(-1.35, birdState.y + 0.85, -3.6);
      lookTarget.set(0, birdState.y - 0.15, 7.5);
    } else if (this.cameraMode === CameraMode.COCKPIT) {
      targetPos.set(0, birdState.y + 0.12, 0.35);
      lookTarget.set(0, birdState.y + Math.sin(birdState.pitch) * 3.0, 9.0);
    }

    const lerpRate = this.cameraMode === CameraMode.COCKPIT ? 0.35 : 0.1;
    this.camera.position.lerp(targetPos, lerpRate);

    if (this.shakeIntensity > 0.005) {
      this.camera.position.x += (Math.random() - 0.5) * this.shakeIntensity;
      this.camera.position.y += (Math.random() - 0.5) * this.shakeIntensity;
      this.shakeIntensity *= 0.86;
    } else {
      this.shakeIntensity = 0;
    }

    this.camera.lookAt(lookTarget);

    this.renderer.render(this.scene, this.camera);
  }

  private onWindowResize(): void {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  public dispose(): void {
    this.renderer.dispose();
  }
}
