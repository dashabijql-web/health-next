package com.xzkj.healthnext.config;

import cn.dev33.satoken.exception.NotLoginException;
import com.xzkj.healthnext.common.Result;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@RestControllerAdvice
public class GlobalExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);

    @ExceptionHandler(NotLoginException.class)
    public Result<Void> handleNotLogin(NotLoginException ex) {
        log.warn("未登录或 token 失效: {}", ex.getMessage());
        return Result.error(401, "未登录或登录已过期");
    }

    @ExceptionHandler(Exception.class)
    public Result<Void> handleUnknown(Exception ex) {
        log.error("未处理异常", ex);
        return Result.error("系统错误");
    }
}
