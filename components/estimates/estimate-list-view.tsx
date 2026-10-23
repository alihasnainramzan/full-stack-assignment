'use client';

import * as React from 'react';
import { useState, useMemo } from 'react';
import { format } from 'date-fns';
import {
  FileText,
  Search,
  Plus,
  DollarSign,
  TrendingUp,
  Clock,
  CheckCircle2,
  AlertCircle,
  Filter,
  Eye,
  Trash2,
  FolderOpen,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Estimate, formatCentsToCurrency, EstimateStatus } from '@/lib/estimate-service';
import { EstimateCreateDrawer } from './estimate-create-drawer';
import { EstimateDetailsDialog } from './estimate-details-dialog';

interface EstimateListViewProps {
  accountId: string;
  accountName: string;
  initialEstimates: Estimate[];
  projects?: Array<{ id: string; name: string }>;
  canManage?: boolean;
}

export function EstimateListView({
  accountId,
  accountName,
  initialEstimates,
  projects = [],
  canManage = true,
}: EstimateListViewProps) {
  const [estimates, setEstimates] = useState<Estimate[]>(initialEstimates);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [projectFilter, setProjectFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedEstimate, setSelectedEstimate] = useState<Estimate | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);

  // Financial summary metrics
  const metrics = useMemo(() => {
    let totalCents = 0;
    let acceptedCents = 0;
    let pendingCents = 0;
    let draftsCount = 0;

    for (const est of estimates) {
      totalCents += est.total_cents;
      if (est.status === 'accepted') {
        acceptedCents += est.total_cents;
      } else if (est.status === 'sent') {
        pendingCents += est.total_cents;
      } else if (est.status === 'draft') {
        draftsCount += 1;
      }
    }

    return {
      totalCents,
      acceptedCents,
      pendingCents,
      draftsCount,
    };
  }, [estimates]);

  // Client-side filtering
  const filteredEstimates = useMemo(() => {
    return estimates.filter((est) => {
      if (statusFilter !== 'all' && est.status !== statusFilter) {
        return false;
      }
      if (projectFilter !== 'all' && est.project_id !== projectFilter) {
        return false;
      }
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const matchesTitle = est.title.toLowerCase().includes(query);
        const matchesNumber = est.estimate_number.toLowerCase().includes(query);
        const matchesProject = est.projects?.name?.toLowerCase().includes(query);
        if (!matchesTitle && !matchesNumber && !matchesProject) {
          return false;
        }
      }
      return true;
    });
  }, [estimates, statusFilter, projectFilter, searchQuery]);

  const handleEstimateCreated = (newEstimate: Estimate) => {
    setEstimates((prev) => [newEstimate, ...prev]);
  };

  const handleEstimateUpdated = (updated: Estimate) => {
    setEstimates((prev) => prev.map((e) => (e.id === updated.id ? updated : e)));
    setSelectedEstimate(updated);
  };

  const handleEstimateDeleted = (deletedId: string) => {
    setEstimates((prev) => prev.filter((e) => e.id !== deletedId));
  };

  const getStatusBadge = (status: EstimateStatus) => {
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
    <div className="space-y-6">
      {/* Top Banner / Actions */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-foreground text-2xl font-bold tracking-tight">
            Revenue & Billing (Estimates)
          </h2>
          <p className="text-muted-foreground text-sm">
            Manage quotes, deliverables, and billing lifecycle for {accountName}.
          </p>
        </div>

        {canManage && (
          <EstimateCreateDrawer
            accountId={accountId}
            projects={projects}
            onEstimateCreated={handleEstimateCreated}
          />
        )}
      </div>

      {/* KPI Financial Metric Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="border-border bg-[var(--surface-2)]">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-muted-foreground text-xs font-medium uppercase tracking-wider">
              Total Invoiced Pipeline
            </CardTitle>
            <DollarSign className="text-primary h-4 w-4" />
          </CardHeader>
          <CardContent>
            <div className="text-foreground text-2xl font-bold font-mono">
              {formatCentsToCurrency(metrics.totalCents)}
            </div>
            <p className="text-muted-foreground mt-1 text-xs">
              Across all {estimates.length} active estimates
            </p>
          </CardContent>
        </Card>

        <Card className="border-border bg-[var(--surface-2)]">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-muted-foreground text-xs font-medium uppercase tracking-wider">
              Accepted Revenue
            </CardTitle>
            <CheckCircle2 className="text-emerald-400 h-4 w-4" />
          </CardHeader>
          <CardContent>
            <div className="text-emerald-400 text-2xl font-bold font-mono">
              {formatCentsToCurrency(metrics.acceptedCents)}
            </div>
            <p className="text-muted-foreground mt-1 text-xs">
              Won & approved by client
            </p>
          </CardContent>
        </Card>

        <Card className="border-border bg-[var(--surface-2)]">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-muted-foreground text-xs font-medium uppercase tracking-wider">
              Sent & Pending
            </CardTitle>
            <Clock className="text-[#007EE5] h-4 w-4" />
          </CardHeader>
          <CardContent>
            <div className="text-[#007EE5] text-2xl font-bold font-mono">
              {formatCentsToCurrency(metrics.pendingCents)}
            </div>
            <p className="text-muted-foreground mt-1 text-xs">
              Awaiting client approval
            </p>
          </CardContent>
        </Card>

        <Card className="border-border bg-[var(--surface-2)]">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-muted-foreground text-xs font-medium uppercase tracking-wider">
              Active Drafts
            </CardTitle>
            <FileText className="text-amber-400 h-4 w-4" />
          </CardHeader>
          <CardContent>
            <div className="text-foreground text-2xl font-bold font-mono">
              {metrics.draftsCount}
            </div>
            <p className="text-muted-foreground mt-1 text-xs">
              Under internal preparation
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Filter and Search Bar */}
      <Card className="border-border bg-[var(--surface-2)]">
        <CardContent className="p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative flex-1">
              <Search className="text-muted-foreground absolute top-1/2 left-3 -translate-y-1/2 h-4 w-4" />
              <Input
                placeholder="Search estimates by number, title, or project..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 text-xs"
              />
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <div className="w-36">
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Statuses</SelectItem>
                    <SelectItem value="draft">Drafts</SelectItem>
                    <SelectItem value="sent">Sent</SelectItem>
                    <SelectItem value="accepted">Accepted</SelectItem>
                    <SelectItem value="rejected">Rejected</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {projects.length > 0 && (
                <div className="w-44">
                  <Select value={projectFilter} onValueChange={setProjectFilter}>
                    <SelectTrigger className="h-9 text-xs">
                      <SelectValue placeholder="Project" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Projects</SelectItem>
                      {projects.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Estimates Table */}
      <div className="border-border overflow-hidden rounded-xl border bg-[var(--surface-2)] shadow-[var(--shadow-sm)]">
        <Table>
          <TableHeader>
            <TableRow className="border-border hover:bg-transparent">
              <TableHead className="w-28 text-xs">Estimate #</TableHead>
              <TableHead className="text-xs">Title & Description</TableHead>
              <TableHead className="w-36 text-xs">Project</TableHead>
              <TableHead className="w-28 text-center text-xs">Status</TableHead>
              <TableHead className="w-20 text-center text-xs">Items</TableHead>
              <TableHead className="w-36 text-right text-xs">Total Amount</TableHead>
              <TableHead className="w-28 text-center text-xs">Created</TableHead>
              <TableHead className="w-20 text-center text-xs">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredEstimates.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="py-12 text-center text-muted-foreground text-xs">
                  <div className="flex flex-col items-center justify-center gap-2">
                    <FileText className="h-8 w-8 text-muted-foreground/40" />
                    <p className="font-medium text-foreground">No estimates found</p>
                    <p className="text-xs">
                      {searchQuery || statusFilter !== 'all' || projectFilter !== 'all'
                        ? 'Try clearing filters to see more results.'
                        : 'Create your first revenue estimate to begin billing.'}
                    </p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              filteredEstimates.map((est) => (
                <TableRow
                  key={est.id}
                  onClick={() => {
                    setSelectedEstimate(est);
                    setDetailsOpen(true);
                  }}
                  className="cursor-pointer border-border hover:bg-white/[0.03] transition-colors"
                >
                  <TableCell className="font-mono text-xs font-semibold text-primary">
                    {est.estimate_number}
                  </TableCell>
                  <TableCell>
                    <div className="space-y-0.5">
                      <div className="text-xs font-medium text-foreground">{est.title}</div>
                      {est.description && (
                        <div className="text-muted-foreground text-xs line-clamp-1">
                          {est.description}
                        </div>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-xs">
                    {est.projects?.name ? (
                      <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                        <FolderOpen className="h-3 w-3" />
                        <span className="truncate max-w-[130px]">{est.projects.name}</span>
                      </span>
                    ) : (
                      <span className="text-muted-foreground/60 italic text-xs">Account Level</span>
                    )}
                  </TableCell>
                  <TableCell className="text-center">{getStatusBadge(est.status)}</TableCell>
                  <TableCell className="text-center font-mono text-xs text-muted-foreground">
                    {est.line_items?.length || 0}
                  </TableCell>
                  <TableCell className="text-right font-mono text-xs font-bold text-foreground">
                    {formatCentsToCurrency(est.total_cents, est.currency)}
                  </TableCell>
                  <TableCell className="text-center text-xs text-muted-foreground">
                    {format(new Date(est.created_at), 'MMM d, yyyy')}
                  </TableCell>
                  <TableCell className="text-center" onClick={(e) => e.stopPropagation()}>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => {
                        setSelectedEstimate(est);
                        setDetailsOpen(true);
                      }}
                      className="h-7 w-7 text-muted-foreground hover:text-foreground"
                    >
                      <Eye className="h-3.5 w-3.5" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Details & Lifecycle Dialog */}
      <EstimateDetailsDialog
        accountId={accountId}
        estimate={selectedEstimate}
        open={detailsOpen}
        onOpenChange={setDetailsOpen}
        onEstimateUpdated={handleEstimateUpdated}
        onEstimateDeleted={handleEstimateDeleted}
        canManage={canManage}
      />
    </div>
  );
}
