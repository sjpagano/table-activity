# Table Activity

Personal scan review and activity dashboard, hosted on GitHub Pages.

Live app: https://sjpagano.github.io/table-activity/

## Use

1. Create your app sign-in with your email and password; confirm the email. Use the same sign-in on your phone and PC.
2. Add multiple photos or PDFs in **Scan & review**. Each PDF page becomes a review card; the overview displays six cards at a time. Or choose **Scan with camera**, allow camera access, and tap **Capture** for each page without leaving the camera. Keep the handwritten date and whole table visible. **Undo last** removes an accidental photo; **Pause / Resume** stops and restarts the camera while retaining your captures. **Finish & review** starts reading all captured pages.
3. Choose **Next to review** or **View scan**. Each scan opens as a focused review card: date above the paper, a detected-X overlay, and **Reviewed & next** fixed at the bottom. Blue cells contain a detected X; tap an extra or missed mark to correct it. **Undo** reverses the last mark edit. Use Zoom and pan to inspect the paper; zoom stays the same for the next scan. **Edit as a table** opens the digital grid, and **Scan adjustments & recognition details** contains alignment, rotation and recognition controls.
4. Tap the date and type `10/8/26` or `100826`. One-day buttons handle small corrections. Dates come only from the document; unreadable dates stay blank. Metadata is never used. In the overview, Enter moves to the next date field. Use **Reviewed & next** to advance through the batch, or the top arrows to move without marking a page reviewed.
5. When the review finishes, save the batch from **All scans**. One day is stored per account and date, including every blank cell. Existing dates require explicit replacement approval; changes on another device are detected.
6. Open **Activity**. Browse weeks, choose tables and time ranges, inspect hourly activity, daily totals, weekday occupancy, and a weekly heatmap. Tap a day for its hourly chart. Select **All saved dates** for long-term weekday patterns.
7. Open a saved day to edit its marks. Archive incorrect days, or restore them using **Show archived days**. Download JSON backups under **Backup & restore**.

Missing days are not counted as zero. Occupancy is marked cells divided by recorded table/time cells. Hourly active tables are averaged across recorded observations. X counts are observations, not distinct visitors. Post-midnight times belong to the date on the sheet.

The scanner finds the printed table rules and follows camera tilt and perspective, excluding time headings and table labels. It removes printed rules before classifying handwritten marks. If the first detection misses faint rules, it automatically retries with lower line contrast thresholds and accepts a result only when two passes agree on the corners with near-complete columns. Mark sensitivity stays unchanged. If it cannot locate a complete table reliably, it leaves the cells blank and requires alignment before review or saving. Open **Scan adjustments & recognition details**, choose **Adjust grid corners**, tap the four corners of the data cells in the indicated order, then **Read marks again**. Keep the whole table in the photo, with readable lines and marks.

For existing drafts read by the older detector, open the scan and choose **Find table again**. This keeps the date, rechecks alignment, replaces previous X corrections, and requires another review. The same control remains available under scan adjustments. Recognition is still an aid: compare the overlay with the paper before saving.

## Storage and cost

The static app runs on GitHub Pages. Supabase provides the shared Postgres database and email/password authentication. The configured project uses the Free plan. Its published limits currently include 500 MB database space, 5 GB egress, and pausing after one week of inactivity. Resume paused projects in the Supabase dashboard. There is no App Store distribution or iOS developer subscription.

Only structured records are uploaded when Save is selected; source photos/PDFs are used for review and are not stored in the database. Scanning works in the browser. The first handwriting scan downloads approximately 65 MB of model files. After files are added or **Finish & review** is selected, scans and corrections are saved as local IndexedDB drafts. Reopening the same browser restores those drafts, including unprocessed pages; choose **Resume reading** to continue. Draft images load only when opened. A storage failure is shown on the page; keep that page open until the reviewed days are saved. Browser storage can be cleared or evicted, so the shared database remains the durable copy of reviewed data. Drafts stay available after a database save until **Clear scans** removes them; it does not delete saved database records. Local drafts do not sync between devices and cannot recover batches lost before this update.

The continuous camera uses your rear camera when available, with no microphone. Recognition waits until you finish capturing so it does not slow down page turning. The camera stops when you pause, leave the browser, close the camera view, or finish. Return and tap Resume to continue after switching apps. Camera batches are limited to 200 pages or 100 MB of compressed photos; finish a batch before starting another. If live camera access is unavailable, **Take one photo** and **Add files** remain available. Captures are not automatically saved to your phone’s photo library. Captures still inside the live camera session are held in memory until **Finish & review**. During recognition, **Pause reading** or opening a ready scan pauses at the current page boundary; review your results, then resume from **All scans**.

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
