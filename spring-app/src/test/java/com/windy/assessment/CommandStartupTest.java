package com.windy.assessment;

import java.nio.file.*;
import java.sql.DriverManager;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import static org.junit.jupiter.api.Assertions.*;

class CommandStartupTest {
    @TempDir Path directory;

    @Test void defaultProfileImportCommandPersistsAcrossRestarts() throws Exception {
        Path exported=directory.resolve("export.json");
        try (var source=getClass().getResourceAsStream("/default-config.json")) {
            assertNotNull(source);
            Files.copy(source,exported);
        }
        String url="jdbc:h2:file:"+directory.resolve("command-db").toAbsolutePath().toString().replace('\\','/')
            +";MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_ON_EXIT=FALSE";
        // Exercise the real main entry point, with no explicit local profile.
        String[] args={"--spring.main.web-application-type=none","--app.command=import-legacy",
            "--app.import-file="+exported,"--spring.datasource.url="+url,
            "--spring.datasource.username=sa","--spring.datasource.password="};
        for (int expected=1;expected<=2;expected++) {
            if (expected==2) {
                var mapper=new tools.jackson.databind.ObjectMapper();
                String config=Files.readString(exported);
                var row=mapper.createObjectNode().put("draft_json",config).put("published_json",config);
                var wrapper=mapper.createObjectNode();wrapper.putArray("results").add(row);
                Files.writeString(exported,mapper.writeValueAsString(mapper.createArrayNode().add(wrapper)));
            }
            AssessmentApplication.main(args);
            try (var connection=DriverManager.getConnection(url,"sa","");var statement=connection.createStatement()) {
                try (var rows=statement.executeQuery("SELECT COUNT(*) FROM assessment_version")) {
                    assertTrue(rows.next());assertEquals(expected,rows.getInt(1));
                }
                try (var rows=statement.executeQuery("SELECT COUNT(*) FROM app_user")) {
                    assertTrue(rows.next());assertEquals(0,rows.getInt(1));
                }
            }
        }
    }
}
