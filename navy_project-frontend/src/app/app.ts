// import { Component, ElementRef, ViewChild, afterNextRender } from '@angular/core'; // 1. Import afterNextRender
// import { HttpClient } from '@angular/common/http';
// import * as THREE from 'three';
// import {FormsModule} from '@angular/forms';
// import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
// // @ts-ignore
// import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// @Component({
//   selector: 'app-root',
//   templateUrl: './app.html',
//   imports: [
//     FormsModule
//   ],
//   styleUrls: ['./app.css']
// })
// export class App {
//   @ViewChild('rendererContainer', { static: false }) rendererContainer!: ElementRef; // Change static to false

//   // UI State Variables
//   tide: number = 0;
//   speed: number = 5;
//   safetyThreshold: number = 1.5;
//   restingDraft: number = 10;

//   // Three.js variables
//   scene!: THREE.Scene;
//   camera!: THREE.PerspectiveCamera;
//   renderer!: THREE.WebGLRenderer;
//   seabedGeometry!: THREE.PlaneGeometry;
//   controls!: OrbitControls; // <-- Add this line
//   shipMesh!: THREE.Mesh;
//   waterMesh!: THREE.Mesh;
//   seabedMesh!: THREE.Mesh; // <-- Add this to track the seabed object
 

//   constructor(private http: HttpClient) {
//     // 2. Wrap all browser-only execution inside afterNextRender in the constructor
//     afterNextRender(() => {
//       this.initThreeJS();

//       // Fetch data from Spring Boot Backend
//       this.http.get<any[]>('http://localhost:8080/api/bathymetry').subscribe({
//         next: (data) => {
//           this.buildSeabed(data);
//           this.animate(); // Start loop inside browser context
//           this.buildShip();
//           this.buildWater();
//         },
//         error: (err) => console.error('Backend connection failed:', err)
//       });
//     });
//   }

//   // Remove ngOnInit completely since we are using afterNextRender now

//   initThreeJS() {
//     this.scene = new THREE.Scene();
//     this.scene.background = new THREE.Color(0x87ceeb); // Sky blue background

//     // safe to read window.innerWidth here!
//     this.camera = new THREE.PerspectiveCamera(75, window.innerWidth * 0.75 / window.innerHeight, 0.1, 1000);
//     this.camera.position.set(10, 15, 30);
//     this.camera.lookAt(10, 0, 10);

//     this.renderer = new THREE.WebGLRenderer({ antialias: true });
//     this.renderer.setSize(window.innerWidth * 0.75, window.innerHeight);
//     // Add ambient daylight
//     const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
//     this.scene.add(ambientLight);

//     // Add a directional sun to create shadows on the underwater trenches
//     const sunLight = new THREE.DirectionalLight(0xffffff, 1);
//     sunLight.position.set(50, 100, 50);
//     this.scene.add(sunLight);
//     this.rendererContainer.nativeElement.appendChild(this.renderer.domElement);

//     this.controls = new OrbitControls(this.camera, this.renderer.domElement);
//     this.controls.enableDamping = true; // Makes the rotation smooth and heavy
//     this.controls.dampingFactor = 0.05;
//   }

//   // buildSeabed(data: any[]) {
//   //   this.seabedGeometry = new THREE.PlaneGeometry(20, 20, 2, 2);
//   //   this.seabedGeometry.rotateX(-Math.PI / 2);

//   //   const positions = this.seabedGeometry.attributes['position'].array;
//   //   const colors = new Float32Array(positions.length);

//   //   for (let i = 0; i < data.length; i++) {
//   //     positions[i * 3 + 1] = data[i].z;
//   //     colors[i * 3] = 0;
//   //     colors[i * 3 + 1] = 0;
//   //     colors[i * 3 + 2] = 1;
//   //   }

    

//   //   this.seabedGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
//   //   const material = new THREE.MeshBasicMaterial({ vertexColors: true, wireframe: false });
//   //   const seabedMesh = new THREE.Mesh(this.seabedGeometry, material);
//   //   this.scene.add(seabedMesh);
//   // }

//   buildSeabed(data: any[]) {
//     // 1. Create a 50x50 segment grid (matches the Node.js script exactly)
//     // We make the physical width and height 100x100 so it looks massive on screen
//     this.seabedGeometry = new THREE.PlaneGeometry(100, 100, 50, 50);
//     this.seabedGeometry.rotateX(-Math.PI / 2); 
    
//     const positions = this.seabedGeometry.attributes['position'].array;
//     const colors = new Float32Array(positions.length);

//     // 2. Map the perfect database grid to the perfect Three.js grid
//     for (let i = 0; i < data.length; i++) {
//       // The Z value from the database becomes the Y (height) in Three.js
//       positions[i * 3 + 1] = data[i].z; 
      
//       // Default all vertices to safe Blue
//       colors[i * 3] = 0;     // R
//       colors[i * 3 + 1] = 0; // G
//       colors[i * 3 + 2] = 1; // B
//     }

//     this.seabedGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    
//     // 3. Recalculate the geometry so the shadows map correctly to the bumps
//     this.seabedGeometry.computeVertexNormals();
    
//     // 4. Use MeshStandardMaterial for solid surfaces (wireframe is OFF)
//     const material = new THREE.MeshStandardMaterial({ 
//       vertexColors: true, 
//       wireframe: false,
//       roughness: 0.8,
//       metalness: 0.2
//     });
    
