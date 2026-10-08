package com.windy.assessment;

import jakarta.servlet.*;
import jakarta.servlet.http.*;
import java.io.*;
import java.util.*;
import org.springframework.context.annotation.*;
import org.springframework.core.env.Environment;
import org.springframework.beans.factory.annotation.Value;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import org.springframework.security.authorization.AuthorizationDecision;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.context.*;
import org.springframework.security.web.csrf.CsrfTokenRequestAttributeHandler;
import org.springframework.web.filter.OncePerRequestFilter;

@Configuration
class SecurityConfig {
    public record Principal(String id, String username, long securityVersion) implements Serializable, java.security.Principal {
        @Override public String getName() { return username; }
    }
    @Bean PasswordEncoder passwordEncoder() { return new BCryptPasswordEncoder(12); }
    @Bean org.springframework.security.core.userdetails.UserDetailsService accountUsers(AccountRepository accounts) {
        return username -> {
            var u=accounts.findByUsername(AuthService.normalize(username)).orElseThrow(() -> new org.springframework.security.core.userdetails.UsernameNotFoundException("Unknown account"));
            return org.springframework.security.core.userdetails.User.withUsername(u.username).password(u.passwordHash)
                .roles(u.role).disabled(!u.enabled).accountLocked(!u.verified).build();
        };
    }
    @Bean HttpSessionSecurityContextRepository contextRepository() { return new HttpSessionSecurityContextRepository(); }
    static boolean local(Environment env) { return Arrays.asList(env.getActiveProfiles()).contains("local") || (env.getActiveProfiles().length==0 && Arrays.asList(env.getDefaultProfiles()).contains("local")); }
    static boolean loopback(String ip) { return Set.of("127.0.0.1","::1","0:0:0:0:0:0:0:1").contains(ip); }

    @Bean @org.springframework.boot.autoconfigure.condition.ConditionalOnWebApplication
    SecurityFilterChain chain(HttpSecurity http, AccountRepository accounts, Environment env,
                                    HttpSessionSecurityContextRepository repository,
                                    @Value("${app.origin-token:}") String originToken) throws Exception {
        http.securityContext(s -> s.securityContextRepository(repository))
            .csrf(csrf -> csrf.csrfTokenRequestHandler(new CsrfTokenRequestAttributeHandler()))
            .authorizeHttpRequests(a -> a
                .requestMatchers("/api/auth/**","/auth/**","/assets/**","/actuator/health","/error","/favicon.ico").permitAll()
                .requestMatchers("/dev/**").access((auth,ctx) -> new AuthorizationDecision(local(env) && loopback(ctx.getRequest().getRemoteAddr())))
                .requestMatchers("/admin/**","/api/admin/**").hasRole("ADMIN")
                .anyRequest().authenticated())
            .exceptionHandling(e -> e
                .authenticationEntryPoint((req,res,ex) -> {
                    if (req.getRequestURI().startsWith("/api/")) error(res,401,"请先登录。");
                    else res.sendRedirect("/auth/");
                })
                .accessDeniedHandler((req,res,ex) -> error(res,403,"没有权限或页面已过期，请刷新后重试。")))
            .headers(h -> h
                .contentSecurityPolicy(c -> c.policyDirectives("default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'self'; base-uri 'self'; form-action 'self'"))
                .frameOptions(f -> f.sameOrigin()))
            .logout(l -> l.logoutUrl("/api/auth/logout").logoutSuccessHandler((req,res,auth) -> {
                res.setContentType("application/json"); res.getWriter().write("{\"ok\":true}");
            }))
            .addFilterBefore(new OncePerRequestFilter() {
                @Override protected void doFilterInternal(HttpServletRequest req,HttpServletResponse res,FilterChain chain) throws ServletException,IOException {
                    String supplied=req.getHeader("X-Origin-Token");
                    if (!originToken.isBlank() && !req.getRequestURI().equals("/actuator/health") &&
                        (supplied==null || !MessageDigest.isEqual(originToken.getBytes(StandardCharsets.UTF_8),supplied.getBytes(StandardCharsets.UTF_8)))) {
                        error(res,403,"请通过网站的 HTTPS 入口访问。");return;
                    }
                    chain.doFilter(req,res);
                }
            },SecurityContextHolderFilter.class)
            .addFilterAfter(new OncePerRequestFilter() {
                @Override protected void doFilterInternal(HttpServletRequest req, HttpServletResponse res, FilterChain chain) throws ServletException, IOException {
                    res.setHeader("Cache-Control","no-store");
                    res.setHeader("Referrer-Policy","no-referrer");
                    var auth=SecurityContextHolder.getContext().getAuthentication();
                    if (auth!=null && auth.getPrincipal() instanceof Principal p) {
                        var u=accounts.findById(p.id()).orElse(null);
                        if (u==null || !u.enabled || !u.verified || u.securityVersion!=p.securityVersion()) {
                            if (req.getSession(false)!=null) req.getSession(false).invalidate();
                            SecurityContextHolder.clearContext();
                        }
                    }
                    chain.doFilter(req,res);
                }
            }, SecurityContextHolderFilter.class);
        return http.build();
    }
    private static void error(HttpServletResponse res,int status,String message) throws IOException {
        res.setStatus(status);res.setContentType("application/json;charset=UTF-8");
        res.getWriter().write("{\"error\":\""+message+"\"}");
    }
}
