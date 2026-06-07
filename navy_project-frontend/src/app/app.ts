import { Component, ElementRef, OnInit, ViewChild, PLATFORM_ID, Inject } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common'; 
import { FormsModule } from '@angular/forms';   
import * as THREE from 'three';
// @ts-ignore
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { HttpClient } from '@angular/common/http';
import * as Papa from 'papaparse';

// @ts-ignore
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
// @ts-ignore
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader'; // <-- Add this!

@Component({
  selector: 'app-root',
  templateUrl: './app.html',
  styleUrls: ['./app.css'],
  standalone: true,                      
  imports: [CommonModule, FormsModule]   
})
export class App implements OnInit {
  @ViewChild('rendererContainer', { static: true }) rendererContainer!: ElementRef;

  // UI Variables
  tide: number = 2.0;
  speed: number = 8;
  safetyThreshold: number = 1.0;
  restingDraft: number = 10.0;
  statusMessage: string = 'Upload .xyz survey data to render the seabed.';
  uploadedRows: number = 0;

  // Ship navigation + real-time UKC variables
  isShipMoving: boolean = false;
  simulationMultiplier: number = 10; 
  currentDepth: number = 0;
  currentSquat: number = 0;
  currentUkc: number = 0;
  ukcStatus: string = 'WAITING FOR SURVEY';
  shipRouteStartZ: number = -50;
  shipRouteEndZ: number = 50;
  seabedWidth: number = 0;
  seabedLength: number = 0;
  
  // Timer replacement for deprecated THREE.Clock
  private previousTime: number = 0;

  // Three.js Variables
  scene!: THREE.Scene;
  camera!: THREE.PerspectiveCamera;
  renderer!: THREE.WebGLRenderer;
  controls!: OrbitControls;
  
  // 3D Objects
  worldGroup!: THREE.Group; // <-- The Sandbox Container!
  seabedGeometry!: THREE.PlaneGeometry;
  seabedMesh!: THREE.Mesh;
  waterMesh!: THREE.Mesh;
  shipMesh!: THREE.Group; 
  
  // Color Tracking
  mapShallowest: number = 0;
  mapDeepest: number = -20;

  constructor(
    @Inject(PLATFORM_ID) private platformId: Object,
    private http: HttpClient
  ) {}

  ngOnInit() {
    if (isPlatformBrowser(this.platformId)) {
      this.initThreeJS();
      this.buildShip(); 
      // Initialize the animation loop correctly with a starting time of 0
      requestAnimationFrame(this.animate);
      console.log("🚢 3D Engine Ready. Please upload a survey file!");
    }
  }

