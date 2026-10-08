package com.windy.assessment;

import org.junit.jupiter.api.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.test.context.ActiveProfiles;
import jakarta.servlet.http.Cookie;
import org.springframework.test.web.servlet.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import java.time.Instant;
import java.util.*;
import tools.jackson.databind.*;
import tools.jackson.databind.node.*;

@SpringBootTest(properties={
    "spring.datasource.url=${TEST_DATABASE_URL:jdbc:h2:mem:platform;MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1}",
    "spring.datasource.username=${TEST_DATABASE_USERNAME:sa}","spring.datasource.password=${TEST_DATABASE_PASSWORD:}",
    "app.seed-default=false"
})
@AutoConfigureMockMvc @ActiveProfiles("local")
class PlatformIntegrationTest {
    @Autowired MockMvc mvc;
    @Autowired ObjectMapper mapper;
    @Autowired JdbcTemplate jdbc;
    @Autowired AccountRepository users;
    @Autowired TokenRepository tokens;
    @Autowired SubmissionRepository submissions;
    @Autowired AssessmentRepository assessments;
    @Autowired PlatformService platform;
    @Autowired ConfigEngine engine;
    @Autowired PasswordEncoder encoder;
    @Autowired MailService mail;
    @Autowired AuthService auth;
    static final String PASSWORD="Synthetic-test-password-2026";
    int sequence=0;
    @BeforeEach void clean() {
        for(String table:List.of("submission","assignment","assessment_version","assessment","auth_token","app_user"))jdbc.update("DELETE FROM "+table);
    }
    Entities.Account account(String role) {
        var u=new Entities.Account();u.username="test_"+UUID.randomUUID().toString().substring(0,8);u.email=u.username+"@example.test";u.wechat="synthetic";u.phone="+16045550123";u.role=role;u.verified=true;u.passwordHash=encoder.encode(PASSWORD);return users.saveAndFlush(u);
    }
    Cookie login(Entities.Account u) throws Exception {
        return (Cookie)mvc.perform(post("/api/auth/login").with(csrf()).with(r->{r.setRemoteAddr("127.0.1."+(++sequence));return r;}).contentType("application/json").content(engine.json(Map.of("login",u.username,"password",PASSWORD))))
            .andExpect(status().isOk()).andReturn().getResponse().getCookie("SESSION");
    }
    JsonNode body(MvcResult r) throws Exception {return mapper.readTree(r.getResponse().getContentAsString());}
    JsonNode published() {
        var a=platform.create("版本测试",null);return engine.tree(platform.publish((String)a.get("id"),((Number)a.get("revision")).longValue()));
    }
    String assign(Entities.Account u,JsonNode assessment) {
        platform.assign(assessment.path("versions").get(0).path("id").asText(),List.of(u.id));
        return engine.tree(platform.assignments(u.id,0,false)).path("items").get(0).path("id").asText();
    }
    ObjectNode answers(int score) {
        var n=mapper.createObjectNode();for(JsonNode q:platform.defaultConfig().path("questions"))n.put(q.path("id").asText(),score);return n;
    }
    String submitBody(String assignment,String key,JsonNode answers) {return engine.json(Map.of("assignmentId",assignment,"idempotencyKey",key,"answers",answers));}

