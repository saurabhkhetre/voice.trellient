package com.trellient.voice.api.security;

import org.bouncycastle.crypto.generators.SCrypt;
import org.springframework.stereotype.Component;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.Base64;

/**
 * The web app's password hashing, reproduced exactly
 * (src/lib/auth/password.server.ts).
 *
 * Stored form is {@code scrypt$N$r$p$<salt>$<hash>} with the salt and hash in
 * standard base64. The cost parameters travel with each hash, so verification
 * reads them from the stored string rather than the constants below and a
 * future increase does not invalidate existing passwords.
 *
 * Every value here has to match Node's crypto.scrypt byte for byte, or accounts
 * created by the web app stop being able to sign in: UTF-8 password bytes, a
 * 16-byte salt, and a 64-byte derived key.
 */
@Component
public class PasswordHasher {

    private static final int N = 16384;
    private static final int R = 8;
    private static final int P = 1;
    private static final int KEY_LENGTH = 64;
    private static final int SALT_LENGTH = 16;

    private static final SecureRandom RANDOM = new SecureRandom();

    /** Hashes a password as {@code scrypt$N$r$p$<salt>$<hash>}. */
    public String hash(String password) {
        byte[] salt = new byte[SALT_LENGTH];
        RANDOM.nextBytes(salt);
        byte[] key = derive(password, salt, N, R, P, KEY_LENGTH);
        Base64.Encoder base64 = Base64.getEncoder();
        return String.join("$", "scrypt", String.valueOf(N), String.valueOf(R), String.valueOf(P),
                base64.encodeToString(salt), base64.encodeToString(key));
    }

    /**
     * Checks a password against a stored hash in constant time. A malformed or
     * unknown-scheme hash is a failed check, never an error, so a bad row cannot
     * be told apart from a wrong password.
     */
    public boolean verify(String password, String stored) {
        if (stored == null) return false;
        String[] parts = stored.split("\\$");
        if (parts.length != 6 || !"scrypt".equals(parts[0])) return false;

        int n;
        int r;
        int p;
        byte[] salt;
        byte[] expected;
        try {
            n = Integer.parseInt(parts[1]);
            r = Integer.parseInt(parts[2]);
            p = Integer.parseInt(parts[3]);
            salt = Base64.getDecoder().decode(parts[4]);
            expected = Base64.getDecoder().decode(parts[5]);
        } catch (IllegalArgumentException e) {
            return false;
        }
        if (expected.length == 0) return false;

        // Key length comes from the stored hash, matching verifyPassword().
        byte[] actual = derive(password, salt, n, r, p, expected.length);
        return MessageDigest.isEqual(actual, expected);
    }

    private static byte[] derive(String password, byte[] salt, int n, int r, int p, int keyLength) {
        return SCrypt.generate(password.getBytes(StandardCharsets.UTF_8), salt, n, r, p, keyLength);
    }
}
