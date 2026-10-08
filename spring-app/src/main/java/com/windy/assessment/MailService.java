package com.windy.assessment;

import java.time.Instant;
import java.net.URI;
import java.util.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.core.env.Environment;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.MailSendException;
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
    @Autowired(required=false) software.amazon.awssdk.services.sesv2.SesV2Client ses;
    MailService(JavaMailSender sender,Environment env) {this.sender=sender;this.env=env;}
    @PostConstruct void validate() {
        if (!Set.of("preview","smtp","ses").contains(mode)) throw new IllegalStateException("MAIL_MODE must be preview, smtp or ses");
        if (mode.equals("ses") && ses==null) throw new IllegalStateException("SES client is required in ses mail mode");
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
        String body=subject+"\n\n请打开以下链接并确认操作：\n"+link+"\n\n如果不是你发起的请求，请忽略此邮件。";
        if (mode.equals("ses")) {
            try {
                ses.sendEmail(request -> request.fromEmailAddress(from).destination(d -> d.toAddresses(email))
                    .content(c -> c.simple(m -> m.subject(s -> s.data(subject).charset("UTF-8"))
                        .body(b -> b.text(t -> t.data(body).charset("UTF-8"))))));
            } catch (software.amazon.awssdk.core.exception.SdkException ex) {
                throw new MailSendException("Email delivery failed",ex);
            }
            return;
        }
        SimpleMailMessage message=new SimpleMailMessage();
        message.setFrom(from);message.setTo(email);message.setSubject(subject);
        message.setText(body);
        sender.send(message);
    }
    synchronized List<Preview> previews() {return List.copyOf(outbox.reversed());}
}
