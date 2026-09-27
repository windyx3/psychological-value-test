package com.windy.assessment;

import static com.windy.assessment.Entities.*;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.time.*;
import java.util.*;
import org.springframework.core.io.ClassPathResource;
import org.springframework.data.domain.*;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.node.ObjectNode;

@Service @Transactional(readOnly=true)
public class PlatformService {
    private final AccountRepository users;
    private final AssessmentRepository assessments;
    private final ReleaseRepository releases;
    private final AssignmentRepository assignments;
    private final SubmissionRepository submissions;
    private final ConfigEngine engine;
    private final JdbcTemplate jdbc;
    PlatformService(AccountRepository users,AssessmentRepository assessments,ReleaseRepository releases,
        AssignmentRepository assignments,SubmissionRepository submissions,ConfigEngine engine,JdbcTemplate jdbc) {
        this.users=users;this.assessments=assessments;this.releases=releases;this.assignments=assignments;this.submissions=submissions;this.engine=engine;this.jdbc=jdbc;
    }
    private <T> T found(Optional<T> value) {return value.orElseThrow(() -> new ApiError(404,"记录不存在或没有访问权限。"));}
    private PageRequest page(int page,String order) {return PageRequest.of(Math.max(0,page),20,Sort.by(order).descending());}
    private Map<String,Object> paged(Page<?> page,List<?> items) {return Map.of("items",items,"page",page.getNumber(),"totalPages",page.getTotalPages(),"total",page.getTotalElements());}
    public JsonNode defaultConfig() {
        try {return engine.parse(new ClassPathResource("default-config.json").getContentAsString(StandardCharsets.UTF_8));}
        catch(IOException e) {throw new IllegalStateException(e);}
    }
    public Map<String,Object> users(String q,int page) {
        // Escape LIKE metacharacters: searches are literal, not a user-controlled pattern.
        String search=q.toLowerCase(Locale.ROOT).replace("\\","\\\\").replace("%","\\%").replace("_","\\_");
        var p=users.search("%"+search+"%",page(page,"createdAt"));return paged(p,p.getContent().stream().map(AuthService::view).toList());
    }
    public Map<String,Object> user(String id) {return AuthService.view(found(users.findById(id)));}
    @Transactional public Map<String,Object> updateUser(String id,String role,boolean enabled) {
        ApiError.require(Set.of("ADMIN","USER").contains(role),400,"身份无效。");
        jdbc.queryForObject("SELECT id FROM platform_guard WHERE id = 1 FOR UPDATE",Integer.class);
        Account u=found(users.locked(id));
        ApiError.require(!role.equals("ADMIN") || u.verified,400,"只有已验证用户才能成为管理员。");
        if (u.role.equals("ADMIN") && u.enabled && (!enabled || !role.equals("ADMIN"))) {
            ApiError.require(users.countByRoleAndEnabledAndVerified("ADMIN",true,true)>1,409,"不能停用或降级最后一位有效管理员。");
        }
        if (!u.role.equals(role) || u.enabled!=enabled) u.securityVersion++;
        u.role=role;u.enabled=enabled;users.save(u);return AuthService.view(u);
    }
    public Map<String,Object> assessments(int page) {
        var p=assessments.findAll(page(page,"updatedAt"));return paged(p,p.getContent().stream().map(this::summary).toList());
    }
    private Map<String,Object> summary(Assessment a) {
        return Map.of("id",a.id,"title",a.title,"revision",a.revision,"publishedVersion",a.publishedVersion,"archived",a.archived,"updatedAt",a.updatedAt);
    }
    public Map<String,Object> assessment(String id) {
        Assessment a=found(assessments.findById(id));
        var result=new LinkedHashMap<>(summary(a));result.put("config",engine.parse(a.draftJson));
        result.put("versions",releases.findByAssessmentIdOrderByVersionNumberDesc(id).stream().map(r -> Map.of("id",r.id,"number",r.versionNumber,"publishedAt",r.publishedAt)).toList());
        return result;
    }
    @Transactional public Map<String,Object> create(String title,String copyFrom) {
        ApiError.require(title!=null && !title.isBlank() && title.length()<=200,400,"请输入200字以内的测验名称。");
        JsonNode config=copyFrom==null ? defaultConfig() : engine.parse(found(assessments.findById(copyFrom)).draftJson);
        ((ObjectNode) config.path("site")).put("title",title.trim());engine.validate(config);
        Assessment a=new Assessment();a.title=title.trim();a.draftJson=engine.json(config);assessments.saveAndFlush(a);return assessment(a.id);
    }
    private Assessment editable(String id,long revision) {
        Assessment a=found(assessments.locked(id));
        ApiError.require(a.revision==revision,409,"草稿已被其他管理员修改，请重新加载。");
        ApiError.require(!a.archived,409,"套题已归档，请恢复后再编辑。");return a;
    }
    @Transactional public Map<String,Object> save(String id,long revision,JsonNode config) {
        engine.validate(config);Assessment a=editable(id,revision);a.draftJson=engine.json(config);a.title=config.path("site").path("title").asText();a.revision++;a.updatedAt=Instant.now();assessments.saveAndFlush(a);return assessment(id);
    }
    @Transactional public Map<String,Object> publish(String id,long revision) {
        Assessment a=editable(id,revision);engine.validate(engine.parse(a.draftJson));
        Release r=new Release();r.assessmentId=id;r.versionNumber=++a.publishedVersion;r.configJson=a.draftJson;
        releases.save(r);a.revision++;a.updatedAt=Instant.now();assessments.saveAndFlush(a);return assessment(id);
    }
    @Transactional public Map<String,Object> discard(String id,long revision) {
        Assessment a=editable(id,revision);
        ApiError.require(a.publishedVersion>0,409,"尚未发布，无法恢复到已发布版本。");
        a.draftJson=found(releases.findByAssessmentIdAndVersionNumber(id,a.publishedVersion)).configJson;
        a.title=engine.parse(a.draftJson).path("site").path("title").asText();a.revision++;a.updatedAt=Instant.now();assessments.saveAndFlush(a);return assessment(id);
    }
    @Transactional public Map<String,Object> archive(String id,long revision,boolean archived) {
        Assessment a=found(assessments.locked(id));ApiError.require(a.revision==revision,409,"版本已变化，请刷新。");
        a.archived=archived;a.revision++;a.updatedAt=Instant.now();assessments.saveAndFlush(a);return assessment(id);
    }
    public Map<String,Object> preview(JsonNode config,JsonNode answers) {
        engine.validate(config);var evaluation=engine.evaluate(config,answers);
        return Map.of("total",evaluation.total(),"result",evaluation.result(),"preview",true);
    }
    @Transactional public void assign(String versionId,List<String> userIds) {
        ApiError.require(userIds!=null && !userIds.isEmpty() && userIds.size()<=200,400,"一次请选择1–200位用户。");
        Release r=found(releases.findById(versionId));Assessment a=found(assessments.locked(r.assessmentId));
        ApiError.require(!a.archived,409,"已归档的套题不能分配。");
        for (String userId : new LinkedHashSet<>(userIds)) {
            Account u=found(users.findById(userId));ApiError.require(u.enabled && u.verified,400,"只能分配给已验证且启用的用户。");
            Assignment assignment=assignments.findByUserIdAndVersionId(userId,versionId).orElseGet(Assignment::new);
            assignment.userId=userId;assignment.versionId=versionId;assignment.active=true;assignment.assignedAt=Instant.now();assignments.save(assignment);
        }
    }
    @Transactional public void revoke(String id) {
        Assignment a=found(assignments.locked(id));a.active=false;assignments.save(a);
    }
    private Map<String,Object> assignmentView(Assignment a) {
        Release r=found(releases.findById(a.versionId));Assessment set=found(assessments.findById(r.assessmentId));
        var c=engine.parse(r.configJson);
        return Map.of("id",a.id,"userId",a.userId,"versionId",r.id,"version",r.versionNumber,"assessmentId",set.id,"title",c.path("site").path("title").asText(),"active",a.active && !set.archived,"assignedAt",a.assignedAt,"questionCount",c.path("questions").size());
    }
    public Map<String,Object> assignments(String userId,int page,boolean admin) {
        var p=admin ? assignments.findByUserId(userId,page(page,"assignedAt")) : assignments.available(userId,page(page,"assignedAt"));
        return paged(p,p.getContent().stream().map(this::assignmentView).toList());
    }
    public Map<String,Object> questionnaire(String userId,String assignmentId) {
        Assignment a=found(assignments.findById(assignmentId));ApiError.require(a.userId.equals(userId),404,"测验不存在或未分配给你。");
        Release r=found(releases.findById(a.versionId));Assessment set=found(assessments.findById(r.assessmentId));
        ApiError.require(a.active && !set.archived,409,"该测验已撤回或归档。");
        var view=new LinkedHashMap<>(assignmentView(a));view.putAll(engine.questionnaire(engine.parse(r.configJson)));return view;
    }
    @Transactional public Map<String,Object> submit(String userId,long securityVersion,String assignmentId,String key,JsonNode answers) {
        ApiError.require(key!=null && key.matches("[a-zA-Z0-9_-]{16,64}"),400,"提交标识无效，请刷新页面。");
        Account user=found(users.locked(userId));
        ApiError.require(user.enabled && user.verified && user.securityVersion==securityVersion,401,"登录已失效，请重新登录。");
        // Serialize submissions per user: retries return the original transaction's result.
        Submission existing=submissions.findByUserIdAndIdempotencyKey(userId,key).orElse(null);
        if (existing!=null) {
            ApiError.require(existing.assignmentId.equals(assignmentId) && engine.parse(existing.answersJson).equals(answers),409,"提交标识已用于不同答案，请开始新一次作答。");
            return submissionView(existing,true);
        }
        Assignment first=found(assignments.findById(assignmentId));ApiError.require(first.userId.equals(userId),404,"测验未分配给你。");
        Release release=found(releases.findById(first.versionId));Assessment set=found(assessments.locked(release.assessmentId));
        Assignment assignment=found(assignments.locked(assignmentId));
        ApiError.require(assignment.active && !set.archived,409,"该测验已撤回或归档。");
        var evaluation=engine.evaluate(engine.parse(release.configJson),answers);
        Submission s=new Submission();s.userId=userId;s.assignmentId=assignmentId;s.versionId=release.id;s.idempotencyKey=key;s.answersJson=engine.json(answers);s.resultJson=engine.json(evaluation.result());s.total=evaluation.total();
        submissions.saveAndFlush(s);return submissionView(s,true);
    }
    private Map<String,Object> submissionView(Submission s,boolean detail) {
        Release r=found(releases.findById(s.versionId));JsonNode c=engine.parse(r.configJson);
        Map<String,Object> view=new LinkedHashMap<>();view.put("id",s.id);view.put("userId",s.userId);view.put("username",found(users.findById(s.userId)).username);
        view.put("assessmentId",r.assessmentId);view.put("assignmentId",s.assignmentId);view.put("version",r.versionNumber);view.put("title",c.path("site").path("title").asText());view.put("submittedAt",s.submittedAt);view.put("total",s.total);view.put("maximum",c.path("questions").size()*10);view.put("result",engine.parse(s.resultJson));
        if(detail) {view.put("questions",c.path("questions"));view.put("answers",engine.parse(s.answersJson));view.put("disclaimer",c.path("site").path("disclaimer").asText());}
        return view;
    }
    public Map<String,Object> submission(String userId,String id,boolean admin) {
        Submission s=found(submissions.findById(id));ApiError.require(admin || s.userId.equals(userId),404,"记录不存在或没有访问权限。");return submissionView(s,true);
    }
    public Map<String,Object> submissions(String userId,String assessmentId,LocalDate from,LocalDate to,int page) {
        Specification<Submission> spec=(root,q,cb) -> cb.conjunction();
        if(userId!=null && !userId.isBlank()) spec=spec.and((root,q,cb)->cb.equal(root.get("userId"),userId));
        if(assessmentId!=null && !assessmentId.isBlank()) {
            List<String> ids=releases.findByAssessmentIdOrderByVersionNumberDesc(assessmentId).stream().map(r->r.id).toList();
            spec=spec.and((root,q,cb)->ids.isEmpty()?cb.disjunction():root.get("versionId").in(ids));
        }
        if(from!=null) spec=spec.and((root,q,cb)->cb.greaterThanOrEqualTo(root.get("submittedAt"),from.atStartOfDay(ZoneOffset.UTC).toInstant()));
        if(to!=null) spec=spec.and((root,q,cb)->cb.lessThan(root.get("submittedAt"),to.plusDays(1).atStartOfDay(ZoneOffset.UTC).toInstant()));
        var p=submissions.findAll(spec,page(page,"submittedAt"));return paged(p,p.getContent().stream().map(s->submissionView(s,false)).toList());
    }
    @Transactional public void importLegacy(JsonNode source) {
        JsonNode draft=source.has("draft")?source.path("draft"):source.has("draft_json")?engine.parse(source.path("draft_json").asText()):source;
        JsonNode published=source.has("published")?source.path("published"):source.has("published_json")?engine.parse(source.path("published_json").asText()):source;
        engine.validate(draft);engine.validate(published);
        Assessment a=new Assessment();a.title=draft.path("site").path("title").asText();a.draftJson=engine.json(draft);a.publishedVersion=1;assessments.saveAndFlush(a);
        Release r=new Release();r.assessmentId=a.id;r.versionNumber=1;r.configJson=engine.json(published);releases.save(r);
    }
}
