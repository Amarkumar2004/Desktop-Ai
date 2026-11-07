import { NextResponse } from 'next/server';
import { discoverAvailableProviders } from '@/backend/services/aiProviderService';

/**
 * Returns live provider availability and model IDs only.
 * API credentials are never included in the response.
 */
export async function GET() {
  try {
    const providers = await discoverAvailableProviders();
    return NextResponse.json({
      success: true,
      checkedAt: new Date().toISOString(),
      providers: providers.map((provider) => ({
        id: provider.id,
        name: provider.name,
        available: provider.available,
        models: provider.models,
        diagnostic: provider.diagnostic,
        defaultModel: provider.defaultModel || null,
      })),
    }, {
      headers: { 'Cache-Control': 'no-store, max-age=0' },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Provider discovery failed.';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
