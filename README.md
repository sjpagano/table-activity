# Table Activity

Personal scan review and activity dashboard, hosted on GitHub Pages.

Live app: https://sjpagano.github.io/table-activity/

## Use

1. Open **Account** at the top right and use an administrator-provided sign-in. Account creation is not available in the app. An administrator can link a separate login to the same saved activity. Signing out affects only that device, so other people using a shared login stay signed in.
2. Choose **Add files** in **Scan & review** for photos or PDFs. Each PDF page becomes a scan. Or choose **Scan with camera** and tap **Capture** for each page; **Finish & review** starts reading the captured pages. Keep the handwritten date and whole table visible.
   Selections are queued if another step is busy, and files are saved to device storage before being read one at a time. There is no 19-photo limit in the app. If the phone photo picker’s Add button does not respond, choose a smaller group; further groups can be selected during reading. **Pause reading** remains in effect when more files are added.
3. Press the large **Review** button below the upload area, or tap a scan image. The overview shows each image, its date, **Remove**, and a green check once accepted. Six images appear per overview page. The table layout is preset.
4. Review the date and detected marks against the paper. Blue cells contain a detected X; tap an extra or missed mark to correct it. **Find table** sits directly above the scan and redetects the boundaries and marks. **Undo** reverses the last mark edit. On mobile, pinch to zoom and drag to inspect the paper. Rapid taps on the review arrows do not trigger double-tap zoom. The Zoom slider also remains available and keeps its setting for the next scan. **Edit as a table** opens the digital grid, and **Scan adjustments & recognition details** contains manual alignment, rotation and mark sensitivity.
5. Tap the date and type `10/8/26` or `100826`. The date preview includes handwriting above the table and the Date field inside its header, following the table’s perspective. Existing date corrections are kept when older previews refresh. Check the handwriting: unreadable document dates stay blank, and metadata is never used. Press **Reviewed & next** to accept the scan and remove it from the remaining review sequence. Arrows move without accepting and wrap from the last remaining scan to the first, or back. After the final acceptance, the overview shows all scans with green checks. Reopening an accepted image preserves its check; changing its date, marks or alignment requires another review.
6. Press **Submit scans** in the overview. One day is stored per activity owner and date, including every blank cell. Linked logins read and update that same record. Submission automatically replaces any saved or archived record for that date, using the latest revision, without another checkbox or dialog. A concurrent change during submission is still detected. Successful submission clears those scans and their local drafts; failed submission keeps them available to retry. Two scans with the same date in the current batch still need a date correction or removal of the duplicate.
7. Open **Activity → Overview**. The **Year** view starts on your latest saved year; choose 2025, 2026, or another available year. All twelve months show recorded days, total X’s, average active tables and occupancy, with bars for comparing X counts. Tap a recorded month to filter the statistics, hours, weekday patterns and saved days; **Show whole year** clears that selection. Table and time filters also apply to the monthly breakdown. Choose **Week** for daily totals and the weekly heatmap, or **All saved dates** for long-term patterns.
8. Choose **Custom query** to filter by start/end date, one or more tables, weekdays and times. Group by month, date, week, year, weekday, hour, table or the whole range; sort by date/label or a measure of activity, and optionally require a minimum number of X’s per result. Press **Run query**. **Download CSV** exports every result, including rows beyond the first 100 shown. Editing filters hides the old results until you run again; **Reset filters** starts over. Queries only read your saved records and exclude archived days.
9. Open a saved day in the overview to edit its marks. Archive incorrect days, or restore them using **Show archived days**. The saved-day list follows the selected date range; its row totals always describe the full saved sheet. Download JSON backups under **Backup & restore**.

Missing days are not counted as zero. Occupancy is marked cells divided by recorded table/time cells. Hourly active tables are averaged across recorded observations. X counts are observations, not distinct visitors. Post-midnight times belong to the date on the sheet.

Monthly and query averages use the same definitions: total X’s divided by the number of recorded time observations, with one observation per time on each selected sheet. Occupancy is weighted by the actual number of recorded table/time cells, rather than averaging daily percentages. A month without observations displays **No record** and no percentage; a recorded blank sheet contributes zero X’s and its recorded cells. Compare recorded-day coverage alongside monthly totals. Query date/time endpoints are inclusive, weeks start on Monday, and a range such as 6 PM through 2 AM crosses midnight while keeping the sheet’s date and weekday. A single blank time endpoint uses the sheet’s default 11 AM start or 10:59 AM end. Minimum X’s filters result groups; the matched-day summary describes all matching observations before that minimum.

The yearly view and query builder calculate results in the browser using the signed-in account’s loaded records. They do not create database tables, run user-written SQL or change saved scans. Analytics tests use in-memory fixtures and never insert test dates into the shared database.

The scanner finds the printed table rules and follows camera tilt and perspective, excluding time headings and table labels. It removes printed rules before classifying handwritten marks. If the first detection misses faint rules, it automatically retries with lower line contrast thresholds and accepts a result only when two passes agree on the corners with near-complete columns. Mark sensitivity stays unchanged. If it cannot locate a complete table reliably, it leaves the cells blank and requires alignment before review or saving. Open **Scan adjustments & recognition details**, choose **Adjust grid corners**, tap the four corners of the data cells in the indicated order, then **Read marks again**. Keep the whole table in the photo, with readable lines and marks.

