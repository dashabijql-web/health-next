package com.xzkj.healthnext.auth;

import cn.dev33.satoken.stp.StpUtil;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Service
public class AuthService {

    static final long LOCAL_USER_ID = 1L;

    @Value("${health.auth.username}")
    private String username;

    @Value("${health.auth.password}")
    private String password;

    @Value("${health.auth.display-name:管理员}")
    private String displayName;

    public Map<String, Object> login(String rawUsername, String rawPassword) {
        if (!StringUtils.hasText(rawUsername) || !StringUtils.hasText(rawPassword)) {
            throw new IllegalArgumentException("请输入用户名和密码");
        }
        if (!constantTimeEquals(username, rawUsername.trim()) || !constantTimeEquals(password, rawPassword)) {
            throw new IllegalArgumentException("用户名或密码错误");
        }
        StpUtil.login(LOCAL_USER_ID);
        Map<String, Object> data = profile();
        data.put("token", StpUtil.getTokenValue());
        return data;
    }

    public Map<String, Object> currentUser() {
        StpUtil.checkLogin();
        return profile();
    }

    public void logout(String tokenValue) {
        if (StringUtils.hasText(tokenValue)) {
            StpUtil.logoutByTokenValue(tokenValue);
            return;
        }
        StpUtil.logout();
    }

    private Map<String, Object> profile() {
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("name", displayName);
        data.put("username", username);
        data.put("avatar", "");
        data.put("roles", List.of("admin"));
        data.put("routes", List.of("home"));
        data.put("buttons", List.of());
        return data;
    }

    static boolean constantTimeEquals(String left, String right) {
        byte[] a = left.getBytes(StandardCharsets.UTF_8);
        byte[] b = right.getBytes(StandardCharsets.UTF_8);
        return MessageDigest.isEqual(a, b);
    }
}
