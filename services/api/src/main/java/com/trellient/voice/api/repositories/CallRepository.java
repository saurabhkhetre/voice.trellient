package com.trellient.voice.api.repositories;

import com.trellient.voice.api.models.Call;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

public interface CallRepository extends JpaRepository<Call, UUID> {
    
    @Query("SELECT c FROM Call c WHERE c.businessId = :businessId AND c.startedAt >= :since")
    List<Call> findByBusinessIdAndStartedAtGreaterThanEqual(
        @Param("businessId") UUID businessId, 
        @Param("since") OffsetDateTime since
    );
    
    long countByBusinessIdAndStartedAtGreaterThanEqual(UUID businessId, OffsetDateTime since);
    
    long countByBusinessIdAndStatusIn(UUID businessId, List<String> statuses);
}
