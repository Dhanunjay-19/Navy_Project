import { Component, ElementRef, OnInit, ViewChild, PLATFORM_ID, Inject } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import * as THREE from 'three';
// @ts-ignore
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { HttpClient } from '@angular/common/http';
import * as Papa from 'papaparse';

interface RouteWaypoint {
  name: string;
  // Local Three.js coordinates used for rendering and movement
  x: number;
  z: number;
  // Original survey coordinates from uploaded XYZ file
  surveyX: number;
  surveyY: number;
}

@Component({
  selector: 'app-root',
  templateUrl: './app.html',
  styleUrls: ['./app.css'],
  standalone: true,                      // <-- Ensure this is here
  imports: [CommonModule, FormsModule]   // <-- 3. Add this line!
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
  simulationMultiplier: number = 10; // 10x visual speed so movement is visible on screen
  currentDepth: number = 0;
  currentSquat: number = 0;
  currentUkc: number = 0;
  ukcStatus: string = 'WAITING FOR SURVEY';
  shipRouteStartZ: number = -50;
  shipRouteEndZ: number = 50;
  seabedWidth: number = 0;
  seabedLength: number = 0;

  // Original uploaded survey coordinate boundaries
  originalMinX: number = 0;
  originalMaxX: number = 0;
  originalMinY: number = 0;
  originalMaxY: number = 0;
  surveyCenterX: number = 0;
  surveyCenterY: number = 0;
  totalSurveyPoints: number = 0;
  rawSurveyPoints: any[] = [];

  // Real-time original survey coordinate of ship
  currentShipSurveyX: number = 0;
  currentShipSurveyY: number = 0;

  // Route planner + waypoint navigation variables
  routeWaypoints: RouteWaypoint[] = [];
  currentWaypointIndex: number = 1;
  routeTotalDistance: number = 0;
  routeDistanceTravelled: number = 0;
  routeProgressPercent: number = 0;
  minRouteUkc: number = 0;
  routeRiskStatus: string = 'NO ROUTE';
  newWaypointSurveyX: number = 0;
  newWaypointSurveyY: number = 0;
  routeLine?: THREE.Line;

  private clock = new THREE.Clock();

  // Three.js Variables
  scene!: THREE.Scene;
  camera!: THREE.PerspectiveCamera;
  renderer!: THREE.WebGLRenderer;
  controls!: OrbitControls;

  // 3D Objects
  seabedGeometry!: THREE.PlaneGeometry;
  seabedMesh!: THREE.Mesh;
  waterMesh!: THREE.Mesh;
  shipMesh!: THREE.Group;

  constructor(
    @Inject(PLATFORM_ID) private platformId: Object,
    private http: HttpClient
  ) {}

  ngOnInit() {
    // 2. Only run Three.js if we are in the actual browser!
    // This prevents SSR (Server-Side Rendering) from crashing when looking for 'window'
    if (isPlatformBrowser(this.platformId)) {
      this.initThreeJS();
      this.buildShip();
      this.animate();
      console.log("🚢 3D Engine Ready. Please upload a survey file!");
    }
  }

  initThreeJS() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x87ceeb);

    // 1. Change the last number to 10000 (This is the Far Clipping Plane)
    // It allows the camera to see up to 10 kilometers away without the map vanishing!
    this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 10000);

    // 2. Bring the camera down close to the ship (X: 40, Y: 30, Z: 60)
    this.camera.position.set(40, 30, 60);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
    this.scene.add(ambientLight);

    const sunLight = new THREE.DirectionalLight(0xffffff, 1);
    sunLight.position.set(50, 100, 50);
    this.scene.add(sunLight);

    this.rendererContainer.nativeElement.appendChild(this.renderer.domElement);

    // 3. Upgrade OrbitControls
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(0, 0, 0); // Lock the camera focus exactly on the ship
    this.controls.maxDistance = 2000;  // Allow the user to zoom out up to 2000m
    this.controls.maxPolarAngle = Math.PI / 2 - 0.05; // Prevent the camera from going perfectly underground

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

      // Step runs row-by-row, saving browser memory
      step: (row: any) => {
        // BULLETPROOF FORMATTER:
        // No matter what PapaParse thinks the delimiter is, we force the row
        // into a single string, replace commas with spaces, and split cleanly by whitespace.
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

        // --- SAFETY SHIELD: PREVENT THE NaN CRASH ---
        if (rawPoints.length === 0) {
            console.error("❌ ERROR: 0 valid points found. The math engine has been stopped.");
            this.statusMessage = 'Could not read any valid x y z points from this file.';
            alert("Could not read any valid numbers from this file.");
            return; // Stops the code here so Three.js doesn't crash!
        }

        // If we have points, proceed to math!
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

 // --- THE MATH ENGINE ---
  processParsedData(rawPoints: any[]) {
    console.log('🧮 Calculating 3D Boundaries...');

    // 1. Highly optimized boundary calculation for Big Data
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

    // Store original XYZ survey coordinate details.
    // Three.js uses small local coordinates, but user must see real uploaded X/Y.
    this.originalMinX = minX;
    this.originalMaxX = maxX;
    this.originalMinY = minY;
    this.originalMaxY = maxY;
    this.surveyCenterX = (minX + maxX) / 2;
    this.surveyCenterY = (minY + maxY) / 2;
    this.totalSurveyPoints = rawPoints.length;
    this.rawSurveyPoints = rawPoints;
    this.newWaypointSurveyX = this.surveyCenterX;
    this.newWaypointSurveyY = this.surveyCenterY;

    console.log('Original survey X range:', this.originalMinX, this.originalMaxX);
    console.log('Original survey Y range:', this.originalMinY, this.originalMaxY);
    console.log('Survey center:', this.surveyCenterX, this.surveyCenterY);

    // ---------------------------------------------------------
    // 2. THE ULTIMATE AUTO-GRID CALCULATOR (This is the new part!)
    // ---------------------------------------------------------
    const maxSegments = 250; // The safe memory ceiling for WebGL
    const desiredResolution = 2.0; // Aim for 1 polygon every 2 meters

    let segmentsX = Math.round(realWidth / desiredResolution);
    let segmentsY = Math.round(realLength / desiredResolution);

    // Aspect Ratio Preservation
    const highestSegment = Math.max(segmentsX, segmentsY);

    if (highestSegment > maxSegments) {
      const scaleRatio = maxSegments / highestSegment;
      segmentsX = Math.round(segmentsX * scaleRatio);
      segmentsY = Math.round(segmentsY * scaleRatio);
    }

    // Safety floor for very tiny berths
    if (segmentsX < 25) segmentsX = 25;
    if (segmentsY < 25) segmentsY = 25;

    console.log(`📐 Smart Grid: ${segmentsX} x ${segmentsY} (Preserved true physical shape)`);

    const stepX = realWidth / segmentsX;
    const stepY = realLength / segmentsY;

    let finalGridData = [];

    // ---------------------------------------------------------
    // 3. 3D Interpolation (Building the Seabed)
    // ---------------------------------------------------------
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

    // 4. Send the data to your Three.js renderer
    this.buildSeabed(finalGridData, realWidth, realLength, segmentsX, segmentsY);
  }

  // --- 3. THE 3D RENDERERS ---
  buildSeabed(gridData: any[], width: number, length: number, segmentsX: number, segmentsY: number) {
    if (this.seabedMesh) {
      this.scene.remove(this.seabedMesh);
      this.seabedGeometry.dispose();
    }

    this.seabedGeometry = new THREE.PlaneGeometry(width, length, segmentsX, segmentsY);
    this.seabedGeometry.rotateX(-Math.PI / 2);

    const positions = this.seabedGeometry.attributes['position'].array;
    const colors = new Float32Array(positions.length);

    for (let i = 0; i < gridData.length; i++) {
      positions[i * 3 + 1] = gridData[i].z_depth;
      colors[i * 3] = 0;
      colors[i * 3 + 1] = 0;
      colors[i * 3 + 2] = 1;
    }

    this.seabedGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    this.seabedGeometry.computeVertexNormals();

    const material = new THREE.MeshStandardMaterial({
      vertexColors: true, wireframe: false, roughness: 0.8, metalness: 0.2
    });

    this.seabedMesh = new THREE.Mesh(this.seabedGeometry, material);
    this.scene.add(this.seabedMesh);

    // Prepare automatic waypoint route through the survey channel.
    this.seabedWidth = width;
    this.seabedLength = length;
    this.shipRouteStartZ = -length / 2 + 20;
    this.shipRouteEndZ = length / 2 - 20;
    this.createDefaultRoute();
    this.drawRoute();
    this.resetShipPosition();

    this.buildDynamicWater(width, length);
    this.statusMessage = `Rendered channel: ${segmentsX} x ${segmentsY} grid. Backend rows saved: ${this.uploadedRows || 'pending/not connected'}.`;
    console.log(`✅ Success! Rendered the channel.`);
  }

  buildDynamicWater(width: number, length: number) {
    if (this.waterMesh) {
      this.scene.remove(this.waterMesh);
    }

    const waterGeometry = new THREE.PlaneGeometry(width, length);
    waterGeometry.rotateX(-Math.PI / 2);

    const waterMaterial = new THREE.MeshPhysicalMaterial({
      color: 0x00aaff,
      transparent: true,
      opacity: 0.4,
      roughness: 0.1,
      metalness: 0.1,
      depthWrite: false
    });

    this.waterMesh = new THREE.Mesh(waterGeometry, waterMaterial);
    this.scene.add(this.waterMesh);
  }

  buildShip() {
    this.shipMesh = new THREE.Group();

    // 1. The Hull (Dark Grey)
    const hullGeometry = new THREE.BoxGeometry(12, 10, 30);
    const hullMaterial = new THREE.MeshStandardMaterial({ color: 0x333333 });
    const hull = new THREE.Mesh(hullGeometry, hullMaterial);
    hull.position.y = 5; // Anchor at the absolute bottom
    this.shipMesh.add(hull);

    // 2. The Cabin (White)
    const cabinGeometry = new THREE.BoxGeometry(10, 6, 8);
    const cabinMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff });
    const cabin = new THREE.Mesh(cabinGeometry, cabinMaterial);
    cabin.position.set(0, 13, -8);
    this.shipMesh.add(cabin);

    // 3. The Funnel (Red)
    const funnelGeometry = new THREE.CylinderGeometry(1.5, 1.5, 6, 16);
    const funnelMaterial = new THREE.MeshStandardMaterial({ color: 0xcc0000 });
    const funnel = new THREE.Mesh(funnelGeometry, funnelMaterial);
    funnel.position.set(0, 15, -13);
    this.shipMesh.add(funnel);

    this.scene.add(this.shipMesh);
  }

  // --- Coordinate conversion helpers ---
  // Uploaded survey file uses very large real-world X/Y values.
  // Three.js works better with small local X/Z values centered around 0.
  // localX = surveyX - centerX
  // localZ = centerY - surveyY  (Y is mapped into Z axis)
  surveyToLocalX(surveyX: number): number {
    return surveyX - this.surveyCenterX;
  }

  surveyToLocalZ(surveyY: number): number {
    return this.surveyCenterY - surveyY;
  }

  localToSurveyX(localX: number): number {
    return localX + this.surveyCenterX;
  }

  localToSurveyY(localZ: number): number {
    return this.surveyCenterY - localZ;
  }

  makeWaypoint(name: string, surveyX: number, surveyY: number): RouteWaypoint {
    return {
      name,
      surveyX,
      surveyY,
      x: this.surveyToLocalX(surveyX),
      z: this.surveyToLocalZ(surveyY)
    };
  }

  findDeepestPointNearY(targetY: number): any {
    if (!this.rawSurveyPoints.length) {
      return { x: this.surveyCenterX, y: targetY, z: 0 };
    }

    const yTolerance = Math.max((this.originalMaxY - this.originalMinY) * 0.08, 5);
    let candidates = this.rawSurveyPoints.filter(p => Math.abs(p.y - targetY) <= yTolerance);

    // Fallback: if no point found in the band, use the nearest Y points.
    if (candidates.length === 0) {
      candidates = [...this.rawSurveyPoints]
        .sort((a, b) => Math.abs(a.y - targetY) - Math.abs(b.y - targetY))
        .slice(0, 25);
    }

    // In your file Z is depth as positive metres. Higher Z = deeper and safer.
    return candidates.reduce((deepest, p) => p.z > deepest.z ? p : deepest, candidates[0]);
  }

  // --- 4. THE ROUTE PLANNER + PHYSICS + NAVIGATION ENGINE ---
  createDefaultRoute() {
    if (!this.seabedWidth || !this.seabedLength || !this.rawSurveyPoints.length) return;

    // Build a route from the uploaded survey data itself.
    // We sample 4 Y-bands from channel entry to berth and choose the deepest point in each band.
    // This is more realistic than hard-coded random local X/Z values.
    const targetYs = [
      this.originalMaxY - (this.originalMaxY - this.originalMinY) * 0.08,
      this.originalMaxY - (this.originalMaxY - this.originalMinY) * 0.35,
      this.originalMaxY - (this.originalMaxY - this.originalMinY) * 0.65,
      this.originalMinY + (this.originalMaxY - this.originalMinY) * 0.08
    ];

    const p1 = this.findDeepestPointNearY(targetYs[0]);
    const p2 = this.findDeepestPointNearY(targetYs[1]);
    const p3 = this.findDeepestPointNearY(targetYs[2]);
    const p4 = this.findDeepestPointNearY(targetYs[3]);

    this.routeWaypoints = [
      this.makeWaypoint('Channel Entry', p1.x, p1.y),
      this.makeWaypoint('Approach Turn', p2.x, p2.y),
      this.makeWaypoint('Mid Channel', p3.x, p3.y),
      this.makeWaypoint('Berth Approach', p4.x, p4.y)
    ];

    this.currentWaypointIndex = 1;
    this.calculateRouteDistance();
    this.updateRouteRisk();
  }

  addWaypoint() {
    if (!this.seabedGeometry) {
      alert('Please upload survey data before adding waypoints.');
      return;
    }

    const surveyX = Number(this.newWaypointSurveyX);
    const surveyY = Number(this.newWaypointSurveyY);

    if (surveyX < this.originalMinX || surveyX > this.originalMaxX || surveyY < this.originalMinY || surveyY > this.originalMaxY) {
      alert('Waypoint is outside uploaded survey boundary. Please enter X/Y inside the survey range.');
      return;
    }

    this.routeWaypoints.push(
      this.makeWaypoint(`Waypoint ${this.routeWaypoints.length + 1}`, surveyX, surveyY)
    );

    this.calculateRouteDistance();
    this.drawRoute();
    this.updateRouteRisk();
  }

  removeWaypoint(index: number) {
    if (this.routeWaypoints.length <= 2) {
      alert('A route needs at least 2 waypoints.');
      return;
    }

    this.routeWaypoints.splice(index, 1);
    this.currentWaypointIndex = Math.min(this.currentWaypointIndex, this.routeWaypoints.length - 1);
    this.calculateRouteDistance();
    this.drawRoute();
    this.resetShipPosition();
    this.updateRouteRisk();
  }

  resetDefaultRoute() {
    this.createDefaultRoute();
    this.drawRoute();
    this.resetShipPosition();
  }

  calculateRouteDistance() {
    this.routeTotalDistance = 0;

    for (let i = 1; i < this.routeWaypoints.length; i++) {
      const previous = this.routeWaypoints[i - 1];
      const current = this.routeWaypoints[i];
      const dx = current.x - previous.x;
      const dz = current.z - previous.z;
      this.routeTotalDistance += Math.sqrt(dx * dx + dz * dz);
    }
  }

  drawRoute() {
    if (!this.scene || this.routeWaypoints.length < 2) return;

    if (this.routeLine) {
      this.scene.remove(this.routeLine);
      this.routeLine.geometry.dispose();
    }

    const routePoints = this.routeWaypoints.map(wp => new THREE.Vector3(wp.x, 0.25, wp.z));
    const routeGeometry = new THREE.BufferGeometry().setFromPoints(routePoints);
    const routeMaterial = new THREE.LineBasicMaterial({ color: 0x00ff00, linewidth: 3 });
    this.routeLine = new THREE.Line(routeGeometry, routeMaterial);
    this.routeLine.position.y = this.tide;
    this.scene.add(this.routeLine);
  }

  toggleShipMovement() {
    if (!this.seabedGeometry) {
      alert('Please upload survey data first.');
      return;
    }
    if (this.routeWaypoints.length < 2) {
      alert('Please create at least 2 waypoints.');
      return;
    }
    this.isShipMoving = !this.isShipMoving;
  }

  resetShipPosition() {
    if (!this.shipMesh || this.routeWaypoints.length === 0) return;

    const firstWaypoint = this.routeWaypoints[0];
    this.shipMesh.position.x = firstWaypoint.x;
    this.shipMesh.position.z = firstWaypoint.z;
    this.currentWaypointIndex = 1;
    this.routeDistanceTravelled = 0;
    this.routeProgressPercent = 0;
    this.rotateShipTowardNextWaypoint();
    this.updateRealtimeUKC();
  }

  rotateShipTowardNextWaypoint() {
    if (!this.shipMesh || this.currentWaypointIndex >= this.routeWaypoints.length) return;

    const target = this.routeWaypoints[this.currentWaypointIndex];
    const dx = target.x - this.shipMesh.position.x;
    const dz = target.z - this.shipMesh.position.z;
    this.shipMesh.rotation.y = Math.atan2(dx, dz);
  }

  updateShipMovement(deltaSeconds: number) {
    if (!this.isShipMoving || !this.shipMesh || !this.seabedGeometry || this.routeWaypoints.length < 2) return;

    if (this.currentWaypointIndex >= this.routeWaypoints.length) {
      this.isShipMoving = false;
      this.ukcStatus = 'ROUTE COMPLETED';
      return;
    }

    const target = this.routeWaypoints[this.currentWaypointIndex];
    const dx = target.x - this.shipMesh.position.x;
    const dz = target.z - this.shipMesh.position.z;
    const distanceToTarget = Math.sqrt(dx * dx + dz * dz);

    if (distanceToTarget < 0.1) {
      this.currentWaypointIndex++;
      this.rotateShipTowardNextWaypoint();
      return;
    }

    // Convert knots to metres/second, then multiply for visible simulation speed.
    const metresPerSecond = this.speed * 0.514444;
    const moveDistance = metresPerSecond * this.simulationMultiplier * deltaSeconds;
    const actualMove = Math.min(moveDistance, distanceToTarget);

    this.shipMesh.position.x += (dx / distanceToTarget) * actualMove;
    this.shipMesh.position.z += (dz / distanceToTarget) * actualMove;
    this.routeDistanceTravelled += actualMove;

    if (this.routeTotalDistance > 0) {
      this.routeProgressPercent = Math.min(100, (this.routeDistanceTravelled / this.routeTotalDistance) * 100);
    }

    this.rotateShipTowardNextWaypoint();
  }

  getSeabedYAtPosition(shipX: number, shipZ: number): number {
    if (!this.seabedGeometry) return 0;

    const positions = this.seabedGeometry.attributes['position'].array;
    const shipHalfWidth = 8;
    const shipHalfLength = 18;

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

      if (dx <= shipHalfWidth && dz <= shipHalfLength && vertexY > shallowestUnderShip) {
        shallowestUnderShip = vertexY;
      }
    }

    return shallowestUnderShip === Number.NEGATIVE_INFINITY ? nearestSeabedY : shallowestUnderShip;
  }

  updateRouteRisk() {
    if (!this.seabedGeometry || this.routeWaypoints.length === 0) return;

    const squat = 0.06 * Math.pow(this.speed, 2);
    const keelY = this.tide - this.restingDraft - squat;
    let minimumUkc = Number.POSITIVE_INFINITY;

    for (const waypoint of this.routeWaypoints) {
      const seabedY = this.getSeabedYAtPosition(waypoint.x, waypoint.z);
      const ukc = keelY - seabedY;
      if (ukc < minimumUkc) {
        minimumUkc = ukc;
      }
    }

    this.minRouteUkc = minimumUkc === Number.POSITIVE_INFINITY ? 0 : minimumUkc;

    if (this.minRouteUkc < 0) {
      this.routeRiskStatus = 'CRITICAL ROUTE';
    } else if (this.minRouteUkc < this.safetyThreshold) {
      this.routeRiskStatus = 'HIGH RISK ROUTE';
    } else {
      this.routeRiskStatus = 'ROUTE SAFE';
    }
  }

  updateRealtimeUKC() {
    if (!this.seabedGeometry || !this.shipMesh) return;

    const shallowestUnderShip = this.getSeabedYAtPosition(this.shipMesh.position.x, this.shipMesh.position.z);

    // Show real uploaded survey coordinates for the current ship position.
    this.currentShipSurveyX = this.localToSurveyX(this.shipMesh.position.x);
    this.currentShipSurveyY = this.localToSurveyY(this.shipMesh.position.z);

    this.currentSquat = 0.06 * Math.pow(this.speed, 2);
    const keelY = this.tide - this.restingDraft - this.currentSquat;

    // Move water, route line and ship vertically based on tide, draft and squat.
    if (this.waterMesh) {
      this.waterMesh.position.y = this.tide;
    }
    if (this.routeLine) {
      this.routeLine.position.y = this.tide + 0.25;
    }
    this.shipMesh.position.y = keelY;

    this.currentDepth = this.tide - shallowestUnderShip;
    this.currentUkc = keelY - shallowestUnderShip;

    if (this.currentUkc < 0) {
      this.ukcStatus = 'GROUNDING / TOUCHING SEABED';
    } else if (this.currentUkc < this.safetyThreshold) {
      this.ukcStatus = 'UNSAFE LOW UKC';
    } else {
      this.ukcStatus = 'SAFE';
    }

    this.updateRouteRisk();
  }

  checkUKC() {
    if (!this.seabedGeometry) return;

    const positions = this.seabedGeometry.attributes['position'].array;
    const colors = this.seabedGeometry.attributes['color'].array;

    // Whole-channel safety colouring using current tide/draft/speed.
    const dynamicSquat = 0.06 * Math.pow(this.speed, 2);
    const keelY = this.tide - this.restingDraft - dynamicSquat;

    for (let i = 0; i < positions.length / 3; i++) {
        const vertexY = positions[i * 3 + 1];
        const clearance = keelY - vertexY;

        if (clearance < this.safetyThreshold) {
            colors[i * 3] = 1;     // Red = unsafe
            colors[i * 3 + 1] = 0;
            colors[i * 3 + 2] = 0;
        } else {
            colors[i * 3] = 0;     // Blue = safe
            colors[i * 3 + 1] = 0;
            colors[i * 3 + 2] = 1;
        }
    }
    this.seabedGeometry.attributes['color'].needsUpdate = true;
  }

  animate = () => {
    requestAnimationFrame(this.animate);

    const deltaSeconds = this.clock.getDelta();
    this.updateShipMovement(deltaSeconds);
    this.updateRealtimeUKC();
    this.checkUKC();

    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }
}
