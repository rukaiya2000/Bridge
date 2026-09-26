import { describe, expect, it } from "vitest";
import { findInText, redactPersonal } from "../src/privacy/detect";
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
