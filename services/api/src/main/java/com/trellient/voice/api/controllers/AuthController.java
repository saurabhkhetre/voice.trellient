package com.trellient.voice.api.controllers;

import com.trellient.voice.api.security.PasswordHasher;
import com.trellient.voice.api.security.SessionAuthFilter;
import com.trellient.voice.api.security.SessionService;
import com.trellient.voice.api.security.UserPrincipal;
import com.trellient.voice.api.web.Validate;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;

/**
 * Sign-up, sign-in, sign-out and "who am I", ported from
 * src/lib/auth/auth.functions.ts.
 *
 * These are the only endpoints that must work without a session, so they are
 * permitAll in SecurityConfig. CSRF still applies: the token rides in a cookie
 * rather than the session, so a pre-auth caller can read it from any response
 * and a cross-origin page still cannot forge the header. That closes login CSRF
 * (an attacker signing a victim into an account the attacker controls) without
 * requiring the session the caller does not have yet.
 */
@RestController
@RequestMapping("/api/auth")
public class AuthController {

    /** The shape zod's .email() accepts, as used elsewhere in this API. */
    private static final Pattern EMAIL = Pattern.compile("^[^@\\s]+@[^@\\s.]+(\\.[^@\\s.]+)+$");
    private static final int EMAIL_MAX = 200;
    private static final int PASSWORD_MAX = 200;
    private static final int PASSWORD_MIN = 8;

    /**
     * Hashed once and reused so an unknown email costs the same as a wrong
     * password, matching the web app's dummyHash. Without it, response time
     * reveals which accounts exist.
     */
    private volatile String dummyHash;

    private final JdbcTemplate jdbc;
    private final PasswordHasher passwords;
    private final SessionService sessions;

    public AuthController(JdbcTemplate jdbc, PasswordHasher passwords, SessionService sessions) {
        this.jdbc = jdbc;
        this.passwords = passwords;
        this.sessions = sessions;
    }

    /** Creates an account and signs it in. */
    @PostMapping("/signup")
    public ResponseEntity<Map<String, String>> signUp(@RequestBody Map<String, Object> body) {
        String email = email(body.get("email"));
        String password = password(body.get("password"), PASSWORD_MIN,
                "Use at least 8 characters for your password.");

        String userId;
        try {
            userId = jdbc.queryForObject(
                    """
                    INSERT INTO users (email, password_hash, last_sign_in_at)
                    VALUES (?, ?, now())
                    RETURNING id::text
                    """,
                    String.class, email, passwords.hash(password));
        } catch (DuplicateKeyException e) {
            // users_email_idx is UNIQUE on lower(email).
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "This email is already registered. Sign in instead.");
        }

        return issue(userId, email);
    }

    /** Signs in with email and password. */
    @PostMapping("/signin")
    public ResponseEntity<Map<String, String>> signIn(@RequestBody Map<String, Object> body) {
        String email = email(body.get("email"));
        String password = password(body.get("password"), 1, "Enter your password.");

        List<Map<String, Object>> rows = jdbc.queryForList(
                "SELECT id::text AS id, email, password_hash FROM users WHERE lower(email) = ?", email);
        Map<String, Object> user = rows.isEmpty() ? null : rows.get(0);

        // Always run a verification, even with no such user, so the timing does
        // not differ between "unknown email" and "wrong password".
        String stored = user != null ? (String) user.get("password_hash") : dummyHash();
        boolean valid = passwords.verify(password, stored);
        if (user == null || !valid) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Wrong email or password.");
        }

        String userId = (String) user.get("id");
        jdbc.update("UPDATE users SET last_sign_in_at = now() WHERE id = ?::uuid", userId);
        return issue(userId, (String) user.get("email"));
    }

    /** Ends the current session and clears the cookie. Safe to call when signed out. */
    @PostMapping("/signout")
    public ResponseEntity<Void> signOut(HttpServletRequest request) {
        sessions.end(readSessionToken(request));
        return ResponseEntity.noContent()
                .header(HttpHeaders.SET_COOKIE, sessions.expiredCookie().toString())
                .build();
    }

    /**
     * The signed-in user, or nothing. Never an error for a missing session:
     * getCurrentUser() returned null, and 204 is how this API already expresses
     * that (see GET /api/business/context).
     */
    @GetMapping("/me")
    public ResponseEntity<Map<String, String>> me(@AuthenticationPrincipal UserPrincipal user) {
        if (user == null) return ResponseEntity.noContent().build();
        List<Map<String, Object>> rows = jdbc.queryForList(
                "SELECT id::text AS id, email FROM users WHERE id = ?::uuid", user.getId());
        if (rows.isEmpty()) return ResponseEntity.noContent().build();
        return ResponseEntity.ok(payload((String) rows.get(0).get("id"), (String) rows.get(0).get("email")));
    }

    /** Starts a session and returns the user with the session cookie attached. */
    private ResponseEntity<Map<String, String>> issue(String userId, String email) {
        String token = sessions.start(userId);
        return ResponseEntity.ok()
                .header(HttpHeaders.SET_COOKIE, sessions.cookie(token).toString())
                .body(payload(userId, email));
    }

    private static Map<String, String> payload(String id, String email) {
        Map<String, String> user = new LinkedHashMap<>();
        user.put("id", id);
        user.put("email", email);
        return user;
    }

    /** Trimmed and lower-cased, as the zod `email` schema did. */
    private static String email(Object raw) {
        String message = "Enter a valid email address.";
        if (!(raw instanceof String s)) throw Validate.bad(message);
        String normalised = s.trim().toLowerCase();
        if (normalised.isEmpty() || normalised.length() > EMAIL_MAX || !EMAIL.matcher(normalised).matches()) {
            throw Validate.bad(message);
        }
        return normalised;
    }

    /** Passwords are never trimmed — leading and trailing spaces are part of them. */
    private static String password(Object raw, int min, String message) {
        if (!(raw instanceof String s) || s.length() < min) throw Validate.bad(message);
        if (s.length() > PASSWORD_MAX) throw Validate.bad("That password is too long (max 200 characters).");
        return s;
    }

    private String dummyHash() {
        String current = dummyHash;
        if (current == null) {
            current = passwords.hash("no-account-with-this-email");
            dummyHash = current;
        }
        return current;
    }

    private static String readSessionToken(HttpServletRequest request) {
        Cookie[] cookies = request.getCookies();
        if (cookies == null) return null;
        for (Cookie cookie : cookies) {
            if (SessionAuthFilter.SESSION_COOKIE.equals(cookie.getName())) return cookie.getValue();
        }
        return null;
    }
}
