import { PRIVATE_BETA_DEFAULT_CODE } from "./config";

export function getExpectedAccessCode() {
  return process.env.PRIVATE_BETA_CODE || PRIVATE_BETA_DEFAULT_CODE;
}

export function hasPrivateAccess(accessCode?: string | null) {
  if (!accessCode) return false;
  return accessCode.trim() === getExpectedAccessCode();
}

export function getDevAccessHint() {
  return process.env.PRIVATE_BETA_CODE ? null : PRIVATE_BETA_DEFAULT_CODE;
}
