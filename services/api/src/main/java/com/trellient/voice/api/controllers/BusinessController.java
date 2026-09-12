package com.trellient.voice.api.controllers;

import com.trellient.voice.api.models.Business;
import com.trellient.voice.api.security.UserPrincipal;
import com.trellient.voice.api.services.BusinessService;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/business")
public class BusinessController {

    private final BusinessService businessService;

    public BusinessController(BusinessService businessService) {
        this.businessService = businessService;
    }

    @GetMapping("/me")
    public ResponseEntity<Business> getCurrentBusiness(@AuthenticationPrincipal UserPrincipal user) {
        Business business = businessService.resolveBusinessForUser(user.getId());
        return ResponseEntity.ok(business);
    }

    @PostMapping("/provision")
    public ResponseEntity<Business> provisionWorkspace(
            @AuthenticationPrincipal UserPrincipal user,
            @RequestBody Map<String, String> payload) {

        String companyName = payload.get("companyName");
        if (companyName == null || companyName.trim().isEmpty()) {
            return ResponseEntity.badRequest().build();
        }

        Business business = businessService.provisionWorkspace(user.getId(), companyName.trim());
        return ResponseEntity.ok(business);
    }
}
