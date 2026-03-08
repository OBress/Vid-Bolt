import crypto from "crypto";

/**
 * Verify HMAC-SHA256 signature from GPU API
 */
export function verifySignature(
  payload: string,
  signature: string | null,
  secret: string | undefined
): boolean {
  // Fail closed in production; only skip in development
  if (!secret) {
    if (process.env.NODE_ENV === 'development') {
      console.warn("[GPUCallback] No webhook secret configured, skipping verification (dev only)");
      return true;
    }
    console.error("[GPUCallback] GPU_WEBHOOK_SECRET not configured — rejecting request");
    return false;
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
