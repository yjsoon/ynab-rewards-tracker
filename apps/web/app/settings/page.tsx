'use client';

import Link from 'next/link';
import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { useYnabPAT, useCreditCards, useSettings, useSelectedBudget, useTrackedAccountIds } from '@/hooks/useLocalStorage';
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
} from '@/lib/cloud-sync';
import { YnabClient } from '@/lib/ynab-client';
import type { CreditCard } from '@/lib/storage';
import { validateYnabToken } from '@/lib/validation';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Switch } from '@/components/ui/switch';
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
  Cloud,
  ChevronDown,
  ChevronUp,
  Info,
  Check,
} from 'lucide-react';
import { DashboardQuickStats } from '@/components/dashboard/DashboardQuickStats';

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
};

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
          <Link href={`/cards/${linkedCard.id}?tab=settings`} aria-label={`View ${linkedCard.name} details`}>
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
  const { pat, setPAT, isLoading: patLoading } = useYnabPAT();
  const { cards, saveCard, deleteCard, isLoading: cardsLoading } = useCreditCards();
  const { settings, updateSettings, exportSettings, importSettings, clearAll } = useSettings();
  const { autoBackup } = useAutoBackup();
  
  const [tokenInput, setTokenInput] = useState('');
  const [testingConnection, setTestingConnection] = useState(false);
  const [connectionMessage, setConnectionMessage] = useState('');
  const [showClearDialog, setShowClearDialog] = useState(false);
  const [showClearTokenDialog, setShowClearTokenDialog] = useState(false);
  const hasRequestedBudgetsRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [cloudSyncPhrase, setCloudSyncPhrase] = useState('');
  const [generatedCloudPhrase, setGeneratedCloudPhrase] = useState<string | null>(null);
  const [cloudSyncMessage, setCloudSyncMessage] = useState('');
  const [cloudSyncError, setCloudSyncError] = useState('');
  const [cloudSyncAction, setCloudSyncAction] = useState<'idle' | 'generate' | 'upload' | 'download' | 'delete' | 'sync'>('idle');
  const [showAdvancedSync, setShowAdvancedSync] = useState(false);
  const [showGenerateDialog, setShowGenerateDialog] = useState(false);
  const [justToggledRemember, setJustToggledRemember] = useState(false);
  const [showEmptySyncWarningDialog, setShowEmptySyncWarningDialog] = useState(false);
  const hasInitializedPhraseRef = useRef(false);
  const orphanedMessageTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Orphaned cards state
  const [orphanedCardMessage, setOrphanedCardMessage] = useState('');
  const [showClearOrphanedDialog, setShowClearOrphanedDialog] = useState(false);
  const [clearingOrphanedCards, setClearingOrphanedCards] = useState(false);

  // Auto-backup state
  const [autoBackupError, setAutoBackupError] = useState('');

  // Budget and account selection state
  const [budgets, setBudgets] = useState<YnabBudget[]>([]);
  const { selectedBudget, setSelectedBudget: persistSelectedBudget } = useSelectedBudget();
  const [accounts, setAccounts] = useState<YnabAccount[]>([]);
  const { trackedAccountIds, setTrackedAccountIds: persistTrackedAccountIds, isAccountTracked } = useTrackedAccountIds();
  const [loadingBudgets, setLoadingBudgets] = useState(false);
  const [loadingAccounts, setLoadingAccounts] = useState(false);
  const [showBudgetSelector, setShowBudgetSelector] = useState(false);

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
  const isGeneratingCloudSync = cloudSyncAction === 'generate';
  const isUploadingCloudSync = cloudSyncAction === 'upload';
  const isDownloadingCloudSync = cloudSyncAction === 'download';
  const isDeletingCloudSync = cloudSyncAction === 'delete';
  const isSyncingNow = cloudSyncAction === 'sync';
  const isCodeRemembered = settings.rememberCloudSyncCode && Boolean(settings.cloudSyncMnemonic);
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

  const fetchAccounts = useCallback(async (budgetId: string) => {
    if (!pat) return;

    setLoadingAccounts(true);
    try {
      const client = new YnabClient(pat);
      const fetchedAccounts = await client.getAccounts<YnabAccount>(budgetId);
      const openAccounts = fetchedAccounts.filter((acc) => !acc.closed && acc.on_budget);
      setAccounts(openAccounts);
      syncCardsWithAccounts(openAccounts);
    } catch (error) {
      setConnectionMessage(`Failed to fetch accounts: ${getErrorMessage(error)}`);
    } finally {
      setLoadingAccounts(false);
    }
  }, [pat, syncCardsWithAccounts]);

  const handleBudgetSelect = useCallback((budgetId: string, budgetName: string) => {
    persistSelectedBudget(budgetId, budgetName);
    setShowBudgetSelector(false);
    fetchAccounts(budgetId);
  }, [fetchAccounts, persistSelectedBudget]);

  const fetchBudgets = useCallback(async () => {
    if (!pat) return;

    setLoadingBudgets(true);
    try {
      const client = new YnabClient(pat);
      const fetchedBudgets = await client.getBudgets();
      setBudgets(fetchedBudgets);

      if (fetchedBudgets.length === 1) {
        handleBudgetSelect(fetchedBudgets[0].id, fetchedBudgets[0].name);
      }
    } catch (error) {
      setConnectionMessage(`Failed to fetch budgets: ${getErrorMessage(error)}`);
    } finally {
      setLoadingBudgets(false);
    }
  }, [pat, handleBudgetSelect]);

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
    
    const validation = validateYnabToken(tokenInput);
    if (!validation.valid) {
      setConnectionMessage(`❌ ${validation.error}`);
      return;
    }

    setPAT(tokenInput);
    setConnectionMessage('Token saved! Fetching budgets...');
    setTokenInput('');
    
    // Immediately fetch budgets after saving token
    fetchBudgets();
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
    a.download = `ynab-rewards-settings-${new Date().toISOString().split('T')[0]}.json`;
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

    // Auto-backup to cloud after save
    try {
      await autoBackup();
    } catch (error) {
      setAutoBackupError('Cloud backup failed. Your changes are saved locally.');
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

  async function uploadWithPhrase(phrase: string, options: { generated?: boolean } = {}) {
    const normalised = normaliseMnemonic(phrase);
    if (!isValidMnemonic(normalised)) {
      throw new Error('Invalid sync code. Check the words and try again.');
    }

    const payload = parseExportedSettings();
    const keyId = await computeKeyId(normalised);
    const { ciphertext, iv } = await encryptJson(normalised, payload);
    const { updatedAt } = await uploadEncryptedSettings({ keyId, ciphertext, iv });

    updateSettings({ cloudSyncKeyId: keyId, cloudSyncLastSyncedAt: updatedAt });
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

    setCloudSyncError('');
    setCloudSyncMessage('');
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
      updateSettings({ cloudSyncKeyId: keyId, cloudSyncLastSyncedAt: stored.updatedAt });
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
      setJustToggledRemember(true);
      setShowAdvancedSync(true); // Ensure user can access "Show simple mode" button
    } else {
      // User wants to stop remembering
      updateSettings({
        cloudSyncMnemonic: undefined,
        rememberCloudSyncCode: false,
      });
      setCloudSyncMessage('Sync code removed from this device.');
    }
  }

  // Helper to check if uploading empty settings would overwrite cloud backup
  function shouldWarnAboutEmptyUpload(): boolean {
    try {
      const exportedSettings = parseExportedSettings() as {
        cards?: unknown;
        rules?: unknown;
      };

      const hasNoCards = !Array.isArray(exportedSettings?.cards) || exportedSettings.cards.length === 0;
      const hasNoRules = !Array.isArray(exportedSettings?.rules) || exportedSettings.rules.length === 0;

      // Detect cloud backup via:
      // 1. cloudSyncKeyId exists (uploaded before on this or another device)
      // 2. OR user has a sync code but no keyId yet (likely entered code from another device)
      const hasSyncKeyId = Boolean(settings.cloudSyncKeyId);
      const hasCodeButNoKeyId = Boolean((storedMnemonic || cloudSyncPhrase).trim()) && !settings.cloudSyncKeyId;
      const likelyHasCloudBackup = hasSyncKeyId || hasCodeButNoKeyId;

      return hasNoCards && hasNoRules && likelyHasCloudBackup;
    } catch (error) {
      // If we can't parse settings, assume they're not empty to avoid blocking uploads
      return false;
    }
  }

  async function handleSyncNow() {
    setCloudSyncError('');
    setCloudSyncMessage('');

    if (shouldWarnAboutEmptyUpload()) {
      setShowEmptySyncWarningDialog(true);
      return;
    }

    // Proceed with upload
    await performSyncUpload();
  }

  async function performSyncUpload() {
    setCloudSyncError('');
    setCloudSyncMessage('');
    setCloudSyncAction('sync');
    try {
      const phraseToUse = storedMnemonic || cloudSyncPhrase;
      if (!phraseToUse.trim()) {
        throw new Error('No sync code available.');
      }
      await uploadWithPhrase(phraseToUse);

      // If code is remembered, save the potentially normalized version
      if (settings.rememberCloudSyncCode) {
        const normalised = normaliseMnemonic(phraseToUse);
        updateSettings({ cloudSyncMnemonic: normalised });
      }
    } catch (error) {
      setCloudSyncError(getErrorMessage(error));
    } finally {
      setCloudSyncAction('idle');
    }
  }

  async function handleDownloadInsteadOfUpload() {
    setShowEmptySyncWarningDialog(false);
    await handleCloudDownload();
  }

  async function handleUploadAnywayDespiteEmpty() {
    setShowEmptySyncWarningDialog(false);
    await performSyncUpload();
  }

  // Fix #7: Less aggressive - keep sync history (keyId, lastSyncedAt)
  function handleForgetCode() {
    updateSettings({
      cloudSyncMnemonic: undefined,
      rememberCloudSyncCode: false,
      // Keep cloudSyncKeyId and cloudSyncLastSyncedAt for history
    });
    setCloudSyncPhrase('');
    setGeneratedCloudPhrase(null);
    setCloudSyncMessage('Sync code removed from this device. Cloud backup and sync history preserved.');
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
      // deleteCard is synchronous, but we're being defensive
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

  if (patLoading || cardsLoading) {
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

      {/* YNAB Connection */}
      <Card id="settings-budget">
        <CardHeader>
          <CardTitle>YNAB Connection</CardTitle>
          <CardDescription>
            Connect your YNAB account to sync transactions and budgets
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!pat ? (
            <form onSubmit={handleSaveToken} className="space-y-4">
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
              <div className="flex gap-2">
                <input
                  type="password"
                  value={tokenInput}
                  onChange={(e) => setTokenInput(e.target.value)}
                  placeholder="Paste your YNAB Personal Access Token"
                  className="flex-1 px-3 py-2 border rounded-md"
                />
                <Button type="submit">Save Token</Button>
              </div>
            </form>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-green-600">
                <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
                <span className="font-medium">Token configured</span>
              </div>
              
              {/* Budget Selection */}
              {selectedBudget.id && !showBudgetSelector ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">Selected Budget</p>
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
                  <div className="flex gap-2">
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
                  onClick={fetchBudgets}
                >
                  Load Budgets
                </Button>
              )}
              
              <div className="flex gap-2">
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
          )}
          {connectionMessage && (
            <Alert className="mt-4">
              <AlertCircle className="h-4 w-4" aria-hidden="true" />
              <AlertDescription>{connectionMessage}</AlertDescription>
            </Alert>
          )}
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
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {accounts.map(account => {
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
                className="w-full px-3 py-2 border rounded-md mt-1"
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
                className="w-full px-3 py-2 border rounded-md mt-1"
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

      {/* Auto-backup error notification */}
      {autoBackupError && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" aria-hidden="true" />
          <AlertDescription>{autoBackupError}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Cloud Sync (optional)</CardTitle>
          <CardDescription className="space-y-1">
            <span>Encrypt your settings with a 12-word sync code and store them in Cloudflare KV. No sign-in required.</span>
            <span className="block">API keys (YNAB PATs, formatter keys, etc.) are never synced.</span>
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {/* Simple Mode: Code is remembered */}
            {isCodeRemembered && !showAdvancedSync && !justToggledRemember ? (
              <>
                <div className="flex items-center justify-between rounded-lg border bg-muted/30 p-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                      <Check className="h-5 w-5 text-primary" aria-hidden="true" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">Auto-backup enabled</p>
                      {cloudSyncLastSynced ? (
                        <p className="text-xs text-muted-foreground">
                          Last backup: {cloudSyncLastSynced}
                        </p>
                      ) : (
                        <p className="text-xs text-muted-foreground">
                          Settings will auto-backup on save
                        </p>
                      )}
                    </div>
                  </div>
                  <Button
                    type="button"
                    onClick={handleSyncNow}
                    disabled={isCloudSyncBusy}
                  >
                    <Cloud className="mr-2 h-4 w-4" aria-hidden="true" />
                    {isSyncingNow ? 'Syncing…' : 'Sync Now'}
                  </Button>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setShowAdvancedSync(true)}
                  >
                    <ChevronDown className="mr-2 h-3 w-3" aria-hidden="true" />
                    Advanced options
                  </Button>
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
              </>
            ) : (
              <>
                {/* Advanced/Manual Mode */}
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
                  <label className="text-sm font-medium" htmlFor="cloud-sync-phrase">
                    Sync code
                  </label>
                  <textarea
                    id="cloud-sync-phrase"
                    className="w-full rounded-md border px-3 py-2 font-mono text-sm"
                    rows={2}
                    value={cloudSyncPhrase}
                    onChange={(event) => setCloudSyncPhrase(event.target.value)}
                    placeholder="twelve lowercase words separated by spaces"
                  />
                  <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 dark:border-amber-900/50 dark:bg-amber-950/20">
                    <Info className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-600 dark:text-amber-500" aria-hidden="true" />
                    <p className="text-xs text-amber-800 dark:text-amber-200">
                      Keep this code private. Anyone with it can download and decrypt your settings. Your YNAB token is never synced.
                    </p>
                  </div>
                </div>

                {/* Remember Code Toggle */}
                {cloudSyncPhrase.trim() && !generatedCloudPhrase && (
                  <div className="flex items-center justify-between rounded-lg border p-3">
                    <div className="flex items-start gap-3">
                      <KeyRound className="mt-0.5 h-4 w-4 text-muted-foreground" aria-hidden="true" />
                      <div>
                        <p className="text-sm font-medium">Remember sync code on this device</p>
                        <p className="text-xs text-muted-foreground">
                          Store encrypted code locally for one-click syncing
                        </p>
                      </div>
                    </div>
                    <Switch
                      id="remember-sync-code"
                      checked={Boolean(settings.rememberCloudSyncCode)}
                      onCheckedChange={handleRememberCodeToggle}
                      aria-label="Remember sync code on this device"
                    />
                  </div>
                )}

                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant={settings.cloudSyncKeyId ? "outline" : "default"}
                    onClick={handleGenerateCloudSync}
                    disabled={isCloudSyncBusy}
                  >
                    <KeyRound className="mr-2 h-4 w-4" aria-hidden="true" />
                    {isGeneratingCloudSync ? 'Generating…' : 'Generate & upload'}
                  </Button>
                  <Button
                    type="button"
                    variant={settings.cloudSyncKeyId ? "default" : "outline"}
                    onClick={handleCloudUpload}
                    disabled={isCloudSyncBusy || !cloudSyncPhrase.trim()}
                  >
                    <CloudUpload className="mr-2 h-4 w-4" aria-hidden="true" />
                    {isUploadingCloudSync ? 'Uploading…' : 'Upload with code'}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleCloudDownload}
                    disabled={isCloudSyncBusy || !cloudSyncPhrase.trim()}
                  >
                    <CloudDownload className="mr-2 h-4 w-4" aria-hidden="true" />
                    {isDownloadingCloudSync ? 'Downloading…' : 'Download & apply'}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={handleCloudDelete}
                    disabled={isCloudSyncBusy}
                  >
                    <CloudOff className="mr-2 h-4 w-4" aria-hidden="true" />
                    {isDeletingCloudSync ? 'Deleting…' : 'Delete cloud backup'}
                  </Button>
                </div>

                {isCodeRemembered && showAdvancedSync && (
                  <div className="flex justify-start">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setShowAdvancedSync(false);
                        setJustToggledRemember(false);
                      }}
                    >
                      <ChevronUp className="mr-2 h-3 w-3" aria-hidden="true" />
                      Show simple mode
                    </Button>
                  </div>
                )}

                {cloudSyncLastSynced && (
                  <p className="text-xs text-muted-foreground">
                    Last synced: {cloudSyncLastSynced}
                  </p>
                )}
              </>
            )}

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
          </div>
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
        title="Clear YNAB Token?"
        message="This will remove your Personal Access Token and clear your budget and account selections. You'll need to reconnect to YNAB. Your card configurations and rules will not be affected."
        confirmText="Clear Token"
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

      {/* Empty Sync Warning Dialog - Custom 3-button variant */}
      <Dialog open={showEmptySyncWarningDialog} onOpenChange={(open) => !open && setShowEmptySyncWarningDialog(false)}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Info className="h-5 w-5 text-primary" aria-hidden="true" />
              Your local settings are empty
            </DialogTitle>
            <DialogDescription className="pt-2">
              You have no cards or rules configured locally, but there's likely a cloud backup{' '}
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
      </div>

    </div>
  );
}
