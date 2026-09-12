package com.trellient.voice.api.repositories;

import com.trellient.voice.api.models.Business;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Optional;
import java.util.UUID;

public interface BusinessRepository extends JpaRepository<Business, UUID> {

    /**
     * Finds the first business a user belongs to, via the business_users join table
     * (oldest membership first).
     */
    @Query("""
        SELECT b FROM Business b
        JOIN BusinessUser bu ON bu.businessId = b.id
        WHERE bu.authUserId = :authUserId
        ORDER BY bu.createdAt ASC
        LIMIT 1
        """)
    Optional<Business> findFirstByAuthUserId(@Param("authUserId") UUID authUserId);
}
