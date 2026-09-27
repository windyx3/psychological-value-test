package com.windy.assessment;

import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.time.LocalDate;
import java.util.*;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import tools.jackson.databind.JsonNode;

@RestController @RequestMapping("/api")
class PlatformController {
    record Create(@NotBlank @Size(max=200) String title,String copyFrom) {}
    record Draft(@Min(1) long revision,@NotNull JsonNode config) {}
    record Revision(@Min(1) long revision) {}
    record Archive(@Min(1) long revision,@NotNull Boolean archived) {}
    record UserUpdate(@NotBlank String role,@NotNull Boolean enabled) {}
    record Assign(@NotBlank String versionId,@NotEmpty @Size(max=200) List<@NotBlank String> userIds) {}
    record Preview(@NotNull JsonNode config,@NotNull JsonNode answers) {}
    record Submit(@NotBlank String assignmentId,@NotBlank String idempotencyKey,@NotNull JsonNode answers) {}
    private final PlatformService service;
    PlatformController(PlatformService service) {this.service=service;}

    @GetMapping("/admin/users") Object users(@RequestParam(defaultValue="") String q,@RequestParam(defaultValue="0") int page) {return service.users(q,page);}
    @GetMapping("/admin/users/{id}") Object user(@PathVariable String id) {return service.user(id);}
    @PatchMapping("/admin/users/{id}") Object updateUser(@PathVariable String id,@Valid @RequestBody UserUpdate body) {return service.updateUser(id,body.role(),body.enabled());}
    @GetMapping("/admin/assessments") Object assessments(@RequestParam(defaultValue="0") int page) {return service.assessments(page);}
    @PostMapping("/admin/assessments") Object create(@Valid @RequestBody Create body) {return service.create(body.title(),body.copyFrom());}
    @GetMapping("/admin/assessments/{id}") Object assessment(@PathVariable String id) {return service.assessment(id);}
    @PutMapping("/admin/assessments/{id}/draft") Object draft(@PathVariable String id,@Valid @RequestBody Draft body) {return service.save(id,body.revision(),body.config());}
    @PostMapping("/admin/assessments/{id}/publish") Object publish(@PathVariable String id,@Valid @RequestBody Revision body) {return service.publish(id,body.revision());}
    @PostMapping("/admin/assessments/{id}/discard") Object discard(@PathVariable String id,@Valid @RequestBody Revision body) {return service.discard(id,body.revision());}
    @PatchMapping("/admin/assessments/{id}") Object archive(@PathVariable String id,@Valid @RequestBody Archive body) {return service.archive(id,body.revision(),body.archived());}
    @PostMapping("/admin/preview") Object preview(@Valid @RequestBody Preview body) {return service.preview(body.config(),body.answers());}
    @PostMapping("/admin/assignments") Object assign(@Valid @RequestBody Assign body) {service.assign(body.versionId(),body.userIds());return Map.of("ok",true);}
    @GetMapping("/admin/assignments") Object assignments(@RequestParam String userId,@RequestParam(defaultValue="0") int page) {return service.assignments(userId,page,true);}
    @DeleteMapping("/admin/assignments/{id}") Object revoke(@PathVariable String id) {service.revoke(id);return Map.of("ok",true);}
    @GetMapping("/me/assignments") Object myAssignments(@AuthenticationPrincipal SecurityConfig.Principal p,@RequestParam(defaultValue="0") int page) {return service.assignments(p.id(),page,false);}
    @GetMapping("/me/assignments/{id}") Object questionnaire(@AuthenticationPrincipal SecurityConfig.Principal p,@PathVariable String id) {return service.questionnaire(p.id(),id);}
    @PostMapping("/me/submissions") Object submit(@AuthenticationPrincipal SecurityConfig.Principal p,@Valid @RequestBody Submit body) {return service.submit(p.id(),p.securityVersion(),body.assignmentId(),body.idempotencyKey(),body.answers());}
    @GetMapping("/me/submissions") Object mySubmissions(@AuthenticationPrincipal SecurityConfig.Principal p,@RequestParam(required=false) String assessmentId,@RequestParam(defaultValue="0") int page) {return service.submissions(p.id(),assessmentId,null,null,page);}
    @GetMapping("/me/submissions/{id}") Object mySubmission(@AuthenticationPrincipal SecurityConfig.Principal p,@PathVariable String id) {return service.submission(p.id(),id,false);}
    @GetMapping("/admin/submissions") Object allSubmissions(@RequestParam(required=false) String userId,@RequestParam(required=false) String assessmentId,@RequestParam(required=false) LocalDate from,@RequestParam(required=false) LocalDate to,@RequestParam(defaultValue="0") int page) {return service.submissions(userId,assessmentId,from,to,page);}
    @GetMapping("/admin/submissions/{id}") Object submission(@PathVariable String id) {return service.submission(null,id,true);}
}
