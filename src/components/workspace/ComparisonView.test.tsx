import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { sanitizeText } from '../../engine';
import { sanitizeCsvText } from '../../utils';
import {
  ComparisonView,
  MAX_CSV_PREVIEW_ROWS,
  MAX_PREVIEW_CHARS,
} from './ComparisonView';

describe('ComparisonView', () => {
  it('renders highlighted <mark> elements safely without injecting HTML elements', () => {
    const source =
      'Payload <img src=x onerror=alert(1)> email john@example.com.';
    const { detection, redaction } = sanitizeText(source, { mode: 'partial' });

    const { container } = render(
      <ComparisonView
        totalDetected={detection.totalCount}
        plainComparison={{
          sourceText: source,
          detectedEntities: detection.entities,
          sanitizedText: redaction.sanitizedText,
          redactedEntities: redaction.entities,
        }}
      />,
    );

    expect(container.querySelectorAll('img')).toHaveLength(0);

    const marks = container.querySelectorAll('mark');
    expect(marks).toHaveLength(2);
    expect(marks[0]).toHaveTextContent('john@example.com');
    expect(marks[0]).toHaveAttribute('aria-label', 'Detected Email Address');
    expect(marks[1]).toHaveTextContent('j***@example.com');
    expect(marks[1]).toHaveAttribute('aria-label', 'Sanitized Email Address');
  });

  it('renders zero-match note when no entities are detected', () => {
    render(
      <ComparisonView
        totalDetected={0}
        plainComparison={{
          sourceText: 'Clean note',
          detectedEntities: [],
          sanitizedText: 'Clean note',
          redactedEntities: [],
        }}
      />,
    );

    expect(
      screen.getByText(
        'No supported PII patterns were detected in the current input.',
      ),
    ).toBeInTheDocument();
  });

  it('renders paired CSV comparison tables with accessible captions, scope="col" headers, and cell highlights', () => {
    const csv = 'name,email\nAlice,alice@example.com\nBob,bob@company.org';
    const result = sanitizeCsvText(csv, { mode: 'pseudonymize' });
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    const { container } = render(
      <ComparisonView
        totalDetected={result.totalDetected}
        csvComparison={result.comparison}
      />,
    );

    const tables = screen.getAllByRole('table');
    expect(tables).toHaveLength(2);

    const sourceTable = tables[0]!;
    const sanitizedTable = tables[1]!;

    expect(
      sourceTable.querySelector('caption')?.textContent,
    ).toMatch(/source csv/i);
    expect(
      sanitizedTable.querySelector('caption')?.textContent,
    ).toMatch(/sanitized csv/i);

    for (const th of sourceTable.querySelectorAll('th')) {
      expect(th).toHaveAttribute('scope', 'col');
    }
    for (const th of sanitizedTable.querySelectorAll('th')) {
      expect(th).toHaveAttribute('scope', 'col');
    }

    expect(within(sourceTable).getByText('name')).toBeInTheDocument();
    expect(within(sourceTable).getByText('email')).toBeInTheDocument();
    expect(within(sourceTable).getByText('alice@example.com').tagName).toBe(
      'MARK',
    );
    expect(within(sanitizedTable).getByText('[EMAIL_001]').tagName).toBe(
      'MARK',
    );
    expect(within(sanitizedTable).getByText('[EMAIL_002]').tagName).toBe(
      'MARK',
    );
    expect(container.querySelectorAll('mark')).toHaveLength(4);
  });

  it('caps large plain-text and CSV visual previews while preserving complete data semantics', () => {
    const oversizedSource = `john@example.com ${'a'.repeat(MAX_PREVIEW_CHARS + 500)}`;
    const { detection, redaction } = sanitizeText(oversizedSource, {
      mode: 'full',
    });

    const { unmount } = render(
      <ComparisonView
        totalDetected={detection.totalCount}
        plainComparison={{
          sourceText: oversizedSource,
          detectedEntities: detection.entities,
          sanitizedText: redaction.sanitizedText,
          redactedEntities: redaction.entities,
        }}
      />,
    );

    expect(
      screen.getByText(/Showing first 100,000 characters in the visual preview/i),
    ).toBeInTheDocument();
    unmount();

    const rows = Array.from({ length: MAX_CSV_PREVIEW_ROWS + 25 }, (_, i) => [
      {
        originalValue: `row_${i}@example.com`,
        sanitizedValue: '[REDACTED]',
        detectedEntities: [],
        redactedEntities: [],
      },
    ]);

    render(
      <ComparisonView
        totalDetected={rows.length}
        csvComparison={{
          headers: ['email'],
          rows,
        }}
      />,
    );

    expect(
      screen.getByText(/Showing first 200 of 225 CSV rows in the visual preview/i),
    ).toBeInTheDocument();

    const tables = screen.getAllByRole('table');
    expect(tables[0]?.querySelectorAll('tbody tr')).toHaveLength(
      MAX_CSV_PREVIEW_ROWS,
    );
  });
});
