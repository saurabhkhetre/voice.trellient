package com.trellient.voice.api.security;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseCookie;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Duration;
import java.util.Base64;
import java.util.HexFormat;

/**
 * Issues and ends sessions, ported from src/lib/auth/session.server.ts.
 *
 * The browser holds a random token in an HttpOnly cookie and the database stores
 * only its SHA-256, so a leaked user_sessions table cannot be replayed.
 * {@link SessionAuthFilter} already validated sessions this way; this class adds
 * the other half and owns the hashing both sides use.
 */
@Service
public class SessionService {

    /** Matches SESSION_DAYS in session.server.ts. */
    private static final int SESSION_DAYS = 30;
    private static final int TOKEN_BYTES = 32;

    private static final SecureRandom RANDOM = new SecureRandom();
    /** base64url without padding, as Node's randomBytes().toString("base64url") produces. */
    private static final Base64.Encoder TOKEN_ENCODER = Base64.getUrlEncoder().withoutPadding();

    private final JdbcTemplate jdbc;

    /**
     * The web app set `secure` from NODE_ENV. Here it is an explicit setting so a
     * deployment cannot ship plaintext cookies just because an env var is
     * missing — it must be turned on for production (SECURITY.md F-03).
     */
    private final boolean secureCookie;

    public SessionService(JdbcTemplate jdbc,
                          @Value("${app.session.secure-cookie:false}") boolean secureCookie) {
        this.jdbc = jdbc;
        this.secureCookie = secureCookie;
    }

    /** Creates a session row for the user and returns the raw token for the cookie. */
    public String start(String userId) {
        byte[] raw = new byte[TOKEN_BYTES];
        RANDOM.nextBytes(raw);
        String token = TOKEN_ENCODER.encodeToString(raw);
        jdbc.update(
                """
                INSERT INTO user_sessions (user_id, token_hash, expires_at)
                VALUES (?::uuid, ?, now() + make_interval(days => ?::int))
                """,
                userId, sha256Hex(token), SESSION_DAYS);
        return token;
    }

    /** Deletes the session behind this token. A token with no row is a no-op. */
    public void end(String token) {
        if (token == null || token.isBlank()) return;
        jdbc.update("DELETE FROM user_sessions WHERE token_hash = ?", sha256Hex(token));
    }

    /** The Set-Cookie for a freshly started session. */
    public ResponseCookie cookie(String token) {
        return base(token).maxAge(Duration.ofDays(SESSION_DAYS)).build();
    }

    /** The Set-Cookie that clears the session cookie, matching deleteCookie(). */
    public ResponseCookie expiredCookie() {
        return base("").maxAge(Duration.ZERO).build();
    }

    private ResponseCookie.ResponseCookieBuilder base(String value) {
        return ResponseCookie.from(SessionAuthFilter.SESSION_COOKIE, value)
                .httpOnly(true)
                .sameSite("Lax")
                .secure(secureCookie)
                .path("/");
    }

    /** Only the digest is stored, so this is the one place that defines it. */
    public static String sha256Hex(String value) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            return HexFormat.of().formatHex(digest.digest(value.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 is unavailable", e);
        }
    }
}
