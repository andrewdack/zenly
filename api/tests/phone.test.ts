import { describe, expect, it } from "vitest";
import { normalizePhoneTarget } from "../src/util/phone.js";

describe("normalizePhoneTarget", () => {
  it("turns a local US witness number into E.164", () => {
    expect(normalizePhoneTarget("5715996273")).toBe("+15715996273");
  });

  it("extracts the phone from Spectrum composite ids", () => {
    expect(normalizePhoneTarget("any;-;+15715996273")).toBe("+15715996273");
  });

  it("normalizes composite-ish ids even if the plus is missing", () => {
    expect(normalizePhoneTarget("any;-;5715996273")).toBe("+15715996273");
  });

  it("prefers Andrew's phone over the user-facing Zenly agent number", () => {
    expect(normalizePhoneTarget("any;-;+14156035536;-;+15715197392")).toBe("+15715197392");
  });

  it("prefers the witness phone over the snitch sender number", () => {
    expect(normalizePhoneTarget("any;-;+14156055823;-;+15715996273")).toBe("+15715996273");
  });
});
