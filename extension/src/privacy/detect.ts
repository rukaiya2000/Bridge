// Finds and removes personal information in text. Runs only on the device: nothing here makes a
// network call (neither library gets an API key, so neither phones home). File checks are in files.ts.
import { Redactor } from "@redactpii/node";
import cardValidator from "card-validator";

export type Finding =
  | "phone" | "email" | "ssn" | "card" | "bank" | "address" | "password" | "birthday" | "student_id" | "id_document"
  // Blocked by the Jev safety gate (core/src/safety.ts). No category, so abuse is never revealed to a parent.
  | "unsafe";

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
  unsafe: "something unsafe to share with a chatbot",
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
const DIGIT_WORD = "(?:zero|oh|one|two|three|four|five|six|seven|eight|nine)";
const CVV_DIGITS = `(?:\\d{3,4}|${DIGIT_WORD}(?:[\\s-]+${DIGIT_WORD}){2,3})\\b`;
const PHRASES: [Finding, RegExp][] = [
  ["address", new RegExp(`\\b\\d{2,6}\\s+(?:${NOT_A_STREET_WORD}[a-z0-9]+\\s+){1,4}(?:${STREET_TYPES})\\b${UNIT}${CITY_STATE_ZIP}`, "i")],
  ["address", /\bp\.?\s*o\.?\s*box\s+\d+/i],
  ["address", /\b(zip|zip code|postal code)\s*(is|:)?\s*\d{5}(-\d{4})?\b/i],
  // After "ssn" / "social security", any 4-9 digits count as (part of) an SSN, so "last 4 of my ssn is 1234"
  // or a short number isn't mistaken for a phone number. Full dashed SSNs without a keyword: redactpii.
  ["ssn", /\b(ssn|social security)\s*(number|no\.?|#)?\s*(is|:|#)?\s*\d(?:[\s-]?\d){3,8}\b/i],
  // Security code: the usual names (CVV, CVC, CSC, CID on Amex, "sec code") or "the digits on the back",
  // followed by 3-4 digits, also spelled out ("one two three").
  ["card", new RegExp(`\\b(?:(?:cvv|cvc|cvn|cav)2?|csc|cid|sec(?:urity)?\\s*code|card\\s+verification(?:\\s+(?:code|value|number))?|(?:code|digits|numbers?)\\s+on\\s+the\\s+back(?:\\s+of\\s+(?:the|my)\\s+card)?)\\s*(?:is|are|:|#|=)?\\s*${CVV_DIGITS}`, "i")],
  // Expiry: "exp 04/28", "expiry 04-28", "valid thru 04/28", "good through 4/2028".
  ["card", /\b(exp|expiry|expires|expiration|valid\s+(thru|through|until)|good\s+(thru|through))(\s+date)?\s*(is|:)?\s*\d{1,2}\s*[/-]\s*\d{2,4}\b/i],
  ["bank", /\b(routing|account|acct|iban|bank account)\s*(number|no\.?|#)?\s*(is|:|#)?\s*[a-z]{0,2}\d[\d\s-]{5,30}\d\b/i],
  ["id_document", /\b(passport|driver'?s? licen[cs]e|licen[cs]e|dl|state id)\s*(number|no\.?|#)?\s*(is|:|#)?\s*(?=[a-z]*\d)[a-z0-9-]{6,15}\b/i],
  ["password", /\b(password|passcode|pin)\b(\s+\w+){0,5}?\s*(is|:|=)\s*\S{3,}/i], // "password for X is ..."
  ["birthday", /\b(born on|birthday is|dob|date of birth)\s*(is|:)?\s*\d{1,2}[/\-.]\d{1,2}[/\-.]\d{2,4}/i],
  ["student_id", /\bstudent\s*(id|number|#)\s*(is|:|#)?\s*\d{4,}/i],
];

const unique = (xs: Finding[]) => [...new Set(xs)];

// Never allowed through, even if the teen chooses "send anyway": money and identity theft risks.
export const ALWAYS_BLOCKED: readonly Finding[] = ["card", "ssn", "bank"];

// Undo tricks that hide numbers from pattern matching, before any rule runs:
//   fullwidth digits "４１１１" (NFKC), zero-width and soft-hyphen characters, odd spaces (non-breaking,
//   thin, ideographic), and card numbers broken up by dots, slashes, underscores, line breaks or single
//   spaces, or with O/l/I typed for 0/1. A broken-up number is only joined back together when
//   card-validator (Braintree) says the result is a real card number, so ordinary numbers stay apart.
const INVISIBLE = /[\u00ad\u200b-\u200d\u2060\ufeff]/g;
const ODD_SPACE = /[\u00a0\u1680\u2000-\u200a\u202f\u205f\u3000]/g;
const LOOKALIKE: Record<string, string> = { O: "0", o: "0", l: "1", I: "1" };
const CARDLIKE_RUN = /[0-9OolI](?:[\s._/\\-]*[0-9OolI]){12,22}/g;

function joinCardRuns(text: string): string {
  return text.replace(CARDLIKE_RUN, (run) => {
    const chars = run.replace(/[\s._/\\-]/g, "");
    if ((chars.match(/\d/g) ?? []).length < 10) return run; // mostly letters: a word, not a number
    const digits = chars.replace(/[OolI]/g, (c) => LOOKALIKE[c]);
    return digits.length >= 12 && digits.length <= 19 && cardValidator.number(digits).isValid ? digits : run;
  });
}

const normalize = (text: string) =>
  joinCardRuns(text.normalize("NFKC").replace(INVISIBLE, "").replace(ODD_SPACE, " "))
    // "536.22.1234": dotted SSN-shaped numbers read like dashed ones
    .replace(/\b(\d{3})\.(\d{2})\.(\d{4})\b/g, "$1-$2-$3");

// Fast enough (well under a millisecond) to run synchronously on every send.
export function findInText(text: string): Finding[] {
  if (!text.trim()) return [];
  // Keyword rules go first and take their digits out, so "ssn 1234567" is an SSN, not also a phone number.
  let rest = normalize(text);
  const found: Finding[] = [];
  for (const [f, re] of PHRASES) {
    if (!re.test(rest)) continue;
    found.push(f);
    rest = rest.replace(new RegExp(re.source, "gi"), " ");
  }
  const redacted = redactor.redact(rest);
  found.push(...PLACEHOLDERS.filter(([p]) => redacted.includes(p)).map(([, f]) => f));
  return unique(found);
}



// Copy of `text` with personal details replaced by placeholders ("my number is PHONE_NUMBER"). Used
// before a message is sent anywhere for labeling, so Bridge itself never forwards those details.
export function redactPersonal(text: string): string {
  // Same order as findInText: keyword rules first, so their digits get the right label.
  let out = normalize(text);
  for (const [f, re] of PHRASES) out = out.replace(new RegExp(re.source, "gi"), f.toUpperCase());
  return redactor.redact(out);
}

// What replaces each kind of detail when the teen chooses "Send without these details".
export const HIDDEN_LABEL: Record<Finding, string> = {
  phone: "[phone number removed]",
  email: "[email removed]",
  ssn: "[SSN removed]",
  card: "[card details removed]",
  bank: "[bank number removed]",
  address: "[address removed]",
  password: "[password removed]",
  birthday: "[birthday removed]",
  student_id: "[student ID removed]",
  id_document: "[ID number removed]",
  unsafe: "[message removed]", // never found inside text: the safety gate blocks the whole message
};

// The teen's message with each personal detail replaced by a readable placeholder, so the rest can
// still be sent. Returns null if anything detectable would remain, so nothing risky goes out.
export function hideDetails(text: string): string | null {
  // Context rules first ("student id is 1048837"), so the pattern library doesn't claim those digits
  // under the wrong kind (it would call that one a phone number).
  let out = normalize(text);
  for (const [f, re] of PHRASES) out = out.replace(new RegExp(re.source, "gi"), HIDDEN_LABEL[f]);
  out = redactor.redact(out);
  for (const [placeholder, f] of PLACEHOLDERS) out = out.split(placeholder).join(HIDDEN_LABEL[f]);
  // A bracket the pattern library left behind: "(786) 412-9934" → "([phone number removed]".
  out = out.replace(/\(\s*(\[[a-z ]+ removed\])\)?/gi, "$1");
  // "[card details removed] [card details removed]" (number, expiry, CVV) reads better once.
  out = out.replace(/(\[[a-z ]+ removed\])(?:\s*,?\s*\1)+/gi, "$1");
  return findInText(out).length ? null : out;
}

