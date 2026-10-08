import { randomInt } from "node:crypto";

// Excludes 0/O and 1/I, which are easy to mix up when read off a screen.
const ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
export const TEAM_CODE_LENGTH = 6;

export function generateTeamCode(): string {
  let code = "";
  for (let i = 0; i < TEAM_CODE_LENGTH; i++) {
    code += ALPHABET[randomInt(ALPHABET.length)];
  }
  return code;
}
