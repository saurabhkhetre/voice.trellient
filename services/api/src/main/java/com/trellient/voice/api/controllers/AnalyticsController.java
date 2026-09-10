package com.trellient.voice.api.controllers;

import com.trellient.voice.api.models.Business;
import com.trellient.voice.api.models.Call;
import com.trellient.voice.api.repositories.AgentConfigRepository;
import com.trellient.voice.api.repositories.CallRepository;
import com.trellient.voice.api.repositories.EscalationRepository;
import com.trellient.voice.api.security.UserPrincipal;
import com.trellient.voice.api.services.BusinessService;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/stats")
public class AnalyticsController {

    private final CallRepository callRepository;
    private final AgentConfigRepository agentConfigRepository;
    private final EscalationRepository escalationRepository;
    private final BusinessService businessService;

    public AnalyticsController(CallRepository callRepository,
                               AgentConfigRepository agentConfigRepository,
                               EscalationRepository escalationRepository,
                               BusinessService businessService) {
        this.callRepository = callRepository;
        this.agentConfigRepository = agentConfigRepository;
        this.escalationRepository = escalationRepository;
        this.businessService = businessService;
    }

    @GetMapping("/dashboard")
    public Map<String, Object> getDashboardStats(@AuthenticationPrincipal UserPrincipal user) {
        Business business = businessService.resolveBusinessForUser(user.getId());
        
        OffsetDateTime startOfDay = LocalDate.now().atStartOfDay(ZoneId.systemDefault()).toOffsetDateTime();
        
        long callsToday = callRepository.countByBusinessIdAndStartedAtGreaterThanEqual(business.getId(), startOfDay);
        long activeCalls = callRepository.countByBusinessIdAndStatusIn(business.getId(), List.of("ringing", "in_progress"));
        long activeAgents = agentConfigRepository.countByBusinessIdAndEnabled(business.getId(), true);
        long openEscalations = escalationRepository.countByBusinessIdAndStatus(business.getId(), "open");
        
        Map<String, Object> stats = new HashMap<>();
        stats.put("callsToday", callsToday);
        stats.put("activeCalls", activeCalls);
        stats.put("activeAgents", activeAgents);
        stats.put("openEscalations", openEscalations);
        return stats;
    }

    @GetMapping("/analytics")
    public Map<String, Object> getAnalyticsStats(@AuthenticationPrincipal UserPrincipal user,
                                                 @RequestParam(defaultValue = "30d") String range) {
        Business business = businessService.resolveBusinessForUser(user.getId());
        
        OffsetDateTime since = getSinceFromRange(range);
        
        List<Call> calls = callRepository.findByBusinessIdAndStartedAtGreaterThanEqual(business.getId(), since);
        
        int totalCalls = calls.size();
        long answeredCalls = calls.stream().filter(c -> "completed".equals(c.getStatus())).count();
        long missedCalls = calls.stream().filter(c -> "missed".equals(c.getStatus())).count();
        long failedCalls = calls.stream().filter(c -> "failed".equals(c.getStatus())).count();
        
        int totalSeconds = calls.stream().mapToInt(c -> c.getDurationSeconds() != null ? c.getDurationSeconds() : 0).sum();
        double totalMinutes = Math.round((totalSeconds / 60.0) * 10.0) / 10.0;
        long avgDuration = answeredCalls > 0 ? Math.round((double) totalSeconds / answeredCalls) : 0;
        
        long escalationCount = calls.stream().filter(c -> Boolean.TRUE.equals(c.getEscalationRequired())).count();
        long escalationRate = totalCalls > 0 ? Math.round(((double) escalationCount / totalCalls) * 100) : 0;
        long containmentRate = totalCalls > 0 ? 100 - escalationRate : 100;
        
        Map<String, Long> intentMap = new HashMap<>();
        for (Call c : calls) {
            if (c.getIntent() != null && !c.getIntent().isEmpty()) {
                intentMap.put(c.getIntent(), intentMap.getOrDefault(c.getIntent(), 0L) + 1);
            }
        }
        
        List<Map<String, Object>> topIntents = intentMap.entrySet().stream()
                .sorted(Map.Entry.<String, Long>comparingByValue().reversed())
                .limit(10)
                .map(e -> {
                    Map<String, Object> m = new HashMap<>();
                    m.put("intent", e.getKey());
                    m.put("count", e.getValue());
                    return m;
                })
                .collect(Collectors.toList());
                
        long inbound = calls.stream().filter(c -> "inbound".equals(c.getDirection())).count();
        long outbound = calls.stream().filter(c -> "outbound".equals(c.getDirection())).count();
        
        Map<String, Long> callsByStatus = new HashMap<>();
        for (Call c : calls) {
            callsByStatus.put(c.getStatus(), callsByStatus.getOrDefault(c.getStatus(), 0L) + 1);
        }
        
        Map<String, Object> result = new HashMap<>();
        result.put("totalCalls", totalCalls);
        result.put("answeredCalls", answeredCalls);
        result.put("missedCalls", missedCalls);
        result.put("failedCalls", failedCalls);
        result.put("totalMinutes", totalMinutes);
        result.put("avgDuration", avgDuration);
        result.put("escalationCount", escalationCount);
        result.put("escalationRate", escalationRate);
        result.put("containmentRate", containmentRate);
        result.put("topIntents", topIntents);
        result.put("callsByDirection", Map.of("inbound", inbound, "outbound", outbound));
        result.put("callsByStatus", callsByStatus);
        
        return result;
    }

    private OffsetDateTime getSinceFromRange(String range) {
        OffsetDateTime now = OffsetDateTime.now();
        return switch (range) {
            case "today" -> LocalDate.now().atStartOfDay(ZoneId.systemDefault()).toOffsetDateTime();
            case "7d" -> now.minusDays(7);
            case "90d" -> now.minusDays(90);
            case "all" -> now.minusYears(10);
            default -> now.minusDays(30); // 30d is default
        };
    }
}
