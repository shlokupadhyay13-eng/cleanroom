# CLEANROOM — Local PII Sanitization Utility

## 1. Overview & Platform Definition

**CLEANROOM** is a 100% client-side browser web application for detecting, validating, and sanitizing personally identifiable information (PII) in plain text (`.txt` / pasted text) and structured `.csv` files.

- **What CLEANROOM is:** A zero-backend React and TypeScript browser utility where detection, validation, redaction, CSV parsing, preview highlighting, and file download execute entirely within local browser memory.
- **What CLEANROOM is not:** CLEANROOM is not a custom browser, browser extension, native desktop binary, or cloud API service.

## 2. Core Privacy Model & Threat-Model Scope

- **Local-Only Execution:** All text scanning, checksum verification, redaction, and CSV processing run locally in the browser tab or a same-origin local Web Worker. No document text, file contents, or PII metadata are sent to external servers, APIs, or telemetry endpoints.
- **Production Content Security Policy (CSP):** Production builds inject a strict `<meta http-equiv="Content-Security-Policy">` directive into `dist/index.html` enforcing `connect-src 'none'`, `worker-src 'self'`, `script-src 'self'`, `style-src 'self'`, `font-src 'self'`, and `form-action 'none'`.
- **Ephemeral Volatile State:** Source text, sanitized output, and pseudonymization mappings exist solely in volatile page memory (never written to `localStorage`, `sessionStorage`, `IndexedDB`, or cookies) and are cleared when the user clicks **Clear**, loads a new file/sample, or closes/unmounts the workspace.
- **PII-Free Local Activity Log:** Records operational metadata only (timestamps, action type, redaction mode, source format, byte size, and entity counts), reinforced by a defense-in-depth `sanitizeLogSummary` pass.
- **Threat-Model Limits:** Browser-side execution eliminates server and network exposure during processing, but cannot protect against a compromised device, malicious browser extensions, screen-capture tools, OS clipboard managers, or operating-system compromises.

## 3. Supported PII Categories & Validation Scope

Detection candidates are validated strictly before overlap resolution so invalid longer tokens cannot mask valid overlapping entities.

| Category | Pattern Scope | Validation Method | Technical Check |
| --- | --- | --- | --- |
| Email Addresses | Local-part, `@`, domain labels, alphabetic TLD | `email-format` | Length bounds (local 1–64, domain 4–253), no consecutive/leading/trailing dots, valid domain labels and >=2-letter TLD |
| Phone Numbers | Indian (`+91`, `0`, 10-digit mobile) and international (`+`, `00`, formatted NANP) | `phone-structure` | Balanced parentheses, allowed separators, rejects date patterns and repeated digits, validates E.164/Indian/NANP digit structure |
| IP Addresses | IPv4 dotted quads and IPv6 (uncompressed and `::` compressed) | `ipv4-parse` / `ipv6-parse` | IPv4: 4 octets in `0–255` without leading zeros; IPv6: RFC 4291 8-group or single-`::` hex parsing (with optional trailing IPv4) |
| Indian PAN | 10-character uppercase alphanumeric token | `pan-format` | Exact `[A-Z]{5}[0-9]{4}[A-Z]` layout and official 4th-character entity holder code (`A, B, C, F, G, H, J, L, P, T`) |
| Indian Aadhaar Pattern | 12 digits starting `2–9` (contiguous or consistent space/hyphen `4-4-4`) | `verhoeff-checksum` | Non-identical digits, consistent separator check, and dihedral group D5 Verhoeff checksum |
| Credit Card Candidate | 13–19 digits (contiguous or space/hyphen grouped) | `luhn-checksum` | Non-identical digits, group structure check, and Luhn Mod-10 checksum |

> **Validation Disclaimer:** Format and checksum checks verify structural plausibility only. They never confirm real personal identity, UIDAI/tax registration, or active payment card status.

## 4. Redaction Modes

1. **Full Masking (`full`):** Replaces every detected entity with `[REDACTED]`.
   - Example: `Contact Alex.Taylor@example.org (PAN ABCPE1234F)` -> `Contact [REDACTED] (PAN [REDACTED])`
