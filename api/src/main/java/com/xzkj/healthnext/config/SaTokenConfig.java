package com.xzkj.healthnext.config;

import cn.dev33.satoken.context.SaHolder;
import cn.dev33.satoken.interceptor.SaInterceptor;
import cn.dev33.satoken.stp.StpUtil;
import jakarta.servlet.DispatcherType;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;
import org.springframework.web.filter.CorsFilter;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

import java.util.Arrays;
import java.util.List;

@Configuration
public class SaTokenConfig implements WebMvcConfigurer {

    @Value("${health.cors.allowed-origin-patterns}")
    private String allowedOriginPatterns;

    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        registry.addInterceptor(new SaInterceptor(ignored -> {
            Object source = SaHolder.getRequest().getSource();
            if (source instanceof HttpServletRequest request && shouldCheckLogin(request)) {
                StpUtil.checkLogin();
            }
        }))
                .addPathPatterns("/**")
                .excludePathPatterns("/error");
    }

    boolean shouldCheckLogin(HttpServletRequest request) {
        if (request.getDispatcherType() == DispatcherType.ASYNC || request.getDispatcherType() == DispatcherType.ERROR) {
            return false;
        }
        if (HttpMethod.OPTIONS.matches(request.getMethod())) {
            return false;
        }
        String path = request.getRequestURI();
        String contextPath = request.getContextPath();
        if (contextPath != null && !contextPath.isBlank() && path.startsWith(contextPath)) {
            path = path.substring(contextPath.length());
        }
        if (path.isBlank()) {
            path = "/";
        }
        return !isPublicPath(path);
    }

    static boolean isPublicPath(String path) {
        return "/auth/login".equals(path)
                || "/auth/logout".equals(path)
                || "/error".equals(path)
                || path.startsWith("/actuator/");
    }

    @Bean
    public CorsFilter corsFilter() {
        CorsConfiguration config = new CorsConfiguration();
        config.setAllowCredentials(true);
        Arrays.stream(allowedOriginPatterns.split(","))
                .map(String::trim)
                .filter(origin -> !origin.isBlank())
                .forEach(config::addAllowedOriginPattern);
        config.setAllowedHeaders(List.of("satoken", "Content-Type", "Authorization", "X-Requested-With"));
        config.setAllowedMethods(List.of("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"));
        config.setMaxAge(3600L);

        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", config);
        return new CorsFilter(source);
    }
}
