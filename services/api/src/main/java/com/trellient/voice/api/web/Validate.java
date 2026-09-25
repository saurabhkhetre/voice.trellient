package com.trellient.voice.api.web;

import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.regex.Pattern;

/**
 * The validation the web app did with zod (src/lib/validation.ts and the
 * per-module schemas), reproduced so the API rejects the same input with the
 * same wording. A failure is a 400.
 */
public final class Validate {

    /** Same shape the dashboard's phone fields accept. */
    public static final Pattern PHONE = Pattern.compile("^\\+?[0-9]{6,15}$");
    private static final Pattern UUID_RE =
            Pattern.compile("^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$");

    private Validate() {}

    public static ResponseStatusException bad(String message) {
        return new ResponseStatusException(HttpStatus.BAD_REQUEST, message);
    }

    public static String uuid(String value, String field) {
        if (value == null || !UUID_RE.matcher(value).matches()) {
            throw bad(field + " must be a UUID.");
        }
        return value;
    }

    /** Required, trimmed, length-bounded text. */
    public static String text(Object value, String message, int max) {
        if (!(value instanceof String s)) throw bad(message);
        String trimmed = s.trim();
        if (trimmed.isEmpty()) throw bad(message);
        if (trimmed.length() > max) throw bad("That value is too long (max " + max + " characters).");
        return trimmed;
    }

    /** Optional text: null and blank both collapse to null, as zod's blankToNull did. */
    public static String optionalText(Object value, int max) {
        if (value == null) return null;
        if (!(value instanceof String s)) throw bad("Expected text.");
        String trimmed = s.trim();
        if (trimmed.isEmpty()) return null;
        if (trimmed.length() > max) throw bad("That value is too long (max " + max + " characters).");
        return trimmed;
    }

    public static boolean bool(Object value, boolean fallback) {
        if (value == null) return fallback;
        if (value instanceof Boolean b) return b;
        throw bad("Expected true or false.");
    }

    public static String oneOf(Object value, List<String> allowed, String field) {
        if (!(value instanceof String s) || !allowed.contains(s)) {
            throw bad(field + " must be one of: " + String.join(", ", allowed) + ".");
        }
        return s;
    }

    /** Strips spaces, dashes and brackets, then checks the international format. */
    public static String phone(Object value, String message) {
        if (!(value instanceof String s)) throw bad(message);
        String cleaned = s.replaceAll("[\\s()\\-]", "");
        if (!PHONE.matcher(cleaned).matches()) throw bad(message);
        return cleaned;
    }

    public static String cleanPhoneDigits(String value) {
        return value == null ? "" : value.replaceAll("[\\s()\\-]", "");
    }
}
