package com.trellient.voice.api.security;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.csrf.CookieCsrfTokenRepository;
import org.springframework.security.web.csrf.CsrfTokenRequestAttributeHandler;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

import java.util.Arrays;
import java.util.List;

@Configuration
@EnableWebSecurity
public class SecurityConfig {

    private final SessionAuthFilter sessionAuthFilter;
    private final List<String> allowedOrigins;

    public SecurityConfig(SessionAuthFilter sessionAuthFilter,
                          @Value("${app.cors.allowed-origins}") String allowedOrigins) {
        this.sessionAuthFilter = sessionAuthFilter;
        this.allowedOrigins = Arrays.stream(allowedOrigins.split(","))
                .map(String::trim)
                .filter(origin -> !origin.isEmpty())
                .toList();
    }

    @Bean
    public SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
        http
            .csrf(csrf -> csrf
                // Cookie-to-header (double submit). Spring writes the token to a
                // readable XSRF-TOKEN cookie; the browser client echoes it back in
                // X-XSRF-TOKEN. An attacker's page cannot read our cookie
                // cross-origin, so it cannot forge the header — while the session
                // cookie itself stays HttpOnly.
                .csrfTokenRepository(CookieCsrfTokenRepository.withHttpOnlyFalse())
                .csrfTokenRequestHandler(eagerCsrfTokenHandler())
                // Server-to-server callers cannot carry a CSRF token. The telephony
                // webhook authenticates with TELEPHONY_WEBHOOK_TOKEN instead, and
                // must verify it (SECURITY.md F-15) when it is ported here.
                .ignoringRequestMatchers("/api/public/**"))
            .cors(cors -> cors.configurationSource(corsConfigurationSource()))
            .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
            .authorizeHttpRequests(auth -> auth
                .requestMatchers("/api/public/**").permitAll()
                // Sign-in, sign-up and "who am I" cannot require a session:
                // they are how one is obtained. CSRF still applies to them,
                // since that token comes from a cookie, not the session.
                .requestMatchers("/api/auth/**").permitAll()
                .requestMatchers("/api/**").authenticated()
                .anyRequest().permitAll()
            )
            .addFilterBefore(sessionAuthFilter, UsernamePasswordAuthenticationFilter.class);

        return http.build();
    }

    /**
     * Loads the CSRF token on every request instead of deferring it, so the
     * XSRF-TOKEN cookie is always present for the client to read.
     *
     * This uses the plain handler rather than the XOR one: XOR exists to blunt
     * BREACH, which attacks a secret embedded in a compressed response body.
     * This API never renders the token into a body — it travels only as a cookie
     * and a header — so the masking buys nothing here and would force the client
     * to deal with a token whose value changes on every request.
     */
    private static CsrfTokenRequestAttributeHandler eagerCsrfTokenHandler() {
        CsrfTokenRequestAttributeHandler handler = new CsrfTokenRequestAttributeHandler();
        handler.setCsrfRequestAttributeName(null);
        return handler;
    }

    @Bean
    CorsConfigurationSource corsConfigurationSource() {
        CorsConfiguration configuration = new CorsConfiguration();
        configuration.setAllowedOrigins(allowedOrigins);
        configuration.setAllowedMethods(List.of("GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"));
        configuration.setAllowedHeaders(List.of("*"));
        
        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", configuration);
        return source;
    }
}
