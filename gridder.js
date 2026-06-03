const fs = require('fs');

console.log('Reading XYZ data...');
const rawData = fs.readFileSync('data.xyz', 'utf-8').split('\n');
let points = [];

// 1. Parse the real data
rawData.forEach(line => {
    let parts = line.trim().split(/\s+/);
    if (parts.length >= 3) {
        points.push({ x: parseFloat(parts[0]), y: parseFloat(parts[1]), z: parseFloat(parts[2]) });
    }
});

// 2. Find the boundaries to center the map
const minX = Math.min(...points.map(p => p.x));
const maxX = Math.max(...points.map(p => p.x));
const minY = Math.min(...points.map(p => p.y));
const maxY = Math.max(...points.map(p => p.y));

// 3. Setup a perfect 50x50 grid
const gridSegments = 50; 
const stepX = (maxX - minX) / gridSegments;
const stepY = (maxY - minY) / gridSegments;

let sql = 'USE port_simulation;\nTRUNCATE TABLE bathymetry_points;\nINSERT INTO bathymetry_points (x_coord, y_coord, z_depth) VALUES \n';
let values = [];

console.log('Calculating perfect grid (Interpolation)...');
// Three.js PlaneGeometry generates vertices top-to-bottom, left-to-right. 
// We structure our loops exactly the same way so the data maps perfectly.
for (let j = gridSegments; j >= 0; j--) {
    for (let i = 0; i <= gridSegments; i++) {
        let gridX = i * stepX;
        let gridY = j * stepY;

        // Inverse Distance Weighting Math
        let numerator = 0;
        let denominator = 0;
        
        for (let p of points) {
            let px = p.x - minX;
            let py = p.y - minY;
            let distance = Math.sqrt(Math.pow(gridX - px, 2) + Math.pow(gridY - py, 2));
            if (distance === 0) distance = 0.001; // Prevent division by zero
            
            let weight = 1 / Math.pow(distance, 2);
            numerator += weight * p.z;
            denominator += weight;
        }
        
        let calculatedZ = numerator / denominator;
        values.push(`(${gridX.toFixed(2)}, ${gridY.toFixed(2)}, -${calculatedZ.toFixed(2)})`);
    }
}

sql += values.join(',\n') + ';';
fs.writeFileSync('gridded_surface.sql', sql);
console.log('Success! Open MySQL and run gridded_surface.sql');