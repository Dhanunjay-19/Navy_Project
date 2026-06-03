import { Component, ElementRef, ViewChild, afterNextRender } from '@angular/core'; // 1. Import afterNextRender
import { HttpClient } from '@angular/common/http';
import * as THREE from 'three';
import {FormsModule} from '@angular/forms';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
// @ts-ignore
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

@Component({
  selector: 'app-root',
  templateUrl: './app.html',
  imports: [
    FormsModule
  ],
  styleUrls: ['./app.css']
})
export class App {
  @ViewChild('rendererContainer', { static: false }) rendererContainer!: ElementRef; // Change static to false

  // UI State Variables
  tide: number = 0;
  speed: number = 5;
  safetyThreshold: number = 1.5;
  restingDraft: number = 10;

  // Three.js variables
  scene!: THREE.Scene;
  camera!: THREE.PerspectiveCamera;
  renderer!: THREE.WebGLRenderer;
  seabedGeometry!: THREE.PlaneGeometry;
  controls!: OrbitControls; // <-- Add this line
  shipMesh!: THREE.Object3D;
  waterMesh!: THREE.Mesh;
 

  constructor(private http: HttpClient) {
    // 2. Wrap all browser-only execution inside afterNextRender in the constructor
    afterNextRender(() => {
      this.initThreeJS();

      // Fetch data from Spring Boot Backend
      this.http.get<any[]>('http://localhost:8080/api/bathymetry').subscribe({
        next: (data) => {
          this.buildSeabed(data);
          this.animate(); // Start loop inside browser context
          this.buildShip();
          
        },
        error: (err) => console.error('Backend connection failed:', err)
      });
    });
  }

  // Remove ngOnInit completely since we are using afterNextRender now

