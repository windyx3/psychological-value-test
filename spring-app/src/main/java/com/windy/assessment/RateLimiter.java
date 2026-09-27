package com.windy.assessment;

import java.time.Instant;
import java.util.HashMap;
import java.util.Map;
import org.springframework.stereotype.Component;

@Component
class RateLimiter {
    private record Bucket(long minute,int count) {}
    private final Map<String,Bucket> buckets=new HashMap<>();
    synchronized void check(String key,int maximum) {
        long minute=Instant.now().getEpochSecond()/60;
        buckets.entrySet().removeIf(e -> e.getValue().minute()<minute);
        Bucket b=buckets.getOrDefault(key,new Bucket(minute,0));
        ApiError.require(b.count()<maximum && buckets.size()<10000,429,"操作过于频繁，请一分钟后重试。");
        buckets.put(key,new Bucket(minute,b.count()+1));
    }
}
