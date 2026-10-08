package com.windy.assessment;

import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import org.springframework.mock.env.MockEnvironment;
import org.springframework.mail.MailSendException;
import org.springframework.mail.javamail.JavaMailSender;
import java.util.function.Consumer;
import software.amazon.awssdk.services.sesv2.SesV2Client;
import software.amazon.awssdk.services.sesv2.model.*;

class SesMailTest {
    @Test void sesUsesAwsRoleTransportAndHandlesDeliveryFailure() {
        var environment=new MockEnvironment();environment.setActiveProfiles("prod");
        var smtp=mock(JavaMailSender.class);
        var service=new MailService(smtp,environment);
        service.mode="ses";service.baseUrl="https://assessment.example.test";service.from="sender@example.test";
        service.ses=mock(SesV2Client.class);service.validate();
        var token="a".repeat(43);
        doAnswer(invocation -> {
            Consumer<SendEmailRequest.Builder> build=invocation.getArgument(0);
            var request=SendEmailRequest.builder();build.accept(request);var sent=request.build();
            assertEquals(service.from,sent.fromEmailAddress());assertEquals("user@example.test",sent.destination().toAddresses().getFirst());
            assertEquals("UTF-8",sent.content().simple().subject().charset());
            assertTrue(sent.content().simple().body().text().data().contains("/auth/?action=verify#token="+token));
            return SendEmailResponse.builder().messageId("synthetic-test").build();
        }).when(service.ses).sendEmail(org.mockito.ArgumentMatchers.<Consumer<SendEmailRequest.Builder>>any());
        service.send("user@example.test","VERIFY",token);verifyNoInteractions(smtp);assertTrue(service.previews().isEmpty());
        doThrow(SesV2Exception.builder().message("Synthetic unavailable transport").build())
            .when(service.ses).sendEmail(org.mockito.ArgumentMatchers.<Consumer<SendEmailRequest.Builder>>any());
        assertThrows(MailSendException.class,()->service.send("user@example.test","VERIFY",token));
    }
}
