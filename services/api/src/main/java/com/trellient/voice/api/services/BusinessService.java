package com.trellient.voice.api.services;

import com.trellient.voice.api.models.Business;
import com.trellient.voice.api.repositories.BusinessRepository;
import org.springframework.stereotype.Service;

import java.util.UUID;

@Service
public class BusinessService {

    private final BusinessRepository businessRepository;

    public BusinessService(BusinessRepository businessRepository) {
        this.businessRepository = businessRepository;
    }

    public Business resolveBusinessForUser(String userId) {
        return businessRepository.findByOwnerId(UUID.fromString(userId))
                .orElseThrow(() -> new RuntimeException("Business not found for user"));
    }
}
