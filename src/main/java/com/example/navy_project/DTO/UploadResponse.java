package com.example.navy_project.DTO;

public class UploadResponse {
    private String message;
    private int insertedRows;

    public UploadResponse(String message, int insertedRows) {
        this.message = message;
        this.insertedRows = insertedRows;
    }

    public String getMessage() {
        return message;
    }

    public int getInsertedRows() {
        return insertedRows;
    }
}