  initThreeJS() {
    this.scene = new THREE.Scene();

    // safe to read window.innerWidth here!
    this.camera = new THREE.PerspectiveCamera(75, window.innerWidth * 0.75 / window.innerHeight, 0.1, 1000);
    this.camera.position.set(10, 15, 30);
    this.camera.lookAt(10, 0, 10);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(window.innerWidth * 0.75, window.innerHeight);
    // Add ambient daylight
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
    this.scene.add(ambientLight);

    // Add a directional sun to create shadows on the underwater trenches
    const sunLight = new THREE.DirectionalLight(0xffffff, 1);
    sunLight.position.set(50, 100, 50);
    this.scene.add(sunLight);
    this.rendererContainer.nativeElement.appendChild(this.renderer.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true; // Makes the rotation smooth and heavy
    this.controls.dampingFactor = 0.05;
  }

  // buildSeabed(data: any[]) {
  //   this.seabedGeometry = new THREE.PlaneGeometry(20, 20, 2, 2);
  //   this.seabedGeometry.rotateX(-Math.PI / 2);

  //   const positions = this.seabedGeometry.attributes['position'].array;
  //   const colors = new Float32Array(positions.length);

  //   for (let i = 0; i < data.length; i++) {
  //     positions[i * 3 + 1] = data[i].z;
  //     colors[i * 3] = 0;
  //     colors[i * 3 + 1] = 0;
  //     colors[i * 3 + 2] = 1;
  //   }

    

  //   this.seabedGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  //   const material = new THREE.MeshBasicMaterial({ vertexColors: true, wireframe: false });
  //   const seabedMesh = new THREE.Mesh(this.seabedGeometry, material);
  //   this.scene.add(seabedMesh);
  // }

  buildSeabed(data: any[]) {
    // 1. Create a 50x50 segment grid (matches the Node.js script exactly)
    // We make the physical width and height 100x100 so it looks massive on screen
    this.seabedGeometry = new THREE.PlaneGeometry(100, 100, 50, 50);
    this.seabedGeometry.rotateX(-Math.PI / 2); 
    
    const positions = this.seabedGeometry.attributes['position'].array;
    const colors = new Float32Array(positions.length);

    // 2. Map the perfect database grid to the perfect Three.js grid
    for (let i = 0; i < data.length; i++) {
      // The Z value from the database becomes the Y (height) in Three.js
      positions[i * 3 + 1] = data[i].z; 
      
      // Default all vertices to safe Blue
      colors[i * 3] = 0;     // R
      colors[i * 3 + 1] = 0; // G
      colors[i * 3 + 2] = 1; // B
    }

    this.seabedGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    
    // 3. Recalculate the geometry so the shadows map correctly to the bumps
    this.seabedGeometry.computeVertexNormals();
    
    // 4. Use MeshStandardMaterial for solid surfaces (wireframe is OFF)
    const material = new THREE.MeshStandardMaterial({ 
      vertexColors: true, 
      wireframe: false,
      roughness: 0.8,
      metalness: 0.2
    });
    
    const seabedMesh = new THREE.Mesh(this.seabedGeometry, material);
    this.scene.add(seabedMesh);
  }

  buildShip() {
    const loader = new GLTFLoader();
    
    // Look inside the Angular assets folder for your file
    loader.load('assets/ship.glb', (gltf) => {
      
      this.shipMesh = gltf.scene;
      
      // 1. SCALE: 3D models from the internet are often MASSIVE or tiny.
      // Start with 1.0, but if the ship is too big, change these to 0.5 or 0.1.
      this.shipMesh.scale.set(100, 100, 100); 

      // 2. POSITION: Center it initially
      this.shipMesh.position.set(50, 0, 50); // Assuming your grid is 100x100

      // 3. SHADOWS (Optional but makes it look realistic):
      this.shipMesh.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
        }
      });

      this.scene.add(this.shipMesh);
      
    }, 
    undefined, // We don't need a loading progress bar right now
    (error) => {
      console.error('Error loading the 3D ship model:', error);
    });
  }

  

  animate() {
    requestAnimationFrame(() => this.animate());

    if (this.controls) {
      this.controls.update(); // <-- Add this line to update the smooth camera physics
    }

    if (this.seabedGeometry) {
      this.checkUKC();
    }
    this.renderer.render(this.scene, this.camera);
  }

  checkUKC() {
    if (!this.seabedGeometry) return;

    const positions = this.seabedGeometry.attributes['position'].array;
    const colors = this.seabedGeometry.attributes['color'].array;

    // 1. Hydrodynamic Math
    const dynamicSquat = 0.06 * Math.pow(this.speed, 2);
    
    // Calculate exactly where the bottom of the ship is in the 3D world.
    // Tide pushes it up (+), draft and squat pull it down (-)
    const keelY = this.tide - this.restingDraft - dynamicSquat; 

    // 2. Move the 3D Environment
    if (this.waterMesh) {
      this.waterMesh.position.y = this.tide; 
    }

    if (this.shipMesh) {
      // "+ 7" pushes the center of the ship up so the keel rests exactly on keelY.
      // Adjust this number if your specific .glb model floats too high or low!
      this.shipMesh.position.y = keelY + 7; 
    }

    // 3. Collision Check Loop
    for (let i = 0; i < positions.length / 3; i++) {
        // The Y value of the seabed at this specific point
        const vertexY = positions[i * 3 + 1]; 

        // The actual gap of water between the ship and the mud
        const clearance = keelY - vertexY;

        if (clearance < this.safetyThreshold) {
            // DANGER: Color this point RED
            colors[i * 3] = 1;     // R
            colors[i * 3 + 1] = 0; // G
            colors[i * 3 + 2] = 0; // B
        } else {
            // SAFE: Color this point BLUE (or standard safe color)
            colors[i * 3] = 0;     // R
            colors[i * 3 + 1] = 0; // G
            colors[i * 3 + 2] = 1; // B
        }
    }

    // Tell Three.js to update the colors on the screen
    this.seabedGeometry.attributes['color'].needsUpdate = true;
  }
}
