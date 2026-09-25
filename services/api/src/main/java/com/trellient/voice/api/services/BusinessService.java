package com.trellient.voice.api.services;

import com.trellient.voice.api.models.Business;
import com.trellient.voice.api.repositories.BusinessRepository;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.util.UUID;

@Service
public class BusinessService {

    private final BusinessRepository businessRepository;

    public BusinessService(BusinessRepository businessRepository) {
        this.businessRepository = businessRepository;
    }

    /**
     * Resolves the business a user belongs to via the business_users join
     * table: the oldest membership wins, as in the web app's resolveBusinessId().
     */
    public Business resolveBusinessForUser(String userId) {
        UUID authUserId = UUID.fromString(userId);
        return businessRepository.findFirstByAuthUserId(authUserId)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND, "No workspace found for this user."));
    }

    // Provisioning lives in BusinessController, which mirrors the web app's
    // provision.functions.ts contract (optional name, idempotent, seeds a
    // starter agent). Keeping a second implementation here invited exactly the
    // drift this migration exists to remove.
}
