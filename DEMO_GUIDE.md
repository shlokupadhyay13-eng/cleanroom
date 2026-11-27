# CLEANROOM — Live Demonstration Guide

This guide outlines a repeatable 3-to-5-minute walkthrough verifying CLEANROOM's local-only execution, detection/validation accuracy, redaction modes, CSV structure preservation, and privacy controls.

## Pre-Demo Setup

1. Build and serve the production bundle locally so the production Content Security Policy (`connect-src 'none'`, `worker-src 'self'`) is active:
   ```bash
   npm run build && npm run preview
   ```
2. Open the local preview URL in a desktop browser.
3. Open **DevTools -> Network** (check **Preserve log** if desired, clear existing entries after initial local asset load) and keep **DevTools -> Application** accessible to inspect Local Storage and Session Storage.

## Step 1 — Privacy & Scope Verification (~30 seconds)

- Point to the header badge: **Client-Side Only — No Data Leaves Browser**.
- Expand **Privacy & Security Scope** in the footer to show the four explicit guarantees and threat-model limits (local execution, volatile memory only, format/checksum vs. identity, and device/OS boundaries).
- Point to the empty **Network** tab confirming zero outbound API, font CDN, or telemetry calls.

## Step 2 — Sample Noisy Text & False-Positive Resistance (~45 seconds)

- Click **Load Sample** to populate the Source Input editor with synthetic multi-line ticket text.
- Click **Sanitize** (or press `Ctrl+Enter` / `Cmd+Enter`).
- Show the **Statistics** panel updating across all six categories (`Email Addresses`, `Phone Numbers`, `IP Addresses`, `PAN Numbers`, `Aadhaar Numbers`, `Credit Cards`).
- Scroll the **Side-by-Side Comparison** panel to point out that decoys in the sample—the ISO date (`2026-11-27`), timestamp (`14:35:20`), software version (`v2.4.1.0`), ticket ID (`INC-2026-0419`), and non-Luhn order reference (`4111-1111-1111-1112`)—were left untouched.

## Step 3 — Live Redaction Mode Switching (~45 seconds)

- Switch the **Redaction Mode** selector while results are displayed:
  1. **Full Masking:** Every detected entity becomes `[REDACTED]`.
  2. **Partial Masking:** Reveals minimal structural context (e.g., `A***@example.org`, `ABXXXXXX4F`, `192.XXX.XXX.XXX`, `XXXX-XXXX-XXXX-1111`).
  3. **Consistent Pseudonymization:** Point out that `Alex.Taylor@example.org` and `alex.taylor@example.org` both map to `[EMAIL_001]`, while the second email maps to `[EMAIL_002]`.

## Step 4 — CSV Structure Preservation (~60 seconds)

- Click **Upload File** and select a synthetic `.csv` file containing quoted commas (e.g., `"Patel, Rohan"`), escaped quotes, and repeated email addresses across multiple rows.
- Click **Sanitize** with **Consistent Pseudonymization** selected.
- Show the paired **Side-by-Side Comparison** CSV tables preserving column headers, row dimensions, and cell boundaries, with identical `[EMAIL_001]` placeholders across rows.
- Click **Download** to export `<filename>-sanitized.csv` locally and note that all headers and quoting remain intact.

## Step 5 — Activity Log & Workspace Reset (~30 seconds)

- Review the **Local Activity Log** panel: confirm entries record timestamps, actions (`Sample`, `Sanitize`, `Mode`, `Upload`, `Download`), modes, formats, and counts—with **zero raw PII**.
- Click **Clear** and confirm source text, file badge, sanitized output, comparison highlights, statistics (`0` across all categories), status (`Idle`), and pseudonymization session state reset immediately.

## Step 6 — Final Network & Storage Proof (~20 seconds)

- Return to **DevTools -> Network**: confirm **0** network requests occurred during sample loading, sanitization, CSV upload, mode switching, copying, and downloading.
- Open **DevTools -> Application -> Local Storage** and **Session Storage**: confirm both remain completely empty.
