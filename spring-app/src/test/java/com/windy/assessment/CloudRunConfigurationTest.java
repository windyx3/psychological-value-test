package com.windy.assessment;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.core.env.Environment;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest(properties={
    "spring.datasource.url=jdbc:h2:mem:cloudrun;MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1",
    "spring.datasource.username=sa","spring.datasource.password=",
    "app.base-url=https://assessment.example.test","app.mail-from=sender@example.test",
    "app.mail-mode=smtp","spring.mail.host=localhost","app.origin-token="
})
@AutoConfigureMockMvc @ActiveProfiles({"prod","cloudrun"})
class CloudRunConfigurationTest {
    @Autowired Environment env;
    @Autowired MockMvc mvc;
    @Autowired MailService mail;

    @Test void productionHasNoPreviewOrDefaultSeedAndAllowsScaleToZero() {
        assertFalse(mail.isPreview());
        assertFalse(env.getProperty("app.seed-default",Boolean.class));
        assertTrue(env.getProperty("server.servlet.session.cookie.secure",Boolean.class));
        assertEquals(0,env.getProperty("spring.datasource.hikari.minimum-idle",Integer.class));
        assertEquals(0,env.getProperty("spring.datasource.hikari.keepalive-time",Integer.class));
        assertFalse(env.getProperty("management.health.mail.enabled",Boolean.class));
    }

    @Test void hostedEntryRetainsAuthorizationAndCsrfProtection() throws Exception {
        mvc.perform(get("/auth/").secure(true)).andExpect(status().isOk());
        mvc.perform(get("/api/admin/users").secure(true)).andExpect(status().isUnauthorized());
        mvc.perform(get("/dev/mail").secure(true)).andExpect(status().is3xxRedirection())
            .andExpect(redirectedUrl("/auth/"));
        mvc.perform(post("/api/auth/register").secure(true).contentType("application/json").content("{}"))
            .andExpect(status().isForbidden());
    }
}
