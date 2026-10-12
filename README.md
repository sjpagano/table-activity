# Table activity

A personal browser app for converting table activity photos and PDFs into editable Excel worksheets.

## Use

1. Optionally select an existing `.xlsx` workbook. Its blank activity tab is selected as the layout when available.
2. Select multiple photos and PDFs together, or drag them onto Add files. Every PDF page is included automatically. On a phone, you can also take a photo. More files can be added after the current batch finishes reading.
3. Review all pages together in the batch overview. Each card shows the date crop, editable date, score and editable X grid, with a permanent horizontal scroll control. Completed pages can be reviewed while the remaining pages are still reading.
4. Select Open scan for a larger original, cell close-ups, Undo, rotation or corner alignment. Corrections are retained when switching scans. Mark reviewed & next moves to the next unfinished page. Rereading marks replaces corrections on that page only.
5. Mark pages Reviewed individually, or confirm I have checked all dates and marks after checking the overview. Editing a page clears that page's reviewed status. Failed files can be retried or removed; they are never silently omitted from export.
6. Download Excel once. The downloaded workbook contains one new dated tab per page, in upload/page order, with existing tabs preserved. Repeated dates receive numbered suffixes instead of replacing any tab.

Use Safari’s Share → Add to Home Screen on iPhone, or bookmark/install the site in a desktop browser. No Apple developer account or subscription is needed.

## Recognition

The default layout has tables 3, 5, 6, 7, 8 and 9, with 36 half-hour columns from 11 a.m. through 4:30 a.m. Custom labels and workbook layouts are supported. Layout changes apply to files added next; existing pages keep their layouts and corrections. Pages matching the selected workbook template use its formatting; other layouts use the standard export format.

Pages are read sequentially with one reused handwriting model, so ten scans do not start ten model downloads. Only the active editor and processing page need full-size canvases; other page previews are stored as compressed images in memory. The entire Excel archive is assembled once per download. Very large batches still depend on the device's available memory.

The app reads the scanned handwriting above the table first, retries uncertain readings with extra image padding, then tries printed-text OCR and embedded PDF text. Metadata is used only if no document date can be read. Common punctuation errors are normalized; a unique slash repair needs either a recognized separator or a matching weekday. A clear date with a conflicting weekday remains a visibly flagged suggestion instead of being discarded for metadata. Previously scanned dates survive a failed reread, and manual corrections remain authoritative until you explicitly choose Read date again. Numeric dates use month/day/year. Two-digit years 00–69 mean 2000–2069; 70–99 mean 1970–1999. A year is never inferred from the workbook.

If no date can be read, the fallback order is PDF creation/modification date, photo EXIF date, then file modification date. Metadata can be the scanning date rather than the activity date. Every date remains editable.

The handwriting reader downloads approximately 65 MB of model files from Hugging Face on first use and caches them in the browser. Recognition runs locally in a worker; documents are not sent to an OCR service. The app's supporting runtime adds approximately 30 MB to its static download. After caching, it can work offline, subject to browser storage eviction. If the model is unavailable, printed OCR and manual date entry still work. Model download progress resets the idle timeout so slow active downloads are not cut off after two minutes. Any metadata fallback and reader failure is stated directly on the review card.

Recognition is fallible. Review all marks and the date, especially faint strokes, crossed-out cells, shadows or warped photos. The supplied test scan produced the correct October 8, 2026 / Thursday suggestion and all 67 X marks; this is a single sample, not an accuracy guarantee. Amber cell underlines indicate borderline ink detection, not calibrated confidence.

## Excel

- Date and weekday above the grid; X or blank in each activity cell.
- Live COUNTIF row/column totals and a SUM grand total, with cached results for previewers.
- Compatible templates retain row heights, column widths, cell styles and zoom so large template fonts are not clipped.
- Existing worksheets, charts and pivot parts are preserved. Summary/pivot ranges are not automatically extended to include a new tab.
- Only `.xlsx` is supported. Password-protected, digitally signed and macro workbooks are unsupported. Inputs are limited to 25 MB.
- Template discovery expects “Table Number” in A2, table labels starting A3 and times starting B2. Manual layouts support 1–40 rows and 8–72 time columns.

## Hosting and development

This is a static site: no API key, database or application server is required. GitHub Pages can serve the published repository's root from its `main` branch. The app code is public; uploaded scans and workbooks are not stored in the repository.

In the portable source package, `dist/` contains the website. Run `node server.mjs` and visit `http://127.0.0.1:4173`. Opening HTML directly with `file://` cannot run its workers reliably.

Run `node tests/core.test.mjs`, `node tests/date-reader.test.mjs` and `node tests/batch.test.mjs` for date parsing, totals, independent corrections, review/export gates and template selection. Browser checks covered a mixed ten-page batch, multi-page PDFs, failed-file removal, correction/undo, review navigation, worksheet append, duplicate dates, permanent scrolling and a 390px viewport. The exported ten tabs were checked for formulas, cached totals, formatting and preservation of original workbook parts. Actual iPhone hardware has not been tested.

## Dependencies

Vendored: Tesseract.js 7.0.0 and English OCR data, PDF.js 5.6.205, JSZip, Transformers.js 3.8.1 and its ONNX WebAssembly runtime. License files are in `vendor/` (or `dist/vendor/` in the source package).

The handwriting model is [Xenova/trocr-small-handwritten](https://huggingface.co/Xenova/trocr-small-handwritten), converted from [Microsoft TrOCR](https://huggingface.co/microsoft/trocr-small-handwritten), pinned to revision `2432e24d184b1d964d07ed04f5d9e21d31a59141`. Model downloads use Hugging Face; no paid inference endpoint is used.

Current edits are held in memory. Download before closing the page. There is no cross-device sync.