  initThreeJS() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x87ceeb);

    // Create the master container for Auto-Scaling
    this.worldGroup = new THREE.Group();
    this.scene.add(this.worldGroup);

    this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 10000);
    this.camera.position.set(40, 30, 60); 

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
    this.scene.add(ambientLight);

    const sunLight = new THREE.DirectionalLight(0xffffff, 1);
    sunLight.position.set(50, 100, 50);
    this.scene.add(sunLight);

    this.rendererContainer.nativeElement.appendChild(this.renderer.domElement);
    
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(0, 0, 0); 
    this.controls.maxDistance = 2000;  
    //this.controls.maxPolarAngle = Math.PI / 2 - 0.05; 

    window.addEventListener('resize', () => this.onWindowResize());
  }

  onWindowResize() {
    if (!this.camera || !this.renderer) {
      return;
    }
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  onFileSelected(event: any) {
    const file = event.target.files[0];
    if (!file) return;

    this.statusMessage = `Reading ${file.name}...`;
    this.uploadSurveyToBackend(file);
    console.log(`🚀 PapaParse is reading ${file.name}...`);
    let rawPoints: any[] = [];

    Papa.parse(file, {
      skipEmptyLines: true,
      step: (row: any) => {
        const rawLine = row.data.join(" ").trim().replace(/,/g, ' ');
        const parts = rawLine.split(/\s+/);

        if (parts.length >= 3) {
          const x = parseFloat(parts[0]);
          const y = parseFloat(parts[1]);
          const z = parseFloat(parts[2]);
          
          if (!isNaN(x) && !isNaN(y) && !isNaN(z)) {
             rawPoints.push({ x, y, z });
          }
        }
      },
      complete: () => {
        console.log(`✅ PapaParse finished! Found ${rawPoints.length} valid 3D points.`);
        if (rawPoints.length === 0) {
            console.error("❌ ERROR: 0 valid points found.");
            this.statusMessage = 'Could not read any valid x y z points from this file.';
            alert("Could not read any valid numbers from this file.");
            return; 
        }
        
        this.statusMessage = `Parsed ${rawPoints.length} points. Building 3D model...`;
        this.processParsedData(rawPoints);
      },
      error: (err) => {
        this.statusMessage = 'File parsing failed. Please check the file format.';
        console.error("❌ PapaParse Error:", err);
      }
    });
  }

  uploadSurveyToBackend(file: File) {
    const formData = new FormData();
    formData.append('file', file);

    this.http.post<{ message: string; insertedRows: number }>('http://localhost:8080/api/upload-survey', formData)
      .subscribe({
        next: (response) => {
          this.uploadedRows = response.insertedRows;
          console.log(`✅ Backend saved ${response.insertedRows} rows.`);
        },
        error: (error) => {
          console.warn('⚠️ Backend upload failed. 3D browser rendering can still continue.', error);
        }
      });
  }

  processParsedData(rawPoints: any[]) {
    console.log('🧮 Calculating 3D Boundaries...');

    let minX = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;

    for (let i = 0; i < rawPoints.length; i++) {
      const p = rawPoints[i];
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }

    const realWidth = maxX - minX;
    const realLength = maxY - minY;

    const maxSegments = 100; 
    const desiredResolution = 2.0; 

    let segmentsX = Math.round(realWidth / desiredResolution);
    let segmentsY = Math.round(realLength / desiredResolution);

    const highestSegment = Math.max(segmentsX, segmentsY);
    
    if (highestSegment > maxSegments) {
      const scaleRatio = maxSegments / highestSegment;
      segmentsX = Math.round(segmentsX * scaleRatio);
      segmentsY = Math.round(segmentsY * scaleRatio);
    }

    if (segmentsX < 25) segmentsX = 25; 
    if (segmentsY < 25) segmentsY = 25;

    console.log(`📐 Smart Grid: ${segmentsX} x ${segmentsY}`);

    const stepX = realWidth / segmentsX;
    const stepY = realLength / segmentsY;

    let finalGridData = [];

    console.log('⚙️ Running 3D Interpolation...');
    for (let j = segmentsY; j >= 0; j--) {
      for (let i = 0; i <= segmentsX; i++) {
        let gridX = minX + (i * stepX);
        let gridY = minY + (j * stepY);

        let numerator = 0;
        let denominator = 0;

        for (let p of rawPoints) {
          let distance = Math.sqrt(Math.pow(gridX - p.x, 2) + Math.pow(gridY - p.y, 2));
          if (distance === 0) distance = 0.001; 
          
          let weight = 1 / Math.pow(distance, 2);
          numerator += weight * p.z;
          denominator += weight;
        }

        let calculatedZ = numerator / denominator;
        finalGridData.push({ z_depth: -calculatedZ });
      }
    }

    this.buildSeabed(finalGridData, realWidth, realLength, segmentsX, segmentsY);
  }

  buildSeabed(gridData: any[], width: number, length: number, segmentsX: number, segmentsY: number) {
    if (this.seabedMesh) {
      this.worldGroup.remove(this.seabedMesh);
      this.seabedGeometry.dispose();
    }

    // 1. Find the deepest and shallowest points for the color gradient
    this.mapShallowest = Number.NEGATIVE_INFINITY;
    this.mapDeepest = Number.POSITIVE_INFINITY;
    
    for (let p of gridData) {
      if (p.z_depth > this.mapShallowest) this.mapShallowest = p.z_depth;
      if (p.z_depth < this.mapDeepest) this.mapDeepest = p.z_depth;
    }

    this.seabedGeometry = new THREE.PlaneGeometry(width, length, segmentsX, segmentsY);
    this.seabedGeometry.rotateX(-Math.PI / 2); 
    
    const positions = this.seabedGeometry.attributes['position'].array;
    const colors = new Float32Array(positions.length);

    // 2. Define our colors (Sand vs Dark Ocean)
    const deepColor = new THREE.Color(0x001133);   
    const shallowColor = new THREE.Color(0xd2b48c); 

    for (let i = 0; i < gridData.length; i++) {
      const z = gridData[i].z_depth;
      positions[i * 3 + 1] = z; 

      const depthRatio = (z - this.mapDeepest) / (this.mapShallowest - this.mapDeepest);
      const pointColor = deepColor.clone().lerp(shallowColor, depthRatio);

      colors[i * 3] = pointColor.r; 
      colors[i * 3 + 1] = pointColor.g; 
      colors[i * 3 + 2] = pointColor.b; 
    }

    this.seabedGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    this.seabedGeometry.computeVertexNormals();
    
    const material = new THREE.MeshStandardMaterial({ 
      vertexColors: true, roughness: 0.9, metalness: 0.0, flatShading: true 
    });
    
    this.seabedMesh = new THREE.Mesh(this.seabedGeometry, material);
    this.worldGroup.add(this.seabedMesh); // Add to Group!

    // Add Wireframe Overlay
    const wireframeMaterial = new THREE.MeshBasicMaterial({
      color: 0xffffff, wireframe: true, transparent: true, opacity: 0.1
    });
    const wireframeMesh = new THREE.Mesh(this.seabedGeometry, wireframeMaterial);
    this.seabedMesh.add(wireframeMesh); 

    this.seabedWidth = width;
    this.seabedLength = length;
    this.shipRouteStartZ = -length / 2 + 85;
    this.shipRouteEndZ = length / 2 - 85;
    this.resetShipPosition();

    this.buildDynamicWater(width, length);

    const isMiniatureMode = true; // Toggle this to 'false' for Real-Scale!

    if (isMiniatureMode) {
        const maxVisualSize = 150; 
        const shrinkScale = maxVisualSize / Math.max(width, length);
        const depthExaggeration = 10; 
        this.worldGroup.scale.set(shrinkScale, shrinkScale * depthExaggeration, shrinkScale);
    } else {
        // Real-Scale: No shrinking, no depth exaggeration
        this.worldGroup.scale.set(1, 1, 1); 
    }

    this.statusMessage = `Rendered 3D channel: ${segmentsX} x ${segmentsY} grid.`;
  }

  buildDynamicWater(width: number, length: number) {
    if (this.waterMesh) {
      this.worldGroup.remove(this.waterMesh);
    }
    
    const waterGeometry = new THREE.PlaneGeometry(width, length);
    waterGeometry.rotateX(-Math.PI / 2);

    const waterMaterial = new THREE.MeshPhysicalMaterial({
      color: 0x00aaff, transparent: true, opacity: 0.4, roughness: 0.1, metalness: 0.1, depthWrite: false    
    });

    this.waterMesh = new THREE.Mesh(waterGeometry, waterMaterial);
    this.worldGroup.add(this.waterMesh); // Add to Group!
  }

 buildShip() {
    this.shipMesh = new THREE.Group();

    // @ts-ignore
    const loader = new GLTFLoader();
    
    loader.load('/ship.glb', (gltf: any) => {
      const model = gltf.scene;

      // 1. AUTO-SCALER
      const boundingBox = new THREE.Box3().setFromObject(model);
      const size = new THREE.Vector3();
      boundingBox.getSize(size);
      
      const originalLength = Math.max(size.x, size.z);
      if (originalLength === 0) return;

      const targetLength = 150; 
      const scaleFactor = targetLength / originalLength;
      model.scale.set(scaleFactor, scaleFactor, scaleFactor);

      // 2. ROTATION FIX
      model.rotation.y = -Math.PI / 2; 

      // 3. THE PERFECT WATERLINE FIX
      const scaledBox = new THREE.Box3().setFromObject(model);
      const modelHeight = scaledBox.max.y - scaledBox.min.y;
      
      // We lift the absolute bottom of the ship to 0, then drop it by 15% into the water.
      // (No crazy *10 multiplication this time!)
      model.position.y = Math.abs(scaledBox.min.y) - (modelHeight * 0.15); 

      // 4. MATERIAL FIX
      model.traverse((child: any) => {
        if (child.isMesh) {
          child.castShadow = true;
          child.receiveShadow = true;
          if (child.material) {
             child.material.side = THREE.DoubleSide; 
             if (child.material.metalness !== undefined) {
                 child.material.metalness = 0.1; 
                 child.material.roughness = 0.6; 
             }
             child.material.needsUpdate = true;
          }
        }
      });

      this.shipMesh.add(model);
    });

    // 5. UN-SQUISH THE SHIP
    const depthExaggeration = 10; 
    this.shipMesh.scale.set(1, 1 / depthExaggeration, 1);
    this.worldGroup.add(this.shipMesh);
  }

  toggleShipMovement() {
    if (!this.seabedGeometry) {
      alert('Please upload survey data first.');
      return;
    }
    this.isShipMoving = !this.isShipMoving;
  }

  resetShipPosition() {
    if (!this.shipMesh) return;
    this.shipMesh.position.x = 0;
    this.shipMesh.position.z = this.shipRouteStartZ;
    this.shipMesh.rotation.y = 0;
    this.updateRealtimeUKC();
  }

  updateShipMovement(deltaSeconds: number) {
    if (!this.isShipMoving || !this.shipMesh || !this.seabedGeometry) return;

    const metresPerSecond = this.speed * 0.514444;
    const moveDistance = metresPerSecond * this.simulationMultiplier * deltaSeconds;

    this.shipMesh.position.z += moveDistance;

    if (this.shipMesh.position.z > this.shipRouteEndZ) {
      this.shipMesh.position.z = this.shipRouteStartZ;
    }
  }

  updateRealtimeUKC() {

    
    if (!this.seabedGeometry || !this.shipMesh) return;

    const positions = this.seabedGeometry.attributes['position'].array;

    // 1. The 150m Ship Footprint!
    const shipHalfWidth = 25; 
    const shipHalfLength = 85; 
    const shipX = this.shipMesh.position.x;
    const shipZ = this.shipMesh.position.z;

    let shallowestUnderShip = Number.NEGATIVE_INFINITY;
    let nearestDistance = Number.POSITIVE_INFINITY;
    let nearestSeabedY = 0;

    for (let i = 0; i < positions.length / 3; i++) {
      const vertexX = positions[i * 3];
      const vertexY = positions[i * 3 + 1];
      const vertexZ = positions[i * 3 + 2];

      const dx = Math.abs(vertexX - shipX);
      const dz = Math.abs(vertexZ - shipZ);

      const distance = Math.sqrt((dx * dx) + (dz * dz));
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestSeabedY = vertexY;
      }

      if (dx <= shipHalfWidth && dz <= shipHalfLength) {
        if (vertexY > shallowestUnderShip) {
          shallowestUnderShip = vertexY;
        }
      }
    }

    if (shallowestUnderShip === Number.NEGATIVE_INFINITY) {
      shallowestUnderShip = nearestSeabedY;
    }

    // 2. Realistic Squat Math
    this.currentSquat = 0.01 * Math.pow(this.speed, 2);
    const keelY = this.tide - this.restingDraft - this.currentSquat;

    if (this.waterMesh) {
      this.waterMesh.position.y = this.tide;
    }
    
    // 3. Pin the master container EXACTLY to the water line!
    // (It sinks slightly based on squat physics)
    this.shipMesh.position.y = this.tide - this.currentSquat;

    this.currentDepth = this.tide - shallowestUnderShip;
    this.currentUkc = keelY - shallowestUnderShip;

    console.log("====== UKC DEBUG ======");
console.log("Tide:", this.tide);
console.log("Draft:", this.restingDraft);
console.log("Squat:", this.currentSquat);
console.log("KeelY:", keelY);
console.log("SeabedY:", shallowestUnderShip);
console.log("Depth:", this.currentDepth);
console.log("UKC:", this.currentUkc);

    if (this.currentUkc < 0) {
      this.ukcStatus = 'GROUNDING / TOUCHING SEABED';
    } else if (this.currentUkc < this.safetyThreshold) {
      this.ukcStatus = 'UNSAFE LOW UKC';
    } else {
      this.ukcStatus = 'SAFE';
    }
  }

 checkUKC() {
    if (!this.seabedGeometry) return;

    const positions = this.seabedGeometry.attributes['position'].array;
    const colors = this.seabedGeometry.attributes['color'].array;

    const dynamicSquat = 0.01 * Math.pow(this.speed, 2);
    const keelY = this.tide - this.restingDraft - dynamicSquat;

    // Define the ship's footprint (matching our physics)
    const shipHalfWidth = 25; 
    const shipHalfLength = 85; 
    const shipX = this.shipMesh.position.x;
    const shipZ = this.shipMesh.position.z;

    for (let i = 0; i < positions.length / 3; i++) {
        const vertexX = positions[i * 3];
        const vertexZ = positions[i * 3 + 2];
        const vertexY = positions[i * 3 + 1];

        // Is this part of the seabed under the ship?
        const isUnderShip = (Math.abs(vertexX - shipX) <= shipHalfWidth && 
                             Math.abs(vertexZ - shipZ) <= shipHalfLength);

        // Does the ship's keel hit this point?
        const isTouching = isUnderShip && (keelY <= vertexY);

        if (isTouching) {
            // TURN RED: This is where you are hitting the ground!
            colors[i * 3] = 1.0;     
            colors[i * 3 + 1] = 0.0;
            colors[i * 3 + 2] = 0.0;
        } else if (isUnderShip && (keelY - vertexY < this.safetyThreshold)) {
            // TURN YELLOW: Dangerously low clearance
            colors[i * 3] = 1.0;     
            colors[i * 3 + 1] = 1.0;
            colors[i * 3 + 2] = 0.0;
        } else {
            // Restore natural color
            const depthRatio = (vertexY - this.mapDeepest) / (this.mapShallowest - this.mapDeepest);
            const pointColor = new THREE.Color(0x001133).lerp(new THREE.Color(0xd2b48c), depthRatio);
            colors[i * 3] = pointColor.r;     
            colors[i * 3 + 1] = pointColor.g;
            colors[i * 3 + 2] = pointColor.b;
        }
    }
    this.seabedGeometry.attributes['color'].needsUpdate = true;
  }

  animate = (time: number) => {
    requestAnimationFrame(this.animate);

    const deltaSeconds = this.previousTime === 0 ? 0 : (time - this.previousTime) / 1000;
    this.previousTime = time;

    this.updateShipMovement(deltaSeconds);
    this.updateRealtimeUKC();
    this.checkUKC();

    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }
}