# Table activity

A personal browser app for converting table activity photos and PDFs into editable Excel worksheets.

## Use

1. Optionally select an existing `.xlsx` workbook. Its blank activity tab is selected as the layout when available.
2. Choose a photo or PDF. On a phone, you can also take a photo.
3. Check the suggested date against the displayed crop. Tap any grid cell to switch between X and blank. Use Undo to reverse a correction. The horizontal slider and arrow buttons stay visible above the grid.
4. If needed, rotate the image or adjust the four corners around the data cells, then read the marks again. Rereading replaces manual mark corrections.
5. Confirm the date and marks, then download Excel. The downloaded copy includes a new dated tab; existing tabs are preserved. Duplicate dates receive a numbered suffix.

Use Safari’s Share → Add to Home Screen on iPhone, or bookmark/install the site in a desktop browser. No Apple developer account or subscription is needed.

## Recognition

The default layout has tables 3, 5, 6, 7, 8 and 9, with 36 half-hour columns from 11 a.m. through 4:30 a.m. Custom labels and workbook layouts are supported.

The app reads embedded PDF text or the handwriting above the table, then tries printed-text OCR. Ambiguous slash strokes are accepted only when one valid date matches a clearly recognized weekday; these results are labeled suggestions. Numeric dates use month/day/year. Two-digit years 00–69 mean 2000–2069; 70–99 mean 1970–1999. A year is never inferred from the workbook.

If no date can be read, the fallback order is PDF creation/modification date, photo EXIF date, then file modification date. Metadata can be the scanning date rather than the activity date. Every date remains editable.

The handwriting reader downloads approximately 65 MB of model files from Hugging Face on first use and caches them in the browser. Recognition runs locally in a worker; documents are not sent to an OCR service. The app's supporting runtime adds approximately 30 MB to its static download. After caching, it can work offline, subject to browser storage eviction. If the model is unavailable, printed OCR and manual date entry still work.

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

Run `node tests/core.test.mjs` for date parsing, metadata, totals and Excel date checks. Browser checks covered the supplied PDF, correction/undo, worksheet append, permanent scrolling and a 390px viewport. Actual iPhone hardware has not been tested.

## Dependencies

Vendored: Tesseract.js 7.0.0 and English OCR data, PDF.js 5.6.205, JSZip, Transformers.js 3.8.1 and its ONNX WebAssembly runtime. License files are in `vendor/` (or `dist/vendor/` in the source package).

The handwriting model is [Xenova/trocr-small-handwritten](https://huggingface.co/Xenova/trocr-small-handwritten), converted from [Microsoft TrOCR](https://huggingface.co/microsoft/trocr-small-handwritten), pinned to revision `2432e24d184b1d964d07ed04f5d9e21d31a59141`. Model downloads use Hugging Face; no paid inference endpoint is used.

Current edits are held in memory. Download before closing the page. There is no cross-device sync.
