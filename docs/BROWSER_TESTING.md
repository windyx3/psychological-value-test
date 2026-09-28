# Browser Smoke Testing

The optional smoke runner uses Chrome through Playwright. It runs against an isolated, in-memory Java test fixture on `127.0.0.1:8081`; it must not be repointed at real user data. The fixture and its synthetic credentials are compiled only as test classes and are not in the production JAR.

## Prepare

From `spring-app/`, install the optional test dependency into an ignored directory:

```sh
npm install --prefix .tools --no-save playwright
```

Install Google Chrome if it is not already available. Then generate the test classpath:

```sh
./mvnw -B -ntp test-compile dependency:build-classpath -Dmdep.outputFile=target/test-classpath.txt -DincludeScope=test
```

In PowerShell, use `mvnw.cmd` and quote the `-D...` arguments to prevent PowerShell from splitting them.

## Start the fixture

PowerShell:

```powershell
$qaClassPath = 'target/test-classes;target/classes;' + (Get-Content target/test-classpath.txt -Raw).Trim()
java -cp $qaClassPath com.windy.assessment.BrowserFixture
```

macOS/Linux:

```sh
java -cp "target/test-classes:target/classes:$(cat target/test-classpath.txt)" com.windy.assessment.BrowserFixture
```

Wait for `Browser QA fixture ready` before starting the runner in a second terminal.

## Run

PowerShell:

```powershell
$env:PLAYWRIGHT_MODULE = (Resolve-Path .tools/node_modules/playwright).Path
node scripts/browser-smoke.cjs
```

macOS/Linux:

```sh
PLAYWRIGHT_MODULE="$PWD/.tools/node_modules/playwright" node scripts/browser-smoke.cjs
```

The test registers a synthetic user, verifies its local email, logs in with separate user/admin browser contexts, adds a D result with `total > 0`, previews and publishes it, assigns the assessment, submits real scores through the UI, and compares user/admin record views. It also checks initial empty answers, invalid submission focus, reset, script errors, and overflow at phone/tablet/desktop widths.

Screenshots are written to ignored `.qa/` files. Stop the fixture after testing. For a fresh repeat, restart it to recreate the in-memory database. The regular application continues to use port 8080 and its own persistent local database.
