package com.trellient.voice.api.models;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Data;
import java.util.UUID;

@Entity
@Table(name = "escalations")
@Data
public class Escalation {
    @Id
    private UUID id;
    
    @Column(name = "business_id")
    private UUID businessId;
    
    private String status;
}
