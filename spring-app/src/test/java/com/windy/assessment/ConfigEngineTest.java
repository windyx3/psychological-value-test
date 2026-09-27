package com.windy.assessment;

import org.junit.jupiter.api.*;
import static org.junit.jupiter.api.Assertions.*;
import tools.jackson.databind.*;
import tools.jackson.databind.node.*;
import tools.jackson.databind.json.JsonMapper;
import java.nio.charset.StandardCharsets;
import org.springframework.core.io.ClassPathResource;

class ConfigEngineTest {
    final ObjectMapper mapper=JsonMapper.builder().build();
    final ConfigEngine engine=new ConfigEngine(mapper);
    JsonNode config;
    @BeforeEach void setup() throws Exception {config=engine.parse(new ClassPathResource("default-config.json").getContentAsString(StandardCharsets.UTF_8));}
    ObjectNode scores(int value) {ObjectNode n=mapper.createObjectNode();for(JsonNode q:config.path("questions"))n.put(q.path("id").asText(),value);return n;}
    String grade(JsonNode answers) {return engine.evaluate(config,answers).result().path("code").asText();}
    @Test void boundariesAndRedLine() {
        engine.validate(config);assertEquals("S",grade(scores(7)));assertEquals(105,engine.evaluate(config,scores(7)).total());
        assertEquals("A",grade(scores(7).put("q1",2)));
        assertEquals("C",grade(scores(5).put("q1",4).put("q13",7).put("q14",7).put("q15",7)));
        assertEquals("B",grade(scores(10).put("q13",4).put("q15",4)));
        assertNotEquals("B",grade(scores(6).put("q13",4).put("q15",5)));
        assertDoesNotThrow(()->grade(scores(1)));assertDoesNotThrow(()->grade(scores(10)));
    }
    @Test void rejectsInvalidAndExtraAnswers() {
        for(int n:new int[]{0,11,-1})assertThrows(ApiError.class,()->grade(scores(7).put("q1",n)));
        assertThrows(ApiError.class,()->grade(scores(7).put("q1",7.5)));
        assertThrows(ApiError.class,()->grade(scores(7).put("q1","7")));
        var missing=scores(7);missing.remove("q1");assertThrows(ApiError.class,()->grade(missing));
        assertThrows(ApiError.class,()->grade(scores(7).put("extra",5)));
    }
    @Test void fallbackLastRegardlessOfPositionAndRulesNeverReturned() {
        var results=(ArrayNode)config.path("results");var fallback=results.remove(3);results.insert(0,fallback);
        assertEquals("S",grade(scores(7)));
        assertFalse(engine.evaluate(config,scores(7)).result().has("groups"));
        assertFalse(engine.questionnaire(config).containsKey("results"));
    }
    @Test void supportsOrEqualsLessEqualAndFirstMatchPriority() {
        var group=(ObjectNode)config.path("results").get(0).path("groups").get(0);
        group.put("logic","OR");var conditions=(ArrayNode)group.path("conditions");
        ((ObjectNode)conditions.get(0)).put("operator","=").put("value",7);
        ((ObjectNode)conditions.get(1)).put("operator","<=").put("value",3);
        assertEquals("B",grade(scores(7)));assertEquals("B",grade(scores(6).put("q15",3)));
        assertEquals("C",grade(scores(6)));
    }
    @Test void preventsDanglingReferencesAndMissingFallback() {
        ((ArrayNode)config.path("questions")).remove(12);assertThrows(ApiError.class,()->engine.validate(config));
    }
}
