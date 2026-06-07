package com.example.navy_project.Controller;

import com.example.navy_project.DTO.UploadResponse;
import com.example.navy_project.Entity.BathymetryPoint;
import com.example.navy_project.Service.BathymetryService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;

@RestController
@RequestMapping("/api")
public class BathymetryController {

    private final BathymetryService bathymetryService;

    public BathymetryController(BathymetryService bathymetryService) {
        this.bathymetryService = bathymetryService;
    }

    @PostMapping("/upload-survey")
    public ResponseEntity<UploadResponse> handleFileUpload(@RequestParam("file") MultipartFile file) {
        try {
            int insertedRows = bathymetryService.replaceSurveyData(file);
            return ResponseEntity.ok(new UploadResponse("Survey file processed successfully.", insertedRows));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(new UploadResponse(e.getMessage(), 0));
        } catch (Exception e) {
            return ResponseEntity.internalServerError()
                    .body(new UploadResponse("Server error while processing file: " + e.getMessage(), 0));
        }
    }

    @GetMapping("/bathymetry")
    public ResponseEntity<List<BathymetryPoint>> getPoints() {
        return ResponseEntity.ok(bathymetryService.getAllPoints());
    }

    @GetMapping("/health")
    public ResponseEntity<String> health() {
        return ResponseEntity.ok("Navy Project backend is running");
    }
}
