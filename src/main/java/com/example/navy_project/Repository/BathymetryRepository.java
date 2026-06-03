package com.example.navy_project.Repository;

import com.example.navy_project.Entity.BathymetryPoint;
import org.springframework.data.jpa.repository.JpaRepository;

public interface BathymetryRepository extends JpaRepository<BathymetryPoint, Long> {
}
