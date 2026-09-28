# AWS Deployment Guide

This is a deployment runbook, not evidence that an AWS environment already exists. The implementation has no runtime dependency on Cloudflare. The user interface and APIs are packaged together in one Spring Boot JAR.

## Target architecture

- Elastic Beanstalk **Java SE / Corretto 21**, running the executable JAR.
- A separately created **RDS PostgreSQL 17** instance in the same VPC and region.
- An HTTPS application hostname, with a certificate and trusted reverse proxy/load balancer.
- SMTP for verification and recovery messages; Amazon SES SMTP is an optional provider.
- Database-backed sessions, so restarting the application does not depend on process-local login storage.

The initial target is one application instance. Choose an AWS region and resource sizes when provisioning, according to your users' location, data requirements, and budget. No particular account, region, domain, or paid resource is assumed by this repository.

## 1. Prepare the release

From `spring-app/`:

```sh
./mvnw -B -ntp verify
```

Use `mvnw.cmd` on Windows. The output is `target/assessment-platform.jar`.

Create a source bundle containing exactly these files at its ZIP root:

```text
application.jar   (copy of target/assessment-platform.jar)
Procfile          (copy of deploy/Procfile)
global-bundle.pem (AWS RDS CA bundle, when using the path below)
```

Download the RDS certificate bundle from the official [RDS certificate documentation](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/UsingWithRDS.SSL.html). The Procfile starts the application on port 5000, which matches Elastic Beanstalk's Java SE proxy configuration. Configure the environment's `PORT` consistently if changing this convention.

Do not include `.env`, a local H2 file, logs, email previews, answer exports, AWS credentials, or test fixtures in the bundle.

## 2. Create the database independently

Create RDS outside the Elastic Beanstalk environment rather than selecting a database whose lifecycle is tied to that environment. Keep it in private subnets with public accessibility disabled. Permit port 5432 only from the application's security group and an explicitly authorized migration/administration path.

Enable storage encryption, automated backups (start with seven-day retention), and deletion protection. Store database credentials in AWS Secrets Manager or an equivalent approved secret store. Give the application its own database login instead of using the master login for normal operation.

The application runs Flyway migrations at startup, so its configured migration identity must own or have permission to create/alter the application tables and indexes. Do not deploy two versions that require incompatible schema changes simultaneously. For stricter deployments, run migrations separately and grant the runtime identity only the permissions it needs.

## 3. Configure the application environment

Set these in the Elastic Beanstalk environment, using managed secret integration where available:

```text
SPRING_PROFILES_ACTIVE=prod
APP_BASE_URL=https://your-application-hostname.example
DATABASE_URL=jdbc:postgresql://YOUR_RDS_ENDPOINT:5432/assessment?sslmode=verify-full&sslrootcert=/var/app/current/global-bundle.pem
DATABASE_USERNAME=assessment_app
DATABASE_PASSWORD=<database secret>
SMTP_HOST=<SMTP endpoint>
SMTP_PORT=587
SMTP_USERNAME=<SMTP username>
SMTP_PASSWORD=<SMTP password>
MAIL_FROM=<verified sender address>
```

The JDBC URL is a `jdbc:postgresql://` URL, not a `postgres://` URL. Do not put database credentials in the URL. Production disables sample-data seeding and forces SMTP. It refuses localhost mail-preview profiles and requires an HTTPS base URL.

Terminate TLS at a trusted load balancer/reverse proxy, redirect HTTP to HTTPS, and keep the application instance accessible only through that proxy. The app honors forwarded headers in production, so the proxy must replace untrusted incoming forwarded headers. Production session cookies are `Secure`, `HttpOnly`, and `SameSite=Lax`.

Configure the environment health check as `/actuator/health`. Health details are not exposed publicly. SMTP is included in production health checks, so configure real SMTP before declaring the environment healthy.

## 4. Configure email delivery

Verify the sending identity with the chosen provider. For SES, follow the [SES production-access process](https://docs.aws.amazon.com/ses/latest/dg/request-production-access.html) before inviting arbitrary public users. Sandbox delivery restrictions are different from this application's own end-user verification process.

Use SES **SMTP credentials**, not an AWS access key pasted into the SMTP password field. Allow outbound access to port 587. Test registration, activation, expired links, resending, and password reset with a controlled real mailbox before opening registration broadly.

## 5. Initialize and release

1. Deploy the source bundle with the environment settings above.
2. Establish an authorized shell with connectivity to RDS, such as a managed SSM session on the application instance.
3. Using the same configuration and artifact, run:

   ```sh
   java -jar application.jar --spring.main.web-application-type=none --app.command=bootstrap-admin
   ```

4. Enter the first administrator's contact details and password interactively. The application never prints or stores a plaintext password.
5. Optionally import an old configuration using the separate legacy import command. Otherwise create and publish the first assessment in the admin UI.
6. Register and verify a test user; assign a specific version; submit it; check the answers from both accounts.
7. Confirm ordinary users cannot request admin APIs or another user's record ID, and that the `/dev/mailbox` route is unavailable.

Record the deployed Git commit, artifact checksum, application version, and Flyway schema version in the release notes. GitHub Actions in this repository never deploys automatically.

## 6. Updates, backups, and rollback

- Publish a new application version only after H2 and PostgreSQL CI jobs pass.
- Retain the last known-good application artifact. A code-only rollback can redeploy that artifact if the database schema remains backward compatible.
- Flyway migrations move forward; do not automatically reverse migrations or remove submission records during a rollback.
- Take a database snapshot before potentially destructive schema changes. Restoring a database snapshot can discard later submissions; coordinate any restore explicitly.
- Test backup restoration into a separate database before relying on the recovery procedure.
- Application restarts, environment replacements, or code rollback must not delete the independent RDS instance.
- Monitor application health, SMTP delivery errors, database storage, and AWS costs. Do not log passwords, verification tokens, complete contact records, or user answers.

## Costs and live acceptance

Elastic Beanstalk has no additional platform fee, but EC2, load balancers, RDS, storage, networking, backups, secrets, domains, and email delivery may incur charges. Review the [AWS pricing calculator](https://calculator.aws/) using the actual region and resource sizes before provisioning. Budget alerts notify you; they are not an automatic spending cap.

The live acceptance checklist includes HTTPS, database connectivity and backups, real email delivery, role/ownership protection, versioned assignment and history, session invalidation, and a documented rollback. Completing the local build does not establish that these cloud-specific checks have passed.
