package com.trellient.voice.api.controllers;

import com.trellient.voice.api.models.Business;
import com.trellient.voice.api.repositories.BusinessRepository;
import com.trellient.voice.api.security.UserPrincipal;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.time.OffsetDateTime;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/business")
public class BusinessController {

    private final BusinessRepository businessRepository;

    public BusinessController(BusinessRepository businessRepository) {
        this.businessRepository = businessRepository;
    }

    @PostMapping("/provision")
    public ResponseEntity<Business> provisionWorkspace(@AuthenticationPrincipal UserPrincipal user,
                                                       @RequestBody Map<String, String> payload) {
        String companyName = payload.get("companyName");
        if (companyName == null || companyName.trim().isEmpty()) {
            return ResponseEntity.badRequest().build();
        }

        UUID ownerId = UUID.fromString(user.getId());

        // Check if user already has a business
        if (businessRepository.findByOwnerId(ownerId).isPresent()) {
            return ResponseEntity.badRequest().build(); // Already provisioned
        }

        Business business = new Business();
        business.setId(UUID.randomUUID());
        business.setName(companyName);
        business.setOwnerId(ownerId);
        business.setCreatedAt(OffsetDateTime.now());

        business = businessRepository.save(business);
        return ResponseEntity.ok(business);
    }
}
