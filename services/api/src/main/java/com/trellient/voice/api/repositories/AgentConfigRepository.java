package com.trellient.voice.api.repositories;

import com.trellient.voice.api.models.AgentConfig;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.UUID;

public interface AgentConfigRepository extends JpaRepository<AgentConfig, UUID> {
    long countByBusinessIdAndEnabled(UUID businessId, Boolean enabled);
}
