package com.trellient.voice.api.models;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Data;
import java.time.OffsetDateTime;
import java.util.UUID;

@Entity
@Table(name = "calls")
@Data
public class Call {
    @Id
    private UUID id;
    
    @Column(name = "business_id")
    private UUID businessId;
    
    private String direction;
    private String status;
    private String intent;
    
    @Column(name = "escalation_required")
    private Boolean escalationRequired;
    
    @Column(name = "duration_seconds")
    private Integer durationSeconds;
    
    @Column(name = "started_at")
    private OffsetDateTime startedAt;
}
