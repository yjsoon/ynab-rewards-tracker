'use client';

import Link from 'next/link';
import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { useBudgetConnection, useCreditCards, useSettings } from '@/hooks/useLocalStorage';
import { useAutoBackup } from '@/hooks/useAutoBackup';
import {
  createMnemonic,
  encryptJson,
  decryptJson,
  computeKeyId,
  fetchEncryptedSettings,
  uploadEncryptedSettings,
  deleteEncryptedSettings,
  isValidMnemonic,
  normaliseMnemonic,
  isAutoSyncEnabled,
} from '@/lib/cloud-sync';
import {
  fetchCurrentCloudRevision,
  resolveUploadExpectedRevision,
  shouldWarnAboutEmptyUpload as checkEmptyUpload,
  shouldWarnAboutOutdatedUpload as checkOutdatedUpload,
} from '@/lib/cloud-sync/decision-helpers';
import { clearCloudSyncConflict } from '@/lib/cloud-sync/conflict-state';
import { YnabClient } from '@/lib/ynab-client';
import { toIsoDateString } from '@/lib/date';
import type { CreditCard } from '@/lib/storage';
import { validateYnabToken } from '@/lib/validation';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { getErrorMessage, cn } from '@/lib/utils';
import {
  CheckCircle2,
  ChevronRight,
  CreditCard as CreditCardIcon,
  Trash2,
  Download,
  Upload,
  AlertCircle,
  RefreshCw,
  Wallet,
  DollarSign,
  CloudUpload,
  CloudDownload,
  Copy,
  CloudOff,
  KeyRound,
  Info,
  Check,
} from 'lucide-react';
import { DashboardQuickStats } from '@/components/dashboard/DashboardQuickStats';
import {
  createProviderMigrationSnapshot,
  validateProviderMigration,
} from '@ynab-counter/app-core/storage';

interface YnabBudget {
  id: string;
  name: string;
  last_modified_on: string;
}

interface YnabAccount {
  id: string;
  name: string;
  type: string;
  on_budget: boolean;
  closed: boolean;
  balance: number;
}

// Constants for account type labels
const ACCOUNT_TYPE_LABELS: Record<string, string> = {
  creditCard: 'Credit Card',
  checking: 'Checking',
  savings: 'Savings',
  cash: 'Cash',
  lineOfCredit: 'Line of Credit',
  otherAsset: 'Other Asset',
  otherLiability: 'Other Liability',
};

// Order for displaying account type groups, with most relevant first
const ACCOUNT_TYPE_ORDER = ['creditCard', 'checking', 'lineOfCredit', 'savings', 'cash', 'otherAsset', 'otherLiability'];

// Account types that should be expanded by default
const EXPANDED_BY_DEFAULT = new Set(['creditCard', 'checking']);

function buildTrackedCard(accountId: string, accountName: string): CreditCard {
  return {
    id: `ynab-${accountId}`,
    name: accountName,
    issuer: 'Unknown',
    type: 'cashback',
    featured: true,
    ynabAccountId: accountId,
    billingCycle: {
      type: 'calendar',
      dayOfMonth: 1,
    },
    earningRate: 1,
    earningBlockSize: null,
    minimumSpend: null,
    maximumSpend: null,
    subcategoriesEnabled: false,
    subcategories: [],
  };
}

interface TrackedAccountCardProps {
  account: YnabAccount;
  isTracked: boolean;
  linkedCard?: CreditCard;
  onToggle: () => void;
}

