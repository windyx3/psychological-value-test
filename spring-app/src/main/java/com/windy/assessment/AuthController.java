package com.windy.assessment;

import jakarta.servlet.http.*;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.util.*;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.context.HttpSessionSecurityContextRepository;
import org.springframework.security.web.csrf.CsrfToken;
import org.springframework.web.bind.annotation.*;

@RestController @RequestMapping("/api/auth")
class AuthController {
    record Registration(
        @NotBlank(message="请输入账号：3–64位英文字母、数字、下划线或短横线。")
        @Pattern(regexp="[A-Za-z0-9_-]{3,64}",message="账号须为3–64位英文字母、数字、下划线或短横线，不含空格。") String username,
        @NotBlank(message="请输入邮箱，例如 name@example.com。")
        @jakarta.validation.constraints.Email(message="请输入有效邮箱，例如 name@example.com。")
        @Size(max=254,message="邮箱不能超过254个字符。") String email,
        @NotBlank(message="请输入微信号，不能只包含空格。")
        @Size(max=100,message="微信号不能超过100个字符。") String wechat,
        @NotBlank(message="请输入手机号，例如 +1 604 555 0123。")
        @Pattern(regexp="[+0-9() -]{6,32}",message="手机号须为6–32个字符，仅含数字、+、括号、空格或短横线，例如 +1 604 555 0123。") String phone,
        @NotBlank(message="请输入密码，至少12个字符，UTF-8长度不超过72字节。")
        @Size(min=12,max=72,message="密码至少12个字符，UTF-8长度不超过72字节。") String password,
        @NotBlank(message="请再次输入相同的密码。")
        @Size(max=72,message="确认密码不能超过72个字符，并须与密码一致。") String confirmPassword) {}
    record Login(@NotBlank @Size(max=254) String login,@NotBlank @Size(max=72) String password) {}
    record Email(@NotBlank @jakarta.validation.constraints.Email @Size(max=254) String email) {}
    record Token(@NotBlank @Size(max=100) String token) {}
    record Reset(@NotBlank @Size(max=100) String token,@NotBlank @Size(max=72) String password,@NotBlank String confirmPassword) {}
    private final AuthService service;
    private final AccountRepository accounts;
    private final RateLimiter limiter;
    private final MailService mail;
    private final HttpSessionSecurityContextRepository repository;
    AuthController(AuthService service, AccountRepository accounts, RateLimiter limiter,MailService mail,HttpSessionSecurityContextRepository repository) {
        this.service=service;this.accounts=accounts;this.limiter=limiter;this.mail=mail;this.repository=repository;
    }
    @GetMapping("/csrf") Map<String,String> csrf(CsrfToken token) {return Map.of("token",token.getToken(),"headerName",token.getHeaderName());}
    @GetMapping("/me") Map<String,Object> me(Authentication auth) {
        Map<String,Object> result=new LinkedHashMap<>();
        result.put("user",auth!=null && auth.getPrincipal() instanceof SecurityConfig.Principal p ? AuthService.view(accounts.findById(p.id()).orElseThrow()) : null);
        result.put("mailPreview",mail.isPreview());return result;
    }
    @PostMapping("/register") Map<String,Object> register(@Valid @RequestBody Registration body,HttpServletRequest req) {
        limiter.check("register:"+req.getRemoteAddr(),5);return service.register(body);
    }
    @PostMapping("/login") Map<String,Object> login(@Valid @RequestBody Login body,HttpServletRequest req,HttpServletResponse res) {
        limiter.check("login:"+req.getRemoteAddr(),15);
        limiter.check("account:"+AuthService.normalize(body.login()),10);
        var u=service.authenticate(body.login(),body.password());
        if (req.getSession(false)!=null) req.getSession(false).invalidate();
        var context=SecurityContextHolder.createEmptyContext();
        context.setAuthentication(UsernamePasswordAuthenticationToken.authenticated(new SecurityConfig.Principal(u.id,u.username,u.securityVersion),null,List.of(new SimpleGrantedAuthority("ROLE_"+u.role))));
        SecurityContextHolder.setContext(context);repository.saveContext(context,req,res);
        return Map.of("user",AuthService.view(u));
    }
    @PostMapping("/verify") Map<String,Boolean> verify(@Valid @RequestBody Token body,HttpServletRequest req) {
        limiter.check("token:"+req.getRemoteAddr(),20);service.consume(body.token(),"VERIFY",null);return Map.of("ok",true);
    }
    @PostMapping({"/resend","/forgot-password"}) Map<String,String> resend(@Valid @RequestBody Email body,HttpServletRequest req) {
        limiter.check("email-ip:"+req.getRemoteAddr(),10);limiter.check("email:"+AuthService.normalize(body.email()),2);
        service.resend(body.email(),req.getRequestURI().endsWith("/resend") ? "VERIFY" : "RESET");
        return Map.of("message","如邮箱符合条件，将收到邮件；若未收到，可一分钟后重试。");
    }
    @PostMapping("/reset-password") Map<String,Boolean> reset(@Valid @RequestBody Reset body,HttpServletRequest req) {
        limiter.check("token:"+req.getRemoteAddr(),20);
        ApiError.field(body.password().equals(body.confirmPassword()),"confirmPassword","两次密码输入不一致，请再次输入相同的密码。");
        service.consume(body.token(),"RESET",body.password());return Map.of("ok",true);
    }
}
