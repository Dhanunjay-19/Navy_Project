package com.example.navy_project.Controller;


import com.example.navy_project.Entity.BathymetryPoint;
import com.example.navy_project.Repository.BathymetryRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api")
@CrossOrigin(origins = "*")
public class BathymetryController {

    @Autowired
    private BathymetryRepository repository;

    @GetMapping("/bathymetry")
    public List<BathymetryPoint> getPoints() {
        return repository.findAll();
    }

}
