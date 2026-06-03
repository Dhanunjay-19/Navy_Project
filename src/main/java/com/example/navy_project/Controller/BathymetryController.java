package com.example.navy_project.Controller;


import com.example.navy_project.Entity.BathymetryPoint;
import com.example.navy_project.Repository.BathymetryRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.util.List;

@RestController
@RequestMapping("/api")
@CrossOrigin(origins = "*")
public class BathymetryController {

    @Autowired
    private BathymetryRepository repository;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @PostMapping("/upload-survey")
    public ResponseEntity<String> handleFileUpload(@RequestParam("file") MultipartFile file) {
        try {
            // 1. Clear the old map data from MySQL
            jdbcTemplate.execute("TRUNCATE TABLE bathymetry_points");

            // 2. Read the uploaded file line by line (Highly memory efficient in Java)
            BufferedReader reader = new BufferedReader(new InputStreamReader(file.getInputStream()));
            String line;
            
            while ((line = reader.readLine()) != null) {
                // Ignore text headers, replace commas, split by spaces
                String[] parts = line.trim().replaceAll(",", " ").split("\\s+");
                
                if (parts.length >= 3) {
                    try {
                        double x = Double.parseDouble(parts[0]);
                        double y = Double.parseDouble(parts[1]);
                        double z = Double.parseDouble(parts[2]);

                        // 3. Save directly to MySQL
                        jdbcTemplate.update(
                            "INSERT INTO bathymetry_points (x_coord, y_coord, z_depth) VALUES (?, ?, ?)", 
                            x, y, z
                        );
                    } catch (NumberFormatException e) {
                        // Skip lines that are just text (like "X Y DEPTH")
                    }
                }
            }
            return ResponseEntity.ok("File processed and saved to database successfully.");

        } catch (Exception e) {
            return ResponseEntity.status(500).body("Server Error: " + e.getMessage());
        }
    }

    @GetMapping("/bathymetry")
    public List<BathymetryPoint> getPoints() {
        return repository.findAll();
    }

}
