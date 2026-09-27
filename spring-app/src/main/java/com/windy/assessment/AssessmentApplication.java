package com.windy.assessment;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication
public class AssessmentApplication {
    public static void main(String[] args) {
        var context = SpringApplication.run(AssessmentApplication.class, args);
        if (context.getEnvironment().containsProperty("app.command")) context.close();
    }
}
