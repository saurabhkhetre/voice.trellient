package com.trellient.voice.api.services;

import com.trellient.voice.api.models.Business;
import com.trellient.voice.api.models.BusinessUser;
import com.trellient.voice.api.repositories.BusinessRepository;
import com.trellient.voice.api.repositories.BusinessUserRepository;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.OffsetDateTime;
import java.util.UUID;

@Service
public class BusinessService {

    private final BusinessRepository businessRepository;
    private final BusinessUserRepository businessUserRepository;

    public BusinessService(BusinessRepository businessRepository,
                           BusinessUserRepository businessUserRepository) {
        this.businessRepository = businessRepository;
        this.businessUserRepository = businessUserRepository;
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

    /**
     * Creates a new business workspace and links the user as owner.
     * Returns the created business.
     */
    @Transactional
    public Business provisionWorkspace(String userId, String companyName) {
        UUID authUserId = UUID.fromString(userId);

        // Prevent double-provisioning
        if (businessUserRepository.existsByAuthUserId(authUserId)) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT, "User already has a workspace.");
        }

        // Create the business
        Business business = new Business();
        business.setId(UUID.randomUUID());
        business.setName(companyName);
        business.setTimezone("Asia/Kolkata");
        business.setDefaultLanguage("en");
        business.setCreatedAt(OffsetDateTime.now());
        business.setUpdatedAt(OffsetDateTime.now());
        business = businessRepository.save(business);

        // Link the user as owner via business_users
        BusinessUser membership = new BusinessUser();
        membership.setId(UUID.randomUUID());
        membership.setBusinessId(business.getId());
        membership.setAuthUserId(authUserId);
        membership.setRole(BusinessUser.BusinessRole.owner);
        membership.setCreatedAt(OffsetDateTime.now());
        businessUserRepository.save(membership);

        return business;
    }
}
