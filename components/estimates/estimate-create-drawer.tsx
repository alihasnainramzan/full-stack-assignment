'use client';

import * as React from 'react';
import { useState } from 'react';
import { toast } from 'sonner';
import { PlusIcon, FileText, Loader2, DollarSign } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  EstimateLineItemEditor,
  EditableLineItem,
} from './estimate-line-item-editor';
import { decimalToCents, Estimate } from '@/lib/estimate-service';

interface ProjectOption {
  id: string;
  name: string;
}

interface EstimateCreateDrawerProps {
  accountId: string;
  projects?: ProjectOption[];
  onEstimateCreated?: (estimate: Estimate) => void;
  children?: React.ReactNode;
}

export function EstimateCreateDrawer({
  accountId,
  projects = [],
  onEstimateCreated,
  children,
}: EstimateCreateDrawerProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  // Form State
  const [title, setTitle] = useState('');
  const [estimateNumber, setEstimateNumber] = useState('');
  const [projectId, setProjectId] = useState<string>('none');
  const [description, setDescription] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [taxRatePercent, setTaxRatePercent] = useState<number>(0);
  const [lineItems, setLineItems] = useState<EditableLineItem[]>([
    {
      description: 'Phase 1: Implementation & Engineering Deliverables',
      quantity: 1,
      unitPriceDollars: 2500,
    },
  ]);

  const resetForm = () => {
    setTitle('');
    setEstimateNumber('');
    setProjectId('none');
    setDescription('');
    setCurrency('USD');
    setTaxRatePercent(0);
    setLineItems([
      {
        description: 'Phase 1: Implementation & Engineering Deliverables',
        quantity: 1,
        unitPriceDollars: 2500,
      },
    ]);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!title.trim()) {
      toast.error('Estimate title is required');
      return;
    }

    if (lineItems.length === 0) {
      toast.error('At least one line item is required');
      return;
    }

    const hasInvalidItem = lineItems.some(
      (item) => !item.description.trim() || Number(item.quantity) <= 0 || Number(item.unitPriceDollars) < 0,
    );
    if (hasInvalidItem) {
      toast.error('Please ensure all line items have a valid description, positive quantity, and non-negative price');
      return;
    }

    setLoading(true);

    try {
      // Generate client-side UUID idempotency key to prevent double charging on retry/slow network
      const idempotencyKey = crypto.randomUUID();

      const payload = {
        title: title.trim(),
        estimate_number: estimateNumber.trim() || undefined,
        project_id: projectId !== 'none' ? projectId : undefined,
        description: description.trim() || undefined,
        currency,
        tax_rate_basis_points: Math.round((taxRatePercent || 0) * 100),
        status: 'draft',
        line_items: lineItems.map((li) => ({
          description: li.description.trim(),
          quantity: parseFloat(String(li.quantity)) || 1,
          unit_price_cents: decimalToCents(li.unitPriceDollars),
        })),
      };

      const response = await fetch(`/api/accounts/${accountId}/estimates`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': idempotencyKey,
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create estimate');
      }

      if (data.idempotentReplayed) {
        toast.info('Retrieved previously created estimate (Idempotency match)');
      } else {
        toast.success(`Estimate ${data.estimate.estimate_number} created successfully`);
      }

      resetForm();
      setOpen(false);

      if (onEstimateCreated) {
        onEstimateCreated(data.estimate);
      }
    } catch (error) {
      toast.error((error as Error).message || 'Failed to create estimate');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {children || (
          <Button size="sm" className="gap-2">
            <PlusIcon className="h-4 w-4" />
            <span>New Estimate</span>
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <FileText className="h-5 w-5 text-primary" />
            Create Revenue Estimate
          </DialogTitle>
          <DialogDescription>
            Draft a new project or client account estimate. All monetary values are managed in minor units with strict multi-tenant isolation.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6 pt-2">
          {/* Header Metadata Grid */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="title" className="text-xs font-medium">
                Estimate Title <span className="text-destructive">*</span>
              </Label>
              <Input
                id="title"
                placeholder="e.g. Q4 Platform Engineering & Modernization"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                disabled={loading}
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="estimateNumber" className="text-xs font-medium">
                Estimate Number (Optional)
              </Label>
              <Input
                id="estimateNumber"
                placeholder="Auto-generated (e.g. EST-0001)"
                value={estimateNumber}
                onChange={(e) => setEstimateNumber(e.target.value)}
                disabled={loading}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="project" className="text-xs font-medium">
                Link to Project (Optional)
              </Label>
              <Select value={projectId} onValueChange={setProjectId} disabled={loading}>
                <SelectTrigger id="project">
                  <SelectValue placeholder="Select an associated project" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None (Account-level billing)</SelectItem>
                  {projects.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="description" className="text-xs font-medium">
                Notes / Scope Description (Optional)
              </Label>
              <Textarea
                id="description"
                placeholder="Include payment terms, milestone release dates, or client deliverables..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                disabled={loading}
              />
            </div>
          </div>

          {/* Dynamic Line Item Editor */}
          <EstimateLineItemEditor
            items={lineItems}
            onChange={setLineItems}
            taxRatePercent={taxRatePercent}
            onTaxRateChange={setTaxRatePercent}
            currency={currency}
            disabled={loading}
          />

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={loading} className="gap-2">
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              Save Draft Estimate
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
