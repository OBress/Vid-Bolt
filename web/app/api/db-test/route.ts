import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET() {
  const supabase = await createClient()

  // This is a simple query to test database connection
  // It assumes there is a table (which might not exist yet)
  // But it demonstrates the pattern for future use.
  const { data, error } = await supabase
    .from('profiles') // Replace with an actual table name once you have one
    .select('*')
    .limit(1)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data })
}
