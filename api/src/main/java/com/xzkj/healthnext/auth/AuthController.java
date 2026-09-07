package com.xzkj.healthnext.auth;

import com.xzkj.healthnext.common.Result;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
@RequestMapping("/auth")
public class AuthController {

    private final AuthService authService;

    public AuthController(AuthService authService) {
        this.authService = authService;
    }

    @PostMapping("/login")
    public Result<Map<String, Object>> login(@RequestBody LoginRequest request) {
        try {
            return Result.ok("登录成功", authService.login(request.getUsername(), request.getPassword()));
        } catch (IllegalArgumentException ex) {
            return Result.error(400, ex.getMessage());
        }
    }

    @GetMapping("/info")
    public Result<Map<String, Object>> info() {
        return Result.ok("获取成功", authService.currentUser());
    }

    @PostMapping("/logout")
    public Result<Void> logout(HttpServletRequest request) {
        authService.logout(request.getHeader("satoken"));
        return Result.ok("退出成功", null);
    }
}
