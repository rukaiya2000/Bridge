import { describe, expect, it } from "vitest";
import { findInText, hideDetails, redactPersonal } from "../src/privacy/detect";
import { checkFile } from "../src/privacy/files";

describe("findInText", () => {
  it.each([
    ["my number is 305-555-0142", ["phone"]],
    ["call me at (786) 412-9934", ["phone"]],
    ["my email is jake.miller2011@gmail.com", ["email"]],
    ["my ssn is 536-22-1234", ["ssn"]],
    ["here is my card 4111 1111 1111 1111", ["card"]],
    ["I live at 1200 SW 8th Street, Miami FL", ["address"]],
    ["my password for the school portal is Tiger!2024", ["password"]],
    ["i was born on 03/14/2011", ["birthday"]],
    ["my student id is 1048837", ["student_id"]],
    ["my ssn is 536221234", ["ssn"]],
    ["cvv 123", ["card"]],
    ["it expires 12/27", ["card"]],
    ["routing 021000021 account 123456789012", ["bank"]],
    ["my passport number is X12345678", ["id_document"]],
    ["drivers license D123-456-78-901", ["id_document"]],
    ["our zip code is 33101", ["address"]],
  ])("finds personal info: %s", async (text, expected) => {
    expect(await findInText(text)).toEqual(expect.arrayContaining(expected));
  });

  it.each([
    "whats 305 minus 142",
    "question 12 says x = 555 and y = 0142",
    "I feel lonely lately",
    "I play xbox with my friend NightOwl22",
    "Hi Sam, can you explain photosynthesis?",
    "the password lesson in class was boring",
    "I have 12 friends on my street",
    "we read 20 pages of the road not taken",
    "my license is expired",
    "I got 1450 on the SAT and my account is new",
    "social studies test is on 12/27",
  ])("stays quiet on normal chat: %s", async (text) => {
    expect(await findInText(text)).toEqual([]);
  });
});

describe("checkFile", () => {
  it("flags ID-like filenames even when the content can't be read", async () => {
    const f = new File(["\x89PNG"], "passport_scan.png", { type: "image/png" });
    expect(await checkFile(f)).toEqual({ name: "passport_scan.png", findings: ["id_document"], photo: true });
  });

  it("reads text files", async () => {
    const f = new File(["Name: Jake\nPhone: 305-555-0142"], "notes.txt", { type: "text/plain" });
    expect((await checkFile(f)).findings).toContain("phone");
  });

  it("lets an ordinary file through", async () => {
    const f = new File(["Chapter 3 summary: the water cycle"], "biology-notes.txt", { type: "text/plain" });
    expect(await checkFile(f)).toEqual({ name: "biology-notes.txt", findings: [], photo: false });
  });
});

describe("redactPersonal", () => {
  it("removes details but keeps the feeling (and crisis phrases) for labeling", async () => {
    const out = await redactPersonal(
      "I feel so alone. text me at 305-555-0142, I live at 1200 SW 8th Street, my password is Tiger!2024. I want to die",
    );
    for (const secret of ["305-555-0142", "1200 SW 8th", "Tiger!2024"]) expect(out).not.toContain(secret);
    expect(out).toContain("I feel so alone");
    expect(out).toContain("I want to die");
  });

  it("removes the whole card, SSN, bank and address details", async () => {
    const out = await redactPersonal(
      "card 4111 1111 1111 1111 exp 12/27 cvv 123, ssn 536221234, routing 021000021, I live at 123 Main St Apt 4B, Miami FL 33101",
    );
    for (const secret of ["4111", "12/27", "123,", "536221234", "021000021", "Main", "4B", "Miami", "33101"]) {
      expect(out).not.toContain(secret);
    }
  });

  it("stops at the street when no city, state and ZIP follow", async () => {
    expect(await redactPersonal("we moved to 45 Oak St and then we went out")).toBe("we moved to ADDRESS and then we went out");
  });

  it("leaves ordinary messages unchanged", async () => {
    expect(await redactPersonal("can you help with my history essay")).toBe("can you help with my history essay");
  });
});

