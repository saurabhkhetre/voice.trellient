package com.trellient.voice.api.controllers;

import com.trellient.voice.api.models.Business;
import com.trellient.voice.api.security.UserPrincipal;
import com.trellient.voice.api.services.BusinessService;
import io.livekit.server.AccessToken;
import io.livekit.server.RoomJoin;
import io.livekit.server.RoomName;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/voice")
public class VoiceController {

    private final BusinessService businessService;

    @Value("${livekit.api-key}")
    private String livekitApiKey;

    @Value("${livekit.api-secret}")
    private String livekitApiSecret;

    public VoiceController(BusinessService businessService) {
        this.businessService = businessService;
    }

    @PostMapping("/monitor")
    public ResponseEntity<Map<String, String>> createCallMonitorSession(
            @AuthenticationPrincipal UserPrincipal user,
            @RequestBody Map<String, String> payload) {
            
        String callId = payload.get("callId");
        if (callId == null || callId.isEmpty()) {
            return ResponseEntity.badRequest().build();
        }

        // Verify the user owns this business
        Business business = businessService.resolveBusinessForUser(user.getId());
        
        // In a real app we'd also verify the call belongs to the business
        String roomName = "call-" + callId;
        String participantIdentity = "monitor-" + UUID.randomUUID().toString().substring(0, 8);

        AccessToken token = new AccessToken(livekitApiKey, livekitApiSecret);
        token.setName("Monitor");
        token.setIdentity(participantIdentity);
        token.addGrants(new RoomJoin(true), new RoomName(roomName));

        return ResponseEntity.ok(Map.of(
                "token", token.toJwt(),
                "identity", participantIdentity,
                "roomName", roomName
        ));
    }

    @PostMapping("/test-call")
    public ResponseEntity<Map<String, String>> createTestCallSession(
            @AuthenticationPrincipal UserPrincipal user,
            @RequestBody Map<String, String> payload) {
            
        String agentId = payload.get("agentId");
        if (agentId == null || agentId.isEmpty()) {
            return ResponseEntity.badRequest().build();
        }

        Business business = businessService.resolveBusinessForUser(user.getId());

        String roomName = "test-" + UUID.randomUUID().toString();
        String participantIdentity = "tester-" + UUID.randomUUID().toString().substring(0, 8);

        AccessToken token = new AccessToken(livekitApiKey, livekitApiSecret);
        token.setName("Dashboard Tester");
        token.setIdentity(participantIdentity);
        token.addGrants(new RoomJoin(true), new RoomName(roomName));
        
        // Setup metadata for the agent to use
        // {"agent_id": "...", "business_id": "..."}
        String metadata = String.format("{\"agent_id\":\"%s\",\"business_id\":\"%s\"}", agentId, business.getId().toString());
        token.setMetadata(metadata);

        return ResponseEntity.ok(Map.of(
                "token", token.toJwt(),
                "identity", participantIdentity,
                "roomName", roomName
        ));
    }
}
