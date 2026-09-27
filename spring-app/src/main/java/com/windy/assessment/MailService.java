package com.windy.assessment;

import java.time.Instant;
import java.net.URI;
import java.util.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.env.Environment;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.stereotype.Service;
import jakarta.annotation.PostConstruct;

@Service
class MailService {
    record Preview(String to,String subject,String link,Instant sentAt) {}
    private final JavaMailSender sender;
    private final Environment env;
    private final List<Preview> outbox=new ArrayList<>();
    @Value("${app.mail-mode}") String mode;
    @Value("${app.base-url}") String baseUrl;
    @Value("${app.mail-from}") String from;
    MailService(JavaMailSender sender,Environment env) {this.sender=sender;this.env=env;}
    @PostConstruct void validate() {
        if (!Set.of("preview","smtp").contains(mode)) throw new IllegalStateException("MAIL_MODE must be preview or smtp");
        if (mode.equals("preview") && !SecurityConfig.local(env)) throw new IllegalStateException("Mail preview requires the local profile");
        if (Arrays.asList(env.getActiveProfiles()).contains("prod")) {
            if (SecurityConfig.local(env) || !"https".equals(URI.create(baseUrl).getScheme())) throw new IllegalStateException("Production requires HTTPS and cannot enable local profile");
        }
    }
    boolean isPreview() { return mode.equals("preview"); }
    synchronized void send(String email,String purpose,String token) {
        String subject=purpose.equals("VERIFY") ? "验证你的邮箱 · 心理价值测验" : "重置你的密码 · 心理价值测验";
        String link=baseUrl+"/auth/?action="+(purpose.equals("VERIFY") ? "verify" : "reset")+"#token="+token;
        if (isPreview()) {
            if (outbox.size()>=100) outbox.removeFirst();
            outbox.add(new Preview(email,subject,link,Instant.now()));
            return;
        }
        SimpleMailMessage message=new SimpleMailMessage();
        message.setFrom(from);message.setTo(email);message.setSubject(subject);
        message.setText(subject+"\n\n请打开以下链接并确认操作：\n"+link+"\n\n如果不是你发起的请求，请忽略此邮件。");
        sender.send(message);
    }
    synchronized List<Preview> previews() {return List.copyOf(outbox.reversed());}
}
