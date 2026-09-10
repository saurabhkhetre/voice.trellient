package com.trellient.voice.api.models;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Data;
import java.time.OffsetDateTime;
import java.util.UUID;

@Entity
@Table(name = "businesses")
@Data
public class Business {
    @Id
    private UUID id;
    private String name;
    
    @Column(name = "owner_id")
    private UUID ownerId;
    
    @Column(name = "created_at")
    private OffsetDateTime createdAt;
}