function TrackedAccountCard({ account, isTracked, linkedCard, onToggle }: TrackedAccountCardProps) {
  const accountTypeLabel = ACCOUNT_TYPE_LABELS[account.type] || account.type;
  const Icon = account.type === 'creditCard' ? CreditCardIcon :
               account.type === 'checking' ? Wallet :
               DollarSign;

  return (
    <div
      className={cn(
        'flex h-full flex-col justify-between rounded-xl border p-4 text-left transition-shadow',
        isTracked ? 'border-primary/60 bg-primary/5 shadow-sm' : 'hover:border-primary/40'
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <Icon className="h-5 w-5 text-muted-foreground" />
          <div>
            <div className="flex items-center gap-2">
              <span className="font-medium">{account.name}</span>
            </div>
            <div className="text-sm text-muted-foreground">{accountTypeLabel}</div>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1">
          <Switch
            id={`account-${account.id}`}
            checked={isTracked}
            onCheckedChange={onToggle}
            aria-label={isTracked ? `Stop tracking ${account.name}` : `Track ${account.name}`}
          />
          <span className="text-xs text-muted-foreground">Track</span>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
        <span>Balance</span>
        <span>${(account.balance / 1000).toFixed(2)}</span>
      </div>

      {isTracked && linkedCard ? (
        <Button
          variant="outline"
          size="sm"
          className="mt-4 w-full justify-center"
          asChild
        >
          <Link href={`/cards/${linkedCard.id}`} aria-label={`View ${linkedCard.name} details`}>
            View card details
          </Link>
        </Button>
      ) : (
        <p className="mt-4 text-xs text-muted-foreground">
          {isTracked
            ? 'Card initialised, sync pending. Give it a moment.'
            : 'Switch on tracking to create a linked rewards card.'}
        </p>
      )}
    </div>
  );
}

export default function SettingsPage() {
  const {
    pat,
    setPAT,
    provider,
    setBudgetProvider,
    migrateToHowMuch,
    selectedBudget,
    setSelectedBudget: persistSelectedBudget,
    trackedAccountIds,
    setTrackedAccountIds: persistTrackedAccountIds,
    isAccountTracked,
    isLoading: connectionLoading,
  } = useBudgetConnection();
  const { cards, saveCard, deleteCard, isLoading: cardsLoading } = useCreditCards();
  const {
    settings,
    updateSettings,
    completeCloudSyncSnapshot,
    exportSettings,
    importSettings,
    clearAll,
  } = useSettings();
  const { autoBackup } = useAutoBackup();
  
  const [tokenInput, setTokenInput] = useState('');
  const [testingConnection, setTestingConnection] = useState(false);
  const [connectionMessage, setConnectionMessage] = useState('');
  const [showClearDialog, setShowClearDialog] = useState(false);
  const [showClearTokenDialog, setShowClearTokenDialog] = useState(false);
  const hasRequestedBudgetsRef = useRef(false);
  const skipConnectionFetchForPatRef = useRef<string | null>(null);
  const accountsRequestIdRef = useRef(0);
  const budgetsRequestIdRef = useRef(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [cloudSyncPhrase, setCloudSyncPhrase] = useState('');
  const [generatedCloudPhrase, setGeneratedCloudPhrase] = useState<string | null>(null);
  const [cloudSyncMessage, setCloudSyncMessage] = useState('');
  const [cloudSyncError, setCloudSyncError] = useState('');
  const [cloudSyncAction, setCloudSyncAction] = useState<'idle' | 'generate' | 'upload' | 'download' | 'delete' | 'sync'>('idle');
  const [showGenerateDialog, setShowGenerateDialog] = useState(false);
  const [showEmptySyncWarningDialog, setShowEmptySyncWarningDialog] = useState(false);
  const [showOutdatedUploadDialog, setShowOutdatedUploadDialog] = useState(false);
  const [cloudTimestamp, setCloudTimestamp] = useState<string | null>(null);
  const hasInitializedPhraseRef = useRef(false);
  const orphanedMessageTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Orphaned cards state
  const [orphanedCardMessage, setOrphanedCardMessage] = useState('');
  const [showClearOrphanedDialog, setShowClearOrphanedDialog] = useState(false);
  const [clearingOrphanedCards, setClearingOrphanedCards] = useState(false);

  // Auto-sync upload state
  const [autoBackupError, setAutoBackupError] = useState('');

  // Budget and account selection state
  const [budgets, setBudgets] = useState<YnabBudget[]>([]);
  const [accounts, setAccounts] = useState<YnabAccount[]>([]);
  const [loadingBudgets, setLoadingBudgets] = useState(false);
  const [loadingAccounts, setLoadingAccounts] = useState(false);
  const [showBudgetSelector, setShowBudgetSelector] = useState(false);
  const [showProviderMigrationDialog, setShowProviderMigrationDialog] = useState(false);
  const [migrationApiKey, setMigrationApiKey] = useState('');
  const [migrationError, setMigrationError] = useState('');
  const [migratingProvider, setMigratingProvider] = useState(false);
  const providerName = provider === 'howmuch' ? 'HowMuch' : 'YNAB';

  // Valuation settings
  const [milesValuation, setMilesValuation] = useState<number>(
    typeof settings.milesValuation === 'number' ? settings.milesValuation : 0.01
  );
  const [currency, setCurrency] = useState<string>(
    typeof settings.currency === 'string' ? settings.currency : '$'
  );
  // Points removed; only miles valuation remains
  const [valuationMessage, setValuationMessage] = useState<string>("");

  const isCloudSyncBusy = cloudSyncAction !== 'idle';
  const cloudSyncLastSynced = settings.cloudSyncLastSyncedAt
    ? new Date(settings.cloudSyncLastSyncedAt).toLocaleString()
    : null;
  const hasConfirmedCloudBackup = Boolean(settings.cloudSyncKeyId);
  const isGeneratingCloudSync = cloudSyncAction === 'generate';
  const isUploadingCloudSync = cloudSyncAction === 'upload';
  const isDownloadingCloudSync = cloudSyncAction === 'download';
  const isDeletingCloudSync = cloudSyncAction === 'delete';
  const isCodeRemembered = settings.rememberCloudSyncCode && Boolean(settings.cloudSyncMnemonic);
  const autoSyncEnabled = isAutoSyncEnabled(settings);
  const canEnableAutoSync = isCodeRemembered;
  const storedMnemonic = settings.cloudSyncMnemonic || '';

  useEffect(() => {
    if (typeof settings.milesValuation === 'number') {
      setMilesValuation(settings.milesValuation);
    }
  }, [settings.milesValuation]);

  useEffect(() => {
    if (typeof settings.currency === 'string') {
      setCurrency(settings.currency);
    }
  }, [settings.currency]);

  // Initialize cloud sync phrase from stored mnemonic (Fix #8: cleaner dependency array)
  useEffect(() => {
    if (isCodeRemembered && storedMnemonic && !hasInitializedPhraseRef.current) {
      setCloudSyncPhrase(storedMnemonic);
      hasInitializedPhraseRef.current = true;
    }
  }, [isCodeRemembered, storedMnemonic]);

  // Cleanup orphaned message timeout on unmount
  useEffect(() => {
    return () => {
      if (orphanedMessageTimeoutRef.current) {
        clearTimeout(orphanedMessageTimeoutRef.current);
      }
    };
  }, []);

  const cardsByAccountId = useMemo(() => {
    const entries = cards
      .filter((card): card is CreditCard & { ynabAccountId: string } => Boolean(card.ynabAccountId))
      .map(card => [card.ynabAccountId, card] as const);
    return new Map(entries);
  }, [cards]);

  // Group accounts by type for collapsible sections
  const accountsByType = useMemo(() => {
    const groups: Record<string, YnabAccount[]> = {};
    accounts.forEach(acc => {
      if (!groups[acc.type]) groups[acc.type] = [];
      groups[acc.type].push(acc);
    });
    return groups;
  }, [accounts]);

  const accountTypesToRender = useMemo(() => {
    const ordered = ACCOUNT_TYPE_ORDER.filter(type => accountsByType[type]?.length > 0);
    const extraTypes = Object.keys(accountsByType)
      .filter(type => !ACCOUNT_TYPE_ORDER.includes(type) && accountsByType[type]?.length > 0)
      .sort((a, b) => a.localeCompare(b));
    return [...ordered, ...extraTypes];
  }, [accountsByType]);

  // Track which account type groups are expanded
  const [expandedAccountGroups, setExpandedAccountGroups] = useState<Set<string>>(
    () => new Set(EXPANDED_BY_DEFAULT)
  );

  const toggleAccountGroup = useCallback((type: string) => {
    setExpandedAccountGroups(prev => {
      const next = new Set(prev);
      if (next.has(type)) {
        next.delete(type);
      } else {
        next.add(type);
      }
      return next;
    });
  }, []);

  // Detect orphaned cards (cards with ynabAccountId that no longer exist in current YNAB connection)
  const orphanedCards = useMemo(() => {
    if (!pat) {
      // No PAT: all cards with ynabAccountId are orphaned (no YNAB connection)
      return cards.filter(card => !!card.ynabAccountId);
    }
    if (accounts.length === 0) {
      // Accounts not loaded yet - can't determine orphaned state
      return [];
    }
    const currentAccountIds = new Set(accounts.map(a => a.id));
    return cards.filter(
      card => card.ynabAccountId && !currentAccountIds.has(card.ynabAccountId)
    );
  }, [cards, accounts, pat]);

  // Fix #4: Detect timing issue where cards exist but accounts haven't loaded yet
  // Returns true when: PAT is connected AND cards with ynabAccountId exist AND accounts haven't loaded
  // yet because no budget is selected. This prompts the user to select a budget to verify card compatibility.
  const hasCardsWithoutAccountsLoaded = useMemo(() => {
    const hasYnabLinkedCards = cards.some(card => card.ynabAccountId);
    return pat && hasYnabLinkedCards && accounts.length === 0 && !selectedBudget.id;
  }, [cards, pat, accounts.length, selectedBudget.id]);

  const syncCardsWithAccounts = useCallback((ynabAccounts: YnabAccount[]) => {
    ynabAccounts.forEach((account) => {
      if (!trackedAccountIds.includes(account.id)) {
        return;
      }

      const existingCard = cardsByAccountId.get(account.id);
      if (!existingCard) {
        saveCard(buildTrackedCard(account.id, account.name));
      }
    });
  }, [trackedAccountIds, cardsByAccountId, saveCard]);

  const fetchAccounts = useCallback(async (budgetId: string, tokenOverride?: string) => {
    const token = tokenOverride ?? pat;
    if (!token) return;
    const requestId = ++accountsRequestIdRef.current;

    setLoadingAccounts(true);
    try {
      const client = new YnabClient(token, tokenOverride ? provider : undefined);
      const fetchedAccounts = await client.getAccounts<YnabAccount>(budgetId);
      if (requestId !== accountsRequestIdRef.current) return;
      const openAccounts = fetchedAccounts.filter((acc) => !acc.closed && acc.on_budget);
      setAccounts(openAccounts);
      syncCardsWithAccounts(openAccounts);
    } catch (error) {
      if (requestId !== accountsRequestIdRef.current) return;
      setConnectionMessage(`Failed to fetch accounts: ${getErrorMessage(error)}`);
    } finally {
      if (requestId === accountsRequestIdRef.current) setLoadingAccounts(false);
    }
  }, [pat, provider, syncCardsWithAccounts]);

  const handleBudgetSelect = useCallback((budgetId: string, budgetName: string, tokenOverride?: string) => {
    persistSelectedBudget(budgetId, budgetName);
    setShowBudgetSelector(false);
    fetchAccounts(budgetId, tokenOverride);
  }, [fetchAccounts, persistSelectedBudget]);

  const fetchBudgets = useCallback(async (tokenOverride?: string) => {
    const token = tokenOverride ?? pat;
    if (!token) return;
    const requestId = ++budgetsRequestIdRef.current;

    setLoadingBudgets(true);
    try {
      const client = new YnabClient(token, tokenOverride ? provider : undefined);
      const fetchedBudgets = await client.getBudgets();
      if (requestId !== budgetsRequestIdRef.current) return;
      setBudgets(fetchedBudgets);
      setConnectionMessage(''); // Clear "Fetching budgets..." message on success

      if (fetchedBudgets.length === 1) {
        handleBudgetSelect(fetchedBudgets[0].id, fetchedBudgets[0].name, token);
      }
    } catch (error) {
      if (requestId !== budgetsRequestIdRef.current) return;
      setConnectionMessage(`Failed to fetch budgets: ${getErrorMessage(error)}`);
    } finally {
      if (requestId === budgetsRequestIdRef.current) setLoadingBudgets(false);
    }
  }, [pat, provider, handleBudgetSelect]);

  useEffect(() => {
    if (!valuationMessage) return;
    const timeout = setTimeout(() => setValuationMessage(''), 2500);
    return () => clearTimeout(timeout);
  }, [valuationMessage]);

  useEffect(() => {
    if (!cloudSyncMessage && !cloudSyncError) {
      return;
    }
    const timeout = setTimeout(() => {
      setCloudSyncMessage('');
      setCloudSyncError('');
    }, 5000);
    return () => clearTimeout(timeout);
  }, [cloudSyncMessage, cloudSyncError]);

  useEffect(() => {
    if (!autoBackupError) return;
    const timeout = setTimeout(() => setAutoBackupError(''), 5000);
    return () => clearTimeout(timeout);
  }, [autoBackupError]);

  // Kick off initial account/budget fetch based on stored selection
  useEffect(() => {
    if (!pat) {
      hasRequestedBudgetsRef.current = false;
      skipConnectionFetchForPatRef.current = null;
      return;
    }

    if (skipConnectionFetchForPatRef.current === pat) {
      skipConnectionFetchForPatRef.current = null;
      return;
    }

    if (selectedBudget.id) {
      hasRequestedBudgetsRef.current = false;
      fetchAccounts(selectedBudget.id);
      return;
    }

    if (!hasRequestedBudgetsRef.current) {
      hasRequestedBudgetsRef.current = true;
      fetchBudgets();
    }
  }, [pat, selectedBudget.id, fetchAccounts, fetchBudgets]);


  async function handleSaveToken(e: React.FormEvent) {
    e.preventDefault();

    const nextToken = tokenInput.trim();
    const validation = provider === 'ynab' ? validateYnabToken(nextToken) : null;
    if (!nextToken || (validation && !validation.valid)) {
      setConnectionMessage(`❌ ${validation?.error || 'Access key is required'}`);
      return;
    }

    if (selectedBudget.id) {
      await handleReplaceToken(nextToken);
      return;
    }

    setPAT(nextToken);
    setConnectionMessage('Token saved! Fetching budgets...');
    setTokenInput('');

    fetchBudgets(nextToken);
  }

  async function handleReplaceToken(nextToken: string) {
    setLoadingBudgets(true);
    setConnectionMessage('Checking access to your selected budget...');

    try {
      const client = new YnabClient(nextToken, provider);
      const fetchedBudgets = await client.getBudgets();
      setBudgets(fetchedBudgets);
      hasRequestedBudgetsRef.current = true;
      skipConnectionFetchForPatRef.current = nextToken;

      const matchingBudget = fetchedBudgets.find((budget) => budget.id === selectedBudget.id);
      if (matchingBudget) {
        persistSelectedBudget(matchingBudget.id, matchingBudget.name);
        setPAT(nextToken);
        setTokenInput('');
        setConnectionMessage('Token saved! Refreshing selected budget...');
        fetchAccounts(matchingBudget.id, nextToken);
        return;
      }

      persistSelectedBudget('', '');
      persistTrackedAccountIds([]);
      setAccounts([]);
      setShowBudgetSelector(true);
      setPAT(nextToken);
      setTokenInput('');
      setConnectionMessage('Token saved. Select a budget available to this token.');
    } catch (error) {
      setConnectionMessage(`Failed to replace token: ${getErrorMessage(error)}`);
    } finally {
      setLoadingBudgets(false);
    }
  }

  async function handleMigrateToHowMuch() {
    const apiKey = migrationApiKey.trim();
    if (!apiKey) {
      setMigrationError('Enter your HowMuch API key.');
      return;
    }
    if (!selectedBudget.id) {
      setMigrationError('Select a YNAB budget before migrating.');
      return;
    }
    const sourceSnapshot = createProviderMigrationSnapshot({
      selectedBudgetId: selectedBudget.id,
      trackedAccountIds,
      linkedCardAccountIds: cards
        .map((card) => card.ynabAccountId)
        .filter((accountId): accountId is string => Boolean(accountId)),
    });

    setMigratingProvider(true);
    setMigrationError('');
    try {
      const client = new YnabClient(apiKey, 'howmuch');
      const targetBudgets = await client.getBudgets({ bypassCache: true });
      const matchingBudget = targetBudgets.find((budget) => budget.id === selectedBudget.id);
      if (!matchingBudget) {
        setMigrationError('HowMuch does not contain your selected YNAB budget yet. Sync it to HowMuch, then try again.');
        return;
      }

      const targetAccounts = await client.getAccounts<YnabAccount>(matchingBudget.id, { bypassCache: true });
      const validation = validateProviderMigration({
        ...sourceSnapshot,
        budgets: targetBudgets,
        accounts: targetAccounts,
      });

      if (!validation.ok) {
        const missingNames = validation.reason === 'accounts-not-found'
          ? validation.missingAccountIds.map((id) => cardsByAccountId.get(id)?.name ?? id)
          : [];
        setMigrationError(validation.reason === 'budget-not-found'
          ? 'HowMuch does not contain your selected YNAB budget yet.'
          : `HowMuch is missing ${missingNames.length === 1 ? 'this linked account' : 'these linked accounts'}: ${missingNames.join(', ')}.`);
        return;
      }

      migrateToHowMuch(apiKey, sourceSnapshot);
      setBudgets(targetBudgets);
      setAccounts(targetAccounts.filter((account) => !account.closed && account.on_budget));
      setShowBudgetSelector(false);
      setMigrationApiKey('');
      setShowProviderMigrationDialog(false);
      setConnectionMessage(`Moved to HowMuch. ${cards.length} reward card${cards.length === 1 ? '' : 's'} kept.`);
    } catch (error) {
      setMigrationError(`Could not verify HowMuch: ${getErrorMessage(error)}`);
    } finally {
      setMigratingProvider(false);
    }
  }

  function handleAccountToggle(accountId: string, accountName: string) {
    const currentlyTracked = isAccountTracked(accountId);
    const newTrackedIds = currentlyTracked
      ? trackedAccountIds.filter(id => id !== accountId)
      : [...trackedAccountIds, accountId];

    persistTrackedAccountIds(newTrackedIds);

    if (!currentlyTracked) {
      saveCard(buildTrackedCard(accountId, accountName));
    } else {
      const cardToDelete = cardsByAccountId.get(accountId);
      if (cardToDelete) {
        deleteCard(cardToDelete.id);
      }
    }
  }

  async function testConnection() {
    if (!pat) {
      setConnectionMessage('Please save a token first');
      return;
    }

    setTestingConnection(true);
    setConnectionMessage('');

    try {
      const client = new YnabClient(pat);
      const budgets = await client.getBudgets();
      setConnectionMessage(`✅ Connected! Found ${budgets.length} budget(s)`);
    } catch (error) {
      setConnectionMessage(`❌ Connection failed: ${getErrorMessage(error)}`);
    } finally {
      setTestingConnection(false);
    }
  }

  function handleExport() {
    const json = exportSettings();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ynab-rewards-settings-${toIsoDateString(new Date())}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        importSettings(event.target?.result as string);
        setConnectionMessage('✅ Settings imported successfully');
      } catch (error) {
        setConnectionMessage(`❌ Failed to import settings: ${getErrorMessage(error)}`);
      }
    };
    reader.readAsText(file);
  }

  async function handleSaveValuations(e: React.FormEvent) {
    e.preventDefault();
    const mv = isFinite(milesValuation) && milesValuation >= 0 ? milesValuation : 0.01;
    const curr = currency.trim() || '$';
    updateSettings({ milesValuation: mv, currency: curr });
    setValuationMessage('Saved valuations. Recommendations will use normalised values for comparison.');

    // Auto-sync upload after save
    try {
      await autoBackup();
    } catch (error) {
      setAutoBackupError('Cloud sync upload failed. Your changes are saved locally.');
    }
  }

  function handleClearAll() {
    clearAll();
    setPAT('');
    setBudgets([]);
    persistSelectedBudget('', '');
    setAccounts([]);
    persistTrackedAccountIds([]);
    setShowClearDialog(false);
  }

  function handleClearToken() {
    setPAT('');
    setBudgets([]);
    persistSelectedBudget('', '');
    setAccounts([]);
    persistTrackedAccountIds([]);
    setShowClearTokenDialog(false);
  }

  function parseExportedSettings(): unknown {
    try {
      return JSON.parse(exportSettings());
    } catch (error) {
      const baseMessage = 'Failed to prepare settings for cloud sync';
      const details = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`${baseMessage}: ${details}`);
    }
  }

  // Fix #3: Validate decrypted data structure before importing
  function validateImportedSettings(data: unknown): void {
    if (!data || typeof data !== 'object') {
      throw new Error('Invalid settings data: not an object');
    }

    const obj = data as Record<string, unknown>;

    // Check for expected top-level keys
    const requiredKeys = ['cards', 'rules', 'settings'];
    const missingKeys = requiredKeys.filter(key => !(key in obj));

    if (missingKeys.length > 0) {
      throw new Error(`Invalid settings data: missing required fields (${missingKeys.join(', ')})`);
    }

    // Validate that cards and rules are arrays
    if (!Array.isArray(obj.cards)) {
      throw new Error('Invalid settings data: cards must be an array');
    }
    if (!Array.isArray(obj.rules)) {
      throw new Error('Invalid settings data: rules must be an array');
    }
    if (!obj.settings || typeof obj.settings !== 'object') {
      throw new Error('Invalid settings data: settings must be an object');
    }
  }

  async function uploadWithPhrase(
    phrase: string,
    options: { generated?: boolean; confirmedCloudUpdatedAt?: string | null } = {},
  ) {
    const normalised = normaliseMnemonic(phrase);
    if (!isValidMnemonic(normalised)) {
      throw new Error('Invalid sync code. Check the words and try again.');
    }

    const payload = parseExportedSettings() as {
      settings?: {
        cloudSyncKeyId?: string;
        cloudSyncLastSyncedAt?: string;
        cloudSyncLocalChangedAt?: string;
      };
    };
    const keyId = await computeKeyId(normalised);
    const { ciphertext, iv } = await encryptJson(normalised, payload);
    const expectedUpdatedAt = resolveUploadExpectedRevision({
      localKeyId: payload.settings?.cloudSyncKeyId,
      localLastSyncedAt: payload.settings?.cloudSyncLastSyncedAt,
      phraseKeyId: keyId,
      confirmedCloudUpdatedAt: options.confirmedCloudUpdatedAt,
    });
    const { updatedAt } = await uploadEncryptedSettings({
      keyId,
      ciphertext,
      iv,
      expectedUpdatedAt,
    });

    // Update settings with new keyId, timestamp, and mnemonic (if remember is enabled)
    const settingsUpdate: {
      cloudSyncKeyId: string;
      cloudSyncLastSyncedAt: string;
      cloudSyncMnemonic?: string;
    } = {
      cloudSyncKeyId: keyId,
      cloudSyncLastSyncedAt: updatedAt,
    };

    // If remember is enabled, update the stored mnemonic to keep automatic sync working
    if (settings.rememberCloudSyncCode) {
      settingsUpdate.cloudSyncMnemonic = normalised;
    }

    completeCloudSyncSnapshot(payload.settings?.cloudSyncLocalChangedAt, settingsUpdate);
    clearCloudSyncConflict();
    setCloudSyncPhrase(normalised);
    setGeneratedCloudPhrase(options.generated ? normalised : null);
    setCloudSyncMessage('Settings uploaded to Cloudflare KV. Copy your sync code to keep it safe.');
  }

  function handleGenerateCloudSync() {
    // Check if user already has a sync code set up
    if (settings.cloudSyncKeyId) {
      setShowGenerateDialog(true);
      return;
    }

    // No existing code, proceed directly
    confirmGenerateNewCode();
  }

  async function confirmGenerateNewCode() {
    setShowGenerateDialog(false);
    setCloudSyncError('');
    setCloudSyncMessage('');
    const phrase = createMnemonic();
    setCloudSyncAction('generate');
    try {
      await uploadWithPhrase(phrase, { generated: true });
    } catch (error) {
      setGeneratedCloudPhrase(null);
      setCloudSyncError(getErrorMessage(error));
    } finally {
      setCloudSyncAction('idle');
    }
  }

  function resetCloudSyncStatus() {
    setCloudSyncError('');
    setCloudSyncMessage('');
  }

  async function handleCloudUpload() {
    if (!cloudSyncPhrase.trim()) {
      setCloudSyncError('Enter your sync code before uploading.');
      return;
    }

    // Check for empty upload attempt
    if (shouldWarnAboutEmptyUpload()) {
      setShowEmptySyncWarningDialog(true);
      return;
    }

    // Check if we're uploading outdated data over newer cloud data
    const isOutdated = await shouldWarnAboutOutdatedUpload(cloudSyncPhrase);
    if (isOutdated) {
      setShowOutdatedUploadDialog(true);
      return;
    }

    resetCloudSyncStatus();
    setCloudSyncAction('upload');
    try {
      await uploadWithPhrase(cloudSyncPhrase);
    } catch (error) {
      setCloudSyncError(getErrorMessage(error));
    } finally {
      setCloudSyncAction('idle');
    }
  }

  async function handleCloudDownload() {
    if (!cloudSyncPhrase.trim()) {
      setCloudSyncError('Enter your sync code before downloading.');
      return;
    }

    setCloudSyncError('');
    setCloudSyncMessage('');
    setCloudSyncAction('download');
    try {
      const normalised = normaliseMnemonic(cloudSyncPhrase);
      if (!isValidMnemonic(normalised)) {
        throw new Error('Invalid sync code.');
      }

      const keyId = await computeKeyId(normalised);
      const stored = await fetchEncryptedSettings(keyId);

      if (!stored) {
        throw new Error('No cloud backup found for this sync code.');
      }

      const decrypted = await decryptJson<unknown>(normalised, stored.ciphertext, stored.iv);

      // Fix #3: Validate before importing
      validateImportedSettings(decrypted);

      importSettings(JSON.stringify(decrypted, null, 2));
      updateSettings({
        cloudSyncKeyId: keyId,
        cloudSyncLastSyncedAt: stored.updatedAt,
        cloudSyncLocalChangedAt: undefined,
      });
      clearCloudSyncConflict();
      setCloudSyncPhrase(normalised);
      setGeneratedCloudPhrase(null);

      // Warn if no PAT is connected yet
      if (!pat) {
        setCloudSyncMessage('Settings downloaded. Note: You haven\'t connected a YNAB account yet. Downloaded cards may not work until you add your Personal Access Token above.');
      } else {
        setCloudSyncMessage('Settings downloaded and applied.');
      }
    } catch (error) {
      setCloudSyncError(getErrorMessage(error));
    } finally {
      setCloudSyncAction('idle');
    }
  }

  async function handleCloudDelete() {
    const trimmedInput = cloudSyncPhrase.trim();
    let keyId = settings.cloudSyncKeyId;

    if (!keyId && trimmedInput) {
      const normalised = normaliseMnemonic(trimmedInput);
      if (!isValidMnemonic(normalised)) {
        setCloudSyncError('Enter a valid sync code before deleting.');
        return;
      }
      keyId = await computeKeyId(normalised);
    }

    if (!keyId) {
      setCloudSyncError('Nothing to delete. Upload once before removing the backup.');
      return;
    }

    setCloudSyncError('');
    setCloudSyncMessage('');
    setCloudSyncAction('delete');
    try {
      await deleteEncryptedSettings(keyId);
      updateSettings({ cloudSyncKeyId: undefined, cloudSyncLastSyncedAt: undefined });
      clearCloudSyncConflict();
      setGeneratedCloudPhrase(null);
      setCloudSyncPhrase('');
      setCloudSyncMessage('Cloud backup deleted.');
    } catch (error) {
      setCloudSyncError(getErrorMessage(error));
    } finally {
      setCloudSyncAction('idle');
    }
  }

  async function handleCopyGeneratedPhrase() {
    if (!generatedCloudPhrase) {
      return;
    }

    try {
      await navigator.clipboard.writeText(generatedCloudPhrase);
      setCloudSyncMessage('Sync code copied to clipboard.');
    } catch (error) {
      setCloudSyncError(`Copy failed: ${getErrorMessage(error)}`);
    }
  }

  function handleRememberCodeToggle(checked: boolean) {
    if (checked && cloudSyncPhrase.trim()) {
      // User wants to remember the code
      const normalised = normaliseMnemonic(cloudSyncPhrase);
      if (!isValidMnemonic(normalised)) {
        setCloudSyncError('Cannot remember an invalid sync code. Check the words and try again.');
        return;
      }
      updateSettings({
        cloudSyncMnemonic: normalised,
        rememberCloudSyncCode: true,
      });
      setCloudSyncPhrase(normalised);
      setCloudSyncMessage('Sync code saved to this device.');
    } else {
      // User wants to stop remembering
      updateSettings({
        cloudSyncMnemonic: undefined,
        rememberCloudSyncCode: false,
        autoSyncEnabled: false,
      });
      setCloudSyncMessage('Sync code removed from this device. Auto sync has been turned off.');
    }
  }

  function handleAutoSyncToggle(checked: boolean) {
    if (checked && !canEnableAutoSync) {
      setCloudSyncError('Remember your sync code on this device before enabling auto sync.');
      return;
    }

    updateSettings({ autoSyncEnabled: checked });
    setCloudSyncMessage(
      checked
        ? 'Auto sync enabled. This device will reconcile cloud and local settings automatically.'
        : 'Auto sync disabled. Use Save/Restore manually when needed.'
    );
  }

  // Helper to check if uploading empty settings would overwrite cloud backup
  function shouldWarnAboutEmptyUpload(): boolean {
    try {
      const exportedSettings = parseExportedSettings() as {
        cards?: unknown[];
        rules?: unknown[];
      };

      const hasSyncKeyId = Boolean(settings.cloudSyncKeyId);
      const hasCodeButNoKeyId = Boolean((storedMnemonic || cloudSyncPhrase).trim()) && !settings.cloudSyncKeyId;

      return checkEmptyUpload({
        cards: exportedSettings?.cards || [],
        rules: exportedSettings?.rules || [],
        hasCloudKeyId: hasSyncKeyId,
        hasEnteredCode: hasCodeButNoKeyId,
      });
    } catch (error) {
      // If we can't parse settings, assume they're not empty to avoid blocking uploads
      return false;
    }
  }

  // Helper to check if uploading would overwrite newer cloud data
  async function shouldWarnAboutOutdatedUpload(phrase: string): Promise<boolean> {
    try {
      const normalised = normaliseMnemonic(phrase);
      if (!isValidMnemonic(normalised)) {
        return false;
      }

      const keyId = await computeKeyId(normalised);
      const stored = await fetchEncryptedSettings(keyId);

      if (!stored || !stored.updatedAt) {
        return false; // No cloud backup or no timestamp
      }

      // Store cloud timestamp for dialog display
      setCloudTimestamp(stored.updatedAt);

      // Use extracted helper for decision logic
      return checkOutdatedUpload({
        cloudUpdatedAt: stored.updatedAt,
        localLastSyncedAt: settings.cloudSyncLastSyncedAt,
        localKeyId: settings.cloudSyncKeyId,
        phraseKeyId: keyId,
      });
    } catch (error) {
      // If we can't check, don't block the upload
      return false;
    }
  }


  async function handleDownloadInsteadOfUpload() {
    setShowEmptySyncWarningDialog(false);
    await handleCloudDownload();
  }

  async function handleUploadAnywayDespiteEmpty() {
    setShowEmptySyncWarningDialog(false);
    resetCloudSyncStatus();
    setCloudSyncAction('upload');
    try {
      const normalised = normaliseMnemonic(cloudSyncPhrase);
      if (!isValidMnemonic(normalised)) {
        throw new Error('Invalid sync code. Check the words and try again.');
      }

      const keyId = await computeKeyId(normalised);
      const confirmedCloudUpdatedAt = await fetchCurrentCloudRevision(
        keyId,
        fetchEncryptedSettings,
      );
      await uploadWithPhrase(normalised, {
        confirmedCloudUpdatedAt,
      });
    } catch (error) {
      setCloudSyncError(getErrorMessage(error));
    } finally {
      setCloudSyncAction('idle');
    }
  }

  async function handleDownloadInsteadOfOutdated() {
    setShowOutdatedUploadDialog(false);
    await handleCloudDownload();
  }

  async function handleUploadAnywayDespiteOutdated() {
    setShowOutdatedUploadDialog(false);
    resetCloudSyncStatus();
    setCloudSyncAction('upload');
    try {
      await uploadWithPhrase(cloudSyncPhrase, {
        confirmedCloudUpdatedAt: cloudTimestamp ?? undefined,
      });
    } catch (error) {
      setCloudSyncError(getErrorMessage(error));
    } finally {
      setCloudSyncAction('idle');
    }
  }

  // Fix #7: Less aggressive - keep sync history (keyId, lastSyncedAt)
  function handleForgetCode() {
    updateSettings({
      cloudSyncMnemonic: undefined,
      rememberCloudSyncCode: false,
      autoSyncEnabled: false,
      // Keep cloudSyncKeyId and cloudSyncLastSyncedAt for history
    });
    setCloudSyncPhrase('');
    setGeneratedCloudPhrase(null);
    setCloudSyncMessage('Sync code removed from this device. Auto sync disabled. Cloud backup and sync history preserved.');
  }

  // Fix #1: Show confirmation before clearing
  function handleClearOrphanedCardsClick() {
    setShowClearOrphanedDialog(true);
  }

  // Fix #2, #6: Separate state, loading indicator
  function confirmClearOrphanedCards() {
    setShowClearOrphanedDialog(false);
    setClearingOrphanedCards(true);

    // Clear any existing timeout
    if (orphanedMessageTimeoutRef.current) {
      clearTimeout(orphanedMessageTimeoutRef.current);
      orphanedMessageTimeoutRef.current = null;
    }

    try {
      const count = orphanedCards.length;
      orphanedCards.forEach(card => {
        deleteCard(card.id);
      });
      setOrphanedCardMessage(`Removed ${count} orphaned card${count === 1 ? '' : 's'}.`);

      // Clear message after 5 seconds, storing timeout ref for cleanup
      orphanedMessageTimeoutRef.current = setTimeout(() => {
        setOrphanedCardMessage('');
        orphanedMessageTimeoutRef.current = null;
      }, 5000);
    } catch (error) {
      setOrphanedCardMessage(`Failed to clear orphaned cards: ${getErrorMessage(error)}`);
    } finally {
      setClearingOrphanedCards(false);
    }
  }

  if (connectionLoading || cardsLoading) {
    return <div className="p-5">Loading settings...</div>;
  }

  return (
    <div className="max-w-6xl mx-auto px-6 py-8">
      <div className="space-y-2 mb-6">
        <h1 className="text-3xl font-bold">Settings</h1>
      </div>

      <div className="space-y-6">
        <DashboardQuickStats
        selectedBudget={selectedBudget}
        trackedAccountCount={trackedAccountIds.length}
      />

      {/* Fix #4: Timing issue warning - cards exist but accounts not loaded */}
      {hasCardsWithoutAccountsLoaded && (
        <Alert>
          <Info className="h-4 w-4" aria-hidden="true" />
          <AlertDescription>
            You have cards configured but no budget selected. Select a budget below to verify your cards are still connected to valid YNAB accounts.
          </AlertDescription>
        </Alert>
      )}

      {/* Orphaned Cards Warning */}
      {orphanedCards.length > 0 && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" aria-hidden="true" />
          <AlertDescription className="flex items-center justify-between gap-4">
            <span>
              {orphanedCards.length} card{orphanedCards.length === 1 ? '' : 's'} reference{orphanedCards.length === 1 ? 's' : ''} YNAB account{orphanedCards.length === 1 ? '' : 's'} that {orphanedCards.length === 1 ? 'is' : 'are'} no longer connected.
              {orphanedCards.length === 1
                ? ` "${orphanedCards[0].name}" won't track rewards until reconnected.`
                : ' These cards won\'t track rewards until reconnected.'}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={handleClearOrphanedCardsClick}
              disabled={clearingOrphanedCards}
              className="flex-shrink-0"
            >
              {clearingOrphanedCards ? 'Clearing...' : 'Clear Orphaned Cards'}
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* Fix #2: Separate success message for orphaned cards */}
      {orphanedCardMessage && (
        <Alert>
          <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
          <AlertDescription>{orphanedCardMessage}</AlertDescription>
        </Alert>
      )}

      {/* Budget provider connection and Cloud Sync */}
      <Card id="settings-budget">
        <CardHeader>
          <CardTitle>Budget Connection & Backup</CardTitle>
          <CardDescription>
            Connect your budget provider first. Cloud Sync is optional if you want a backup or use Rewards Tracker on another device.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <section className="space-y-4" aria-labelledby="ynab-connection-heading">
            <div className="flex items-start gap-3">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
                1
              </div>
              <div>
                <h2 id="ynab-connection-heading" className="text-base font-semibold">Connect {providerName}</h2>
                <p className="text-sm text-muted-foreground">
                  {provider === 'ynab'
                    ? 'Add your Personal Access Token, then choose the budget and accounts that feed rewards tracking.'
                    : 'Add your HowMuch API key, then choose the budget and accounts that feed rewards tracking.'}
                </p>
              </div>
            </div>

            <div className="space-y-2 sm:pl-10">
              <label className="text-sm font-medium" htmlFor="budget-provider">Budget provider</label>
              <Select
                value={provider}
                onValueChange={(value: 'ynab' | 'howmuch') => {
                  if (value === provider) return;
                  if (provider === 'ynab' && value === 'howmuch' && pat && selectedBudget.id) {
                    setMigrationError('');
                    setShowProviderMigrationDialog(true);
                    return;
                  }
                  accountsRequestIdRef.current += 1;
                  budgetsRequestIdRef.current += 1;
                  hasRequestedBudgetsRef.current = false;
                  skipConnectionFetchForPatRef.current = null;
                  setBudgetProvider(value);
                  setBudgets([]);
                  setAccounts([]);
                  setLoadingBudgets(false);
                  setLoadingAccounts(false);
                  setShowBudgetSelector(true);
                  setConnectionMessage(value === 'howmuch'
                    ? 'HowMuch selected. Add your API key to connect.'
                    : 'YNAB selected. Add your Personal Access Token to connect.');
                }}
              >
                <SelectTrigger id="budget-provider" className="w-full sm:w-64">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ynab">YNAB</SelectItem>
                  <SelectItem value="howmuch">HowMuch</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {provider === 'ynab' && !pat ? (
              <form onSubmit={handleSaveToken} className="space-y-4 sm:pl-10">
                <label
                  htmlFor="pat-input"
                  className="block text-sm font-medium"
                >
                  Personal Access Token
                </label>
                <p className="text-sm text-muted-foreground">
                  Get your Personal Access Token from your{' '}
                  <a
                    href="https://app.ynab.com/settings/developer"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline"
                  >
                    YNAB Developer Settings
                  </a>
                </p>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <input
                    id="pat-input"
                    type="password"
                    autoComplete="off"
                    value={tokenInput}
                    onChange={(e) => setTokenInput(e.target.value)}
                    placeholder="Paste your YNAB Personal Access Token"
                    className="flex-1 px-3 py-2 border rounded-md text-base md:text-sm"
                  />
                  <Button type="submit">Save Token</Button>
                </div>
              </form>
            ) : provider === 'ynab' ? (
              <div className="space-y-4 sm:pl-10">
                <div className="flex items-center gap-2 text-green-600">
                  <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
                  <span className="font-medium">Token configured</span>
                </div>

                <form onSubmit={handleSaveToken} className="space-y-2 rounded-lg border bg-muted/20 p-3">
                  <label className="text-sm font-medium" htmlFor="replace-token-input">
                    Replace token
                  </label>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <input
                      id="replace-token-input"
                      type="password"
                      value={tokenInput}
                      onChange={(e) => setTokenInput(e.target.value)}
                      placeholder="Paste a new YNAB Personal Access Token"
                      className="flex-1 px-3 py-2 border rounded-md text-base md:text-sm"
                    />
                    <Button type="submit" disabled={!tokenInput.trim()}>
                      Replace Token
                    </Button>
                  </div>
                </form>

                {/* Budget Selection */}
                {selectedBudget.id && !showBudgetSelector ? (
                  <div className="space-y-2">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="text-sm font-medium">Selected budget</p>
                        <p className="text-lg">{selectedBudget.name}</p>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          fetchBudgets();
                          setShowBudgetSelector(true);
                        }}
                      >
                        Change Budget
                      </Button>
                    </div>
                  </div>
                ) : loadingBudgets ? (
                  <p className="text-sm">Loading budgets...</p>
                ) : (budgets.length > 0 || showBudgetSelector) ? (
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Select a budget:</label>
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <Select
                        value={selectedBudget.id || ''}
                        onValueChange={(value) => {
                          const budget = budgets.find(b => b.id === value);
                          if (budget) handleBudgetSelect(budget.id, budget.name);
                        }}
                      >
                        <SelectTrigger className="flex-1">
                          <SelectValue placeholder="Choose a budget..." />
                        </SelectTrigger>
                        <SelectContent>
                          {budgets.map(budget => (
                            <SelectItem key={budget.id} value={budget.id}>
                              {budget.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {selectedBudget.id && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setShowBudgetSelector(false)}
                        >
                          Cancel
                        </Button>
                      )}
                    </div>
                  </div>
                ) : (
                  <Button
                    variant="outline"
                    onClick={() => fetchBudgets()}
                  >
                    Load Budgets
                  </Button>
                )}

                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    onClick={testConnection}
                    disabled={testingConnection}
                  >
                    {testingConnection ? (
                      <>
                        <RefreshCw className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                        Testing...
                      </>
                    ) : (
                      'Test Connection'
                    )}
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={() => setShowClearTokenDialog(true)}
                  >
                    Clear Token
                  </Button>
                </div>
              </div>
            ) : !pat ? (
              <form onSubmit={handleSaveToken} className="space-y-3 sm:pl-10">
                <label htmlFor="howmuch-access-key" className="block text-sm font-medium">
                  HowMuch API key
                </label>
                <p className="text-sm text-muted-foreground">
                  This account-specific key stays on this device and is never included in exports or Cloud Sync.
                </p>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <input
                    id="howmuch-access-key"
                    type="password"
                    autoComplete="off"
                    value={tokenInput}
                    onChange={(event) => setTokenInput(event.target.value)}
                    placeholder="Paste your HowMuch API key"
                    className="flex-1 px-3 py-2 border rounded-md text-base md:text-sm"
                  />
                  <Button type="submit">Connect</Button>
                </div>
              </form>
            ) : (
              <div className="space-y-4 sm:pl-10">
                <div className="flex items-center gap-2 text-green-600">
                  <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
                  <span className="font-medium">API key configured</span>
                </div>
                {selectedBudget.id && !showBudgetSelector ? (
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-sm font-medium">Selected budget</p>
                      <p className="text-lg">{selectedBudget.name}</p>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => { fetchBudgets(); setShowBudgetSelector(true); }}>
                      Change Budget
                    </Button>
                  </div>
                ) : loadingBudgets ? (
                  <p className="text-sm">Loading budgets...</p>
                ) : budgets.length > 0 ? (
                  <Select
                    value={selectedBudget.id || ''}
                    onValueChange={(value) => {
                      const budget = budgets.find((entry) => entry.id === value);
                      if (budget) handleBudgetSelect(budget.id, budget.name);
                    }}
                  >
                    <SelectTrigger><SelectValue placeholder="Choose a budget..." /></SelectTrigger>
                    <SelectContent>
                      {budgets.map((budget) => <SelectItem key={budget.id} value={budget.id}>{budget.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                ) : (
                  <Button variant="outline" onClick={() => fetchBudgets()}>Load Budgets</Button>
                )}
                <Button variant="outline" onClick={() => setShowClearTokenDialog(true)}>Clear API Key</Button>
              </div>
            )}
          </section>
          {connectionMessage && (
            <Alert className="mt-4">
              <AlertCircle className="h-4 w-4" aria-hidden="true" />
              <AlertDescription>{connectionMessage}</AlertDescription>
            </Alert>
          )}

          <Separator />

          <section className="space-y-4" aria-labelledby="cloud-sync-heading">
            <div className="flex items-start gap-3">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
                2
              </div>
              <div>
                <h2 id="cloud-sync-heading" className="text-base font-semibold">Optional: Cloud Sync</h2>
                <p className="text-sm text-muted-foreground">
                  Skip this if you only use this browser. Enable it to encrypt your settings with a 12-word sync code for backup or another device. YNAB PATs and formatter keys are never synced.
                </p>
              </div>
            </div>

            <div className="space-y-4 sm:pl-10">
              {isCodeRemembered && (
                <div className="flex flex-col gap-3 rounded-lg border bg-muted/30 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                      <Check className="h-5 w-5 text-primary" aria-hidden="true" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">
                        {autoSyncEnabled ? 'Auto sync enabled' : 'Sync code remembered'}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {autoSyncEnabled
                          ? cloudSyncLastSynced
                            ? `Last sync: ${cloudSyncLastSynced}`
                            : 'Cloud and local settings will sync automatically'
                          : 'Auto sync is off. Use Save/Restore buttons when needed.'}
                      </p>
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={handleForgetCode}
                    disabled={isCloudSyncBusy}
                  >
                    <CloudOff className="mr-2 h-3 w-3" aria-hidden="true" />
                    Forget sync code
                  </Button>
                </div>
              )}

              {generatedCloudPhrase && (
                <div className="rounded-md border bg-muted/30 p-4">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <KeyRound className="h-4 w-4 text-primary" aria-hidden="true" />
                      <span className="text-sm font-medium">New sync code</span>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={handleCopyGeneratedPhrase}
                    >
                      <Copy className="mr-2 h-4 w-4" aria-hidden="true" />
                      Copy
                    </Button>
                  </div>
                  <p className="mt-3 whitespace-pre-wrap break-words font-mono text-sm">
                    {generatedCloudPhrase}
                  </p>
                </div>
              )}

              <div className="space-y-2">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-2">
                    <label className="text-sm font-medium" htmlFor="cloud-sync-phrase">
                      Sync code
                    </label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <button
                          type="button"
                          className="inline-flex items-center justify-center"
                          aria-label="Sync code information"
                        >
                          <Info className="h-4 w-4 text-muted-foreground hover:text-foreground transition-colors" />
                        </button>
                      </PopoverTrigger>
                      <PopoverContent className="w-80" align="start">
                        <p className="text-sm text-muted-foreground">
                          Keep this code private. Anyone with it can download and decrypt your settings. Your YNAB token is never synced.
                        </p>
                      </PopoverContent>
                    </Popover>
                  </div>
                  {cloudSyncPhrase.trim() && !generatedCloudPhrase && (
                    <div className="flex items-center gap-2">
                      <span id="remember-sync-code-label" className="text-xs text-muted-foreground">
                        Remember on this device
                      </span>
                      <Switch
                        id="remember-sync-code"
                        checked={Boolean(settings.rememberCloudSyncCode)}
                        onCheckedChange={handleRememberCodeToggle}
                        aria-labelledby="remember-sync-code-label"
                      />
                    </div>
                  )}
                </div>
                <textarea
                  id="cloud-sync-phrase"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-base md:text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  rows={2}
                  value={cloudSyncPhrase}
                  onChange={(event) => setCloudSyncPhrase(event.target.value)}
                  placeholder="twelve lowercase words separated by spaces"
                />
              </div>

              <div className="rounded-md border bg-muted/20 p-3">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium">Auto sync</p>
                    <p className="text-xs text-muted-foreground">
                      On load and when this tab becomes active, compare cloud vs local and keep the most recent version.
                    </p>
                  </div>
                  <Switch
                    id="auto-sync-enabled"
                    checked={autoSyncEnabled}
                    onCheckedChange={handleAutoSyncToggle}
                    disabled={!canEnableAutoSync}
                    aria-label="Enable automatic cloud sync"
                    title={
                      !canEnableAutoSync
                        ? 'Auto sync requires a remembered sync code on this device.'
                        : 'Enable automatic cloud sync'
                    }
                  />
                </div>
                {!canEnableAutoSync && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Remember your sync code on this device to enable auto sync.
                  </p>
                )}
              </div>

              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleGenerateCloudSync}
                  disabled={isCloudSyncBusy}
                >
                  <KeyRound className="mr-2 h-4 w-4" aria-hidden="true" />
                  {isGeneratingCloudSync ? 'Generating...' : 'Generate new code'}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleCloudUpload}
                  disabled={isCloudSyncBusy || !cloudSyncPhrase.trim()}
                >
                  <CloudUpload className="mr-2 h-4 w-4" aria-hidden="true" />
                  {isUploadingCloudSync ? 'Saving...' : 'Save local to cloud'}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleCloudDownload}
                  disabled={isCloudSyncBusy || !cloudSyncPhrase.trim()}
                >
                  <CloudDownload className="mr-2 h-4 w-4" aria-hidden="true" />
                  {isDownloadingCloudSync ? 'Restoring...' : 'Restore cloud to local'}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Save overwrites cloud with your local settings. Restore replaces local with the cloud backup.
              </p>

              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleCloudDelete}
                  disabled={isCloudSyncBusy}
                  className="w-fit text-destructive hover:bg-destructive hover:text-destructive-foreground"
                >
                  <CloudOff className="mr-2 h-3 w-3" aria-hidden="true" />
                  {isDeletingCloudSync ? 'Deleting...' : 'Delete cloud backup'}
                </Button>
                {cloudSyncLastSynced && (
                  <p className="text-xs text-muted-foreground">
                    Last synced: {cloudSyncLastSynced}
                  </p>
                )}
              </div>
            </div>

            {cloudSyncMessage && (
              <Alert>
                <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                <AlertDescription>{cloudSyncMessage}</AlertDescription>
              </Alert>
            )}

            {cloudSyncError && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" aria-hidden="true" />
                <AlertDescription>{cloudSyncError}</AlertDescription>
              </Alert>
            )}

            {autoBackupError && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" aria-hidden="true" />
                <AlertDescription>{autoBackupError}</AlertDescription>
              </Alert>
            )}
          </section>
        </CardContent>
      </Card>

      {/* Accounts for Rewards Tracking */}
      {selectedBudget.id && (
        <Card id="settings-accounts">
          <CardHeader>
            <CardTitle>Accounts for Rewards Tracking</CardTitle>
            <CardDescription>
              Select which accounts you want to track for rewards (including checking, savings, and credit cards)
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loadingAccounts ? (
              <p className="text-sm">Loading accounts...</p>
            ) : accounts.length > 0 ? (
              <div className="space-y-4">
                {accountTypesToRender.map(type => {
                  const typeAccounts = accountsByType[type];
                  const isExpanded = expandedAccountGroups.has(type);
                  const trackedCount = typeAccounts.filter(a => trackedAccountIds.includes(a.id)).length;

                  return (
                    <Collapsible key={type} open={isExpanded} onOpenChange={() => toggleAccountGroup(type)}>
                      <CollapsibleTrigger className="flex items-center gap-2 text-sm font-medium mb-2 hover:text-primary transition-colors">
                        <ChevronRight className={cn("h-4 w-4 transition-transform", isExpanded && "rotate-90")} />
                        <span>{ACCOUNT_TYPE_LABELS[type] || type}</span>
                        <span className="text-muted-foreground font-normal">
                          ({trackedCount > 0 ? `${trackedCount}/` : ''}{typeAccounts.length})
                        </span>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 mb-4">
                          {typeAccounts.map(account => {
                            const isTracked = trackedAccountIds.includes(account.id);
                            const linkedCard = cardsByAccountId.get(account.id);

                            return (
                              <TrackedAccountCard
                                key={account.id}
                                account={account}
                                isTracked={isTracked}
                                linkedCard={linkedCard}
                                onToggle={() => handleAccountToggle(account.id, account.name)}
                              />
                            );
                          })}
                        </div>
                      </CollapsibleContent>
                    </Collapsible>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No accounts found in this budget.</p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Rewards Cards Management */}
      <Card>
        <CardHeader>
          <CardTitle>Rewards Preferences</CardTitle>
          <CardDescription>
            Optimise valuations for your rewards. Use the tracked accounts grid above to dive straight into detailed card settings.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSaveValuations} className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="text-sm font-medium">Currency</label>
              <input
                type="text"
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className="w-full px-3 py-2 border rounded-md mt-1 text-base md:text-sm"
                placeholder="$"
                aria-label="Currency symbol or code"
                maxLength={4}
              />
              <p className="text-xs text-muted-foreground mt-1">Use $ for dollars, £ for pounds, € for euros, or 3-letter ISO codes (USD, GBP, EUR). Defaults to $.</p>
            </div>
            <div>
              <label className="text-sm font-medium">Dollars per mile</label>
              <input
                type="number"
                step="0.001"
                min="0"
                value={milesValuation}
                onChange={(e) => setMilesValuation(Number(e.target.value))}
                className="w-full px-3 py-2 border rounded-md mt-1 text-base md:text-sm"
                placeholder="0.01"
                aria-label="Miles valuation in dollars per mile"
              />
              <p className="text-xs text-muted-foreground mt-1">Typical range 0.010–0.020. Defaults to 0.010.</p>
            </div>
            <div className="md:col-span-2 flex items-center gap-2">
              <Button type="submit">Save Valuations</Button>
              {valuationMessage && (
                <span className="text-sm text-muted-foreground">{valuationMessage}</span>
              )}
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Data Management */}
      <Card>
        <CardHeader>
          <CardTitle>Data Management</CardTitle>
          <CardDescription>
            Export, import, or clear all your settings and data
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={handleExport}>
              <Download className="mr-2 h-4 w-4" />
              Export Settings
            </Button>
            <Button variant="outline" onClick={() => fileInputRef.current?.click()}>
              <Upload className="mr-2 h-4 w-4" />
              Import Settings
            </Button>
            <Button 
              variant="destructive"
              onClick={() => setShowClearDialog(true)}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Clear All Data
            </Button>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            onChange={handleImport}
            className="hidden"
            aria-label="Import settings file"
          />
          <p className="text-sm text-muted-foreground mt-3 space-y-1">
            <span className="block">Export saves your cards and rules (but not your PAT). Import merges with existing data.</span>
            <span className="block">API keys (YNAB PATs, formatter keys, etc.) are never included in exports.</span>
          </p>
        </CardContent>
      </Card>

      {/* Confirmation Dialogs */}
      <ConfirmDialog
        isOpen={showClearDialog}
        title="Clear All Data"
        message="This will delete all your settings, cards, and data. Your PAT will also be removed. This action cannot be undone."
        confirmText="Clear All"
        cancelText="Cancel"
        onConfirm={handleClearAll}
        onCancel={() => setShowClearDialog(false)}
      />

      <ConfirmDialog
        isOpen={showClearTokenDialog}
        title={`Clear ${provider === 'ynab' ? 'YNAB access token' : 'HowMuch API key'}?`}
        message={`This will remove your ${provider === 'ynab' ? 'Personal Access Token' : 'HowMuch API key'} and clear your budget and account selections. You'll need to reconnect to ${providerName}. Your card configurations and rules will not be affected.`}
        confirmText={provider === 'ynab' ? 'Clear Token' : 'Clear API Key'}
        cancelText="Cancel"
        onConfirm={handleClearToken}
        onCancel={() => setShowClearTokenDialog(false)}
      />

      <ConfirmDialog
        isOpen={showGenerateDialog}
        title="Generate New Sync Code?"
        message="You already have a sync code set up. Generating a new code will create a separate cloud backup and won't affect your existing backup. You'll need to update the code on other devices to keep them in sync."
        confirmText="Generate New Code"
        cancelText="Cancel"
        onConfirm={confirmGenerateNewCode}
        onCancel={() => setShowGenerateDialog(false)}
      />

      <ConfirmDialog
        isOpen={showClearOrphanedDialog}
        title="Clear Orphaned Cards?"
        message={`This will permanently delete ${orphanedCards.length} card${orphanedCards.length === 1 ? '' : 's'} that ${orphanedCards.length === 1 ? 'is' : 'are'} no longer connected to YNAB accounts. All associated rules and settings will also be removed. This action cannot be undone.`}
        confirmText="Clear Orphaned Cards"
        cancelText="Cancel"
        onConfirm={confirmClearOrphanedCards}
        onCancel={() => setShowClearOrphanedDialog(false)}
      />

      <Dialog
        open={showProviderMigrationDialog}
        onOpenChange={(open) => {
          if (migratingProvider) return;
          setShowProviderMigrationDialog(open);
          if (!open) {
            setMigrationApiKey('');
            setMigrationError('');
          }
        }}
      >
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Move rewards tracking to HowMuch</DialogTitle>
            <DialogDescription className="pt-2">
              Rewards Tracker will first verify that HowMuch contains “{selectedBudget.name || 'your selected budget'}” and every account linked to your cards. Nothing changes if verification fails.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <label htmlFor="migration-howmuch-api-key" className="text-sm font-medium">
              HowMuch API key
            </label>
            <input
              id="migration-howmuch-api-key"
              type="password"
              autoComplete="off"
              value={migrationApiKey}
              onChange={(event) => setMigrationApiKey(event.target.value)}
              placeholder="Paste your HowMuch API key"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              disabled={migratingProvider}
            />
            <p className="text-sm text-muted-foreground">
              Your cards, reward rules, and tracked-account choices will be kept. Transactions will be refreshed from HowMuch after the move.
            </p>
            {migrationError && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" aria-hidden="true" />
                <AlertDescription>{migrationError}</AlertDescription>
              </Alert>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowProviderMigrationDialog(false)}
              disabled={migratingProvider}
            >
              Cancel
            </Button>
            <Button onClick={handleMigrateToHowMuch} disabled={migratingProvider || !migrationApiKey.trim()}>
              {migratingProvider ? (
                <>
                  <RefreshCw className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                  Verifying…
                </>
              ) : 'Verify and move'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Empty Sync Warning Dialog - Custom 3-button variant */}
      <Dialog open={showEmptySyncWarningDialog} onOpenChange={(open) => !open && setShowEmptySyncWarningDialog(false)}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Info className="h-5 w-5 text-primary" aria-hidden="true" />
              Your local settings are empty
            </DialogTitle>
            <DialogDescription className="pt-2">
              You have no cards or rules configured locally, but {hasConfirmedCloudBackup ? 'you have a cloud backup' : "there's likely a cloud backup"}{' '}
              {cloudSyncLastSynced ? `from ${cloudSyncLastSynced}` : 'from another device'}. Uploading now would overwrite your cloud backup with empty settings.
              <br /><br />
              Would you like to download your settings from the cloud instead?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0 flex-col sm:flex-row">
            <Button variant="outline" onClick={() => setShowEmptySyncWarningDialog(false)}>
              Cancel
            </Button>
            <Button variant="outline" onClick={handleUploadAnywayDespiteEmpty}>
              Upload Anyway
            </Button>
            <Button variant="default" onClick={handleDownloadInsteadOfUpload}>
              <CloudDownload className="mr-2 h-4 w-4" aria-hidden="true" />
              Download Instead
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Outdated Upload Warning Dialog - Warn when cloud might be newer */}
      <Dialog open={showOutdatedUploadDialog} onOpenChange={(open) => !open && setShowOutdatedUploadDialog(false)}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-amber-600" aria-hidden="true" />
              Cloud backup exists
            </DialogTitle>
            <DialogDescription className="pt-2">
              {!settings.cloudSyncLastSyncedAt ? (
                <>
                  A cloud backup exists for this sync code{cloudTimestamp ? ` (updated ${new Date(cloudTimestamp).toLocaleString()})` : ''}, but you haven&apos;t synced on this device yet.
                  <br /><br />
                  Uploading now would overwrite the cloud backup with your local settings. Would you like to download the cloud data first?
                </>
              ) : (
                <>
                  The cloud backup was updated {cloudTimestamp ? `at ${new Date(cloudTimestamp).toLocaleString()}` : 'more recently'}, which may be newer than your local data (last synced {new Date(settings.cloudSyncLastSyncedAt).toLocaleString()}).
                  <br /><br />
                  Uploading now would overwrite the cloud data with your local settings. Would you like to download the cloud data instead?
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0 flex-col sm:flex-row">
            <Button variant="outline" onClick={() => setShowOutdatedUploadDialog(false)}>
              Cancel
            </Button>
            <Button variant="outline" onClick={handleUploadAnywayDespiteOutdated}>
              Upload Anyway
            </Button>
            <Button variant="default" onClick={handleDownloadInsteadOfOutdated}>
              <CloudDownload className="mr-2 h-4 w-4" aria-hidden="true" />
              Download Instead
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      </div>

    </div>
  );
}
