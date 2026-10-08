import { describe, expect, it } from "vitest";
import { generateTeamCode, TEAM_CODE_LENGTH } from "../src/services/teamCode.js";

const AMBIGUOUS_CHARS = ["0", "O", "1", "I"];

describe("generateTeamCode", () => {
  it("produces a code of the expected length", () => {
    expect(generateTeamCode()).toHaveLength(TEAM_CODE_LENGTH);
  });

  it("never includes visually ambiguous characters", () => {
    for (let i = 0; i < 500; i++) {
      const code = generateTeamCode();
      for (const char of AMBIGUOUS_CHARS) {
        expect(code).not.toContain(char);
      }
    }
  });

  it("is not trivially predictable across repeated calls", () => {
    const codes = new Set(Array.from({ length: 50 }, () => generateTeamCode()));
    // With a 32-character alphabet and 6 slots, collisions in 50 draws should be vanishingly rare.
    expect(codes.size).toBeGreaterThan(45);
  });
});