For existing drafts read by the older detector, open the scan and choose **Find table** above the image. This keeps the date, rechecks alignment, replaces previous X corrections, and requires another review. Recognition is still an aid: compare the overlay with the paper before saving.

## Storage and cost

The static app runs on GitHub Pages. Supabase provides the shared Postgres database and email/password authentication. The configured project uses the Free plan. Its published limits currently include 500 MB database space, 5 GB egress, and pausing after one week of inactivity. Resume paused projects in the Supabase dashboard. There is no App Store distribution or iOS developer subscription.

Only structured records are uploaded when Submit is selected; source photos/PDFs are used for review and are not stored in the database. Scanning works in the browser. The first handwriting scan downloads approximately 65 MB of model files. After files are added or **Finish & review** is selected, scans and corrections are saved as local IndexedDB drafts. Reopening the same browser restores those drafts, including unprocessed pages; choose **Resume reading** to continue. Small overview thumbnails are retained with drafts; full images load one at a time when needed. A storage failure is shown on the page; keep that page open until the reviewed days are saved. Browser storage can be cleared or evicted, so the shared database remains the durable copy of reviewed data. Successful submission removes the submitted scans and local drafts without deleting the saved database records. If local cleanup fails after a successful save, the app reports it; old previews may return on a later reload. Local drafts do not sync between devices and cannot recover batches lost before this update.

The continuous camera uses your rear camera when available, with no microphone. Recognition waits until you finish capturing so it does not slow down page turning. The camera stops when you pause, leave the browser, close the camera view, or finish. Return and tap Resume to continue after switching apps. Camera batches are limited to 200 pages or 100 MB of compressed photos; finish a batch before starting another. If live camera access is unavailable, use **Add files** to select photos taken with your phone’s camera app. Captures are not automatically saved to your phone’s photo library. Captures still inside the live camera session are held in memory until **Finish & review**. During recognition, **Pause reading** or opening a ready scan pauses at the current page boundary; review your results, then resume from **All scans**.

The free built-in auth email service sends only to the Supabase project's team email addresses and currently permits two emails per hour. An administrator can create an additional account directly in Supabase Authentication; email invitations and password-reset emails to other addresses require a configured email provider. Never turn off row security to work around a sign-in error.

## Project setup

The current project has already been initialized. For another installation:

- Create a Supabase Free project and run `database/schema.sql` in its SQL Editor.
- Set its Auth Site URL to your deployed app URL.
- Change `config.js` to the project URL and **publishable** key. Never put database passwords or secret/service-role keys in this repository.
- Keep **Allow new users to sign up** off under Authentication → Sign In / Providers. Create approved accounts through Authentication → Users. Keep email confirmation enabled for email-based flows.

The table stores a boolean matrix, ordered table labels, ordered times, source name, date source, revision and archive state. RLS limits reads to the signed-in user's activity owner. An administrator-only mapping in `activity_private.account_access` can link an additional login's UUID to an existing owner's UUID. Both logins then read and write the same rows; there is no duplicated dataset and no automatic access for other accounts. Only authenticated functions can write, using the mapped owner for both revision checks and transaction locks. Batch saves are atomic and compare revisions. The public key provides no anonymous access to records. All original documents remain outside this source repository.

To link another approved login, first create it in Supabase Authentication, then apply `database/schema.sql` and add its `member_id` and the existing data owner's `owner_id` to `activity_private.account_access` as the project administrator. Verify the UUIDs and that the member has no separate records before linking. This grants read, save, edit, archive, restore and export access through the app, not Supabase administration. Keep `activity_private` outside the Data API's exposed schemas. Removing a mapping revokes future server access, but cannot retract data already downloaded. Keep the original owner account: deleting it would delete its activity records through the existing foreign key. Shared account users have identical permissions, and edits cannot be attributed to individual people sharing that login.

## Local preview and checks

```
node server.mjs
node --test tests/*.test.mjs
```

The preview serves http://127.0.0.1:4173/. For authentication emails in development, explicitly allow that redirect URL in the Supabase project settings.

`database/verify.sql` and `database/verify_shared.sql` verify isolation, shared access, stored blanks, stale revisions, atomic batches, archive/restore, revocation and anonymous denial. Run them only in a disposable local PostgreSQL database with `table_activity.local_test` set to `on`; their fixtures are rolled back. Never run fixture scripts in the hosted project. Production checks use read-only queries and never insert test dates.

The phone compatibility module supplies ReadableStream asynchronous iteration when absent, both in the page and workers. PDF text-layer failures also fall back to recognition of the rendered image.

## Dependencies

Vendored Supabase JavaScript client 2.117.3 (MIT), bundled with esbuild 0.28.2 for Safari 15+. Existing scanner dependencies: PDF.js, Tesseract.js, Transformers.js, ONNX Runtime and the pinned Xenova/trocr-small-handwritten model. Vendor license files are included. The legacy Excel module is retained in source for compatibility but is no longer part of the app workflow.

Sources: https://supabase.com/pricing and https://supabase.com/docs/guides/auth/auth-smtp
