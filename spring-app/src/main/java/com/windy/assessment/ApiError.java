package com.windy.assessment;

import java.util.Map;
import java.util.TreeMap;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.dao.DataIntegrityViolationException;

public class ApiError extends RuntimeException {
    final int status;
    final Map<String,String> fieldErrors;
    public ApiError(int status, String message) { this(status, message, Map.of()); }
    public ApiError(int status, String message, Map<String,String> fieldErrors) {
        super(message); this.status = status; this.fieldErrors = Map.copyOf(fieldErrors);
    }
    static void field(boolean valid, String field, String message) {
        if (!valid) throw new ApiError(400, message, Map.of(field, message));
    }
    static void require(boolean valid, int status, String message) {
        if (!valid) throw new ApiError(status, message);
    }
}

@RestControllerAdvice
class ErrorHandler {
    @ExceptionHandler(ApiError.class)
    ResponseEntity<?> business(ApiError ex) {
        return ResponseEntity.status(ex.status).body(Map.of("error", ex.getMessage(), "fieldErrors", ex.fieldErrors));
    }
    @ExceptionHandler(MethodArgumentNotValidException.class)
    ResponseEntity<?> fields(MethodArgumentNotValidException ex) {
        Map<String,String> errors=new TreeMap<>();
        ex.getBindingResult().getFieldErrors().forEach(error -> errors.putIfAbsent(error.getField(),error.getDefaultMessage()));
        return ResponseEntity.badRequest().body(Map.of("error", "请检查标红的输入项，并按下方提示修改。", "fieldErrors", errors));
    }
    @ExceptionHandler({HttpMessageNotReadableException.class, IllegalArgumentException.class})
    ResponseEntity<?> invalid(Exception ex) {
        return ResponseEntity.badRequest().body(Map.of("error", "输入格式无效，请检查必填项及数值范围。"));
    }
    @ExceptionHandler(DataIntegrityViolationException.class)
    ResponseEntity<?> conflict() {
        return ResponseEntity.status(409).body(Map.of("error", "数据已存在或已被修改，请刷新后重试。"));
    }
}
