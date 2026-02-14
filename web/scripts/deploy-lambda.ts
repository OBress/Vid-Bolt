#!/usr/bin/env npx tsx
/**
 * Deploy Lambda Script
 * ============================================================================
 * Deploys the Remotion Lambda infrastructure:
 * 1. Uploads the Remotion bundle (site) to S3
 * 2. Creates or updates the Lambda function
 *
 * Usage:
 *   npx tsx scripts/deploy-lambda.ts
 *
 * Prerequisites:
 *   - AWS credentials configured (via env vars or ~/.aws/credentials)
 *   - Required env vars set in .env.local
 */

import { config } from "dotenv";
import { resolve } from "path";

// Load env vars
config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });

async function deploy() {
  console.log("=".repeat(60));
  console.log("[Deploy Lambda] Starting Remotion Lambda deployment...");
  console.log("=".repeat(60));

  // Dynamically import to avoid loading at parse time
  const { deploySite, deployFunction, getOrCreateBucket } = await import(
    "@remotion/lambda"
  );
  const { lambdaConfig } = await import(
    "../lib/services/render/lambda-config"
  );

  // Only validate the pre-requisites (AWS creds + region).
  // REMOTION_FUNCTION_NAME, REMOTION_SERVE_URL, REMOTION_S3_BUCKET
  // are created BY this script — don't require them upfront.
  const DEPLOY_PREREQS = [
    "AWS_ACCESS_KEY_ID",
    "AWS_SECRET_ACCESS_KEY",
    "REMOTION_AWS_REGION",
  ] as const;
  const missing = DEPLOY_PREREQS.filter((v) => !process.env[v]);
  if (missing.length > 0) {
    console.error("[Deploy Lambda] Missing required env vars:", missing);
    process.exit(1);
  }

  const region = lambdaConfig.region;

  // Step 1: Ensure S3 bucket exists
  console.log(`\n[Deploy Lambda] Ensuring S3 bucket in ${region}...`);
  const { bucketName } = await getOrCreateBucket({ region });
  console.log(`[Deploy Lambda] Using bucket: ${bucketName}`);

  // Step 2: Deploy the Remotion site (bundle)
  console.log("\n[Deploy Lambda] Deploying Remotion site bundle...");
  const { serveUrl } = await deploySite({
    entryPoint: resolve(
      process.cwd(),
      "features/video-editor-v2/utils/remotion/index.ts"
    ),
    bucketName,
    region,
    siteName: "vidbolt-render",
  });
  console.log(`[Deploy Lambda] Site deployed: ${serveUrl}`);

  // Step 3: Deploy the Lambda function
  console.log("\n[Deploy Lambda] Deploying Lambda function...");
  const { functionName, alreadyExisted } = await deployFunction({
    region,
    timeoutInSeconds: lambdaConfig.lambdaTimeoutSec,
    memorySizeInMb: lambdaConfig.lambdaMemoryMb,
    diskSizeInMb: lambdaConfig.lambdaDiskMb,
    createCloudWatchLogGroup: true,
  });
  console.log(
    `[Deploy Lambda] Function ${alreadyExisted ? "updated" : "created"}: ${functionName}`
  );

  // Summary
  console.log("\n" + "=".repeat(60));
  console.log("[Deploy Lambda] Deployment complete!");
  console.log("=".repeat(60));
  console.log("\nAdd these to your .env.local:\n");
  console.log(`REMOTION_AWS_REGION=${region}`);
  console.log(`REMOTION_FUNCTION_NAME=${functionName}`);
  console.log(`REMOTION_SERVE_URL=${serveUrl}`);
  console.log(`REMOTION_S3_BUCKET=${bucketName}`);
}

deploy().catch((err) => {
  console.error("[Deploy Lambda] Fatal error:", err);
  process.exit(1);
});