describe("dotted numbers", () => {
  it("reads a dotted card number as a card and removes it completely for labeling", () => {
    expect(findInText("4111.1111.1111.1111")).toEqual(["card"]);
    expect(redactPersonal("my card 4111.1111.1111.1111")).not.toMatch(/\d/);
  });
  it("leaves decimals and version numbers alone", () => {
    expect(findInText("pi is 3.1415 and we use v1.2.3")).toEqual([]);
  });
});

describe("card security code and expiry", () => {
  it.each([
    "cvv 123", "CVC2 is 456", "sec code 321", "csc 321", "cid 1234", "card verification code 123",
    "the 3 digits on the back are 123", "code on the back is 123", "cvv is one two three",
    "exp 04/28", "expiry 04-28", "valid thru 04/28", "good thru 04/28",
  ])("blocks %s as card data and hides the digits from the labeler", (text) => {
    expect(findInText(text)).toContain("card");
    expect(redactPersonal(text)).not.toMatch(/\d{2}|\b(one|two|three)\b/);
  });

  it.each(["I got 123 on the quiz", "page 12 of 28", "the code is broken, line 321", "the security guard said 123 people came", "we meet 04-28 at noon"])(
    "leaves ordinary text alone: %s", (text) => {
      expect(findInText(text)).toEqual([]);
    },
  );
});

describe("evasion tricks are undone before matching", () => {
  const ZW = "​";
  const fullwidth = (s: string) => s.replace(/\d/g, (d) => String.fromCharCode(0xff10 + Number(d)));
  it.each([
    ["zero-width spaces", `4111${ZW}1111${ZW}1111${ZW}1111`, "card"],
    ["non-breaking spaces", "4111 1111 1111 1111", "card"],
    ["fullwidth digits", fullwidth("4111 1111 1111 1111"), "card"],
    ["line breaks", "4111\n1111\n1111\n1111", "card"],
    ["underscores", "4111_1111_1111_1111", "card"],
    ["slashes", "4111/1111/1111/1111", "card"],
    ["l typed for 1", "4111 1111 1111 111l", "card"],
    ["one digit at a time", "4 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1", "card"],
    ["zero-width in a CVV keyword", `cv${ZW}v 123`, "card"],
    ["fullwidth SSN", fullwidth("my ssn is 536-22-1234"), "ssn"],
    ["zero-width SSN", `ssn 536${ZW}-22-1234`, "ssn"],
    ["dotted SSN", "ssn 536.22.1234", "ssn"],
  ])("%s", (_how, text, kind) => {
    expect(findInText(text)).toContain(kind);
    expect(redactPersonal(text)).not.toMatch(/\d{4}/); // and the labeler never gets the number
  });

  it.each([
    ["two phone numbers", "call 305 555 0142 or 786 412 9934"],
    ["math", "12 + 13 = 25, 1111 * 2"],
    ["words with l and O", "lOOl lol IOIO"],
    ["a shipping tracking number", "tracking 1Z999AA10123456784"],
  ])("does not invent a card from %s", (_how, text) => {
    expect(findInText(text)).not.toContain("card");
  });
});

describe("hideDetails", () => {
  it.each([
    ["my card is 4111 1111 1111 1111 exp 04/29 cvv 123", "my card is [card details removed]"],
    ["call me at (786) 412-9934 after school", "call me at [phone number removed] after school"],
    ["my student id is 1048837", "my [student ID removed]"],
    ["email me at jake.miller2011@gmail.com", "email me at [email removed]"],
  ])("%s", (text, want) => {
    const out = hideDetails(text)!;
    expect(out).toBe(want);
    expect(findInText(out)).toEqual([]);
  });

  it("leaves ordinary brackets and numbers alone", () => {
    expect(hideDetails("the answer (in my notes) is 42")).toBe("the answer (in my notes) is 42");
  });
});

describe("numbers after 'ssn'", () => {
  it("are an SSN, not a phone number, even when short", () => {
    expect(findInText("here is my ssn 1234567, it is my ssn")).toEqual(["ssn"]);
    expect(findInText("the last 4 of my social security number is 1234")).toEqual(["ssn"]);
    expect(hideDetails("here is my ssn 1234567, it is my ssn")).toBe("here is my [SSN removed], it is my ssn");
  });

  it("leave plain numbers and the word 'social' alone", () => {
    expect(findInText("call me at 555 1234")).toEqual(["phone"]);
    expect(findInText("the social 2024 event was fun")).toEqual([]);
  });
});
