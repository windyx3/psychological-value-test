package com.windy.assessment;

import org.springframework.boot.SpringApplication;
import org.springframework.security.crypto.password.PasswordEncoder;

/** Local-only browser QA fixture. Test classes are never included in the application JAR. */
public final class BrowserFixture {
    public static void main(String[] args) {
        var app=new SpringApplication(AssessmentApplication.class);
        app.setAdditionalProfiles("local");
        var context=app.run("--server.port=8081","--app.base-url=http://127.0.0.1:8081",
            "--spring.datasource.url=jdbc:h2:mem:browserqa;MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1");
        var users=context.getBean(AccountRepository.class);
        var u=new Entities.Account();u.username="browser_admin";u.email="browser-admin@example.test";u.wechat="synthetic-qa";u.phone="+16045550123";u.role="ADMIN";u.verified=true;
        u.passwordHash=context.getBean(PasswordEncoder.class).encode("Synthetic-browser-password-2026");users.saveAndFlush(u);
        System.out.println("Browser QA fixture ready on localhost:8081 (in-memory synthetic data only).");
    }
}