2. **Partial Masking (`partial`):** Preserves minimal non-sensitive structural cues while hiding sensitive characters:
   - `email`: `Alex.Taylor@example.org` -> `A***@example.org` (`a@example.org` -> `*@example.com`)
   - `credit_card` / `aadhaar`: preserves separators and last 4 digits (`4111-1111-1111-1111` -> `XXXX-XXXX-XXXX-1111`)
   - `pan`: preserves first 2 and last 2 characters (`ABCPE1234F` -> `ABXXXXXX4F`)
   - `phone`: preserves formatting and last 4 digits (`+91 98765 43210` -> `+XX XXXXX X3210`)
   - `ip`: IPv4 keeps first octet (`192.168.10.42` -> `192.XXX.XXX.XXX`); IPv6 keeps first group or leading `::` (`2001:db8::1` -> `2001:XXXX::XXXX`, `::1` -> `::XXXX`)
3. **Consistent Pseudonymization (`pseudonymize`):** Replaces entities with session-scoped zero-padded category placeholders (`[EMAIL_001]`, `[PHONE_001]`, `[IP_001]`, `[PAN_001]`, `[AADHAAR_001]`, `[CARD_001]`). Normalized equivalents (such as mixed-case emails or space- vs. hyphen-grouped card/Aadhaar numbers) map to the same placeholder within the active session and across cells of a CSV file.

## 5. File Handling & CSV Preservation

- **Supported Formats & Bounds:** Local `.txt` and `.csv` files up to **5 MB** (`5 * 1024 * 1024` bytes) and pasted inputs up to **5,000,000 characters**.
- **Upload Safeguards:** Rejects unsupported extensions, 0-byte/whitespace-only files, binary null-byte files, and malformed CSVs, and strips leading UTF-8 BOMs (`\uFEFF`).
- **Structure-Preserving CSV Sanitization:** Uses `papaparse` (`header: false`, `skipEmptyLines: false`) to preserve the header row verbatim, maintain exact row and column counts, keep quoted fields (embedded commas, escaped quotes, multi-line cells) intact, prevent detection bleed across cell boundaries, and share a single `PseudonymSession` across all cells in pseudonymization mode.
- **Safe Download:** Generates UTF-8 `Blob`s with hardened filenames (path traversal, control characters, and Windows reserved device names stripped) and revokes temporary Object URLs unconditionally inside `try / finally`.

## 6. Architecture & Technology Stack

- **UI & Build Stack:** React 19, TypeScript (strict mode with `noUncheckedIndexedAccess`), Vite, CSS Modules with immutable tokens (`DESIGN_SYSTEM.md`, `src/styles/tokens.css`), Lucide React, and locally bundled `@fontsource/inter` fonts.
- **Parsing & Testing:** PapaParse (`papaparse`), Vitest, `jsdom`, and React Testing Library.
- **Why No Remote Services:** Cloud DLP services (such as Google Cloud DLP) or remote AI APIs were intentionally excluded so user documents never cross a network boundary and the application continues to operate fully offline under `connect-src 'none'`.

## 7. Accessibility & Performance Highlights

- **Accessibility:** Includes a `Skip to main workspace` link targeting `<main id="main-workspace">`, `Ctrl+Enter` / `Cmd+Enter` sanitization shortcut, `aria-invalid` error binding, `aria-busy` async status indication, `aria-live="polite"` status announcements, accessible CSV table `<caption>` and `<th scope="col">` headers, `aria-hidden="true"` on decorative icons, `:focus-visible` outlines, and `prefers-reduced-motion: reduce` support.
- **Performance:** Inputs `>= 50,000` characters lazily offload to `src/workers/sanitizationWorker.ts` (falling back synchronously if `Worker` is unavailable), pure display panels and highlight segments are memoized (`React.memo` / `useMemo`), and visual DOM previews cap rendering at `100,000` characters / `200` CSV rows while preserving 100% of sanitized output for **Copy** and **Download**.

## 8. Local Development & Verification Commands

```bash
npm install
npm run dev
npm run typecheck
npm run lint
npm run test:run
npm run build
npm run preview
```

## 9. Testing & Documentation Index

Current test status: **20 test files, 102 passing tests** executed via `npm run test:run`.

- [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md) — Immutable color tokens, typography scale, and accessibility/styling rules.
- [SECURITY_AUDIT.md](SECURITY_AUDIT.md) — Static security audit, production CSP policy, defense-in-depth controls, and threat-model limits.
- [DEMO_GUIDE.md](DEMO_GUIDE.md) — Repeatable 3-to-5-minute live demonstration walkthrough.
- [SUBMISSION_REPORT.md](SUBMISSION_REPORT.md) — Factual phase completion, verification matrix, and known boundaries.