//     const seabedMesh = new THREE.Mesh(this.seabedGeometry, material);
//     this.scene.add(seabedMesh);
//   }

//   buildWater() {
//     const waterGeometry = new THREE.PlaneGeometry(100, 100);
//     waterGeometry.rotateX(-Math.PI / 2);

//     const waterMaterial = new THREE.MeshPhysicalMaterial({
//       color: 0x00aaff,     
//       transparent: true,
//       opacity: 0.3,        
//       roughness: 0.1,
//       metalness: 0.1,
//       depthWrite: false    // Prevents the transparency glitch
//     });

//     this.waterMesh = new THREE.Mesh(waterGeometry, waterMaterial);
//     this.scene.add(this.waterMesh);
//   }

//   buildShip() {
//     // Simple 3D Box (15m wide, 14m tall, 15m long)
//     const geometry = new THREE.BoxGeometry(12, 10, 30);
    
//     const material = new THREE.MeshStandardMaterial({ 
//       color: 0xffffff, 
//       transparent: true, 
//       opacity: 0.5 
//     });
    
//     this.shipMesh = new THREE.Mesh(geometry, material);
//     this.scene.add(this.shipMesh);
//   }

  

//   animate() {
//     requestAnimationFrame(() => this.animate());

//     if (this.controls) {
//       this.controls.update(); // <-- Add this line to update the smooth camera physics
//     }

//     if (this.seabedGeometry) {
//       this.checkUKC();
//     }
//     this.renderer.render(this.scene, this.camera);
//   }

//   checkUKC() {
//     if (!this.seabedGeometry) return;

//     const positions = this.seabedGeometry.attributes['position'].array;
//     const colors = this.seabedGeometry.attributes['color'].array;

//     // 1. Hydrodynamic Math
//     const dynamicSquat = 0.06 * Math.pow(this.speed, 2);
    
//     // Calculate exactly where the bottom of the ship is in the 3D world.
//     // Tide pushes it up (+), draft and squat pull it down (-)
//     const keelY = this.tide - this.restingDraft - dynamicSquat; 

//     // 2. Move the 3D Environment
//     if (this.waterMesh) {
//       this.waterMesh.position.y = this.tide; 
//     }

//     if (this.shipMesh) {
//       // "+ 7" pushes the center of the ship up so the keel rests exactly on keelY.
//       // Adjust this number if your specific .glb model floats too high or low!
//       this.shipMesh.position.y = keelY + 7; 
//     }

//     // 3. Collision Check Loop
//     for (let i = 0; i < positions.length / 3; i++) {
//         // The Y value of the seabed at this specific point
//         const vertexY = positions[i * 3 + 1]; 

//         // The actual gap of water between the ship and the mud
//         const clearance = keelY - vertexY;

//         if (clearance < this.safetyThreshold) {
//             // DANGER: Color this point RED
//             colors[i * 3] = 1;     // R
//             colors[i * 3 + 1] = 0; // G
//             colors[i * 3 + 2] = 0; // B
//         } else {
//             // SAFE: Color this point BLUE (or standard safe color)
//             colors[i * 3] = 0;     // R
//             colors[i * 3 + 1] = 0; // G
//             colors[i * 3 + 2] = 1; // B
//         }
//     }

//     // Tell Three.js to update the colors on the screen
//     this.seabedGeometry.attributes['color'].needsUpdate = true;
//   }
// }

import { Component, ElementRef, OnInit, ViewChild, PLATFORM_ID, Inject } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common'; 
import { FormsModule } from '@angular/forms';   
import * as THREE from 'three';
// @ts-ignore
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { HttpClient } from '@angular/common/http';
import * as Papa from 'papaparse';


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
  }

  

 onFileSelected(event: any) {
    const file = event.target.files[0];
    if (!file) return;

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
            alert("Could not read any valid numbers from this file.");
            return; // Stops the code here so Three.js doesn't crash!
        }
        
        // If we have points, proceed to math!
        this.processParsedData(rawPoints);
      },
      error: (err) => {
        console.error("❌ PapaParse Error:", err);
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

    this.buildDynamicWater(width, length);
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

  // --- 4. THE PHYSICS ENGINE ---
  checkUKC() {
    if (!this.seabedGeometry) return;

    const positions = this.seabedGeometry.attributes['position'].array;
    const colors = this.seabedGeometry.attributes['color'].array;

    // Hydrodynamic Math
    const dynamicSquat = 0.06 * Math.pow(this.speed, 2);
    const keelY = this.tide - this.restingDraft - dynamicSquat; 

    // Move Environment
    if (this.waterMesh) {
      this.waterMesh.position.y = this.tide; 
    }
    if (this.shipMesh) {
      this.shipMesh.position.y = keelY; 
    }

    // Collision Check
    for (let i = 0; i < positions.length / 3; i++) {
        const vertexY = positions[i * 3 + 1]; 
        const clearance = keelY - vertexY;

        if (clearance < this.safetyThreshold) {
            colors[i * 3] = 1;     // Red
            colors[i * 3 + 1] = 0; 
            colors[i * 3 + 2] = 0; 
        } else {
            colors[i * 3] = 0;     // Blue 
            colors[i * 3 + 1] = 0; 
            colors[i * 3 + 2] = 1; 
        }
    }
    this.seabedGeometry.attributes['color'].needsUpdate = true;
  }

  animate = () => {
    requestAnimationFrame(this.animate);
    this.checkUKC();
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }
}