/**
 * Clear Stock Media Vector DB
 * ============================================================================
 * API endpoint to delete all records from the stock_media table in Supabase.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';

export async function DELETE(_request: NextRequest) {
  console.log('[ClearVectorDB] Starting clear request...');
  
  try {
    const supabase = createServiceClient();

    // Count records before deletion
    const { count: beforeCount } = await supabase
      .from('stock_media')
      .select('*', { count: 'exact', head: true });

    console.log(`[ClearVectorDB] Found ${beforeCount || 0} records to delete`);

    // Delete all records from stock_media table
    const { error } = await supabase
      .from('stock_media')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all (neq to impossible UUID)

    if (error) {
      console.error('[ClearVectorDB] Delete error:', error);
      throw error;
    }

    console.log(`[ClearVectorDB] Successfully deleted ${beforeCount || 0} records`);

    return NextResponse.json({
      success: true,
      data: {
        deleted: beforeCount || 0,
      },
    });
  } catch (error) {
    console.error('[ClearVectorDB] Failed to clear vector DB:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to clear vector DB',
      },
      { status: 500 }
    );
  }
}
