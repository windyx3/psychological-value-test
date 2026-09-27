package com.windy.assessment;

import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;

public final class Entities {
    private Entities() {}
    static String id() { return UUID.randomUUID().toString(); }

    @Entity(name="Account") @Table(name="app_user")
    public static class Account {
        @Id public String id = Entities.id();
        @Column(nullable=false, unique=true, length=64) public String username;
        @Column(nullable=false, unique=true, length=254) public String email;
        @Column(nullable=false) public String passwordHash;
        @Column(nullable=false, length=100) public String wechat;
        @Column(nullable=false, length=32) public String phone;
        @Column(nullable=false, length=10) public String role = "USER";
        public boolean verified;
        public boolean enabled = true;
        public long securityVersion;
        public Instant createdAt = Instant.now();
    }
    @Entity(name="AuthToken") @Table(name="auth_token")
    public static class AuthToken {
        @Id public String id = Entities.id();
        public String userId;
        @Column(length=64, unique=true) public String tokenHash;
        @Column(length=10) public String purpose;
        public Instant expiresAt;
        public boolean used;
    }
    @Entity(name="Assessment") @Table(name="assessment")
    public static class Assessment {
        @Id public String id = Entities.id();
        @Column(length=200) public String title;
        @Column(columnDefinition="text") public String draftJson;
        public long revision = 1;
        public int publishedVersion;
        public boolean archived;
        public Instant createdAt = Instant.now();
        public Instant updatedAt = Instant.now();
    }
    @Entity(name="Release") @Table(name="assessment_version")
    public static class Release {
        @Id public String id = Entities.id();
        public String assessmentId;
        public int versionNumber;
        @Column(columnDefinition="text") public String configJson;
        public Instant publishedAt = Instant.now();
    }
    @Entity(name="Assignment") @Table(name="assignment")
    public static class Assignment {
        @Id public String id = Entities.id();
        public String userId;
        public String versionId;
        public boolean active = true;
        public Instant assignedAt = Instant.now();
    }
    @Entity(name="Submission") @Table(name="submission")
    public static class Submission {
        @Id public String id = Entities.id();
        public String userId;
        public String assignmentId;
        public String versionId;
        @Column(length=64) public String idempotencyKey;
        @Column(columnDefinition="text") public String answersJson;
        @Column(columnDefinition="text") public String resultJson;
        public int total;
        public Instant submittedAt = Instant.now();
    }
}
