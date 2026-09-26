// Finds and removes personal information in text. Runs only on the device: nothing here makes a
// network call (neither library gets an API key, so neither phones home). File checks are in files.ts.
import { Redactor } from "@redactpii/node";

export type Finding =
  | "phone" | "email" | "ssn" | "card" | "bank" | "address" | "password" | "birthday" | "student_id" | "id_document";

export const FINDING_LABEL: Record<Finding, string> = {
  phone: "a phone number",
  email: "an email address",
  ssn: "a Social Security number",
  card: "a payment card number",
  bank: "a bank account or routing number",
  address: "a home address",
  password: "a password",
  birthday: "a date of birth",
  student_id: "a student ID",
  id_document: "what looks like an ID, school or medical document",
};

// Phone, email, SSN and cards. NAME is off: it guesses names from greetings and flags too much chat.
const redactor = new Redactor({ rules: { CREDIT_CARD: true, EMAIL: true, NAME: false, PHONE: true, SSN: true } });
const PLACEHOLDERS: [string, Finding][] = [
  ["US_SOCIAL_SECURITY_NUMBER", "ssn"], ["CREDIT_CARD_NUMBER", "card"], ["PHONE_NUMBER", "phone"], ["EMAIL_ADDRESS", "email"],
];

// Our own patterns for what redactpii doesn't cover. Street addresses: we tried @openredaction/core,
// but it imports Node built-ins (fs, path, crypto) and can't run in a browser extension. The
// address rule needs a house number, 1-4 words and a street type, and skips "12 friends on my street".
const STREET_TYPES = "street|st|avenue|ave|road|rd|boulevard|blvd|lane|ln|drive|dr|court|ct|way|place|pl|terrace|ter|circle|cir|parkway|pkwy|highway|hwy";
const NOT_A_STREET_WORD = "(?!(?:on|my|the|in|at|to|of|for|and|a|with|from|our|his|her|their)\\b)";
// What can follow the street: "Apt 4B", then "Miami FL 33101" (needs the ZIP) or ", Miami, FL".
const UNIT = "(?:,?\\s*(?:apt|apartment|unit|suite|ste|#)\\.?\\s*#?\\s*[a-z0-9-]+)?";
const CITY_STATE_ZIP =
  "(?:,?\\s+[a-z]+(?:\\s[a-z]+){0,2},?\\s+[a-z]{2}\\s+\\d{5}(?:-\\d{4})?\\b|,\\s*[a-z]+(?:\\s[a-z]+){0,2},\\s*[a-z]{2}\\b)?";
// Number rules need a keyword in front ("ssn", "routing", "passport") so math and scores stay untouched,
// and ID values need at least one digit so "my license is expired" isn't flagged.
const PHRASES: [Finding, RegExp][] = [
  ["address", new RegExp(`\\b\\d{2,6}\\s+(?:${NOT_A_STREET_WORD}[a-z0-9]+\\s+){1,4}(?:${STREET_TYPES})\\b${UNIT}${CITY_STATE_ZIP}`, "i")],
  ["address", /\bp\.?\s*o\.?\s*box\s+\d+/i],
  ["address", /\b(zip|zip code|postal code)\s*(is|:)?\s*\d{5}(-\d{4})?\b/i],
  ["ssn", /\b(ssn|social security|social)\s*(number|no\.?|#)?\s*(is|:|#)?\s*\d{3}\s?\d{2}\s?\d{4}\b/i], // no dashes; redactpii handles dashed
  ["card", /\b(cvv2?|cvc|security code)\s*(is|:|#)?\s*\d{3,4}\b/i],
  ["card", /\b(exp|expiry|expires|expiration)(\s+date)?\s*(is|:)?\s*\d{1,2}\s*\/\s*\d{2,4}\b/i],
  ["bank", /\b(routing|account|acct|iban|bank account)\s*(number|no\.?|#)?\s*(is|:|#)?\s*[a-z]{0,2}\d[\d\s-]{5,30}\d\b/i],
  ["id_document", /\b(passport|driver'?s? licen[cs]e|licen[cs]e|dl|state id)\s*(number|no\.?|#)?\s*(is|:|#)?\s*(?=[a-z]*\d)[a-z0-9-]{6,15}\b/i],
  ["password", /\b(password|passcode|pin)\b(\s+\w+){0,5}?\s*(is|:|=)\s*\S{3,}/i], // "password for X is ..."
  ["birthday", /\b(born on|birthday is|dob|date of birth)\s*(is|:)?\s*\d{1,2}[/\-.]\d{1,2}[/\-.]\d{2,4}/i],
  ["student_id", /\bstudent\s*(id|number|#)\s*(is|:|#)?\s*\d{4,}/i],
];

const unique = (xs: Finding[]) => [...new Set(xs)];

// Fast enough (well under a millisecond) to run synchronously on every send.
export function findInText(text: string): Finding[] {
  if (!text.trim()) return [];
  const redacted = redactor.redact(text);
  const found: Finding[] = PLACEHOLDERS.filter(([p]) => redacted.includes(p)).map(([, f]) => f);
  for (const [f, re] of PHRASES) if (re.test(text)) found.push(f);
  return unique(found);
}



// Copy of `text` with personal details replaced by placeholders ("my number is PHONE_NUMBER"). Used
// before a message is sent anywhere for labeling, so Bridge itself never forwards those details.
export function redactPersonal(text: string): string {
  let out = redactor.redact(text);
  for (const [f, re] of PHRASES) out = out.replace(new RegExp(re.source, "gi"), f.toUpperCase());
  return out;
}
