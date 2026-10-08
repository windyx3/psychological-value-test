package com.windy.assessment;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.*;
import software.amazon.awssdk.http.urlconnection.UrlConnectionHttpClient;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.sesv2.SesV2Client;

@Configuration
@ConditionalOnProperty(name="app.mail-mode",havingValue="ses")
class SesConfiguration {
    @Bean(destroyMethod="close") SesV2Client sesClient(@Value("${app.ses-region}") String region) {
        // AWS supplies temporary instance-role credentials; no mailbox or SMTP password is needed.
        return SesV2Client.builder().region(Region.of(region))
            .httpClientBuilder(UrlConnectionHttpClient.builder()).build();
    }
}
