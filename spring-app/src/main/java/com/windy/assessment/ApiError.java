package com.windy.assessment;

import java.util.Map;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.dao.DataIntegrityViolationException;

public class ApiError extends RuntimeException {
    final int status;
    public ApiError(int status, String message) { super(message); this.status = status; }
    static void require(boolean valid, int status, String message) {
        if (!valid) throw new ApiError(status, message);
    }
}

@RestControllerAdvice
class ErrorHandler {
    @ExceptionHandler(ApiError.class)
    ResponseEntity<?> business(ApiError ex) {
        return ResponseEntity.status(ex.status).body(Map.of("error", ex.getMessage()));
    }
    @ExceptionHandler({MethodArgumentNotValidException.class, HttpMessageNotReadableException.class, IllegalArgumentException.class})
    ResponseEntity<?> invalid(Exception ex) {
        return ResponseEntity.badRequest().body(Map.of("error", "输入格式无效，请检查必填项及数值范围。"));
    }
    @ExceptionHandler(DataIntegrityViolationException.class)
    ResponseEntity<?> conflict() {
        return ResponseEntity.status(409).body(Map.of("error", "数据已存在或已被修改，请刷新后重试。"));
    }
}
