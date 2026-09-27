package com.windy.assessment;

import static com.windy.assessment.Entities.*;
import java.nio.charset.StandardCharsets;
import java.security.*;
import java.time.*;
import java.util.*;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.mail.MailException;

@Service
class AuthService {
    private final AccountRepository accounts;
    private final TokenRepository tokens;
    private final PasswordEncoder encoder;
    private final MailService mail;
    private final SecureRandom random=new SecureRandom();
    private final String dummyHash;
    AuthService(AccountRepository accounts,TokenRepository tokens,PasswordEncoder encoder,MailService mail) {
        this.accounts=accounts;this.tokens=tokens;this.encoder=encoder;this.mail=mail;
        dummyHash=encoder.encode(UUID.randomUUID().toString());
    }
    static String normalize(String value) {return value.trim().toLowerCase(Locale.ROOT);}
    static void password(String value) {
        ApiError.require(value!=null && value.length()>=12 && value.getBytes(StandardCharsets.UTF_8).length<=72,400,"密码至少12个字符，UTF-8长度不超过72字节。");
    }
    static Map<String,Object> view(Account u) {
        return Map.of("id",u.id,"username",u.username,"email",u.email,"wechat",u.wechat,"phone",u.phone,"role",u.role,"verified",u.verified,"enabled",u.enabled,"createdAt",u.createdAt);
    }
    @Transactional
    public Map<String,Object> register(AuthController.Registration r) {
        password(r.password());
        ApiError.require(r.password().equals(r.confirmPassword()),400,"两次密码输入不一致。");
        String username=normalize(r.username()), email=normalize(r.email());
        ApiError.require(!accounts.existsByUsernameOrEmail(username,email),409,"账号或邮箱已被使用。");
        Account u=new Account();u.username=username;u.email=email;u.passwordHash=encoder.encode(r.password());u.wechat=r.wechat().trim();u.phone=r.phone().trim();
        accounts.saveAndFlush(u);
        boolean sent=issue(u,"VERIFY");
        return Map.of("ok",true,"mailSent",sent,"message",sent ? "注册成功，请验证邮箱后登录。" : "账号已创建，邮件暂未发送成功，请稍后重新发送。");
    }
    public Account authenticate(String login,String password) {
        String identifier=normalize(login);
        Account u=(identifier.contains("@") ? accounts.findByEmail(identifier) : accounts.findByUsername(identifier)).orElse(null);
        boolean matches=encoder.matches(password,u==null ? dummyHash : u.passwordHash);
        ApiError.require(u!=null && matches,401,"账号或密码不正确。");
        ApiError.require(u.enabled,403,"账号已停用，请联系管理员。");
        ApiError.require(u.verified,403,"请先验证邮箱，可以在登录页重新发送验证邮件。");
        return u;
    }
    @Transactional
    public void resend(String email,String purpose) {
        Account found=accounts.findByEmail(normalize(email)).orElse(null);
        if (found==null) return;
        Account u=accounts.locked(found.id).orElseThrow();
        if (!u.enabled || (purpose.equals("VERIFY") ? u.verified : !u.verified)) return;
        issue(u,purpose);
    }
    private boolean issue(Account u,String purpose) {
        tokens.invalidate(u.id,purpose);
        byte[] bytes=new byte[32];random.nextBytes(bytes);
        String raw=Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
        AuthToken t=new AuthToken();t.userId=u.id;t.tokenHash=hash(raw);t.purpose=purpose;
        t.expiresAt=Instant.now().plus(purpose.equals("VERIFY") ? Duration.ofHours(24) : Duration.ofMinutes(30));
        tokens.saveAndFlush(t);
        try {mail.send(u.email,purpose,raw);return true;}
        catch (MailException ex) {return false;}
    }
    @Transactional
    public void consume(String raw,String purpose,String newPassword) {
        ApiError.require(raw!=null && raw.matches("[A-Za-z0-9_-]{43}"),400,"验证链接无效或已过期。");
        AuthToken found=tokens.findByTokenHash(hash(raw)).orElseThrow(() -> new ApiError(400,"验证链接无效或已过期。"));
        Account u=accounts.locked(found.userId).orElseThrow();
        AuthToken t=tokens.locked(hash(raw)).orElseThrow();
        ApiError.require(!t.used && t.purpose.equals(purpose) && t.expiresAt.isAfter(Instant.now()) && u.enabled,400,"验证链接无效或已过期。");
        if (purpose.equals("VERIFY")) u.verified=true;
        else { password(newPassword);u.passwordHash=encoder.encode(newPassword);u.securityVersion++; }
        t.used=true;tokens.invalidate(u.id,purpose);accounts.save(u);
    }
    static String hash(String value) {
        try {return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8)));}
        catch (NoSuchAlgorithmException e) {throw new IllegalStateException(e);}
    }
}
