// \lib
import crypto from 'crypto';

// ⚠️ CRITICAL: Store this in environment variables, NOT in code!
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || ''; // Must be 32 characters
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;

/**
 * Encrypts sensitive data (card numbers, account numbers)
 * Returns encrypted string with IV and auth tag
 */
export function encrypt(text: string): string {
  try {
    // Ensure key is 32 bytes (256 bits)
    const key = crypto.createHash('sha256').update(ENCRYPTION_KEY).digest();
    
    // Generate random IV
    const iv = crypto.randomBytes(IV_LENGTH);
    
    // Create cipher
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    
    // Encrypt
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    // Get auth tag
    const authTag = cipher.getAuthTag();
    
    // Combine: iv + authTag + encrypted data
    const combined = iv.toString('hex') + ':' + authTag.toString('hex') + ':' + encrypted;
    
    return combined;
  } catch (error) {
    console.error('Encryption error:', error);
    throw new Error('Failed to encrypt data');
  }
}

/**
 * Decrypts encrypted data
 * Returns original plaintext
 */
export function decrypt(encryptedData: string): string {
  try {
    // Ensure key is 32 bytes (256 bits)
    const key = crypto.createHash('sha256').update(ENCRYPTION_KEY).digest();
    
    // Split combined string
    const parts = encryptedData.split(':');
    if (parts.length !== 3) {
      throw new Error('Invalid encrypted data format');
    }
    
    const iv = Buffer.from(parts[0], 'hex');
    const authTag = Buffer.from(parts[1], 'hex');
    const encrypted = parts[2];
    
    // Create decipher
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    
    // Decrypt
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  } catch (error) {
    console.error('Decryption error:', error);
    throw new Error('Failed to decrypt data');
  }
}

/**
 * Mask sensitive data for display
 * Shows only last 4 digits
 */
export function maskNumber(number: string): string {
  if (!number || number.length < 4) return '****';
  return '**** **** **** ' + number.slice(-4);
}

/**
 * Validate card number using Luhn algorithm
 */
export function validateCardNumber(cardNumber: string): boolean {
  const sanitized = cardNumber.replace(/\s/g, '');
  
  if (!/^\d+$/.test(sanitized)) return false;
  if (sanitized.length < 13 || sanitized.length > 19) return false;
  
  let sum = 0;
  let isEven = false;
  
  for (let i = sanitized.length - 1; i >= 0; i--) {
    let digit = parseInt(sanitized[i], 10);
    
    if (isEven) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    
    sum += digit;
    isEven = !isEven;
  }
  
  return sum % 10 === 0;
}

/**
 * Validate routing number (US banks)
 */
export function validateRoutingNumber(routingNumber: string): boolean {
  const sanitized = routingNumber.replace(/\s/g, '');
  
  if (!/^\d{9}$/.test(sanitized)) return false;
  
  // ABA routing number checksum validation
  const weights = [3, 7, 1, 3, 7, 1, 3, 7, 1];
  const sum = sanitized.split('').reduce((acc, digit, i) => {
    return acc + parseInt(digit, 10) * weights[i];
  }, 0);
  
  return sum % 10 === 0;
}

/**
 * Generate encryption key (run once, save to .env)
 */
export function generateEncryptionKey(): string {
  return crypto.randomBytes(32).toString('hex');
}