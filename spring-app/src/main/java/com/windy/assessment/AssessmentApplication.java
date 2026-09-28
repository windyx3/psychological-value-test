package com.windy.assessment;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.WebApplicationType;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import java.util.Arrays;

@SpringBootApplication
public class AssessmentApplication {
    public static void main(String[] args) {
        var application = new SpringApplication(AssessmentApplication.class);
        // Choose the environment before loading profiles, including for maintenance commands.
        if (Arrays.stream(args).anyMatch(arg -> arg.startsWith("--app.command="))) {
            application.setWebApplicationType(WebApplicationType.NONE);
        }
        var context = application.run(args);
        if (context.getEnvironment().containsProperty("app.command")) context.close();
    }
}
