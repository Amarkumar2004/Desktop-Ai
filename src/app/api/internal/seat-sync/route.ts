import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

let inMemorySeats: any[] = [];

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (body && Array.isArray(body.seats)) {
      inMemorySeats = body.seats;
    }
    return NextResponse.json({
      success: true,
      count: inMemorySeats.length,
      syncedAt: new Date().toISOString(),
    });
  } catch {
    return NextResponse.json({ success: true, count: 0 });
  }
}

export async function GET() {
  return NextResponse.json({
    success: true,
    seats: inMemorySeats,
  });
}
