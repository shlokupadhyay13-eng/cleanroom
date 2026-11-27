// Compute a synthetic Verhoeff-valid 12-digit fixture locally so no real identifier is embedded.
function computeVerhoeffFixture(baseElevenDigits: string): string {
  const d: readonly (readonly number[])[] = [
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
    [1, 2, 3, 4, 0, 6, 7, 8, 9, 5],
    [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
    [3, 4, 0, 1, 2, 8, 9, 5, 6, 7],
    [4, 0, 1, 2, 3, 9, 5, 6, 7, 8],
    [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
    [6, 5, 9, 8, 7, 1, 0, 4, 3, 2],
    [7, 6, 5, 9, 8, 2, 1, 0, 4, 3],
    [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
    [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
  ];
  const p: readonly (readonly number[])[] = [
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
    [1, 5, 7, 6, 2, 8, 3, 0, 9, 4],
    [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
    [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
    [9, 4, 5, 3, 1, 2, 6, 8, 7, 0],
    [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
    [2, 7, 9, 3, 8, 0, 6, 4, 1, 5],
    [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
  ];
  const inv: readonly number[] = [0, 4, 3, 2, 1, 5, 6, 7, 8, 9];

  let c = 0;
  for (let i = 0; i < baseElevenDigits.length; i += 1) {
    const digit = baseElevenDigits.charCodeAt(baseElevenDigits.length - 1 - i) - 48;
    const permuted = p[(i + 1) % 8]?.[digit] ?? 0;
    c = d[c]?.[permuted] ?? 0;
  }

  const full = `${baseElevenDigits}${inv[c] ?? 0}`;
  return `${full.slice(0, 4)} ${full.slice(4, 8)} ${full.slice(8, 12)}`;
}

/**
 * Generates synthetic incident ticket text containing all six PII categories
 * plus benign non-PII decoys (dates, timestamps, software versions, non-Luhn IDs).
 * All values are synthetic format/checksum fixtures created strictly for local
 * demonstration and represent no real individual.
 */
export function buildSampleNoisyText(): string {
  const syntheticAadhaar = computeVerhoeffFixture('23456789012');

  return [
    'Ticket #INC-2026-0419 | Logged 2026-11-27 at 14:35:20 UTC (Build v2.4.1.0)',
    'Requester: Alex.Taylor@example.org (alt contact: alex.taylor@example.org)',
    'Escalation Desk: billing.support@sample-corp.net',
    'Phones: +91 98765 43210 (primary), +1 (415) 555-0199 (US callback)',
    'Source Hosts: 192.168.10.42 and fallback node 2001:db8::1',
    `Tax Reference: ABCPE1234F | Synthetic Checksum ID: ${syntheticAadhaar}`,
    'Test Card Fixture: 4111-1111-1111-1111 | Order Ref (non-Luhn): 4111-1111-1111-1112',
  ].join('\n');
}

/**
 * Generates a synthetic 4-row CSV dataset (header + 3 data rows) exercising
 * quoted commas, escaped quotes, cross-row repeated emails, all six PII
 * categories, and benign non-PII decoys.
 */
export function buildSampleCsvText(): string {
  const firstAadhaar = computeVerhoeffFixture('23456789012');
  const secondAadhaar = computeVerhoeffFixture('34567890123');
  const thirdAadhaar = computeVerhoeffFixture('45678901234');

  return [
    'RecordID,FullName,Email,Phone,IPAddress,PAN,GovIDPattern,PaymentCard,Notes',
    `101,"Patel, Rohan",rohan.patel@example.org,+91 98765 43210,192.168.10.42,ABCPE1234F,${firstAadhaar},4111-1111-1111-1111,"Review ""urgent"" on 2026-11-27 (v2.4.1.0)"`,
    `102,"Nair, Kavya",Rohan.Patel@example.org,+1 (415) 555-0199,10.0.0.18,PQRCS9876K,${secondAadhaar},5412345678901232,"Order Ref 4111-1111-1111-1112 verified"`,
    `103,"Sharma, Vikram",vikram.sharma@sample-corp.net,+44 20 7946 0958,2001:db8::1,LMNPB5678R,${thirdAadhaar},3782-822463-10005,"Scheduled maintenance ticket #402"`,
  ].join('\n');
}
