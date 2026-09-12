package com.trellient.voice.api.models;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Data;
import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.UUID;

@Entity
@Table(name = "calls")
@Data
public class Call {
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "business_id", nullable = false)
    private UUID businessId;

    @Column(name = "customer_id")
    private UUID customerId;

    @Column(name = "agent_config_id")
    private UUID agentConfigId;

    @Column(nullable = false)
    private String provider;

    @Column(name = "provider_call_id")
    private String providerCallId;

    @Column(nullable = false)
    private String direction;

    @Column(name = "caller_number")
    private String callerNumber;

    @Column(name = "destination_number")
    private String destinationNumber;

    @Column(name = "started_at", nullable = false)
    private OffsetDateTime startedAt;

    @Column(name = "answered_at")
    private OffsetDateTime answeredAt;

    @Column(name = "ended_at")
    private OffsetDateTime endedAt;

    @Column(name = "duration_seconds")
    private Integer durationSeconds;

    @Column(nullable = false)
    private String status;

    private String language;
    private String intent;
    private String outcome;

    @Column(name = "escalation_required", nullable = false)
    private Boolean escalationRequired;

    @Column(name = "escalation_reason")
    private String escalationReason;

    @Column(name = "recording_url")
    private String recordingUrl;

    private String summary;

    @Column(name = "room_name")
    private String roomName;

    @Column(name = "latency_ms")
    private Integer latencyMs;

    @Column(name = "telephony_cost")
    private BigDecimal telephonyCost;

    @Column(name = "livekit_cost")
    private BigDecimal livekitCost;

    @Column(name = "llm_cost")
    private BigDecimal llmCost;

    @Column(name = "total_cost")
    private BigDecimal totalCost;

    @Column(nullable = false)
    private String currency;

    @Column(name = "created_at", nullable = false, updatable = false)
    private OffsetDateTime createdAt;
}
