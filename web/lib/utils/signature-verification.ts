import crypto from "crypto";

/**
 * Verify HMAC-SHA256 signature from GPU API
 */
export function verifySignature(
  payload: string,
  signature: string | null,
  secret: string | undefined
): boolean {
  // If no secret configured, skip verification (for dev/testing)
  if (!secret) {
    console.log("[GPUCallback] No webhook secret configured, skipping signature verification");
    return true;
  }

  if (!signature) {
    console.warn("[GPUCallback] Missing X-Webhook-Signature header");
    return false;
  }

  const expectedSignature = `sha256=${crypto
    .createHmac("sha256", secret)
    .update(payload)
    .digest("hex")}`;

  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSignature);

  if (signatureBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(expectedBuffer, signatureBuffer);
}
