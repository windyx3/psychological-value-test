package com.windy.assessment;

import java.util.*;
import org.springframework.stereotype.Component;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ObjectNode;

@Component
public class ConfigEngine {
    private final ObjectMapper mapper;
    private static final Set<String> OPS = Set.of(">", ">=", "<", "<=", "=");
    public ConfigEngine(ObjectMapper mapper) { this.mapper = mapper; }
    public JsonNode parse(String json) { return mapper.readTree(json); }
    public String json(Object value) { return mapper.writeValueAsString(value); }
    public JsonNode tree(Object value) { return mapper.valueToTree(value); }

    public void validate(JsonNode c) {
        ApiError.require(c != null && c.isObject(), 400, "配置格式无效。");
        JsonNode site = c.path("site");
        for (String key : List.of("title","description","questionTitle","inputInstruction","resultTotalLabel","disclaimer")) {
            text(site.path(key), key.equals("title") ? 200 : 4000, "基础内容不能为空或过长。");
        }
        JsonNode questions = c.path("questions"), results = c.path("results");
        ApiError.require(questions.isArray() && questions.size() > 0 && questions.size() <= 200, 400, "题目数量须为1–200道。");
        Set<String> ids = new HashSet<>();
        for (JsonNode q : questions) {
            id(q.path("id"));
            ApiError.require(ids.add(q.path("id").asText()), 400, "题目ID重复。");
            text(q.path("text"), 2000, "题目内容不能为空或过长。");
        }
        ApiError.require(results.isArray() && results.size() >= 2 && results.size() <= 30, 400, "需要条件结果和一个兜底结果，最多30个结果。");
        int fallbacks = 0;
        Set<String> codes = new HashSet<>(), resultIds = new HashSet<>();
        for (JsonNode r : results) {
            id(r.path("id"));
            ApiError.require(resultIds.add(r.path("id").asText()), 400, "结果ID重复。");
            for (String key : List.of("code","name","description","advice")) text(r.path(key), key.equals("code") ? 8 : 4000, "结果内容不完整或过长。");
            ApiError.require(codes.add(r.path("code").asText()), 400, "结果代码重复。");
            for (String key : List.of("colorStart","colorEnd")) ApiError.require(r.path(key).asText().matches("#[0-9a-fA-F]{6}"),400,"颜色格式无效。");
            ApiError.require(r.path("fallback").isBoolean(), 400, "兜底标记无效。");
            if (r.path("fallback").asBoolean()) { fallbacks++; continue; }
            JsonNode groups = r.path("groups");
            ApiError.require(groups.isArray() && groups.size()>0 && groups.size()<=30,400,"每个非兜底结果需要1–30组条件。");
            for (JsonNode g : groups) {
                id(g.path("id"));
                ApiError.require(Set.of("AND","OR").contains(g.path("logic").asText()),400,"条件逻辑无效。");
                JsonNode conditions = g.path("conditions");
                ApiError.require(conditions.isArray() && conditions.size()>0 && conditions.size()<=100,400,"条件组需要1–100个条件。");
                for (JsonNode condition : conditions) {
                    id(condition.path("id"));
                    String metric = condition.path("metric").asText();
                    ApiError.require(Set.of("total","question").contains(metric),400,"条件指标无效。");
                    ApiError.require(OPS.contains(condition.path("operator").asText()),400,"比较符号无效。");
                    JsonNode value = condition.path("value");
                    ApiError.require(value.isNumber() && Double.isFinite(value.asDouble()),400,"分数线必须为数字。");
                    if (metric.equals("question")) {
                        ApiError.require(ids.contains(condition.path("questionId").asText()),400,"规则引用了不存在的题目，请先修改规则。");
                        ApiError.require(value.asDouble()>=1 && value.asDouble()<=10,400,"题目阈值须在1–10之间。");
                    }
                }
            }
        }
        ApiError.require(fallbacks==1,400,"必须且只能设置一个兜底结果。");
    }

    private void text(JsonNode n, int limit, String message) {
        ApiError.require(n.isTextual() && !n.asText().isBlank() && n.asText().length()<=limit,400,message);
    }
    private void id(JsonNode n) {
        ApiError.require(n.isTextual() && n.asText().matches("[a-zA-Z0-9_-]{1,100}"),400,"ID只能包含字母、数字、下划线与短横线。");
    }
    public Map<String,Object> questionnaire(JsonNode c) {
        return Map.of("site",c.path("site"),"questions",c.path("questions"));
    }
    public record Evaluation(int total, JsonNode result) {}
    public Evaluation evaluate(JsonNode c, JsonNode answers) {
        ApiError.require(answers!=null && answers.isObject() && answers.size()==c.path("questions").size(),400,"请完整填写所有题目，不可包含额外题目。");
        int total=0;
        for (JsonNode q : c.path("questions")) {
            JsonNode n=answers.path(q.path("id").asText());
            ApiError.require(n.isIntegralNumber() && n.canConvertToInt() && n.asInt()>=1 && n.asInt()<=10,400,"每题必须是1–10的整数。");
            total+=n.asInt();
        }
        JsonNode fallback=null;
        for (JsonNode r : c.path("results")) {
            if (r.path("fallback").asBoolean()) { fallback=r; continue; }
            for (JsonNode g : r.path("groups")) {
                boolean and=g.path("logic").asText().equals("AND"), match=and;
                for (JsonNode condition : g.path("conditions")) {
                    double actual=condition.path("metric").asText().equals("total") ? total : answers.path(condition.path("questionId").asText()).asInt();
                    double threshold=condition.path("value").asDouble();
                    boolean hit=switch(condition.path("operator").asText()) {
                        case ">" -> actual>threshold; case ">=" -> actual>=threshold;
                        case "<" -> actual<threshold; case "<=" -> actual<=threshold;
                        case "=" -> actual==threshold; default -> false;
                    };
                    match=and ? match && hit : match || hit;
                }
                if (match) return new Evaluation(total, publicResult(r));
            }
        }
        ApiError.require(fallback!=null,400,"缺少兜底结果。");
        return new Evaluation(total,publicResult(fallback));
    }
    private JsonNode publicResult(JsonNode r) {
        ObjectNode result=mapper.createObjectNode();
        for (String key : List.of("code","name","description","advice","colorStart","colorEnd")) result.set(key,r.path(key));
        return result;
    }
}
