package com.example.navy_project.Service;

import com.example.navy_project.Entity.BathymetryPoint;
import com.example.navy_project.Repository.BathymetryRepository;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;

@Service
public class BathymetryService {

    private static final int BATCH_SIZE = 1000;

    private final BathymetryRepository repository;
    private final JdbcTemplate jdbcTemplate;

    public BathymetryService(BathymetryRepository repository, JdbcTemplate jdbcTemplate) {
        this.repository = repository;
        this.jdbcTemplate = jdbcTemplate;
    }

    public List<BathymetryPoint> getAllPoints() {
        return repository.findAll();
    }

    @Transactional
    public int replaceSurveyData(MultipartFile file) throws Exception {
        if (file == null || file.isEmpty()) {
            throw new IllegalArgumentException("Please upload a non-empty .xyz or .txt survey file.");
        }

        jdbcTemplate.execute("TRUNCATE TABLE bathymetry_points");

        int insertedRows = 0;
        List<Object[]> batch = new ArrayList<>();

        try (BufferedReader reader = new BufferedReader(
                new InputStreamReader(file.getInputStream(), StandardCharsets.UTF_8))) {
            String line;
            while ((line = reader.readLine()) != null) {
                String[] parts = line.trim().replace(',', ' ').split("\\s+");
                if (parts.length < 3) {
                    continue;
                }

                try {
                    double x = Double.parseDouble(parts[0]);
                    double y = Double.parseDouble(parts[1]);
                    double z = Double.parseDouble(parts[2]);
                    batch.add(new Object[]{x, y, z});

                    if (batch.size() >= BATCH_SIZE) {
                        insertedRows += flushBatch(batch);
                    }
                } catch (NumberFormatException ignored) {
                    // Skip header/text rows like "X Y Z".
                }
            }
        }

        insertedRows += flushBatch(batch);
        return insertedRows;
    }

    private int flushBatch(List<Object[]> batch) {
        if (batch.isEmpty()) {
            return 0;
        }

        int[] counts = jdbcTemplate.batchUpdate(
                "INSERT INTO bathymetry_points (x_coord, y_coord, z_depth) VALUES (?, ?, ?)",
                batch
        );
        batch.clear();

        int total = 0;
        for (int count : counts) {
            total += count;
        }
        return total;
    }
}
