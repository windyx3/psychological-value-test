package com.windy.assessment;

import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.*;

@Controller
class PageController {
    private final MailService mail;
    PageController(MailService mail) {this.mail=mail;}
    @GetMapping("/") String home() {return "forward:/index.html";}
    @GetMapping({"/auth/","/auth"}) String auth() {return "forward:/auth/index.html";}
    @GetMapping({"/admin/","/admin"}) String admin() {return "forward:/admin/index.html";}
    @GetMapping("/admin/editor") String editor() {return "forward:/admin/editor.html";}
    @GetMapping("/dev/mailbox") String mailbox() {return "forward:/dev/mailbox.html";}
    @GetMapping("/dev/mail") @ResponseBody Object messages() {return mail.previews();}
}