    @Test void registrationErrorsIdentifyFieldsWithoutEchoingCredentials() throws Exception {
        var invalid=Map.of("username","bad name!","email","invalid-email","wechat","   ","phone","123","password","short","confirmPassword","");
        var response=body(mvc.perform(post("/api/auth/register").with(csrf()).contentType("application/json").content(engine.json(invalid)))
            .andExpect(status().isBadRequest()).andReturn());
        for(String name:invalid.keySet()) assertTrue(response.path("fieldErrors").has(name),name);
        assertTrue(response.path("fieldErrors").path("phone").asText().contains("6–32"));
        assertFalse(response.toString().contains("short"));
        assertEquals(0,users.count());
        var valid=new HashMap<String,String>(Map.of("username","field_test","email","field-test@example.test","wechat","synthetic","phone","+16045550123","password",PASSWORD,"confirmPassword",PASSWORD+"!"));
        mvc.perform(post("/api/auth/register").with(csrf()).contentType("application/json").content(engine.json(valid)))
            .andExpect(status().isBadRequest()).andExpect(jsonPath("$.fieldErrors.confirmPassword").isString());
        valid.put("password","密".repeat(25));valid.put("confirmPassword","密".repeat(25));
        mvc.perform(post("/api/auth/register").with(csrf()).contentType("application/json").content(engine.json(valid)))
            .andExpect(status().isBadRequest()).andExpect(jsonPath("$.fieldErrors.password").isString());
        assertEquals(0,users.count());
    }
    @Test void registrationVerificationResendAndPasswordReset() throws Exception {
        String name="registration_"+UUID.randomUUID().toString().substring(0,8),email=name+"@example.test";
        var form=Map.of("username",name,"email",email,"wechat","test-contact","phone","+16045550123","password",PASSWORD,"confirmPassword",PASSWORD);
        mvc.perform(post("/api/auth/register").with(csrf()).contentType("application/json").content(engine.json(form))).andExpect(status().isOk());
        var u=users.findByUsername(name).orElseThrow();assertFalse(u.verified);assertNotEquals(PASSWORD,u.passwordHash);
        mvc.perform(post("/api/auth/login").with(csrf()).contentType("application/json").content(engine.json(Map.of("login",name,"password",PASSWORD)))).andExpect(status().isForbidden());
        String token=mail.previews().stream().filter(m->m.to().equals(email)).findFirst().orElseThrow().link().split("#token=")[1];
        assertTrue(tokens.findByTokenHash(AuthService.hash(token)).isPresent());
        mvc.perform(post("/api/auth/verify").with(csrf()).contentType("application/json").content(engine.json(Map.of("token",token)))).andExpect(status().isOk());
        mvc.perform(post("/api/auth/verify").with(csrf()).contentType("application/json").content(engine.json(Map.of("token",token)))).andExpect(status().isBadRequest());
        Cookie session=login(u);
        mvc.perform(post("/api/auth/forgot-password").with(csrf()).contentType("application/json").content(engine.json(Map.of("email",email)))).andExpect(status().isOk());
        String reset=mail.previews().stream().filter(m->m.to().equals(email)).findFirst().orElseThrow().link().split("#token=")[1];
        mvc.perform(post("/api/auth/reset-password").with(csrf()).contentType("application/json").content(engine.json(Map.of("token",reset,"password",PASSWORD+"!","confirmPassword",PASSWORD+"!")))).andExpect(status().isOk());
        mvc.perform(get("/api/me/assignments").cookie(session)).andExpect(status().isUnauthorized());
        mvc.perform(post("/api/auth/register").with(csrf()).contentType("application/json").content(engine.json(form))).andExpect(status().isConflict());
    }
    @Test @org.springframework.transaction.annotation.Transactional
    void smtpFailureKeepsAccountPendingAndResendCanRecover() {
        var sender=org.mockito.Mockito.mock(org.springframework.mail.javamail.JavaMailSender.class);
        var environment=new org.springframework.mock.env.MockEnvironment();environment.setActiveProfiles("prod");
        var smtp=new MailService(sender,environment);smtp.mode="smtp";smtp.baseUrl="https://assessment.example.test";smtp.from="sender@example.test";smtp.validate();
        var service=new AuthService(users,tokens,encoder,smtp);
        org.mockito.Mockito.doThrow(new org.springframework.mail.MailSendException("Synthetic transport failure"))
            .when(sender).send(org.mockito.ArgumentMatchers.any(org.springframework.mail.SimpleMailMessage.class));
        var form=new AuthController.Registration("smtp_test","smtp-test@example.test","synthetic","+16045550123",PASSWORD,PASSWORD);
        var result=service.register(form);
        assertEquals(false,result.get("mailSent"));
        var account=users.findByUsername("smtp_test").orElseThrow();assertFalse(account.verified);
        assertEquals(403,assertThrows(ApiError.class,()->service.authenticate(form.username(),PASSWORD)).status);
        org.mockito.Mockito.doNothing().when(sender).send(org.mockito.ArgumentMatchers.any(org.springframework.mail.SimpleMailMessage.class));
        service.resend(form.email(),"VERIFY");
        var messages=org.mockito.ArgumentCaptor.forClass(org.springframework.mail.SimpleMailMessage.class);
        org.mockito.Mockito.verify(sender,org.mockito.Mockito.times(2)).send(messages.capture());
        var sent=messages.getValue();assertEquals(form.email(),sent.getTo()[0]);assertEquals(smtp.from,sent.getFrom());
        assertTrue(sent.getText().contains("https://assessment.example.test/auth/?action=verify#token="));
        String raw=sent.getText().split("#token=")[1].split("\\n")[0];
        service.consume(raw,"VERIFY",null);assertTrue(users.findByUsername(form.username()).orElseThrow().verified);
        assertThrows(ApiError.class,()->service.consume(raw,"VERIFY",null));
        smtp.mode="preview";assertThrows(IllegalStateException.class,smtp::validate);
    }
    @Test void permissionCsrfAndRoleChanges() throws Exception {
        var admin=account("ADMIN");var u=account("USER");var userSession=login(u);
        mvc.perform(get("/api/admin/users").cookie(userSession)).andExpect(status().isForbidden());
        mvc.perform(get("/admin/").cookie(userSession)).andExpect(status().isForbidden());
        mvc.perform(post("/api/auth/register").contentType("application/json").content("{}")).andExpect(status().isForbidden());
        var adminSession=login(admin);
        mvc.perform(get("/api/admin/users").cookie(adminSession)).andExpect(status().isOk()).andExpect(content().string(org.hamcrest.Matchers.not(org.hamcrest.Matchers.containsString("passwordHash"))));
        assertThrows(ApiError.class,()->platform.updateUser(admin.id,"USER",true));
        platform.updateUser(u.id,"ADMIN",true);
        mvc.perform(get("/api/me/assignments").cookie(userSession)).andExpect(status().isUnauthorized());
        var promoted=login(users.findById(u.id).orElseThrow());
        mvc.perform(get("/api/admin/assessments").cookie(promoted)).andExpect(status().isOk());
        platform.updateUser(u.id,"ADMIN",false);
        mvc.perform(get("/api/admin/users").cookie(promoted)).andExpect(status().isUnauthorized());
    }
    @Test void versionsAssignmentsOwnershipIdempotencyAndArchive() throws Exception {
        var u=account("USER");var other=account("USER");var published=published();String setId=published.path("id").asText();String assignment=assign(u,published);
        var session=login(u);var otherSession=login(other);
        mvc.perform(get("/api/me/assignments/"+assignment).cookie(otherSession)).andExpect(status().isNotFound());
        var questionnaire=body(mvc.perform(get("/api/me/assignments/"+assignment).cookie(session)).andExpect(status().isOk()).andReturn());
        assertFalse(questionnaire.has("config"));assertFalse(questionnaire.has("results"));
        String key=UUID.randomUUID().toString(),payload=submitBody(assignment,key,answers(7));
        var record=body(mvc.perform(post("/api/me/submissions").cookie(session).with(csrf()).contentType("application/json").content(payload)).andExpect(status().isOk()).andReturn());
        assertEquals("S",record.path("result").path("code").asText());assertFalse(record.path("result").has("groups"));
        mvc.perform(post("/api/me/submissions").cookie(session).with(csrf()).contentType("application/json").content(payload)).andExpect(status().isOk());assertEquals(1,submissions.count());
        mvc.perform(post("/api/me/submissions").cookie(session).with(csrf()).contentType("application/json").content(submitBody(assignment,key,answers(8)))).andExpect(status().isConflict());
        mvc.perform(post("/api/me/submissions").cookie(session).with(csrf()).contentType("application/json").content(submitBody(assignment,UUID.randomUUID().toString(),answers(8)))).andExpect(status().isOk());assertEquals(2,submissions.count());
        mvc.perform(get("/api/me/submissions/"+record.path("id").asText()).cookie(otherSession)).andExpect(status().isNotFound());
        JsonNode config=published.path("config").deepCopy();((ObjectNode)config.path("questions").get(0)).put("text","新版本题目");
        long revision=published.path("revision").asLong();var saved=platform.save(setId,revision,config);
        assertThrows(ApiError.class,()->platform.save(setId,revision,config));
        var after=platform.publish(setId,((Number)saved.get("revision")).longValue());
        assertNotEquals("新版本题目",engine.tree(platform.questionnaire(u.id,assignment)).path("questions").get(0).path("text").asText());
        assertEquals(1,engine.tree(platform.submission(u.id,record.path("id").asText(),false)).path("version").asInt());
        platform.archive(setId,((Number)after.get("revision")).longValue(),true);
        mvc.perform(post("/api/me/submissions").cookie(session).with(csrf()).contentType("application/json").content(submitBody(assignment,UUID.randomUUID().toString(),answers(7)))).andExpect(status().isConflict());
        mvc.perform(get("/api/me/submissions/"+record.path("id").asText()).cookie(session)).andExpect(status().isOk());
    }
    @Test void rejectsForgedResultsAndInvalidAnswersAndDoesNotRecordPreview() throws Exception {
        var admin=account("ADMIN");var u=account("USER");var published=published();String assignment=assign(u,published);var session=login(u);
        ObjectNode body=(ObjectNode)engine.parse(submitBody(assignment,UUID.randomUUID().toString(),answers(5)));body.put("userId",admin.id);body.put("total",150);
        mvc.perform(post("/api/me/submissions").cookie(session).with(csrf()).contentType("application/json").content(engine.json(body))).andExpect(status().isBadRequest());
        mvc.perform(post("/api/me/submissions").cookie(session).with(csrf()).contentType("application/json").content(submitBody(assignment,UUID.randomUUID().toString(),answers(11)))).andExpect(status().isBadRequest());
        platform.preview(platform.defaultConfig(),answers(7));assertEquals(0,submissions.count());
        platform.revoke(assignment);
        mvc.perform(get("/api/me/assignments/"+assignment).cookie(session)).andExpect(status().isConflict());
    }
    @Test void expiredTokensAreRejectedAndSetsRemainIndependent() {
        var u=account("USER");u.verified=false;users.saveAndFlush(u);
        String raw="a".repeat(43);var t=new Entities.AuthToken();t.userId=u.id;t.purpose="VERIFY";t.tokenHash=AuthService.hash(raw);t.expiresAt=Instant.now().minusSeconds(1);tokens.saveAndFlush(t);
        assertThrows(ApiError.class,()->auth.consume(raw,"VERIFY",null));
        var one=platform.create("一",null);var two=platform.create("二",(String)one.get("id"));assertNotEquals(one.get("id"),two.get("id"));
        assertEquals("一",platform.assessment((String)one.get("id")).get("title"));assertEquals("二",platform.assessment((String)two.get("id")).get("title"));
    }
    @Test void concurrentRetryAndMailboxIsolation() throws Exception {
        var u=account("USER");var published=published();String assignment=assign(u,published);String key=UUID.randomUUID().toString();
        try(var executor=java.util.concurrent.Executors.newFixedThreadPool(2)) {
            var gate=new java.util.concurrent.CountDownLatch(1);
            var one=executor.submit(()->{gate.await();return platform.submit(u.id,0,assignment,key,answers(7));});
            var two=executor.submit(()->{gate.await();return platform.submit(u.id,0,assignment,key,answers(7));});
            gate.countDown();assertEquals(one.get().get("id"),two.get().get("id"));assertEquals(1,submissions.count());
        }
        mvc.perform(get("/dev/mail").with(r->{r.setRemoteAddr("203.0.113.10");return r;})).andExpect(status().is3xxRedirection());
        mvc.perform(get("/dev/mail").with(r->{r.setRemoteAddr("127.0.0.1");return r;})).andExpect(status().isOk());
    }
}
