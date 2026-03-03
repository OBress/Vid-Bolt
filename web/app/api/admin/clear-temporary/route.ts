/**
 * Clear Temporary Storage
 * ============================================================================
 * API endpoint to delete all temporary/disposable files stored in R2.
 * This deletes all files under the 'temporary/' prefix including:
 * - gpu-api-test/
 * - stock-scraper/
 */

import { NextRequest, NextResponse } from 'next/server';
import { deleteFilesWithPrefix, isR2Configured, STORAGE_PATHS } from '@/lib/services/r2-storage';
import { requireAdmin, isAuthError } from '@/lib/utils/admin-auth';

/**
 * DELETE /api/admin/clear-temporary
 * 
 * SECURITY: Admin-only endpoint.
 */
export async function DELETE(_request: NextRequest) {
  // Admin-only
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth;

  try {
    // Check if R2 is configured
    if (!isR2Configured()) {
      return NextResponse.json(
        { success: false, error: 'R2 storage is not configured' },
        { status: 500 }
      );
    }

    // Delete ALL files under the temporary prefix
    const result = await deleteFilesWithPrefix(`${STORAGE_PATHS.TEMPORARY}/`);

    console.log(`[ClearTemporary] Deleted ${result.deleted} files from temporary storage`);
    
    if (result.errors.length > 0) {
      console.warn(`[ClearTemporary] Encountered ${result.errors.length} errors:`, result.errors);
    }

    return NextResponse.json({
      success: true,
      data: {
        deleted: result.deleted,
        errors: result.errors,
        prefix: `${STORAGE_PATHS.TEMPORARY}/`,
      },
    });
  } catch (error) {
    console.error('[ClearTemporary] Failed to clear storage:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to clear storage',
      },
      { status: 500 }
    );
  }
}
