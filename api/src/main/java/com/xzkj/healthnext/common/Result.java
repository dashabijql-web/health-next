package com.xzkj.healthnext.common;

import lombok.Data;

@Data
public class Result<T> {

    private int code;
    private String message;
    private T data;

    public static <T> Result<T> ok() {
        return ok("操作成功", null);
    }

    public static <T> Result<T> ok(T data) {
        return ok("操作成功", data);
    }

    public static <T> Result<T> ok(String message, T data) {
        Result<T> result = new Result<>();
        result.code = 200;
        result.message = message;
        result.data = data;
        return result;
    }

    public static <T> Result<T> error(String message) {
        return error(500, message);
    }

    public static <T> Result<T> error(int code, String message) {
        Result<T> result = new Result<>();
        result.code = code;
        result.message = message;
        return result;
    }
}
