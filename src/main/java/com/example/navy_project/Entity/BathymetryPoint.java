package com.example.navy_project.Entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name = "bathymetry_points")
public class BathymetryPoint {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "x_coord", nullable = false)
    private double x;

    @Column(name = "y_coord", nullable = false)
    private double y;

    @Column(name = "z_depth", nullable = false)
    private double z;

    public BathymetryPoint() {
    }

    public BathymetryPoint(double x, double y, double z) {
        this.x = x;
        this.y = y;
        this.z = z;
    }

    public Long getId() {
        return id;
    }

    public double getX() {
        return x;
    }

    public void setX(double x) {
        this.x = x;
    }

    public double getY() {
        return y;
    }

    public void setY(double y) {
        this.y = y;
    }

    public double getZ() {
        return z;
    }

    public void setZ(double z) {
        this.z = z;
    }
}
