package com.windy.assessment;

import static com.windy.assessment.Entities.*;
import jakarta.persistence.LockModeType;
import java.util.*;
import org.springframework.data.domain.*;
import org.springframework.data.jpa.repository.*;

interface AccountRepository extends JpaRepository<Account, String> {
    Optional<Account> findByUsername(String username);
    Optional<Account> findByEmail(String email);
    boolean existsByUsernameOrEmail(String username, String email);
    long countByRoleAndEnabledAndVerified(String role, boolean enabled, boolean verified);
    @Lock(LockModeType.PESSIMISTIC_WRITE) @Query("select u from Account u where u.id = :id")
    Optional<Account> locked(String id);
    @Query("select u from Account u where lower(u.username) like :q or lower(u.email) like :q or u.phone like :q or lower(u.wechat) like :q")
    Page<Account> search(String q, Pageable pageable);
}
interface TokenRepository extends JpaRepository<AuthToken, String> {
    Optional<AuthToken> findByTokenHash(String hash);
    @Lock(LockModeType.PESSIMISTIC_WRITE) @Query("select t from AuthToken t where t.tokenHash = :hash")
    Optional<AuthToken> locked(String hash);
    @Modifying @Query("update AuthToken t set t.used = true where t.userId = :userId and t.purpose = :purpose")
    void invalidate(String userId, String purpose);
}
interface AssessmentRepository extends JpaRepository<Assessment, String> {
    @Lock(LockModeType.PESSIMISTIC_WRITE) @Query("select a from Assessment a where a.id = :id")
    Optional<Assessment> locked(String id);
}
interface ReleaseRepository extends JpaRepository<Release, String> {
    List<Release> findByAssessmentIdOrderByVersionNumberDesc(String assessmentId);
    Optional<Release> findByAssessmentIdAndVersionNumber(String assessmentId, int versionNumber);
}
interface AssignmentRepository extends JpaRepository<Assignment, String> {
    Optional<Assignment> findByUserIdAndVersionId(String userId, String versionId);
    @Lock(LockModeType.PESSIMISTIC_WRITE) @Query("select a from Assignment a where a.id = :id")
    Optional<Assignment> locked(String id);
    Page<Assignment> findByUserIdAndActiveTrue(String userId, Pageable page);
    @Query("select a from Assignment a, Release r, Assessment s where a.versionId=r.id and r.assessmentId=s.id and a.userId=:userId and a.active=true and s.archived=false")
    Page<Assignment> available(String userId, Pageable page);
    Page<Assignment> findByUserId(String userId, Pageable page);
}
interface SubmissionRepository extends JpaRepository<Submission, String>, JpaSpecificationExecutor<Submission> {
    Optional<Submission> findByUserIdAndIdempotencyKey(String userId, String idempotencyKey);
}
