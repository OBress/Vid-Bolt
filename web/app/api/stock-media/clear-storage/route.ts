/**
 * Clear Stock Media Storage
 * ============================================================================
 * API endpoint to delete all files stored in R2 for stock media scraping.
 * This deletes all files under the 'stock-scraper/' prefix.
 */

import { NextRequest, NextResponse } from 'next/server';
import { deleteFilesWithPrefix, isR2Configured } from '@/lib/services/r2-storage';

export async function DELETE(request: NextRequest) {
  console.log('[ClearStockMedia] Starting clear request...');
  
  try {
    // Check if R2 is configured
    const r2Configured = isR2Configured();
    console.log('[ClearStockMedia] R2 configured:', r2Configured);
    
    if (!r2Configured) {
      return NextResponse.json(
        { success: false, error: 'R2 storage is not configured' },
        { status: 500 }
      );
    }

    // Delete ALL files under the stock-scraper prefix
    console.log('[ClearStockMedia] Deleting files under stock-scraper/ prefix...');
    const result = await deleteFilesWithPrefix('stock-scraper/');

    console.log(`[ClearStockMedia] Deleted ${result.deleted} files from stock media storage`);
    
    if (result.errors.length > 0) {
      console.warn(`[ClearStockMedia] Encountered ${result.errors.length} errors:`, result.errors);
    }

    return NextResponse.json({
      success: true,
      data: {
        deleted: result.deleted,
        errors: result.errors,
      },
    });
  } catch (error) {
    console.error('[ClearStockMedia] Failed to clear storage:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to clear storage',
      },
      { status: 500 }
    );
  }
}
