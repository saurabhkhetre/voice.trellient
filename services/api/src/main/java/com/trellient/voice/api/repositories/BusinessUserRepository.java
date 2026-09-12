package com.trellient.voice.api.repositories;

import com.trellient.voice.api.models.BusinessUser;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;

public interface BusinessUserRepository extends JpaRepository<BusinessUser, UUID> {

    /**
     * Checks if a user is already a member of any business.
     */
    Optional<BusinessUser> findFirstByAuthUserId(UUID authUserId);

    /**
     * Checks membership in a specific business.
     */
    Optional<BusinessUser> findByBusinessIdAndAuthUserId(UUID businessId, UUID authUserId);

    boolean existsByAuthUserId(UUID authUserId);
}
