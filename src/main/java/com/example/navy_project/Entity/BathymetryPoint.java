package com.example.navy_project.Entity;
import jakarta.persistence.*;

@Entity
@Table(name = "bathymetry_points")

public class BathymetryPoint {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "x_coord") private float x;
    @Column(name = "y_coord") private float y;
    @Column(name = "z_depth") private float z;

    // Getters
    public float getX() { return x; }
    public float getY() { return y; }
    public float getZ() { return z; }

}