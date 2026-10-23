import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { getCurrentUserProfileServer } from '@/lib/auth-server';
import { accountService } from '@/lib/account-service';
import { estimateService } from '@/lib/estimate-service';
import { hasPermission } from '@/lib/rbac';
import { Permission } from '@/lib/permissions';
import { createServerSupabase } from '@/lib/supabase-server';
import { EstimateListView } from '@/components/estimates/estimate-list-view';
import { isValidUUID } from '@/lib/validation-helpers';

interface EstimatesPageProps {
  params: Promise<{
    accountId: string;
  }>;
}

export async function generateMetadata({ params }: EstimatesPageProps): Promise<Metadata> {
  const { accountId } = await params;
  const supabase = await createServerSupabase();
  if (!supabase || !isValidUUID(accountId)) return { title: 'Estimates | Kontrora' };

  const { data: account } = await supabase
    .from('accounts')
    .select('name')
    .eq('id', accountId)
    .single();

  return {
    title: account?.name ? `Estimates — ${account.name}` : 'Estimates',
  };
}

export const dynamic = 'force-dynamic';

export default async function EstimatesPage({ params }: EstimatesPageProps) {
  const { accountId } = await params;

  if (!isValidUUID(accountId)) {
    notFound();
  }

  // 1. Authenticate user
  const userProfile = await getCurrentUserProfileServer();
  if (!userProfile) {
    return (
      <div className="container mx-auto p-6">
        <div className="text-center">
          <h1 className="text-foreground text-2xl font-bold">Access Denied</h1>
          <p className="text-muted-foreground mt-2">Please log in to view account estimates.</p>
        </div>
      </div>
    );
  }

  // 2. Supabase server client
  const supabase = await createServerSupabase();
  if (!supabase) {
    return (
      <div className="container mx-auto p-6">
        <div className="text-center">
          <h1 className="text-foreground text-2xl font-bold">Database Error</h1>
          <p className="text-muted-foreground mt-2">Unable to connect to database.</p>
        </div>
      </div>
    );
  }

  // 3. Permission checks (hybrid RBAC)
  const [canViewAll, canViewAccount, hasAccountAccess] = await Promise.all([
    hasPermission(userProfile, Permission.VIEW_ALL_ESTIMATES),
    hasPermission(userProfile, Permission.VIEW_ESTIMATES, { accountId }),
    accountService.canUserAccessAccount((userProfile as any).id, accountId, supabase),
  ]);

  const hasAccess = canViewAll || canViewAccount || hasAccountAccess;
  if (!hasAccess) {
    return (
      <div className="container mx-auto p-6">
        <div className="text-center">
          <h1 className="text-foreground text-2xl font-bold">Access Denied</h1>
          <p className="text-muted-foreground mt-2">
            You do not have permission to view financial estimates for this account.
          </p>
        </div>
      </div>
    );
  }

  // 4. Fetch account data & projects
  const { data: account, error: accountError } = await supabase
    .from('accounts')
    .select('id, name')
    .eq('id', accountId)
    .single();

  if (accountError || !account) {
    notFound();
  }

  const { data: projects } = await supabase
    .from('projects')
    .select('id, name')
    .eq('account_id', accountId)
    .order('name');

  // 5. Fetch initial estimates list
  const { estimates } = await estimateService.getEstimates(supabase, accountId);

  // 6. Check manage permissions
  const canManage =
    userProfile.is_superadmin ||
    (await hasPermission(userProfile, Permission.MANAGE_ESTIMATES, { accountId }));

  return (
    <div className="container mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
      {/* Navigation Breadcrumb */}
      <div>
        <Link
          href={`/accounts/${accountId}`}
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          <span>Back to {account.name}</span>
        </Link>
      </div>

      {/* Main Estimates List & Editor View */}
      <EstimateListView
        accountId={accountId}
        accountName={account.name}
        initialEstimates={estimates}
        projects={projects || []}
        canManage={canManage}
      />
    </div>
  );
}
