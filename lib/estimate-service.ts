import { AppSupabaseClient } from './supabase';
import { logger } from './debug-logger';
import { CreateEstimateInput, UpdateEstimateInput, GetEstimatesQuery } from './validation-schemas';

export type EstimateStatus = 'draft' | 'sent' | 'accepted' | 'rejected';

export interface EstimateLineItem {
  id: string;
  estimate_id: string;
  account_id: string;
  position: number;
  description: string;
  quantity: number;
  unit_price_cents: number;
  total_cents: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface Estimate {
  id: string;
  account_id: string;
  project_id: string | null;
  estimate_number: string;
  title: string;
  description: string | null;
  status: EstimateStatus;
  currency: string;
  subtotal_cents: number;
  tax_rate_basis_points: number;
  tax_cents: number;
  total_cents: number;
  idempotency_key: string | null;
  sent_at: string | null;
  accepted_at: string | null;
  rejected_at: string | null;
  rejection_reason: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  line_items?: EstimateLineItem[];
  projects?: {
    id: string;
    name: string;
  } | null;
  creator?: {
    id: string;
    name: string;
    email: string;
    image: string | null;
  } | null;
}

/**
 * Format integer cents into a localized currency string.
 * Example: 15420 cents -> "$154.20"
 */
export function formatCentsToCurrency(cents: number, currency: string = 'USD'): string {
  const amount = (cents || 0) / 100;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency || 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

/**
 * Convert integer cents to decimal number (for form inputs)
 */
export function centsToDecimal(cents: number): number {
  return Number(((cents || 0) / 100).toFixed(2));
}

/**
 * Convert user input number or decimal string to integer cents
 */
export function decimalToCents(amount: number | string): number {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  if (isNaN(num) || num < 0) return 0;
  return Math.round(num * 100);
}

export const estimateService = {
  /**
   * Get estimates list for a specific account with server-side filters
   */
  async getEstimates(
    supabase: any,
    accountId: string,
    queryOptions?: GetEstimatesQuery,
  ): Promise<{ estimates: Estimate[]; total: number }> {
    try {
      const limit = queryOptions?.limit ?? 50;
      const offset = queryOptions?.offset ?? 0;

      let query = supabase
        .from('estimates')
        .select(
          `
          *,
          projects (
            id,
            name
          ),
          line_items:estimate_line_items (
            id,
            position,
            description,
            quantity,
            unit_price_cents,
            total_cents
          )
        `,
          { count: 'exact' },
        )
        .eq('account_id', accountId)
        .is('deleted_at', null)
        .order('created_at', { ascending: false });

      if (queryOptions?.status) {
        query = query.eq('status', queryOptions.status);
      }

      if (queryOptions?.project_id) {
        query = query.eq('project_id', queryOptions.project_id);
      }

      if (queryOptions?.search) {
        query = query.ilike('title', `%${queryOptions.search}%`);
      }

      query = query.range(offset, offset + limit - 1);

      const { data, count, error } = await query;

      if (error) {
        logger.error('Error fetching estimates in estimateService', { accountId }, error);
        throw error;
      }

      return {
        estimates: (data as Estimate[]) || [],
        total: count || 0,
      };
    } catch (error) {
      logger.error('Exception in estimateService.getEstimates', { accountId }, error as Error);
      throw error;
    }
  },

  /**
   * Fetch single estimate by ID, bound strictly to tenant account
   */
  async getEstimateById(
    supabase: any,
    accountId: string,
    estimateId: string,
  ): Promise<Estimate | null> {
    try {
      const { data, error } = await supabase
        .from('estimates')
        .select(
          `
          *,
          projects (
            id,
            name
          ),
          creator:user_profiles!created_by (
            id,
            name,
            email,
            image
          ),
          line_items:estimate_line_items (
            id,
            position,
            description,
            quantity,
            unit_price_cents,
            total_cents
          )
        `,
        )
        .eq('id', estimateId)
        .eq('account_id', accountId)
        .is('deleted_at', null)
        .single();

      if (error || !data) {
        return null;
      }

      // Sort line items by position
      if (data.line_items && Array.isArray(data.line_items)) {
        data.line_items.sort((a: EstimateLineItem, b: EstimateLineItem) => a.position - b.position);
      }

      return data as Estimate;
    } catch (error) {
      logger.error('Exception in estimateService.getEstimateById', { accountId, estimateId }, error as Error);
      throw error;
    }
  },

  /**
   * Create new estimate with atomic financial calculations and idempotency support
   */
  async createEstimate(
    supabase: any,
    params: {
      accountId: string;
      userId: string;
      idempotencyKey?: string | null;
      payload: CreateEstimateInput;
    },
  ): Promise<{ estimate: Estimate; isReplay: boolean }> {
    const { accountId, userId, idempotencyKey, payload } = params;

    // 1. Idempotency Check
    if (idempotencyKey) {
      const { data: existing } = await supabase
        .from('estimates')
        .select(
          `
          *,
          projects (id, name),
          line_items:estimate_line_items (*)
        `,
        )
        .eq('account_id', accountId)
        .eq('idempotency_key', idempotencyKey)
        .is('deleted_at', null)
        .maybeSingle();

      if (existing) {
        return { estimate: existing as Estimate, isReplay: true };
      }
    }

    // 2. Compute financial totals in minor units (cents)
    const calculatedLineItems = payload.line_items.map((item, index) => {
      const qty = Number(item.quantity);
      const unitPriceCents = Math.round(Number(item.unit_price_cents));
      const totalCents = Math.round(qty * unitPriceCents);
      return {
        position: index,
        description: item.description.trim(),
        quantity: qty,
        unit_price_cents: unitPriceCents,
        total_cents: totalCents,
      };
    });

    const subtotalCents = calculatedLineItems.reduce((acc, item) => acc + item.total_cents, 0);
    const taxRateBasisPoints = payload.tax_rate_basis_points ?? 0;
    const taxCents = Math.round((subtotalCents * taxRateBasisPoints) / 10000);
    const totalCents = subtotalCents + taxCents;

    // 3. Auto-generate estimate sequence number if omitted
    let estimateNumber = payload.estimate_number?.trim();
    if (!estimateNumber) {
      const { count } = await supabase
        .from('estimates')
        .select('id', { count: 'exact', head: true })
        .eq('account_id', accountId);
      const seq = (count || 0) + 1;
      estimateNumber = `EST-${seq.toString().padStart(4, '0')}`;
    }

    // 4. Insert parent estimate record
    const { data: createdEstimate, error: estimateError } = await supabase
      .from('estimates')
      .insert({
        account_id: accountId, // Securely injected from route context
        project_id: payload.project_id || null,
        estimate_number: estimateNumber,
        title: payload.title.trim(),
        description: payload.description?.trim() || null,
        status: payload.status || 'draft',
        currency: payload.currency.toUpperCase(),
        subtotal_cents: subtotalCents,
        tax_rate_basis_points: taxRateBasisPoints,
        tax_cents: taxCents,
        total_cents: totalCents,
        idempotency_key: idempotencyKey || null,
        created_by: userId,
        sent_at: payload.status === 'sent' ? new Date().toISOString() : null,
      })
      .select()
      .single();

    if (estimateError || !createdEstimate) {
      logger.error('Failed to insert estimate', { accountId }, estimateError);
      throw estimateError || new Error('Failed to create estimate');
    }

    // 5. Insert child line items with bound account_id
    const lineItemsToInsert = calculatedLineItems.map((li) => ({
      estimate_id: createdEstimate.id,
      account_id: accountId,
      position: li.position,
      description: li.description,
      quantity: li.quantity,
      unit_price_cents: li.unit_price_cents,
      total_cents: li.total_cents,
    }));

    const { data: insertedLineItems, error: lineItemsError } = await supabase
      .from('estimate_line_items')
      .insert(lineItemsToInsert)
      .select();

    if (lineItemsError) {
      logger.error('Failed to insert estimate line items', { estimateId: createdEstimate.id }, lineItemsError);
      // Soft-delete the partial record to maintain consistency
      await supabase
        .from('estimates')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', createdEstimate.id);
      throw lineItemsError;
    }

    return {
      estimate: {
        ...createdEstimate,
        line_items: insertedLineItems,
      } as Estimate,
      isReplay: false,
    };
  },

  /**
   * Update estimate and/or transitions lifecycle state
   */
  async updateEstimate(
    supabase: any,
    params: {
      accountId: string;
      estimateId: string;
      payload: UpdateEstimateInput;
    },
  ): Promise<Estimate> {
    const { accountId, estimateId, payload } = params;

    // Fetch existing estimate to validate state transitions
    const existing = await this.getEstimateById(supabase, accountId, estimateId);
    if (!existing) {
      throw new Error('Estimate not found');
    }

    const updates: Record<string, any> = {};

    if (payload.title !== undefined) updates.title = payload.title.trim();
    if (payload.description !== undefined) updates.description = payload.description?.trim() || null;
    if (payload.project_id !== undefined) updates.project_id = payload.project_id || null;
    if (payload.currency !== undefined) updates.currency = payload.currency.toUpperCase();
    if (payload.rejection_reason !== undefined) updates.rejection_reason = payload.rejection_reason?.trim() || null;

    // Lifecycle transitions
    if (payload.status !== undefined && payload.status !== existing.status) {
      updates.status = payload.status;
      const now = new Date().toISOString();
      if (payload.status === 'sent') {
        updates.sent_at = now;
      } else if (payload.status === 'accepted') {
        updates.accepted_at = now;
      } else if (payload.status === 'rejected') {
        updates.rejected_at = now;
      }
    }

    // Line items update (if provided)
    if (payload.line_items && payload.line_items.length > 0) {
      const calculatedLineItems = payload.line_items.map((item, index) => {
        const qty = Number(item.quantity);
        const unitPriceCents = Math.round(Number(item.unit_price_cents));
        const totalCents = Math.round(qty * unitPriceCents);
        return {
          position: index,
          description: item.description.trim(),
          quantity: qty,
          unit_price_cents: unitPriceCents,
          total_cents: totalCents,
        };
      });

      const subtotalCents = calculatedLineItems.reduce((acc, item) => acc + item.total_cents, 0);
      const taxRateBasisPoints = payload.tax_rate_basis_points ?? existing.tax_rate_basis_points;
      const taxCents = Math.round((subtotalCents * taxRateBasisPoints) / 10000);
      const totalCents = subtotalCents + taxCents;

      updates.subtotal_cents = subtotalCents;
      updates.tax_rate_basis_points = taxRateBasisPoints;
      updates.tax_cents = taxCents;
      updates.total_cents = totalCents;

      // Soft-delete existing line items
      await supabase
        .from('estimate_line_items')
        .update({ deleted_at: new Date().toISOString() })
        .eq('estimate_id', estimateId);

      // Insert new line items
      const newItems = calculatedLineItems.map((li) => ({
        estimate_id: estimateId,
        account_id: accountId,
        position: li.position,
        description: li.description,
        quantity: li.quantity,
        unit_price_cents: li.unit_price_cents,
        total_cents: li.total_cents,
      }));

      await supabase.from('estimate_line_items').insert(newItems);
    } else if (payload.tax_rate_basis_points !== undefined && payload.tax_rate_basis_points !== existing.tax_rate_basis_points) {
      const taxRateBasisPoints = payload.tax_rate_basis_points;
      const taxCents = Math.round((existing.subtotal_cents * taxRateBasisPoints) / 10000);
      updates.tax_rate_basis_points = taxRateBasisPoints;
      updates.tax_cents = taxCents;
      updates.total_cents = existing.subtotal_cents + taxCents;
    }

    const { data: updated, error } = await supabase
      .from('estimates')
      .update(updates)
      .eq('id', estimateId)
      .eq('account_id', accountId)
      .select()
      .single();

    if (error || !updated) {
      logger.error('Failed to update estimate', { estimateId }, error);
      throw error || new Error('Failed to update estimate');
    }

    return (await this.getEstimateById(supabase, accountId, estimateId))!;
  },

  /**
   * Soft-delete estimate and associated line items (no hard deletes)
   */
  async softDeleteEstimate(
    supabase: any,
    accountId: string,
    estimateId: string,
  ): Promise<void> {
    const now = new Date().toISOString();

    const { error: estimateError } = await supabase
      .from('estimates')
      .update({ deleted_at: now })
      .eq('id', estimateId)
      .eq('account_id', accountId);

    if (estimateError) {
      logger.error('Failed to soft delete estimate', { estimateId }, estimateError);
      throw estimateError;
    }

    await supabase
      .from('estimate_line_items')
      .update({ deleted_at: now })
      .eq('estimate_id', estimateId)
      .eq('account_id', accountId);
  },
};
