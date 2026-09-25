package com.trellient.voice.api.web;

import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.server.ResponseStatusException;

import java.util.Map;

/**
 * Turns the failures these endpoints raise into a flat {"error": "..."} body,
 * which is the shape the dashboard already shows to users. Without this a
 * ResponseStatusException reaches the browser as Spring's default error page
 * and the message is lost.
 */
@RestControllerAdvice
public class ApiExceptionHandler {

    @ExceptionHandler(ResponseStatusException.class)
    public ResponseEntity<Map<String, String>> handleStatus(ResponseStatusException ex) {
        String message = ex.getReason() != null ? ex.getReason() : "Request failed.";
        return ResponseEntity.status(ex.getStatusCode()).body(Map.of("error", message));
    }

    /** A unique-constraint failure, the isUniqueViolation() case in the web app. */
    @ExceptionHandler(DuplicateKeyException.class)
    public ResponseEntity<Map<String, String>> handleDuplicate(DuplicateKeyException ex) {
        return ResponseEntity.status(HttpStatus.CONFLICT)
                .body(Map.of("error", "A record with those details already exists."));
    }

    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<Map<String, String>> handleIllegalArgument(IllegalArgumentException ex) {
        return ResponseEntity.badRequest().body(Map.of("error", ex.getMessage()));
    }
}
