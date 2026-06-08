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

  // Course Navigation Variables
  courseWaypoints: THREE.Vector3[] = [];
  currentWaypointIndex: number = 0;
  courseLineMesh?: THREE.Line;

  // NEW: Manual Plotting Variables
  isEditingCourse: boolean = false;
  raycaster = new THREE.Raycaster();
  mouse = new THREE.Vector2();

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

    // Listen for mouse clicks on the 3D canvas
    this.renderer.domElement.addEventListener('pointerdown', (event) => this.onMapClick(event));

    window.addEventListener('resize', () => this.onWindowResize());
  }

  toggleCourseEditMode() {
    this.isEditingCourse = !this.isEditingCourse;
    
    // Disable map rotation while plotting so we don't accidentally drag the map!
    if (this.controls) {
      this.controls.enableRotate = !this.isEditingCourse;
    }
  }

  clearCourse() {
    this.courseWaypoints = [];
    if (this.courseLineMesh) {
      this.worldGroup.remove(this.courseLineMesh);
      this.courseLineMesh = undefined;
    }
    this.isShipMoving = false; // Stop the ship if route is cleared
  }

  onMapClick(event: PointerEvent) {
    if (!this.isEditingCourse || !this.waterMesh) return;
    if (event.button !== 0) return; // Only trigger on Left Click

    // 1. Calculate mouse position in normalized device coordinates (-1 to +1)
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    // 2. Shoot the Raycaster from the camera to the mouse
    this.raycaster.setFromCamera(this.mouse, this.camera);

    // 3. Check if the laser hit the water surface
    const intersects = this.raycaster.intersectObject(this.waterMesh);

    if (intersects.length > 0) {
      
      // --- THE FIX ---
      // Get the Global Universe hit point
      const hitPoint = intersects[0].point.clone();
      
      // Convert it to match the miniature scale of our worldGroup!
      this.worldGroup.worldToLocal(hitPoint);
      
      // Add the properly scaled point to our waypoints
      this.courseWaypoints.push(new THREE.Vector3(hitPoint.x, this.tide + 0.5, hitPoint.z));
      
      // Redraw the line!
      this.drawCourse();
    }
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
    this.drawCourse();
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

      // 1. AUTO-SCALER (Your original)
      const boundingBox = new THREE.Box3().setFromObject(model);
      const size = new THREE.Vector3();
      boundingBox.getSize(size);
      
      const originalLength = Math.max(size.x, size.z);
      if (originalLength === 0) return;

      const targetLength = 150; 
      const scaleFactor = targetLength / originalLength;
      model.scale.set(scaleFactor, scaleFactor, scaleFactor);

      // 2. YOUR ORIGINAL ROTATION (Restored)
      model.rotation.y = -Math.PI / 2 + Math.PI; 

      // 3. THE KEEL ANCHOR (This allows the Draft slider to work)
      const scaledBox = new THREE.Box3().setFromObject(model);
      model.position.y = Math.abs(scaledBox.min.y); 

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

    // 5. RESTORE YOUR ANTI-SQUASH! 
    // This cancels out the 10x vertical stretch from the worldGroup
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
    if (!this.isShipMoving || !this.shipMesh || !this.seabedGeometry || this.courseWaypoints.length === 0) return;

    const target = this.courseWaypoints[this.currentWaypointIndex];
    const dx = target.x - this.shipMesh.position.x;
    const dz = target.z - this.shipMesh.position.z;
    const distanceToTarget = Math.sqrt(dx * dx + dz * dz);

    if (distanceToTarget < 1.0) {
      this.currentWaypointIndex++;
      if (this.currentWaypointIndex >= this.courseWaypoints.length) {
        this.currentWaypointIndex = 1;
        this.shipMesh.position.x = this.courseWaypoints[0].x;
        this.shipMesh.position.z = this.courseWaypoints[0].z;
      }
      return;
    }

    // Heading calculation
    const targetHeading = Math.atan2(dx, dz);
    
    // Smoothly update rotation
    this.shipMesh.rotation.y = targetHeading;

    const metresPerSecond = this.speed * 0.514444;
    const moveDistance = metresPerSecond * this.simulationMultiplier * deltaSeconds;
    const actualMove = Math.min(moveDistance, distanceToTarget);

    // Movement
    this.shipMesh.position.x += Math.sin(targetHeading) * actualMove;
    this.shipMesh.position.z += Math.cos(targetHeading) * actualMove;
  }

  drawCourse() {
    if (this.courseLineMesh) {
      this.worldGroup.remove(this.courseLineMesh);
    }

    if (this.courseWaypoints.length < 2) return;

    const material = new THREE.LineDashedMaterial({ 
      color: 0xffff00, linewidth: 2, dashSize: 5, gapSize: 3 
    });
    const geometry = new THREE.BufferGeometry().setFromPoints(this.courseWaypoints);
    this.courseLineMesh = new THREE.Line(geometry, material);
    this.courseLineMesh.computeLineDistances(); 
    
    this.worldGroup.add(this.courseLineMesh);

    if (this.courseWaypoints.length === 2 && !this.isShipMoving) {
      this.currentWaypointIndex = 1;
      this.shipMesh.position.x = this.courseWaypoints[0].x;
      this.shipMesh.position.z = this.courseWaypoints[0].z;
      
      // Calculate angle and apply rotation
      const dx = this.courseWaypoints[1].x - this.courseWaypoints[0].x;
      const dz = this.courseWaypoints[1].z - this.courseWaypoints[0].z;
      
      // Use lookAt or atan2. If the ship is backwards, change the rotation Y directly:
      this.shipMesh.rotation.y = Math.atan2(dx, dz); 
    }
  }

  updateRealtimeUKC() {
    if (!this.seabedGeometry || !this.shipMesh) return;

    const positions = this.seabedGeometry.attributes['position'].array;

    // 1. The 150m Ship Footprint Scanner
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

    // 2. Realistic Squat Math & Keel Calculation
    this.currentSquat = 0.01 * Math.pow(this.speed, 2);
    const keelY = this.tide - this.restingDraft - this.currentSquat;

    // --- 3. THE PHYSICAL GROUNDING FIX ---
    let visualKeelY = keelY; 
    
    // If the math says we are underground, force the visual 3D ship to rest ON top of the rocks!
    if (keelY < shallowestUnderShip) {
        visualKeelY = shallowestUnderShip; 
    }

    // Move the 3D ship to the calculated physical depth
    this.shipMesh.position.y = visualKeelY;

    // --- 4. THE WATER LAYER FIX ---
    // Bring the water down to perfectly meet the ship's exact visual draft line
    if (this.waterMesh) {
      const depthExaggeration = 10; 
      this.waterMesh.position.y = visualKeelY + (this.restingDraft / depthExaggeration);
    }

    // --- 5. THE COURSE NAVIGATION LINE FIX ---
    // Keep the glowing path floating just above the water surface
    if ((this as any).courseLineMesh) {
      (this as any).courseLineMesh.position.y = (this.waterMesh ? this.waterMesh.position.y : this.tide) + 0.5;
    }

    // 6. Calculate Final UI Metrics
    this.currentDepth = this.tide - shallowestUnderShip;
    this.currentUkc = keelY - shallowestUnderShip;

    // 7. Update the Safety Status
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