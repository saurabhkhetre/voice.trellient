package com.trellient.voice.api.repositories;

import com.trellient.voice.api.models.Business;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;

public interface BusinessRepository extends JpaRepository<Business, UUID> {
    Optional<Business> findByOwnerId(UUID ownerId);
}
