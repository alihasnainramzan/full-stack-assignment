'use client';

import * as React from 'react';
import { Plus, Trash2, DollarSign, Calculator } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from '@/components/ui/table';
import { formatCentsToCurrency, decimalToCents } from '@/lib/estimate-service';

export interface EditableLineItem {
  id?: string;
  description: string;
  quantity: number | string;
  unitPriceDollars: number | string;
}

interface EstimateLineItemEditorProps {
  items: EditableLineItem[];
  onChange: (items: EditableLineItem[]) => void;
  taxRatePercent: number;
  onTaxRateChange: (rate: number) => void;
  currency?: string;
  disabled?: boolean;
}

export function EstimateLineItemEditor({
  items,
  onChange,
  taxRatePercent,
  onTaxRateChange,
  currency = 'USD',
  disabled = false,
}: EstimateLineItemEditorProps) {
  const handleItemChange = (index: number, field: keyof EditableLineItem, value: any) => {
    const updated = [...items];
    updated[index] = {
      ...updated[index],
      [field]: value,
    };
    onChange(updated);
  };

  const handleAddItem = () => {
    onChange([
      ...items,
      {
        description: '',
        quantity: 1,
        unitPriceDollars: 0,
      },
    ]);
  };

  const handleRemoveItem = (index: number) => {
    if (items.length <= 1) return;
    const updated = items.filter((_, idx) => idx !== index);
    onChange(updated);
  };

  // Dynamic calculations in minor units (cents)
  const lineItemTotals = React.useMemo(() => {
    return items.map((item) => {
      const qty = parseFloat(String(item.quantity)) || 0;
      const unitCents = decimalToCents(item.unitPriceDollars);
      return Math.round(qty * unitCents);
    });
  }, [items]);

  const subtotalCents = React.useMemo(() => {
    return lineItemTotals.reduce((sum, current) => sum + current, 0);
  }, [lineItemTotals]);

  const taxBasisPoints = Math.round((taxRatePercent || 0) * 100);
  const taxCents = Math.round((subtotalCents * taxBasisPoints) / 10000);
  const grandTotalCents = subtotalCents + taxCents;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <Label className="text-foreground text-sm font-medium">Line Items & Financials</Label>
          <p className="text-muted-foreground text-xs">
            Add billable deliverables. Amounts are calculated dynamically and stored in minor cents.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleAddItem}
          disabled={disabled}
          className="h-8 gap-1.5 text-xs"
        >
          <Plus className="h-3.5 w-3.5" />
          Add Line Item
        </Button>
      </div>

      <div className="border-border overflow-hidden rounded-lg border bg-[var(--surface-2)]">
        <Table>
          <TableHeader>
            <TableRow className="border-border hover:bg-transparent">
              <TableHead className="w-12 text-center text-xs">#</TableHead>
              <TableHead className="min-w-[200px] text-xs">Description</TableHead>
              <TableHead className="w-24 text-right text-xs">Qty</TableHead>
              <TableHead className="w-36 text-right text-xs">Unit Price ({currency})</TableHead>
              <TableHead className="w-36 text-right text-xs">Total Amount</TableHead>
              <TableHead className="w-12 text-center text-xs"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item, index) => {
              const rowTotalCents = lineItemTotals[index] || 0;
              return (
                <TableRow key={index} className="border-border hover:bg-white/[0.02]">
                  <TableCell className="text-muted-foreground text-center text-xs font-mono">
                    {index + 1}
                  </TableCell>
                  <TableCell>
                    <Input
                      placeholder="e.g. Discovery & Architecture Blueprint"
                      value={item.description}
                      onChange={(e) => handleItemChange(index, 'description', e.target.value)}
                      disabled={disabled}
                      className="h-8 text-xs"
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      min="0.01"
                      step="0.5"
                      value={item.quantity}
                      onChange={(e) => handleItemChange(index, 'quantity', e.target.value)}
                      disabled={disabled}
                      className="h-8 text-right text-xs"
                    />
                  </TableCell>
                  <TableCell>
                    <div className="relative">
                      <span className="text-muted-foreground absolute top-1/2 left-2 -translate-y-1/2 text-xs">
                        $
                      </span>
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        value={item.unitPriceDollars}
                        onChange={(e) => handleItemChange(index, 'unitPriceDollars', e.target.value)}
                        disabled={disabled}
                        className="h-8 pl-5 text-right text-xs"
                      />
                    </div>
                  </TableCell>
                  <TableCell className="text-foreground text-right text-xs font-medium font-mono">
                    {formatCentsToCurrency(rowTotalCents, currency)}
                  </TableCell>
                  <TableCell className="text-center">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => handleRemoveItem(index)}
                      disabled={disabled || items.length <= 1}
                      className="text-muted-foreground hover:text-destructive h-7 w-7"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* Financial Breakdown & Tax Rate Panel */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-center gap-3">
          <Label htmlFor="taxRate" className="text-muted-foreground text-xs whitespace-nowrap">
            Tax Rate (%)
          </Label>
          <div className="relative w-28">
            <Input
              id="taxRate"
              type="number"
              min="0"
              max="100"
              step="0.25"
              value={taxRatePercent}
              onChange={(e) => onTaxRateChange(parseFloat(e.target.value) || 0)}
              disabled={disabled}
              className="h-8 pr-6 text-right text-xs"
            />
            <span className="text-muted-foreground absolute top-1/2 right-2 -translate-y-1/2 text-xs">
              %
            </span>
          </div>
        </div>

        <div className="border-border w-full max-w-xs space-y-2 rounded-lg border bg-[var(--surface-1)]/50 p-3 text-xs">
          <div className="flex justify-between text-muted-foreground">
            <span>Subtotal:</span>
            <span className="font-mono">{formatCentsToCurrency(subtotalCents, currency)}</span>
          </div>
          <div className="flex justify-between text-muted-foreground">
            <span>Estimated Tax ({taxRatePercent}%):</span>
            <span className="font-mono">{formatCentsToCurrency(taxCents, currency)}</span>
          </div>
          <div className="border-border flex justify-between border-t pt-2 font-semibold text-foreground text-sm">
            <span>Grand Total:</span>
            <span className="text-primary font-mono font-bold">
              {formatCentsToCurrency(grandTotalCents, currency)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
