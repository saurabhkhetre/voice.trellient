package com.trellient.voice.api.config;

import jakarta.annotation.PostConstruct;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;

/**
 * Refuses to start on a development default outside the dev profile.
 *
 * Several settings have defaults that make local work without any .env. Each
 * one is also silently wrong in production, and silence is the problem: a
 * deployment that forgets LIVEKIT_URL does not fail, it mints tokens for a
 * LiveKit that is not there and the first phone call dies with no useful
 * error. One forgetting APP_SESSION_SECURE_COOKIE serves session cookies over
 * plaintext and nothing says so.
 *
 * Local runs get the dev profile by default (spring.profiles.default), so this
 * never fires during development. Anything that sets a profile is treated as a
 * real deployment and has to supply real values.
 */
@Component
@Profile("!dev")
public class StartupChecks {

    private final boolean secureCookie;
    private final String livekitUrl;
    private final String livekitApiKey;
    private final String livekitApiSecret;

    public StartupChecks(
            @Value("${app.session.secure-cookie}") boolean secureCookie,
            @Value("${livekit.url}") String livekitUrl,
            @Value("${livekit.api-key}") String livekitApiKey,
            @Value("${livekit.api-secret}") String livekitApiSecret) {
        this.secureCookie = secureCookie;
        this.livekitUrl = livekitUrl;
        this.livekitApiKey = livekitApiKey;
        this.livekitApiSecret = livekitApiSecret;
    }

    @PostConstruct
    void verify() {
        List<String> problems = new ArrayList<>();

        if (!secureCookie) {
            problems.add("APP_SESSION_SECURE_COOKIE is false — session cookies would be sent"
                    + " without the Secure flag. Set it to true.");
        }
        if (livekitUrl == null || livekitUrl.contains("localhost") || livekitUrl.contains("127.0.0.1")) {
            problems.add("LIVEKIT_URL points at localhost (" + livekitUrl + ")."
                    + " Set it to the project's wss:// URL.");
        }
        if ("devkey".equals(livekitApiKey)) {
            problems.add("LIVEKIT_API_KEY is still the dev placeholder. Set the real key.");
        }
        if ("secret".equals(livekitApiSecret)) {
            problems.add("LIVEKIT_API_SECRET is still the dev placeholder. Set the real secret.");
        }

        if (!problems.isEmpty()) {
            // Thrown rather than logged: a half-configured deployment that
            // answers requests is worse than one that never comes up.
            throw new IllegalStateException(
                    "Refusing to start with development defaults outside the dev profile:"
                            + problems.stream().map(p -> "\n  - " + p).reduce("", String::concat)
                            + "\n\nTo run locally, leave SPRING_PROFILES_ACTIVE unset.");
        }
    }
}
