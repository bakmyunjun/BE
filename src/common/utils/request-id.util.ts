import { randomBytes } from "node:crypto";

/**
 * Request ID 생성 유틸리티
 */
export function generateRequestId(): string {
  return `req_${randomBytes(16).toString("hex")}`;
}
