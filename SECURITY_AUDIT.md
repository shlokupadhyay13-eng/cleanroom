# CLEANROOM Security & Privacy Audit

## 1. Static Code Audit Results

Static searches across production runtime code under `src/` (excluding test suites) and `index.html` verify:

- **Network APIs (`fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource`, `navigator.sendBeacon`):** `0` occurrences.
- **Persistent browser storage (`localStorage`, `sessionStorage`, `indexedDB`, `document.cookie`, `caches`):** `0` occurrences.
- **Dynamic code evaluation (`eval`, `new Function`, string-based `setTimeout`/`setInterval`):** `0` occurrences (only a function-callback `window.setTimeout` for resetting the 2-second clipboard feedback state).
- **Unsafe DOM injection (`dangerouslySetInnerHTML`, `innerHTML`, `outerHTML`, `document.write`, `insertAdjacentHTML`):** `0` occurrences. All highlighted entities render strictly via React JSX `<span>` and `<mark>` elements.
- **Console logging (`console.*`):** `0` occurrences in production runtime code.
- **TypeScript suppressions / `any` types (`@ts-ignore`, `@ts-expect-error`, `eslint-disable`, `any`):** `0` occurrences in non-test `src/`.
- **External URLs (`http://`, `https://`):** `0` occurrences in `index.html`, `dist/index.html`, and runtime application code. Fonts (`@fontsource/inter`) and icons (`lucide-react`) are bundled locally.

## 2. Production Content Security Policy (CSP)

A build-only Vite plugin (`cleanroom-production-csp` with `apply: 'build'`) in `vite.config.ts` injects a strict `<meta http-equiv="Content-Security-Policy">` directive into `dist/index.html`:

```text
default-src 'self'; script-src 'self'; style-src 'self'; font-src 'self'; img-src 'self' data:; worker-src 'self'; connect-src 'none'; object-src 'none'; base-uri 'self'; form-action 'none';
```

This keeps `vite dev` HMR functional during local development while allowing the locally bundled ES module Web Worker (`worker-src 'self'`) and blocking outbound network connections (`connect-src 'none'`), third-party scripts, external styles, and form submissions in production builds.

## 3. Defense-in-Depth & Local Worker Architecture

- **Activity Log PII Guard (`src/utils/activityLog.ts`):** `sanitizeLogSummary` strips newlines/tabs, runs `detectPii` + `[REDACTED]` masking on every log summary before storing, and caps summary length at 240 characters.
- **UTF-8 BOM Stripping (`src/utils/fileLoader.ts`, `src/utils/csvProcessor.ts`):** Leading `\uFEFF` byte order marks are stripped on file read and CSV parsing so BOM bytes do not corrupt headers or first-character matches.
- **Filename Hardening (`src/utils/fileDownload.ts`):** `buildSanitizedFilename` strips path traversal segments, ASCII control characters, leading/trailing punctuation, unsafe filesystem characters, Windows reserved device names (`CON`, `PRN`, `AUX`, `NUL`, `COM1`–`COM9`, `LPT1`–`LPT9`), and caps base length to 80 characters. Temporary download anchors use `rel="noopener noreferrer"` and clean up `anchor.remove()` and `URL.revokeObjectURL` inside nested `try / finally` blocks.
- **Input Size Bounds (`src/utils/fileLoader.ts`, `src/components/workspace/WorkspaceShell.tsx`):** Both uploaded files (5 MB) and pasted text (`MAX_TEXT_INPUT_LENGTH = 5_000_000`) are bounded with accessible `role="alert"` error reporting that never echoes raw input.
- **Local Web Worker Isolation (`src/workers/sanitizationWorker.ts`, `src/utils/sanitizationClient.ts`):** Inputs at or above `WORKER_THRESHOLD_CHARS` (`50,000` characters) lazily instantiate a local module Web Worker (`new Worker(new URL('../workers/sanitizationWorker.ts', import.meta.url), { type: 'module' })`), with synchronous in-memory fallback when `Worker` is unavailable. Out-of-order responses are isolated by monotonic `requestId` tracking, `clearSession()` clears both synchronous and worker pseudonym maps, and `dispose()` calls `worker.terminate()` on workspace unmount.
- **Ephemeral Memory & Session Reset (`src/components/workspace/WorkspaceShell.tsx`):** Pseudonymization session mappings, active worker instances, and copy feedback timers are cleared on `Clear`, on loading a new file or sample, and on component unmount.

## 4. Automated Security & Privacy Test Coverage

Automated tests across [src/security/security.test.ts](src/security/security.test.ts) (7 tests), [src/utils/sanitizationClient.test.ts](src/utils/sanitizationClient.test.ts) (4 tests), and [src/test/integration.test.tsx](src/test/integration.test.tsx) (4 tests) verify:

- Zero `fetch`, `XMLHttpRequest`, or `navigator.sendBeacon` invocations across end-to-end text and CSV workflows.
- Zero `localStorage` or `sessionStorage` writes during or after processing.
- Defense-in-depth neutralization of accidentally passed raw PII in `createActivityEntry`.
- Non-leakage of raw email/PAN values inside `role="alert"` banners or `ActivityLogPanel` when malformed CSVs fail parsing or oversized (`> 5,000,000` character) inputs are rejected.
- Safe escaped literal rendering of `<script>` and `<img onerror=...>` payloads with zero injected DOM nodes.
- Filename traversal/reserved-name sanitization, UTF-8 BOM stripping, and unconditional `URL.revokeObjectURL` cleanup even if anchor clicks throw.
- Worker request/response isolation, stale async result cancellation on `Clear`, and `worker.terminate()` disposal on unmount.

## 5. Honest Threat-Model Scope & Limitations

- **Format/Checksum vs. Identity:** Validation checks (Luhn, Verhoeff, PAN holder code, phone structure, IPv4/IPv6 parsing, email format) verify structural plausibility only and never confirm identity, document validity, or account status.
- **Client-Side Boundaries:** Running locally in the browser eliminates server and network exposure during document processing, but **cannot** protect against a compromised device, malicious browser extensions, screen-recording software, OS clipboard history managers, or operating-system compromise.
