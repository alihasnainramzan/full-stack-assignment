import { NextRequest, NextResponse } from 'next/server';
import { createApiSupabaseClient } from '@/lib/supabase-server';
import { requireAuthAndPermission, handleGuardError } from '@/lib/server-guards';
import { Permission } from '@/lib/permissions';
import { updateEstimateSchema } from '@/lib/validation-schemas';
import { estimateService } from '@/lib/estimate-service';
import { logger } from '@/lib/debug-logger';
import { isValidUUID } from '@/lib/validation-helpers';

interface RouteContext {
  params: Promise<{
    accountId: string;
    estimateId: string;
  }>;
}

/**
 * GET /api/accounts/[accountId]/estimates/[estimateId]
 * Get-by-id endpoint strictly isolated to tenant account boundary
 */
export async function GET(request: NextRequest, { params }: RouteContext) {
  try {
    const { accountId, estimateId } = await params;

    if (!isValidUUID(accountId) || !isValidUUID(estimateId)) {
      return NextResponse.json({ error: 'Invalid ID format' }, { status: 400 });
    }

    await requireAuthAndPermission(Permission.VIEW_ESTIMATES, { accountId }, request);

    const supabase = createApiSupabaseClient(request);
    if (!supabase) {
      return NextResponse.json({ error: 'Database connection failed' }, { status: 500 });
    }

    const estimate = await estimateService.getEstimateById(supabase, accountId, estimateId);
    if (!estimate) {
      return NextResponse.json({ error: 'Estimate not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, estimate });
  } catch (error) {
    logger.error('Error in GET /api/accounts/[accountId]/estimates/[estimateId]', {}, error as Error);
    return handleGuardError(error);
  }
}

/**
 * PATCH /api/accounts/[accountId]/estimates/[estimateId]
 * Update estimate details, line items, and lifecycle states (draft -> sent -> accepted | rejected)
 */
export async function PATCH(request: NextRequest, { params }: RouteContext) {
  try {
    const { accountId, estimateId } = await params;

    if (!isValidUUID(accountId) || !isValidUUID(estimateId)) {
      return NextResponse.json({ error: 'Invalid ID format' }, { status: 400 });
    }

    await requireAuthAndPermission(Permission.MANAGE_ESTIMATES, { accountId }, request);

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

    const validation = updateEstimateSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: validation.error.format() },
        { status: 400 },
      );
    }

    const updated = await estimateService.updateEstimate(supabase, {
      accountId,
      estimateId,
      payload: validation.data,
    });

    return NextResponse.json({ success: true, estimate: updated });
  } catch (error) {
    logger.error('Error in PATCH /api/accounts/[accountId]/estimates/[estimateId]', {}, error as Error);
    return handleGuardError(error);
  }
}

/**
 * DELETE /api/accounts/[accountId]/estimates/[estimateId]
 * Soft-delete estimate and child line items (no hard deletes)
 */
export async function DELETE(request: NextRequest, { params }: RouteContext) {
  try {
    const { accountId, estimateId } = await params;

    if (!isValidUUID(accountId) || !isValidUUID(estimateId)) {
      return NextResponse.json({ error: 'Invalid ID format' }, { status: 400 });
    }

    await requireAuthAndPermission(Permission.MANAGE_ESTIMATES, { accountId }, request);

    const supabase = createApiSupabaseClient(request);
    if (!supabase) {
      return NextResponse.json({ error: 'Database connection failed' }, { status: 500 });
    }

    await estimateService.softDeleteEstimate(supabase, accountId, estimateId);

    return NextResponse.json({
      success: true,
      message: 'Estimate successfully soft deleted',
    });
  } catch (error) {
    logger.error('Error in DELETE /api/accounts/[accountId]/estimates/[estimateId]', {}, error as Error);
    return handleGuardError(error);
  }
}
