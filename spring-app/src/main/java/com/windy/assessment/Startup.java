package com.windy.assessment;

import java.io.Console;
import java.nio.file.*;
import java.util.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionTemplate;

@Component
class Startup implements ApplicationRunner {
    private final AccountRepository users;
    private final AssessmentRepository assessments;
    private final PlatformService service;
    private final ConfigEngine engine;
    private final PasswordEncoder encoder;
    private final TransactionTemplate transactions;
    private final JdbcTemplate jdbc;
    @Value("${app.command:}") String command;
    @Value("${app.import-file:}") String importFile;
    @Value("${app.seed-default}") boolean seedDefault;
    Startup(AccountRepository users,AssessmentRepository assessments,PlatformService service,ConfigEngine engine,PasswordEncoder encoder,TransactionTemplate transactions,JdbcTemplate jdbc) {
        this.users=users;this.assessments=assessments;this.service=service;this.engine=engine;this.encoder=encoder;this.transactions=transactions;this.jdbc=jdbc;
    }
    @Override public void run(ApplicationArguments args) throws Exception {
        if (command.equals("bootstrap-admin")) {bootstrap();return;}
        if (command.equals("import-legacy")) {
            ApiError.require(!importFile.isBlank(),400,"Set --app.import-file to a legacy JSON export.");
            var node=engine.parse(Files.readString(Path.of(importFile)));
            // Accept the JSON results emitted by wrangler d1 execute --json.
            if (node.isArray() && node.size()==1) node=node.get(0);
            if (node.has("results")) node=node.path("results").get(0);
            service.importLegacy(node);System.out.println("Legacy configuration imported as a separate assessment.");return;
        }
        if (!command.isBlank()) throw new IllegalArgumentException("Unknown app.command");
        if (seedDefault && assessments.count()==0) service.importLegacy(service.defaultConfig());
    }
    private void bootstrap() {
        Console console=System.console();
        if (console==null) throw new IllegalStateException("Run java -jar directly in an interactive terminal (not through Maven or a pipe).");
        String username=console.readLine("Admin username (3-64 letters/digits/_/-): ");
        String email=console.readLine("Admin email: ");
        String wechat=console.readLine("WeChat contact: ");
        String phone=console.readLine("Phone: ");
        char[] chars=console.readPassword("Password (12+ characters): ");
        if (chars==null) throw new IllegalArgumentException("Cancelled");
        String password=new String(chars);Arrays.fill(chars,'\0');AuthService.password(password);
        ApiError.require(username!=null && username.matches("[A-Za-z0-9_-]{3,64}") && email!=null && email.matches("[^\\s@]+@[^\\s@]+\\.[^\\s@]+") && email.length()<=254,400,"Invalid username or email.");
        ApiError.require(wechat!=null && !wechat.isBlank() && wechat.length()<=100 && phone!=null && phone.matches("[+0-9() -]{6,32}"),400,"Invalid contact information.");
        String hash=encoder.encode(password);
        transactions.executeWithoutResult(status -> {
            jdbc.queryForObject("SELECT id FROM platform_guard WHERE id=1 FOR UPDATE",Integer.class);
            ApiError.require(users.countByRoleAndEnabledAndVerified("ADMIN",true,true)==0,409,"An active administrator already exists; use the admin UI.");
            ApiError.require(!users.existsByUsernameOrEmail(AuthService.normalize(username),AuthService.normalize(email)),409,"Username or email already exists.");
            var u=new Entities.Account();u.username=AuthService.normalize(username);u.email=AuthService.normalize(email);u.wechat=wechat.trim();u.phone=phone.trim();u.passwordHash=hash;u.role="ADMIN";u.verified=true;users.saveAndFlush(u);
        });
        System.out.println("Initial administrator created. You can now start the app and sign in.");
    }
}
