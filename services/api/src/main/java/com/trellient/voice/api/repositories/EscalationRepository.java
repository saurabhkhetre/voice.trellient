package com.trellient.voice.api.repositories;

import com.trellient.voice.api.models.Escalation;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.UUID;

public interface EscalationRepository extends JpaRepository<Escalation, UUID> {
    long countByBusinessIdAndStatus(UUID businessId, String status);
}
