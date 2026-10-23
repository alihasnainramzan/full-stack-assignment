import { NextRequest, NextResponse } from 'next/server';
import { createApiSupabaseClient } from '@/lib/supabase-server';
import { requireAuthAndPermission, handleGuardError } from '@/lib/server-guards';
import { Permission } from '@/lib/permissions';
import { createEstimateSchema, getEstimatesQuerySchema } from '@/lib/validation-schemas';
import { estimateService } from '@/lib/estimate-service';
import { logger } from '@/lib/debug-logger';
import { isValidUUID } from '@/lib/validation-helpers';

interface RouteContext {
  params: Promise<{
    accountId: string;
  }>;
}

/**
 * GET /api/accounts/[accountId]/estimates
 * Server-side list and filter endpoint for account-bound estimates
 */
export async function GET(request: NextRequest, { params }: RouteContext) {
  try {
    const { accountId } = await params;

    if (!isValidUUID(accountId)) {
      return NextResponse.json({ error: 'Invalid account ID format' }, { status: 400 });
    }

    // Require VIEW_ESTIMATES permission within this specific tenant account
    const user = await requireAuthAndPermission(Permission.VIEW_ESTIMATES, { accountId }, request);

    const supabase = createApiSupabaseClient(request);
    if (!supabase) {
      return NextResponse.json({ error: 'Database connection failed' }, { status: 500 });
    }

    // Parse and validate query filters
    const searchParams = request.nextUrl.searchParams;
    const queryPayload = {
      status: searchParams.get('status') || undefined,
      project_id: searchParams.get('project_id') || undefined,
      search: searchParams.get('search') || undefined,
      limit: searchParams.get('limit') || '50',
      offset: searchParams.get('offset') || '0',
    };

    const validatedQuery = getEstimatesQuerySchema.safeParse(queryPayload);
    if (!validatedQuery.success) {
      return NextResponse.json(
        { error: 'Invalid query parameters', details: validatedQuery.error.format() },
        { status: 400 },
      );
    }

    const { estimates, total } = await estimateService.getEstimates(
      supabase,
      accountId,
      validatedQuery.data,
    );

    return NextResponse.json({
      success: true,
      estimates,
      total,
      limit: validatedQuery.data.limit,
      offset: validatedQuery.data.offset,
    });
  } catch (error) {
    logger.error('Error in GET /api/accounts/[accountId]/estimates', {}, error as Error);
    return handleGuardError(error);
  }
}

/**
 * POST /api/accounts/[accountId]/estimates
 * Create an estimate requiring an Idempotency-Key to prevent duplicate billing charges
 */
export async function POST(request: NextRequest, { params }: RouteContext) {
  try {
    const { accountId } = await params;

    if (!isValidUUID(accountId)) {
      return NextResponse.json({ error: 'Invalid account ID format' }, { status: 400 });
    }

    // Idempotency-Key validation: Mandatory for monetary and billing creations
    const idempotencyKey =
      request.headers.get('idempotency-key') || request.headers.get('x-idempotency-key');

    if (!idempotencyKey || typeof idempotencyKey !== 'string' || idempotencyKey.trim().length === 0) {
      return NextResponse.json(
        {
          error: 'Idempotency-Key header is required to prevent duplicate billing charges',
          code: 'IDEMPOTENCY_KEY_REQUIRED',
        },
        { status: 400 },
      );
    }

    // Require MANAGE_ESTIMATES permission within this specific tenant account
    const user = await requireAuthAndPermission(Permission.MANAGE_ESTIMATES, { accountId }, request);

    const supabase = createApiSupabaseClient(request);
    if (!supabase) {
      return NextResponse.json({ error: 'Database connection failed' }, { status: 500 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON request body' }, { status: 400 });
    }

    const validation = createEstimateSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: validation.error.format() },
        { status: 400 },
      );
    }

    // Security: Tenant isolation. We strictly bind the server-verified accountId,
    // explicitly ignoring any account ID in the client payload.
    const result = await estimateService.createEstimate(supabase, {
      accountId,
      userId: user.id,
      idempotencyKey: idempotencyKey.trim(),
      payload: validation.data,
    });

    if (result.isReplay) {
      return NextResponse.json(
        {
          success: true,
          estimate: result.estimate,
          idempotentReplayed: true,
        },
        {
          status: 200,
          headers: {
            'Idempotent-Replayed': 'true',
          },
        },
      );
    }

    return NextResponse.json(
      {
        success: true,
        estimate: result.estimate,
      },
      { status: 201 },
    );
  } catch (error) {
    logger.error('Error in POST /api/accounts/[accountId]/estimates', {}, error as Error);
    return handleGuardError(error);
  }
}
