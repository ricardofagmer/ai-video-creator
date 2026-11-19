import { type NextRequest } from 'next/server';
import { proxyToApi } from '@/lib/bff/proxy';

// Node runtime: streamed request bodies to the api need Node's fetch (`duplex: 'half'`).
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface RouteContext {
  params: Promise<{ path: string[] }>;
}

async function handle(request: NextRequest, context: RouteContext): Promise<Response> {
  const { path } = await context.params;
  return proxyToApi(request, path);
}

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
