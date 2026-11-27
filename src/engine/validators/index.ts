import type { ValidationResult } from '../../types/detection';
import type { PiiCategory } from '../../types/ui';
import { isValidVerhoeff, validateAadhaar } from './aadhaarValidator';
import { isValidLuhn, validateCreditCard } from './creditCardValidator';
import { validateEmail } from './emailValidator';
import { validateIp, validateIpv4, validateIpv6 } from './ipValidator';
import { validatePan } from './panValidator';
import { validatePhone } from './phoneValidator';

export function validateCandidate(
  category: PiiCategory,
  value: string,
): ValidationResult {
  switch (category) {
    case 'credit_card':
      return validateCreditCard(value);
    case 'pan':
      return validatePan(value);
    case 'aadhaar':
      return validateAadhaar(value);
    case 'phone':
      return validatePhone(value);
    case 'ip':
      return validateIp(value);
    case 'email':
      return validateEmail(value);
  }
}

export {
  isValidLuhn,
  isValidVerhoeff,
  validateAadhaar,
  validateCreditCard,
  validateEmail,
  validateIp,
  validateIpv4,
  validateIpv6,
  validatePan,
  validatePhone,
};
