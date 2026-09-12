package com.trellient.voice.api.controllers;

import com.trellient.voice.api.models.AgentConfig;
import com.trellient.voice.api.models.Business;
import com.trellient.voice.api.models.Call;
import com.trellient.voice.api.repositories.AgentConfigRepository;
import com.trellient.voice.api.repositories.CallRepository;
import com.trellient.voice.api.security.UserPrincipal;
import com.trellient.voice.api.services.BusinessService;
import io.livekit.server.AccessToken;
import io.livekit.server.CanPublish;
import io.livekit.server.CanPublishData;
import io.livekit.server.CanSubscribe;
import io.livekit.server.Hidden;
import io.livekit.server.RoomJoin;
import io.livekit.server.RoomName;
import io.livekit.server.RoomServiceClient;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import java.io.IOException;
import java.time.OffsetDateTime;
import java.util.HashMap;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

@RestController
@RequestMapping("/api/voice")
public class VoiceController {

    private static final Set<String> ACTIVE_STATUSES = Set.of("ringing", "in_progress");

    private final BusinessService businessService;
    private final CallRepository callRepository;
    private final AgentConfigRepository agentConfigRepository;

    @Value("${livekit.url}")
    private String livekitUrl;

    @Value("${livekit.api-key}")
    private String livekitApiKey;

    @Value("${livekit.api-secret}")
    private String livekitApiSecret;

    public VoiceController(BusinessService businessService,
                           CallRepository callRepository,
                           AgentConfigRepository agentConfigRepository) {
        this.businessService = businessService;
        this.callRepository = callRepository;
        this.agentConfigRepository = agentConfigRepository;
    }

    @PostMapping("/monitor")
    public ResponseEntity<Map<String, String>> createCallMonitorSession(
            @AuthenticationPrincipal UserPrincipal user,
            @RequestBody Map<String, String> payload) {

        UUID callId = parseUuid(payload.get("callId"));
        Business business = businessService.resolveBusinessForUser(user.getId());

        // Only calls in the user's own workspace can be monitored.
        Call call = callRepository.findById(callId)
                .filter(c -> business.getId().equals(c.getBusinessId()))
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Call not found."));
        if (!ACTIVE_STATUSES.contains(call.getStatus())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "This call is no longer active.");
        }
        if (call.getRoomName() == null || call.getRoomName().isBlank()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "This call has no voice room to listen to.");
        }

        String participantIdentity = "monitor-" + UUID.randomUUID().toString().substring(0, 8);

        // Listen-only: the monitor can hear the call but never speak or send data.
        AccessToken token = new AccessToken(livekitApiKey, livekitApiSecret);
        token.setName("Monitor");
        token.setIdentity(participantIdentity);
        token.addGrants(
                new RoomJoin(true),
                new RoomName(call.getRoomName()),
                new CanSubscribe(true),
                new CanPublish(false),
                new CanPublishData(false),
                new Hidden(true));

        Map<String, String> response = new HashMap<>();
        response.put("token", token.toJwt());
        response.put("serverUrl", livekitUrl);
        response.put("identity", participantIdentity);
        response.put("roomName", call.getRoomName());
        return ResponseEntity.ok(response);
    }

    @PostMapping("/test-call")
    public ResponseEntity<Map<String, String>> createTestCallSession(
            @AuthenticationPrincipal UserPrincipal user,
            @RequestBody Map<String, String> payload) {

        UUID agentConfigId = parseUuid(payload.get("agentConfigId"));
        Business business = businessService.resolveBusinessForUser(user.getId());

        // The agent must belong to the caller's own workspace.
        AgentConfig agent = agentConfigRepository.findById(agentConfigId)
                .filter(a -> business.getId().equals(a.getBusinessId()))
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Agent not found."));

        String suffix = UUID.randomUUID().toString().substring(0, 8);
        String roomName = "test-" + agent.getId().toString().substring(0, 8) + "-" + suffix;
        String participantIdentity = "user-" + user.getId().substring(0, 8) + "-" + suffix;

        // Create a call record in the DB (mirrors session.functions.ts)
        Call call = new Call();
        call.setBusinessId(business.getId());
        call.setAgentConfigId(agent.getId());
        call.setProvider("browser");
        call.setProviderCallId(roomName);
        call.setDirection("inbound");
        call.setStatus("ringing");
        call.setRoomName(roomName);
        call.setEscalationRequired(false);
        call.setCurrency("INR");
        call.setStartedAt(OffsetDateTime.now());
        call.setCreatedAt(OffsetDateTime.now());
        call = callRepository.save(call);

        // The agent worker reads business context from the room's metadata, so
        // the room must exist with it before the browser joins.
        String roomMetadata = String.format(
                "{\"agent_config_id\":\"%s\",\"business_id\":\"%s\",\"call_id\":\"%s\",\"mode\":\"web-test\"}",
                agent.getId(), business.getId(), call.getId());
        try {
            RoomServiceClient rooms = RoomServiceClient.Companion.create(
                    httpUrl(livekitUrl), livekitApiKey, livekitApiSecret);
            var created = rooms.createRoom(roomName, 300, 10, null, roomMetadata, null).execute();
            if (!created.isSuccessful()) {
                throw new IOException("LiveKit responded " + created.code());
            }
        } catch (IOException e) {
            call.setStatus("failed");
            call.setEndedAt(OffsetDateTime.now());
            callRepository.save(call);
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Could not create the voice room.", e);
        }

        AccessToken token = new AccessToken(livekitApiKey, livekitApiSecret);
        token.setName("Dashboard Tester");
        token.setIdentity(participantIdentity);
        token.addGrants(new RoomJoin(true), new RoomName(roomName));
        token.setMetadata(String.format("{\"user_id\":\"%s\",\"mode\":\"web-test\"}", user.getId()));

        Map<String, String> response = new HashMap<>();
        response.put("ok", "true");
        response.put("token", token.toJwt());
        response.put("serverUrl", livekitUrl);
        response.put("identity", participantIdentity);
        response.put("roomName", roomName);
        return ResponseEntity.ok(response);
    }

    private static UUID parseUuid(String value) {
        try {
            return UUID.fromString(value);
        } catch (IllegalArgumentException | NullPointerException e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "A valid ID is required.");
        }
    }

    /** RoomServiceClient speaks HTTP(S); LiveKit project URLs are usually ws(s)://. */
    private static String httpUrl(String url) {
        return url.replaceFirst("^ws", "http");
    }
}
