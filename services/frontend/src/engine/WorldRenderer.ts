import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { BirdState, PipeBounds, OrbBounds } from './Physics';

export enum CameraMode {
  SIDE_ISO = 'ISO CAM',
  CHASE = 'CHASE CAM',
  COCKPIT = 'FPV CAM',
}

interface ShockwaveRing {
  mesh: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
  age: number;
  maxAge: number;
  maxScale: number;
}

export class WorldRenderer {
  public scene: THREE.Scene;
  public camera: THREE.PerspectiveCamera;
  public renderer: THREE.WebGLRenderer;
  private composer!: EffectComposer;
  private bloomPass!: UnrealBloomPass;
  public postProcessingEnabled = true;

  // Bird Rig & Dynamic Light
  private birdGroup: THREE.Group;
  private birdBody!: THREE.Object3D;
  private leftWing!: THREE.Object3D;
  private rightWing!: THREE.Object3D;
  private thrusterCore!: THREE.Object3D;
  private birdLight!: THREE.PointLight;

  // Thruster & Explosion Particles
  private thrusterParticles!: THREE.Points;
  private thrusterGeo!: THREE.BufferGeometry;
  private particlePositions!: Float32Array;
  private particleVelocities!: Float32Array;
  private particleLifetimes!: Float32Array;
  private readonly maxParticles = 180;

  // Expanding Shockwave Rings Pool
  private shockwaves: ShockwaveRing[] = [];

  // Pipe & Orb visualization caches
  private pipeMeshMap: Map<string, THREE.Group> = new Map();
  private orbMeshMap: Map<string, THREE.Group> = new Map();
  private latestPipes: PipeBounds[] = [];
  private latestOrbs: OrbBounds[] = [];

  // Headless Blender MCP (.glb) Asset Prototypes
  private gltfLoader: GLTFLoader;
  private pipePrototype: THREE.Group | null = null;
  private orbPrototype: THREE.Group | null = null;
  private cityTowerPrototype: THREE.Object3D | null = null;
  private trenchPlatePrototype: THREE.Object3D | null = null;

  // Parallax Cyberpunk Megastructures & Trench Deck
  private cityParallaxGroup: THREE.Group;
  private trenchDeckGroup: THREE.Group;
  private starField!: THREE.Points;

  // Holographic AI Target Lock Reticle
  private targetReticle!: THREE.Group;

  // Environment & Trajectory
  private gridGround!: THREE.GridHelper;
  private ceilingGrid!: THREE.GridHelper;
  private trajectoryLine!: THREE.Line;
  private trajectoryMat!: THREE.LineDashedMaterial;
  private trajectoryGeo!: THREE.BufferGeometry;
  public showTrajectory = true;
  public cameraMode: CameraMode = CameraMode.SIDE_ISO;

