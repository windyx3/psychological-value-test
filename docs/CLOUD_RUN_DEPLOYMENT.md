# Cloud Run + Neon + Brevo deployment

This is the selected low-traffic deployment target. A trial is deployed at [the public HTTPS application](https://psychological-value-test-257955889460.asia-southeast1.run.app/), with [an authenticated admin dashboard](https://psychological-value-test-257955889460.asia-southeast1.run.app/admin/). The older AWS runbook remains an undeployed alternative; this deployment does not change the legacy Cloudflare application.

Cloud health, PostgreSQL connectivity, SMTP connection/authentication and unauthenticated admin-access protection have been checked. The operator initialized the first administrator interactively. Local browser tests passed for native-prompt-free creation/copying, and the deployed creation form was checked in the embedded browser without adding production test data. Real-recipient activation/reset delivery and mainland-China access still require explicit acceptance; cloning these files does not deploy or include the live database.

## Architecture and cost boundaries

```text
Browser -- HTTPS --> Cloud Run (Spring Boot + Chinese web UI)
                          |                         |
                          | PostgreSQL over TLS     | SMTP with required STARTTLS
                          v                         v
                      Neon Postgres              Brevo
                 Accounts, versions,         Verification and
                 sessions and submissions    password-reset messages
```

Use the Neon and Brevo Free plans and Cloud Run's request-based billing with minimum instances set to zero. This is **free-tier-first**, not an unconditional $0 guarantee. Cloud Run, network egress, container builds, image storage and Secret Manager have separate pricing/allowances. A Google Cloud billing account is required. A trial is time-limited; keeping the service after the trial requires an active billing account, and a paid billing account can incur overage charges. Budget alerts are not a hard spending cap. Review [Cloud Run pricing](https://cloud.google.com/run/pricing), [Google Cloud free-program conditions](https://docs.cloud.google.com/free/docs/free-cloud-features), [Neon pricing](https://neon.com/pricing) and [Brevo plans](https://help.brevo.com/hc/en-us/articles/208589409-About-Brevo-s-pricing-plans) before provisioning.

The trial application region is Google Cloud Singapore (`asia-southeast1`), paired with Neon Singapore. This avoids unnecessary cross-region database latency; it does not guarantee reachability or performance for mainland China users. Test the actual public HTTPS hostname from the users' networks before inviting them. Idle services/databases can introduce cold-start delays.

## 1. Accounts and prerequisites

- An authorized Google Cloud account, a verified **project ID** (not merely a display name), and active billing/trial.
- A Neon Free project using PostgreSQL **17**, matching the database version used in integration tests. Do not enable Neon Auth; this application manages its own users.
- A verified Brevo sender and an enabled transactional-mail account. Verifying a sender is not the same as authenticating its domain or proving delivery.
- Google Cloud CLI, Java 21 and this branch. Docker is optional locally: Google Cloud can build the Dockerfile during source deployment.
- PowerShell 7 for the optional Windows administrator-initialization helper.

Do not paste database connection strings, SMTP keys, login codes or Google credentials into chat, GitHub, build arguments, Dockerfiles or tracked `.env` files. Complete browser login yourself. Never create a downloadable service-account private key just for this deployment.

## 2. Database and SMTP configuration

In Neon, use **Connect** to obtain the database hostname, database name, username and password. Use the direct (non-`-pooler`) hostname for this small connection pool and Flyway migrations. Convert the URL to JDBC format; keep credentials in separate secrets:

```text
jdbc:postgresql://NEON_DIRECT_HOST:5432/neondb?sslmode=verify-full&sslfactory=org.postgresql.ssl.DefaultJavaSSLFactory
```

The Java SSL factory uses the runtime's trusted CA store and `verify-full` retains hostname verification. Never disable certificate verification. Keep the Neon endpoint's hostname rather than substituting its IP address. Tables are created by Flyway; do not create application tables manually in the SQL editor.

Brevo's SMTP page provides the **SMTP login** and an **SMTP key**. The SMTP login can differ from the Brevo account email. Use an SMTP key, not an API key or the mailbox password. See [Brevo SMTP instructions](https://help.brevo.com/hc/en-us/articles/7924908994450-Send-transactional-emails-using-Brevo-SMTP).

With a Gmail/Outlook sender, Brevo may temporarily replace the sending domain to meet recipient-provider requirements. A verified freemail sender is acceptable only as a tested trial setup, not a deliverability guarantee. For sustained public registration, use a domain you own and authenticate DKIM/DMARC. See [Brevo's sender requirements](https://help.brevo.com/hc/en-us/articles/14925263522578-Comply-with-Gmail-Yahoo-and-Microsoft-s-requirements-for-email-senders). Entering `gmail.com` or `outlook.com` in Domains cannot prove ownership of those providers' domains.

## 3. Secret Manager and application identity

Create five secrets through the Google Cloud console. Paste their values directly into Secret Manager, without displaying them in terminal output:

| Secret name | Value |
| --- | --- |
| `assessment-database-url` | JDBC URL above, **without** username/password |
| `assessment-database-username` | Neon database role |
| `assessment-database-password` | Neon database password |
| `assessment-smtp-username` | Brevo SMTP login |
| `assessment-smtp-password` | Brevo SMTP key |

Create a dedicated runtime service account named `assessment-runtime`. Grant it `roles/secretmanager.secretAccessor` on **these five secrets only**, not the entire project. Create a separate `assessment-build` service account with the project-scoped `roles/run.builder` role, and use it for source builds. The build identity should not have access to database or mail secrets. Enable the Cloud Run, Cloud Build, Artifact Registry, IAM and Secret Manager APIs for this dedicated project only. Review cost settings before enabling/provisioning anything. Allow time for new service accounts and IAM grants to propagate before retrying a failed operation.

## 4. Build and deploy

Run local tests from `spring-app/`:

```powershell
.\mvnw.cmd -B -ntp verify
```

On macOS/Linux use `./mvnw -B -ntp verify`. The Docker build also runs these tests. `.dockerignore` and `.gcloudignore` allowlist the source/build metadata: local databases, `.tools`, `.qa`, logs, mail previews and credentials cannot enter the source upload or image. The runtime container runs as a non-root user, binds to the injected `PORT`, and uses an external database. No container filesystem is used for persistent data.

After confirming project ID, IAM permissions and secret versions, replace the examples below. This command provisions a service and may consume trial credit or incur charges; it is not a dry run. Run it from `spring-app/` (PowerShell):

```powershell
$project = 'YOUR_PROJECT_ID'
$region = 'asia-southeast1'
$sender = 'YOUR_VERIFIED_SENDER'
gcloud run deploy psychological-value-test `
  --project=$project --region=$region --source=. `
  --service-account="assessment-runtime@$project.iam.gserviceaccount.com" `
  --build-service-account="projects/$project/serviceAccounts/assessment-build@$project.iam.gserviceaccount.com" `
  --no-allow-unauthenticated --ingress=all `
  --cpu=1 --memory=1Gi --concurrency=8 --min=0 --max=1 --min-instances=0 --max-instances=1 --cpu-throttling --no-cpu-boost `
  --timeout=120 --port=8080 `
  --set-env-vars="^@^SPRING_PROFILES_ACTIVE=prod,cloudrun@APP_BASE_URL=https://pending.invalid@MAIL_MODE=smtp@MAIL_FROM=$sender@SMTP_HOST=smtp-relay.brevo.com@SMTP_PORT=587" `
  --set-secrets='DATABASE_URL=assessment-database-url:1,DATABASE_USERNAME=assessment-database-username:1,DATABASE_PASSWORD=assessment-database-password:1,SMTP_USERNAME=assessment-smtp-username:1,SMTP_PASSWORD=assessment-smtp-password:1'
```

The `^@^` prefix selects an alternate gcloud dictionary delimiter so the comma in the `prod,cloudrun` profile list remains part of its value.

Pin actual secret versions; `:1` is only correct when the first version contains the intended value. For rotating credentials, add a new version and deploy an explicit revision referencing it. A maximum-instance limit reduces risk but is not a hard cost cap, and revisions/deployments can temporarily overlap.

The first deployment is **private**, using a placeholder HTTPS base URL so production validation can run without exposing bad activation links. Obtain the service URL, set the actual base URL, then allow public invocation:

```powershell
$url = gcloud run services describe psychological-value-test --project=$project --region=$region --format='value(status.url)'
gcloud run services update psychological-value-test --project=$project --region=$region --update-env-vars="APP_BASE_URL=$url"
# Only after admin initialization, configuration and private checks:
gcloud run services add-iam-policy-binding psychological-value-test --project=$project --region=$region --member=allUsers --role=roles/run.invoker
```

Cloud IAM public invocation only makes the application reachable. Spring Security still protects admin APIs/pages and user-owned records. Production uses secure HttpOnly session cookies, CSRF protection, database-backed sessions and no local mail preview. Do not set `APP_ORIGIN_TOKEN` for the direct Cloud Run entry; that setting is for the separate CloudFront/Beanstalk origin setup.

The current trial also sets `SPRING_MAIL_TEST_CONNECTION=true` to check SMTP connection/authentication during startup. This does not send an email or prove recipient delivery, and a mail-provider outage can prevent a cold start. Routine SMTP health probes are disabled by the Cloud Run profile. Reassess the startup check for longer-term availability requirements.

## 5. Initialize the first administrator

Use the existing interactive bootstrap command, with the same production database/settings supplied securely to your local shell. Do not copy local H2 data or the weak local test administrator to Neon:

```powershell
java -jar target/assessment-platform.jar --app.command=bootstrap-admin
```

Set `SPRING_PROFILES_ACTIVE=prod,cloudrun` and the database, mail and actual base URL settings before running it. Enter the administrator's contact information and a fresh password of at least 12 characters at the prompt. Password input is not echoed. The command refuses to create another initial administrator if one already exists. Do not run `bootstrap-admin` as a public web endpoint or make it a permanent automatic container startup action.

On Windows with PowerShell 7, the helper can obtain the service URL and pinned database/SMTP secrets in memory before starting the existing interactive Java command:

```powershell
.\deploy\Initialize-CloudAdmin.ps1 -ProjectId YOUR_PROJECT_ID
```

Run it **yourself in an interactive terminal**, not through a pipeline. It locates an installed SDK or this project's ignored SDK cache, uses your Google browser-login authorization, never prints secret payloads, and restores process environment variables afterwards. It needs permission to access the five secrets; the actual password is entered only at Java's hidden-input prompt. It does not create a public bootstrap API, store administrator credentials in files, or overwrite an existing administrator. The helper defaults to version `1`; use `-SecretVersion` only if all five references intentionally use the same different version, otherwise use individually pinned environment settings with the direct Java command.

Production does not seed the default assessment silently. After bootstrap, the administrator can create/publish sets in `/admin/`, or run the documented `import-legacy` maintenance command for an approved D1 export. The repository's `src/main/resources/default-config.json` is an example, **not** a copy of the current Cloudflare configuration.

## 6. Acceptance, backups and rollback

- Verify `/auth/` renders through the actual HTTPS hostname, protected pages require login and `/dev/` is unavailable.
- Confirm registration sends a real email, click its activation link, sign in, assign an assessment and submit answers. Email reset links must also use the actual hostname. Do not claim delivery success based solely on SMTP acceptance.
- Confirm sessions survive an application restart, user/admin records agree and prior submissions remain unchanged after edits/publication.
- Check the service's scaling, billing and container source/image contents. No databases, credentials or answer exports belong in GitHub.
- Test from mainland China and mobile/tablet/desktop networks; a region label is not proof of access.
- Back up Neon through an authorized secure PostgreSQL export and review Free-plan restore limits. Do not rely on container files or GitHub for account/answer backups.
- Roll back application traffic to a known-good Cloud Run revision using the console. Database migrations are independent; never roll back by deleting Neon data or blindly reversing schema changes.
- Rotate exposed secrets immediately. Disable public access or set traffic to a safe revision before maintenance that affects accounts/results.

The trial's deployment checks are described at the top of this guide. They are not a substitute for the complete acceptance checklist, backups or access testing from the intended users' networks. Application source and CI reports belong in GitHub; live database records, secrets and email contents do not.
