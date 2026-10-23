'use client';

import * as React from 'react';
import { useState } from 'react';
import { toast } from 'sonner';
import {
  FileText,
  Send,
  CheckCircle2,
  XCircle,
  Trash2,
  Clock,
  Calendar,
  Building,
  Loader2,
  AlertTriangle,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Estimate, formatCentsToCurrency } from '@/lib/estimate-service';
import { format } from 'date-fns';

interface EstimateDetailsDialogProps {
  accountId: string;
  estimate: Estimate | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEstimateUpdated: (updated: Estimate) => void;
  onEstimateDeleted: (estimateId: string) => void;
  canManage?: boolean;
}

export function EstimateDetailsDialog({
  accountId,
  estimate,
  open,
  onOpenChange,
  onEstimateUpdated,
  onEstimateDeleted,
  canManage = true,
}: EstimateDetailsDialogProps) {
  const [loading, setLoading] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showRejectPrompt, setShowRejectPrompt] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');

  if (!estimate) return null;

  const handleStatusTransition = async (newStatus: 'sent' | 'accepted' | 'rejected') => {
    setLoading(true);
    try {
      const response = await fetch(`/api/accounts/${accountId}/estimates/${estimate.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: newStatus,
          rejection_reason: newStatus === 'rejected' ? rejectionReason.trim() : undefined,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to update estimate status');
      }

      toast.success(`Estimate status updated to ${newStatus}`);
      onEstimateUpdated(data.estimate);
      setShowRejectPrompt(false);
    } catch (error) {
      toast.error((error as Error).message || 'Failed to update status');
    } finally {
      setLoading(false);
    }
  };

  const handleSoftDelete = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/accounts/${accountId}/estimates/${estimate.id}`, {
        method: 'DELETE',
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to soft delete estimate');
      }

      toast.success('Estimate soft deleted successfully');
      setShowDeleteConfirm(false);
      onOpenChange(false);
      onEstimateDeleted(estimate.id);
    } catch (error) {
      toast.error((error as Error).message || 'Failed to delete estimate');
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'draft':
        return <Badge variant="secondary">Draft</Badge>;
      case 'sent':
        return <Badge variant="default" className="bg-[#007EE5] text-white">Sent</Badge>;
      case 'accepted':
        return <Badge variant="success">Accepted</Badge>;
      case 'rejected':
        return <Badge variant="destructive">Rejected</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-primary" />
                <DialogTitle className="text-xl font-bold font-mono">
                  {estimate.estimate_number}
                </DialogTitle>
                {getStatusBadge(estimate.status)}
              </div>
              <div className="text-muted-foreground text-xs">
                Created: {format(new Date(estimate.created_at), 'MMM d, yyyy')}
              </div>
            </div>
            <DialogDescription className="text-foreground text-base font-semibold pt-1">
              {estimate.title}
            </DialogDescription>
          </DialogHeader>

          {/* Details Overview */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 border-border rounded-lg border bg-[var(--surface-1)]/50 p-4 text-xs">
            <div>
              <span className="text-muted-foreground block">Linked Project:</span>
              <span className="font-medium text-foreground">
                {estimate.projects?.name || 'Account Level (No Project)'}
              </span>
            </div>
            <div>
              <span className="text-muted-foreground block">Currency:</span>
              <span className="font-medium text-foreground font-mono">{estimate.currency}</span>
            </div>
            <div>
              <span className="text-muted-foreground block">Tax Rate:</span>
              <span className="font-medium text-foreground">
                {(estimate.tax_rate_basis_points / 100).toFixed(2)}%
              </span>
            </div>
            {estimate.sent_at && (
              <div>
                <span className="text-muted-foreground block">Sent Date:</span>
                <span className="font-medium text-foreground">
                  {format(new Date(estimate.sent_at), 'MMM d, yyyy HH:mm')}
                </span>
              </div>
            )}
            {estimate.accepted_at && (
              <div>
                <span className="text-muted-foreground block">Accepted Date:</span>
                <span className="font-medium text-emerald-400">
                  {format(new Date(estimate.accepted_at), 'MMM d, yyyy HH:mm')}
                </span>
              </div>
            )}
            {estimate.rejected_at && (
              <div className="sm:col-span-2">
                <span className="text-muted-foreground block">Rejection Reason:</span>
                <span className="font-medium text-destructive">
                  {estimate.rejection_reason || 'No reason provided'}
                </span>
              </div>
            )}
          </div>

          {estimate.description && (
            <div className="space-y-1">
              <span className="text-muted-foreground text-xs font-medium">Notes & Scope:</span>
              <p className="text-foreground text-xs leading-relaxed whitespace-pre-wrap bg-[var(--surface-2)] p-3 rounded-lg border border-border">
                {estimate.description}
              </p>
            </div>
          )}

          {/* Line Items Table */}
          <div className="space-y-2">
            <span className="text-muted-foreground text-xs font-medium">Line Items:</span>
            <div className="border-border overflow-hidden rounded-lg border bg-[var(--surface-2)]">
              <Table>
                <TableHeader>
                  <TableRow className="border-border">
                    <TableHead className="w-12 text-center text-xs">#</TableHead>
                    <TableHead className="text-xs">Description</TableHead>
                    <TableHead className="w-20 text-right text-xs">Qty</TableHead>
                    <TableHead className="w-28 text-right text-xs">Unit Price</TableHead>
                    <TableHead className="w-32 text-right text-xs">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {estimate.line_items?.map((item, index) => (
                    <TableRow key={item.id || index} className="border-border">
                      <TableCell className="text-muted-foreground text-center text-xs font-mono">
                        {index + 1}
                      </TableCell>
                      <TableCell className="text-xs text-foreground font-medium">
                        {item.description}
                      </TableCell>
                      <TableCell className="text-right text-xs font-mono">
                        {item.quantity}
                      </TableCell>
                      <TableCell className="text-right text-xs font-mono">
                        {formatCentsToCurrency(item.unit_price_cents, estimate.currency)}
                      </TableCell>
                      <TableCell className="text-right text-xs font-mono font-medium text-foreground">
                        {formatCentsToCurrency(item.total_cents, estimate.currency)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>

          {/* Totals Summary */}
          <div className="flex justify-end">
            <div className="border-border w-full max-w-xs space-y-2 rounded-lg border bg-[var(--surface-1)]/60 p-3 text-xs">
              <div className="flex justify-between text-muted-foreground">
                <span>Subtotal:</span>
                <span className="font-mono">{formatCentsToCurrency(estimate.subtotal_cents, estimate.currency)}</span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>Tax ({(estimate.tax_rate_basis_points / 100).toFixed(2)}%):</span>
                <span className="font-mono">{formatCentsToCurrency(estimate.tax_cents, estimate.currency)}</span>
              </div>
              <div className="border-border flex justify-between border-t pt-2 font-bold text-foreground text-sm">
                <span>Total:</span>
                <span className="text-primary font-mono">{formatCentsToCurrency(estimate.total_cents, estimate.currency)}</span>
              </div>
            </div>
          </div>

          {/* Lifecycle Action Buttons */}
          <DialogFooter className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-3 border-t border-border">
            {canManage && (
              <Button
                variant="destructive"
                size="sm"
                onClick={() => setShowDeleteConfirm(true)}
                disabled={loading}
                className="gap-1.5"
              >
                <Trash2 className="h-4 w-4" />
                <span>Soft Delete</span>
              </Button>
            )}

            <div className="flex flex-wrap items-center gap-2 justify-end">
              {canManage && estimate.status === 'draft' && (
                <Button
                  size="sm"
                  onClick={() => handleStatusTransition('sent')}
                  disabled={loading}
                  className="gap-1.5 bg-[#007EE5] hover:bg-[#0066CC] text-white"
                >
                  <Send className="h-4 w-4" />
                  <span>Send to Client</span>
                </Button>
              )}

              {canManage && (estimate.status === 'sent' || estimate.status === 'draft') && (
                <>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setShowRejectPrompt(true)}
                    disabled={loading}
                    className="gap-1.5 text-destructive hover:border-destructive"
                  >
                    <XCircle className="h-4 w-4" />
                    <span>Reject</span>
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => handleStatusTransition('accepted')}
                    disabled={loading}
                    className="gap-1.5 bg-[#4A5D3A] hover:bg-[#3A4D2A] text-white"
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    <span>Accept Estimate</span>
                  </Button>
                </>
              )}
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject Prompt Dialog */}
      <Dialog open={showRejectPrompt} onOpenChange={setShowRejectPrompt}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Reject Estimate</DialogTitle>
            <DialogDescription>
              Provide an optional reason why this estimate was rejected by the client or account team.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="reason" className="text-xs">Rejection Reason</Label>
            <Input
              id="reason"
              placeholder="e.g. Budget constraints, scope changes..."
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRejectPrompt(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => handleStatusTransition('rejected')}
              disabled={loading}
            >
              Confirm Rejection
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Alert */}
      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              Soft Delete Estimate?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete estimate {estimate.estimate_number}? The record will be soft deleted to preserve billing audit integrity and prevent data loss.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleSoftDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Confirm Soft Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