  // Shared Fallback & Override Materials
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
    // 1. Scene setup with deep cyberpunk atmospheric fog
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x04070d);
    this.scene.fog = new THREE.FogExp2(0x04070d, 0.024);

    // 2. Camera setup
    this.camera = new THREE.PerspectiveCamera(
      54,
      window.innerWidth / window.innerHeight,
      0.1,
      140
    );
    this.camera.position.set(-6.8, 5.5, -4.5);
    this.camera.lookAt(0, 5.0, 5.5);

    // 3. WebGLRenderer with ACES Filmic HDR ToneMapping
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    container.appendChild(this.renderer.domElement);

    // 4. PBR Image-Based Lighting (PMREM Environment Reflections for Blender Metallic Assets)
    const pmremGenerator = new THREE.PMREMGenerator(this.renderer);
    pmremGenerator.compileEquirectangularShader();
    const roomEnv = new RoomEnvironment();
    this.scene.environment = pmremGenerator.fromScene(roomEnv, 0.04).texture;
    roomEnv.dispose();
    pmremGenerator.dispose();

    // 5. Post-Processing Pipeline (RenderPass + UnrealBloomPass + OutputPass)
    this.setupPostProcessing();

    // 6. Shared Geometries & Materials
    this.sharedColumnGeo = new THREE.CylinderGeometry(0.52, 0.52, 12.0, 12);
    this.sharedCollarGeo = new THREE.TorusGeometry(0.64, 0.068, 12, 28);
    this.sharedCollarGeo.rotateX(Math.PI / 2);

    this.sharedColumnMat = new THREE.MeshStandardMaterial({
      color: 0x0f1724,
      metalness: 0.88,
      roughness: 0.24,
    });
    this.sharedActiveCollarMat = new THREE.MeshStandardMaterial({
      color: 0x00f0ff,
      emissive: 0x00f0ff,
      emissiveIntensity: 1.75,
      metalness: 0.3,
      roughness: 0.15,
    });
    this.sharedPassedCollarMat = new THREE.MeshStandardMaterial({
      color: 0x00ff88,
      emissive: 0x00ff88,
      emissiveIntensity: 2.0,
      metalness: 0.3,
      roughness: 0.15,
    });

    this.sharedOrbCoreGeo = new THREE.OctahedronGeometry(0.22, 1);
    this.sharedOrbRingGeo = new THREE.TorusGeometry(0.32, 0.025, 10, 24);
    this.sharedOrbMat = new THREE.MeshStandardMaterial({
      color: 0xffb703,
      emissive: 0xff8800,
      emissiveIntensity: 3.4,
      metalness: 0.45,
      roughness: 0.1,
    });

    // 7. Lighting & Environment
    this.cityParallaxGroup = new THREE.Group();
    this.trenchDeckGroup = new THREE.Group();
    this.scene.add(this.cityParallaxGroup);
    this.scene.add(this.trenchDeckGroup);

    this.setupLighting();
    this.setupEnvironment();

    // 8. Bird Mesh Model (Procedural fallback initially, hot-swapped with Blender MCP mecha_bird.glb)
    this.birdGroup = this.createFallbackBirdModel();
    this.birdLight = new THREE.PointLight(0x00f0ff, 2.2, 6.5, 1.5);
    this.birdLight.position.set(0, 0.2, 0.3);
    this.birdGroup.add(this.birdLight);
    this.scene.add(this.birdGroup);

    // 9. AI Target Reticle, Particle Thruster, Shockwaves & Trajectory Line
    this.setupTargetReticle();
    this.setupThruster();
    this.setupShockwaves();
    this.setupTrajectoryLine();

    // 10. Load Headless Blender MCP (.glb) 3D Assets
    this.gltfLoader = new GLTFLoader();
    this.loadBlenderMcpAssets();

    // 11. Resize Listener
    window.addEventListener('resize', () => this.onWindowResize());
  }

  private setupPostProcessing(): void {
    this.composer = new EffectComposer(this.renderer);
    const renderPass = new RenderPass(this.scene, this.camera);
    this.composer.addPass(renderPass);

    const bloomRes = new THREE.Vector2(
      Math.floor(window.innerWidth * 0.75),
      Math.floor(window.innerHeight * 0.75)
    );
    // High threshold (1.15) ensures ONLY true emissive neon elements bloom, keeping metallic armor crisp
    this.bloomPass = new UnrealBloomPass(bloomRes, 0.38, 0.32, 1.15);
    this.composer.addPass(this.bloomPass);

    const outputPass = new OutputPass();
    this.composer.addPass(outputPass);
  }

  public togglePostProcessing(): boolean {
    this.postProcessingEnabled = !this.postProcessingEnabled;
    return this.postProcessingEnabled;
  }

  private setupLighting(): void {
    const ambientLight = new THREE.AmbientLight(0x1a2639, 0.85);
    this.scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xd8f3ff, 1.65);
    dirLight.position.set(-9, 16, -6);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 1024;
    dirLight.shadow.mapSize.height = 1024;
    dirLight.shadow.camera.near = 0.5;
    dirLight.shadow.camera.far = 45;
    dirLight.shadow.camera.left = -14;
    dirLight.shadow.camera.right = 14;
    dirLight.shadow.camera.top = 15;
    dirLight.shadow.camera.bottom = -5;
    dirLight.shadow.bias = -0.0005;
    this.scene.add(dirLight);

    // Cyberpunk rim light from right/below
    const rimLight = new THREE.DirectionalLight(0x9d4edd, 0.95);
    rimLight.position.set(10, -4, 8);
    this.scene.add(rimLight);

    const hemiLight = new THREE.HemisphereLight(0x00f0ff, 0x7b2cbf, 0.38);
    this.scene.add(hemiLight);
  }

  private setupEnvironment(): void {
    // Scrolling cyber grid floor (at Y = 0.5)
    this.gridGround = new THREE.GridHelper(110, 110, 0x00f0ff, 0x132035);
    this.gridGround.position.set(0, 0.5, 16);
    this.scene.add(this.gridGround);

    // Upper containment grid (at Y = 10.5)
    this.ceilingGrid = new THREE.GridHelper(110, 55, 0x9d4edd, 0x101726);
    this.ceilingGrid.position.set(0, 10.5, 16);
    this.scene.add(this.ceilingGrid);

    // Cyber stars & high-velocity warp dust
    const starCount = 480;
    const starGeo = new THREE.BufferGeometry();
    const starCoords = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount * 3; i += 3) {
      starCoords[i] = (Math.random() - 0.5) * 95;
      starCoords[i + 1] = Math.random() * 24 + 0.6;
      starCoords[i + 2] = (Math.random() - 0.5) * 95;
    }
    starGeo.setAttribute('position', new THREE.BufferAttribute(starCoords, 3));
    const starMat = new THREE.PointsMaterial({
      color: 0x00f0ff,
      size: 0.14,
      transparent: true,
      opacity: 0.72,
      blending: THREE.AdditiveBlending,
    });
    this.starField = new THREE.Points(starGeo, starMat);
    this.scene.add(this.starField);
  }

  /**
   * Asynchronously loads the 4 PBR .glb models generated by headless `sandraschi/blender-mcp`
   * and hot-swaps them into the scene with zero-GC instance cloning.
   */
  private loadBlenderMcpAssets(): void {
    // 1. Load Mecha-Falcon Drone (mecha_bird.glb)
    this.gltfLoader.load(
      '/models/mecha_bird.glb',
      (gltf) => {
        const model = gltf.scene;
        this.tuneGlbMaterials(model, 2.2);

        // Remove fallback children while preserving birdLight
        const toRemove = this.birdGroup.children.filter((c) => c !== this.birdLight);
        toRemove.forEach((c) => this.birdGroup.remove(c));

        this.birdGroup.add(model);
        this.birdBody = model.getObjectByName('Chassis') || model;
        this.leftWing = model.getObjectByName('LeftWing') || new THREE.Group();
        this.rightWing = model.getObjectByName('RightWing') || new THREE.Group();
        this.thrusterCore = model.getObjectByName('ThrusterCore') || new THREE.Group();
      },
      undefined,
      (err) => console.warn('[WorldRenderer] Using fallback bird rig:', err)
    );

    // 2. Load Industrial Reactor Conduit Pipe (cyber_pipe.glb)
    this.gltfLoader.load(
      '/models/cyber_pipe.glb',
      (gltf) => {
        this.pipePrototype = gltf.scene;
        this.tuneGlbMaterials(this.pipePrototype, 2.0);

        // Hot-swap existing pipes in scene with the Blender MCP conduit model
        for (const [, group] of this.pipeMeshMap) {
          this.scene.remove(group);
        }
        this.pipeMeshMap.clear();
        if (this.latestPipes.length > 0) {
          this.updatePipes(this.latestPipes);
        }
      },
      undefined,
      (err) => console.warn('[WorldRenderer] Using fallback pipe rig:', err)
    );

    // 3. Load Quantum Plasma Data Core (plasma_orb.glb)
    this.gltfLoader.load(
      '/models/plasma_orb.glb',
      (gltf) => {
        this.orbPrototype = gltf.scene;
        this.tuneGlbMaterials(this.orbPrototype, 2.6);

        for (const [, group] of this.orbMeshMap) {
          this.scene.remove(group);
        }
        this.orbMeshMap.clear();
        if (this.latestOrbs.length > 0) {
          this.updateOrbs(this.latestOrbs);
        }
      },
      undefined,
      (err) => console.warn('[WorldRenderer] Using fallback orb rig:', err)
    );

    // 4. Load Cyberpunk Megastructure & Trench Deck (cyber_city.glb)
    this.gltfLoader.load(
      '/models/cyber_city.glb',
      (gltf) => {
        const root = gltf.scene;
        this.tuneGlbMaterials(root, 1.8);
        this.cityTowerPrototype = root.getObjectByName('Megastructure') || root;
        this.trenchPlatePrototype = root.getObjectByName('TrenchPlate') || null;
        this.populateCyberCityscape();
      },
      undefined,
      (err) => console.warn('[WorldRenderer] Cityscape GLB optional fallback:', err)
    );
  }

  private tuneGlbMaterials(root: THREE.Object3D, maxEmissive: number): void {
    root.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        const mesh = obj as THREE.Mesh;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        const mat = mesh.material as THREE.MeshStandardMaterial;
        if (mat && mat.isMeshStandardMaterial) {
          if (mat.emissive && (mat.emissive.r > 0.05 || mat.emissive.g > 0.05 || mat.emissive.b > 0.05)) {
            mat.emissiveIntensity = maxEmissive;
          } else {
            mat.emissiveIntensity = 0;
          }
          mat.envMapIntensity = 0.42;
          mat.needsUpdate = true;
        }
      }
    });
  }

  private populateCyberCityscape(): void {
    if (!this.cityTowerPrototype) return;

    // Clear previous parallax instances
    this.cityParallaxGroup.clear();
    this.trenchDeckGroup.clear();

    // Populate distant cyberpunk megastructure silhouettes on right & left of corridor
    const towerPlacements = [
      { x: 11.5, z: -6, scaleY: 0.95, scaleXZ: 1.0 },
      { x: 15.0, z: 4, scaleY: 1.35, scaleXZ: 1.25 },
      { x: 12.0, z: 14, scaleY: 1.05, scaleXZ: 0.9 },
      { x: 16.5, z: 24, scaleY: 1.55, scaleXZ: 1.3 },
      { x: 11.8, z: 34, scaleY: 1.15, scaleXZ: 1.05 },
      { x: 15.5, z: 44, scaleY: 1.4, scaleXZ: 1.2 },
      { x: -13.5, z: 8, scaleY: 1.25, scaleXZ: 1.1 },
      { x: -16.0, z: 22, scaleY: 1.5, scaleXZ: 1.3 },
      { x: -14.0, z: 36, scaleY: 1.1, scaleXZ: 1.0 },
    ];

    for (const cfg of towerPlacements) {
      const tower = this.cityTowerPrototype.clone(true);
      tower.position.set(cfg.x, -1.5, cfg.z);
      tower.scale.set(cfg.scaleXZ, cfg.scaleY, cfg.scaleXZ);
      this.cityParallaxGroup.add(tower);
    }

    // Populate industrial trench floor grating segments along Z
    if (this.trenchPlatePrototype) {
      for (let i = 0; i < 12; i++) {
        const plate = this.trenchPlatePrototype.clone(true);
        plate.position.set(0, 0.38, -8 + i * 4.5);
        this.trenchDeckGroup.add(plate);
      }
    }
  }

  private createFallbackBirdModel(): THREE.Group {
    const group = new THREE.Group();

    const bodyGeo = new THREE.ConeGeometry(0.38, 0.95, 6);
    bodyGeo.rotateX(Math.PI / 2);
    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0x1c2b3d,
      metalness: 0.85,
      roughness: 0.2,
      flatShading: true,
    });
    this.birdBody = new THREE.Mesh(bodyGeo, bodyMat);
    this.birdBody.castShadow = true;
    group.add(this.birdBody);

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
      emissiveIntensity: 1.2,
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

    const ringGeo = new THREE.TorusGeometry(0.15, 0.04, 8, 16);
    const ringMat = new THREE.MeshStandardMaterial({
      color: 0x00f0ff,
      emissive: 0x00f0ff,
      emissiveIntensity: 3.8,
    });
    this.thrusterCore = new THREE.Mesh(ringGeo, ringMat);
    this.thrusterCore.position.set(0, 0, -0.48);
    group.add(this.thrusterCore);

    return group;
  }

  private setupTargetReticle(): void {
    this.targetReticle = new THREE.Group();

    // Outer dashed tactical ring
    const outerGeo = new THREE.RingGeometry(0.42, 0.47, 32);
    const outerMat = new THREE.MeshBasicMaterial({
      color: 0x00ff88,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.55,
    });
    this.targetReticle.add(new THREE.Mesh(outerGeo, outerMat));

    // Inner diamond lock bracket
    const innerGeo = new THREE.RingGeometry(0.24, 0.27, 4);
    const innerMat = new THREE.MeshBasicMaterial({
      color: 0x00f0ff,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.65,
    });
    const innerMesh = new THREE.Mesh(innerGeo, innerMat);
    innerMesh.name = 'InnerReticle';
    this.targetReticle.add(innerMesh);

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
      size: 0.16,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
    });
    this.thrusterParticles = new THREE.Points(this.thrusterGeo, pMat);
    this.scene.add(this.thrusterParticles);
  }

  private setupShockwaves(): void {
    const ringGeo = new THREE.RingGeometry(0.18, 0.25, 28);
    for (let i = 0; i < 6; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: 0x00f0ff,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
      });
      const mesh = new THREE.Mesh(ringGeo, mat);
      mesh.visible = false;
      this.scene.add(mesh);
      this.shockwaves.push({
        mesh,
        mat,
        age: 99,
        maxAge: 0.45,
        maxScale: 3.2,
      });
    }
  }

  private spawnShockwave(x: number, y: number, z: number, colorHex: number, maxScale = 2.8): void {
    const sw = this.shockwaves.find((s) => !s.mesh.visible) || this.shockwaves[0];
    sw.mesh.position.set(x, y, z);
    sw.mesh.scale.set(1, 1, 1);
    sw.mat.color.setHex(colorHex);
    sw.mat.opacity = 0.85;
    sw.age = 0;
    sw.maxAge = 0.42;
    sw.maxScale = maxScale;
    sw.mesh.visible = true;
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

    // Emit plasma shockwave ring at thruster nozzle
    this.spawnShockwave(
      this.birdGroup.position.x,
      this.birdGroup.position.y - 0.05,
      this.birdGroup.position.z - 0.5,
      0x00f0ff,
      2.4
    );

    // Emit directed thruster particle burst
    for (let i = 0; i < 20; i++) {
      const idx = Math.floor(Math.random() * this.maxParticles);
      this.particlePositions[idx * 3] = this.birdGroup.position.x + (Math.random() - 0.5) * 0.18;
      this.particlePositions[idx * 3 + 1] = this.birdGroup.position.y - 0.06;
      this.particlePositions[idx * 3 + 2] = this.birdGroup.position.z - 0.48 - Math.random() * 0.25;

      this.particleVelocities[idx * 3] = (Math.random() - 0.5) * 0.9;
      this.particleVelocities[idx * 3 + 1] = -1.6 - Math.random() * 1.4;
      this.particleVelocities[idx * 3 + 2] = -6.0 - Math.random() * 2.8;
      this.particleLifetimes[idx] = 0.38 + Math.random() * 0.22;
    }
    this.thrusterGeo.attributes.position.needsUpdate = true;
  }

  public triggerOrbCollectBurst(y: number, z: number): void {
    this.spawnShockwave(0, y, z, 0xffb703, 3.8);
  }

  public triggerCollisionBurst(): void {
    this.shakeIntensity = 0.46;
    this.spawnShockwave(
      this.birdGroup.position.x,
      this.birdGroup.position.y,
      this.birdGroup.position.z,
      0xff0055,
      4.8
    );

    for (let i = 0; i < this.maxParticles; i++) {
      this.particlePositions[i * 3] = this.birdGroup.position.x;
      this.particlePositions[i * 3 + 1] = this.birdGroup.position.y;
      this.particlePositions[i * 3 + 2] = this.birdGroup.position.z;

      this.particleVelocities[i * 3] = (Math.random() - 0.5) * 8.5;
      this.particleVelocities[i * 3 + 1] = (Math.random() - 0.5) * 8.5;
      this.particleVelocities[i * 3 + 2] = (Math.random() - 0.5) * 8.5;
      this.particleLifetimes[i] = 0.55 + Math.random() * 0.35;
    }
    this.thrusterGeo.attributes.position.needsUpdate = true;
  }

  public updatePipes(pipes: PipeBounds[], nextPipe?: PipeBounds | null): void {
    this.latestPipes = pipes;
    const activeIds = new Set<string>();

    for (const pipe of pipes) {
      activeIds.add(pipe.id);
      let meshGroup = this.pipeMeshMap.get(pipe.id);

      if (!meshGroup) {
        meshGroup = this.createPipeMesh(pipe);
        this.pipeMeshMap.set(pipe.id, meshGroup);
        this.scene.add(meshGroup);
      }

      // Position group directly at (0, gapCenterY, z)
      meshGroup.position.set(0, pipe.gapCenterY, pipe.z);

      // Switch collar glow material to Neon Emerald once bird clears the pipe
      if (pipe.passed && !meshGroup.userData.markedPassed) {
        meshGroup.userData.markedPassed = true;
        const bottomCollar = meshGroup.userData.bottomCollar as THREE.Mesh | undefined;
        const topCollar = meshGroup.userData.topCollar as THREE.Mesh | undefined;
        if (bottomCollar) bottomCollar.material = this.sharedPassedCollarMat;
        if (topCollar) topCollar.material = this.sharedPassedCollarMat;
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
    this.latestOrbs = orbs;
    const activeIds = new Set<string>();

    for (const orb of orbs) {
      if (orb.collected) continue;
      activeIds.add(orb.id);
      let orbGroup = this.orbMeshMap.get(orb.id);

      if (!orbGroup) {
        orbGroup = this.createOrbMesh();
        this.orbMeshMap.set(orb.id, orbGroup);
        this.scene.add(orbGroup);
      }

      const bobOffset = Math.sin(orb.phase) * 0.14;
      orbGroup.position.set(0, orb.y + bobOffset, orb.z);

      // Counter-rotate multi-ring gyroscope nodes if present
      const innerRing = orbGroup.userData.innerRing as THREE.Object3D | undefined;
      const outerRing = orbGroup.userData.outerRing as THREE.Object3D | undefined;
      const core = orbGroup.userData.core as THREE.Object3D | undefined;

      if (innerRing && outerRing && core) {
        core.rotation.y = orb.phase * 1.6;
        innerRing.rotation.x = orb.phase * 1.4;
        innerRing.rotation.z = orb.phase * 0.9;
        outerRing.rotation.y = -orb.phase * 1.2;
      } else {
        orbGroup.rotation.y = orb.phase * 1.2;
        orbGroup.rotation.z = orb.phase * 0.7;
      }
    }

    for (const [id, orbGroup] of this.orbMeshMap.entries()) {
      if (!activeIds.has(id)) {
        this.scene.remove(orbGroup);
        this.orbMeshMap.delete(id);
      }
    }
  }

  private createOrbMesh(): THREE.Group {
    if (this.orbPrototype) {
      const group = this.orbPrototype.clone(true);
      group.userData = {
        core: group.getObjectByName('Core'),
        innerRing: group.getObjectByName('InnerRing'),
        outerRing: group.getObjectByName('OuterRing'),
      };
      return group;
    }

    const orbGroup = new THREE.Group();
    const core = new THREE.Mesh(this.sharedOrbCoreGeo, this.sharedOrbMat);
    const ring = new THREE.Mesh(this.sharedOrbRingGeo, this.sharedActiveCollarMat);
    orbGroup.add(core);
    orbGroup.add(ring);
    return orbGroup;
  }

  /**
   * Builds a pipe conduit group centered around Y = 0 (the gap center).
   * Uses the Blender MCP `cyber_pipe.glb` asset when loaded, or procedural fallback.
   */
  private createPipeMesh(pipe: PipeBounds): THREE.Group {
    const group = new THREE.Group();
    const halfGap = pipe.gapHeight / 2;

    if (this.pipePrototype) {
      // Top conduit (extends from +halfGap upwards to +halfGap + 12.0)
      const topConduit = this.pipePrototype.clone(true);
      topConduit.position.set(0, halfGap, 0);
      group.add(topConduit);

      // Bottom conduit (mirrored vertically via rotation.z = Math.PI so it extends downwards from -halfGap)
      const bottomConduit = this.pipePrototype.clone(true);
      bottomConduit.position.set(0, -halfGap, 0);
      bottomConduit.rotation.z = Math.PI;
      group.add(bottomConduit);

      const topCollar = topConduit.getObjectByName('CollarGlow') as THREE.Mesh | undefined;
      const bottomCollar = bottomConduit.getObjectByName('CollarGlow') as THREE.Mesh | undefined;
      if (topCollar) topCollar.material = this.sharedActiveCollarMat;
      if (bottomCollar) bottomCollar.material = this.sharedActiveCollarMat;

      group.userData = {
        bottomCollar,
        topCollar,
        markedPassed: false,
      };
      return group;
    }

    const colLength = 12.0;

    const bottomCol = new THREE.Mesh(this.sharedColumnGeo, this.sharedColumnMat);
    bottomCol.position.set(0, -halfGap - colLength / 2, 0);
    bottomCol.castShadow = true;
    bottomCol.receiveShadow = true;
    group.add(bottomCol);

    const bottomCollar = new THREE.Mesh(this.sharedCollarGeo, this.sharedActiveCollarMat);
    bottomCollar.position.set(0, -halfGap, 0);
    group.add(bottomCollar);

    const topCol = new THREE.Mesh(this.sharedColumnGeo, this.sharedColumnMat);
    topCol.position.set(0, halfGap + colLength / 2, 0);
    topCol.castShadow = true;
    topCol.receiveShadow = true;
    group.add(topCol);

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

    // 1. Update bird spatial position, pitch & subtle aerodynamic roll stabilization
    this.birdGroup.position.set(0, birdState.y, 0);
    this.birdGroup.rotation.x = -birdState.pitch;
    this.birdGroup.rotation.z = Math.sin(this.elapsedClock * 3.2) * 0.045;
    this.birdGroup.visible = this.cameraMode !== CameraMode.COCKPIT;

    // 2. Wing & Thruster Core animation
    if (this.wingFlapProgress > 0) {
      this.wingFlapProgress -= clampedDt * 4.8;
      const angle = Math.sin(this.wingFlapProgress * Math.PI) * 0.72;
      this.leftWing.rotation.z = angle;
      this.rightWing.rotation.z = -angle;
      const pulse = 1.0 + Math.sin(this.wingFlapProgress * Math.PI) * 0.45;
      this.thrusterCore.scale.set(pulse, pulse, pulse);
    } else {
      const idleHover = Math.sin(this.elapsedClock * 4.5) * 0.07;
      this.leftWing.rotation.z = idleHover;
      this.rightWing.rotation.z = -idleHover;
      this.thrusterCore.scale.set(1, 1, 1);
    }

    // 3. Rotate holographic target reticle
    if (this.targetReticle.visible) {
      this.targetReticle.rotation.z += clampedDt * 1.6;
      const inner = this.targetReticle.getObjectByName('InnerReticle');
      if (inner) {
        inner.rotation.z -= clampedDt * 3.2;
      }
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

    // 5. Update expanding plasma shockwave rings
    for (const sw of this.shockwaves) {
      if (!sw.mesh.visible) continue;
      sw.age += clampedDt;
      if (sw.age >= sw.maxAge) {
        sw.mesh.visible = false;
      } else {
        const progress = sw.age / sw.maxAge;
        const scale = 1.0 + progress * (sw.maxScale - 1.0);
        sw.mesh.scale.set(scale, scale, 1);
        sw.mat.opacity = (1.0 - progress) * 0.78;
      }
    }

    // 6. Parallax ground, ceiling, trench plates & cyberpunk megastructure scroll
    this.gridGround.position.z = (this.gridGround.position.z - clampedDt * 3.8) % 2.0;
    this.ceilingGrid.position.z = this.gridGround.position.z;

    for (const tower of this.cityParallaxGroup.children) {
      tower.position.z -= clampedDt * 1.45;
      if (tower.position.z < -16) {
        tower.position.z += 58;
      }
    }

    for (const plate of this.trenchDeckGroup.children) {
      plate.position.z -= clampedDt * 3.8;
      if (plate.position.z < -12) {
        plate.position.z += 54;
      }
    }

    // 7. Multi-mode Camera Tracking + Impact Shake
    const targetPos = new THREE.Vector3(-6.8, 5.0 + (birdState.y - 5.0) * 0.28, -4.5);
    const lookTarget = new THREE.Vector3(0, 5.0 + (birdState.y - 5.0) * 0.15, 5.5);

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

    // 8. Render via HDR UnrealBloom EffectComposer or fast direct pipeline
    if (this.postProcessingEnabled) {
      this.composer.render();
    } else {
      this.renderer.render(this.scene, this.camera);
    }
  }

  private onWindowResize(): void {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.composer.setSize(window.innerWidth, window.innerHeight);
  }

  public dispose(): void {
    this.composer.dispose();
    this.renderer.dispose();
  }
}
