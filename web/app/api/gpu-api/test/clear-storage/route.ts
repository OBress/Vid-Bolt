/**
 * Clear GPU API Test Storage
 * ============================================================================
 * API endpoint to delete all files stored in R2 for GPU API testing.
 * This deletes all files under the 'gpu-api-test/' prefix.
 */

import { NextRequest, NextResponse } from 'next/server';
import { deleteFilesWithPrefix, isR2Configured } from '@/lib/services/r2-storage';

// GPU API test storage prefix
const GPU_TEST_PREFIX = 'gpu-api-test/';

export async function DELETE(request: NextRequest) {
  try {
    // Check if R2 is configured
    if (!isR2Configured()) {
      return NextResponse.json(
        { success: false, error: 'R2 storage is not configured' },
        { status: 500 }
      );
    }

    // Delete all files under the GPU test prefix
    const result = await deleteFilesWithPrefix(GPU_TEST_PREFIX);

    console.log(`[ClearStorage] Deleted ${result.deleted} files from GPU API test storage`);
    
    if (result.errors.length > 0) {
      console.warn(`[ClearStorage] Encountered ${result.errors.length} errors:`, result.errors);
    }

    return NextResponse.json({
      success: true,
      data: {
        deleted: result.deleted,
        errors: result.errors,
      },
    });
  } catch (error) {
    console.error('[ClearStorage] Failed to clear storage:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to clear storage',
      },
      { status: 500 }
    );
  }
}
