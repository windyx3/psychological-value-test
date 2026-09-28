# Legacy Cloudflare Configuration Migration

The legacy app stores a single draft and published JSON configuration in D1. The new app supports multiple assessment sets and imports this pair as one new set with a draft and published version 1.

## Export

From the legacy repository root, query the configured D1 database with the existing Wrangler installation:

```sh
npx wrangler d1 execute psychological-value-test --remote --command "SELECT draft_json, published_json FROM assessment_config WHERE id=1" --json
```

Use `--local` instead of `--remote` to export the local Wrangler database. Save the JSON output into a file outside version control. Exporting reads the configuration; it does not modify or disable the old site. Do not assume the default questions in source control include changes previously made through the admin UI.

Accepted input shapes:

```json
{
  "draft": { "site": {}, "questions": [], "results": [] },
  "published": { "site": {}, "questions": [], "results": [] }
}
```

The empty objects/arrays above illustrate the shape only; import requires a valid full configuration. JSON-string fields named `draft_json` and `published_json`, Wrangler's single-query JSON result wrapper, and a single configuration object are also supported.

## Import

Build the JAR and stop the local H2 app. From `spring-app/`, run:

```sh
java -jar target/assessment-platform.jar --spring.main.web-application-type=none --app.command=import-legacy --app.import-file=/absolute/path/to/export.json
```

On Windows, quote the whole argument if it contains spaces:

```powershell
java -jar target/assessment-platform.jar --spring.main.web-application-type=none --app.command=import-legacy '--app.import-file=C:\path with spaces\export.json'
```

For PostgreSQL, supply the same profiles and database variables used by the destination application. Restart the app, sign in as an administrator, and inspect the imported questions, rules, draft, and published version before assigning users.

## Guarantees and limitations

- Question IDs and scoring conditions are preserved after validation.
- The imported draft may differ from the imported published version; this distinction is preserved.
- Import adds a new set and does not overwrite existing sets or submissions.
- Import is transactional: an invalid draft or published configuration creates neither half.
- Import is deliberately not deduplicated; running it twice creates two sets. Archive an unwanted duplicate in the admin UI.
- The legacy app did not store user accounts or submitted answers. It cannot supply historical answer records.
- This command does not migrate H2 user data to PostgreSQL. That is a separate database migration requiring its own export/restore and verification procedure.
