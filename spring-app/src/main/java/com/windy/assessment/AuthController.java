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
    record Registration(@NotBlank @Pattern(regexp="[A-Za-z0-9_-]{3,64}") String username,
        @NotBlank @jakarta.validation.constraints.Email @Size(max=254) String email,
        @NotBlank @Size(max=100) String wechat,
        @NotBlank @Pattern(regexp="[+0-9() -]{6,32}") String phone,
        @NotBlank @Size(max=72) String password,@NotBlank @Size(max=72) String confirmPassword) {}
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
        ApiError.require(body.password().equals(body.confirmPassword()),400,"两次密码输入不一致。");
        service.consume(body.token(),"RESET",body.password());return Map.of("ok",true);
    }
}
