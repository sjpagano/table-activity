# Table Activity

Personal scan review and activity dashboard, hosted on GitHub Pages.

Live app: https://sjpagano.github.io/table-activity/

## Use

1. Create your app sign-in with your email and password; confirm the email. Use the same sign-in on your phone and PC.
2. Add multiple photos or PDFs in **Scan & review**. Each PDF page becomes a review card.
3. Check the handwritten M/D/Y date and tap any cell to correct an X. The scanned date takes priority over file metadata.
4. Mark pages reviewed and save the batch. One day is stored per account and date, including every blank cell. Existing dates require explicit replacement approval; changes on another device are detected.
5. Open **Activity**. Browse weeks, choose tables and time ranges, inspect hourly activity, daily totals, weekday occupancy, and a weekly heatmap. Tap a day for its hourly chart. Select **All saved dates** for long-term weekday patterns.
6. Open a saved day to edit its marks. Archive incorrect days, or restore them using **Show archived days**. Download JSON backups under **Backup & restore**.

Missing days are not counted as zero. Occupancy is marked cells divided by recorded table/time cells. Hourly active tables are averaged across recorded observations. X counts are observations, not distinct visitors. Post-midnight times belong to the date on the sheet.

## Storage and cost

The static app runs on GitHub Pages. Supabase provides the shared Postgres database and email/password authentication. The configured project uses the Free plan. Its published limits currently include 500 MB database space, 5 GB egress, and pausing after one week of inactivity. Resume paused projects in the Supabase dashboard. There is no App Store distribution or iOS developer subscription.

Only structured records are uploaded when Save is selected; source photos/PDFs are used for review and are not stored in the database. Scanning works in the browser. The first handwriting scan downloads approximately 65 MB of model files. Unsaved scans are held in memory; save before closing or refreshing the page.

The free built-in auth email service sends only to the Supabase project's team email addresses and currently permits two emails per hour. This personal app should use the same email as the project account. More users would require configuring an email provider. Never turn off row security to work around a sign-in error.

## Project setup

The current project has already been initialized. For another installation:

- Create a Supabase Free project and run `database/schema.sql` in its SQL Editor.
- Set its Auth Site URL to your deployed app URL.
- Change `config.js` to the project URL and **publishable** key. Never put database passwords or secret/service-role keys in this repository.
- Email confirmation is enabled. Create your app sign-in using your project team email, confirm it, and sign in from each device.

The table stores a boolean matrix, ordered table labels, ordered times, source name, date source, revision and archive state. RLS limits reads to the signed-in owner. Only authenticated, owner-scoped functions can write. Batch saves are atomic and compare revisions. The public key provides no anonymous access to records. All original documents remain outside this source repository.

## Local preview and checks

```
node server.mjs
node --test tests/*.test.mjs
```

The preview serves http://127.0.0.1:4173/. For authentication emails in development, explicitly allow that redirect URL in the Supabase project settings.

`database/verify.sql` verifies owner isolation, stored blanks, stale revisions, all-or-nothing saves, archive/restore and anonymous denial using fixtures inside a rolled-back transaction. It was run successfully against the configured database. No test users or days remain from it.

The phone compatibility module supplies ReadableStream asynchronous iteration when absent, both in the page and workers. PDF text-layer failures also fall back to recognition of the rendered image.

## Dependencies

Vendored Supabase JavaScript client 2.117.3 (MIT), bundled with esbuild 0.28.2 for Safari 15+. Existing scanner dependencies: PDF.js, Tesseract.js, Transformers.js, ONNX Runtime and the pinned Xenova/trocr-small-handwritten model. Vendor license files are included. The legacy Excel module is retained in source for compatibility but is no longer part of the app workflow.

Sources: https://supabase.com/pricing and https://supabase.com/docs/guides/auth/auth-smtp
