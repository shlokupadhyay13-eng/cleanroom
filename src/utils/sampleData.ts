import { computeVerhoeffCheckDigit } from '../engine';

function computeVerhoeffFixture(baseElevenDigits: string): string {
  const full = `${baseElevenDigits}${computeVerhoeffCheckDigit(baseElevenDigits)}`;
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
