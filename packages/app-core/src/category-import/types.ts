import type {
  CardSpendingTier,
  CardSubcategory,
  CategoryImportProvider,
  CreditCard,
} from '../storage/types';
import type { YnabFlagColor } from '../ynab/constants';

export type { CategoryImportProvider };

export type CategoryImportSource =
  | { kind: 'instructions'; instructions: string }
  | { kind: 'termsUrl'; url: string }
  | { kind: 'both'; instructions: string; url: string };

export interface CategoryImportCredentials {
  provider: CategoryImportProvider;
  apiKey: string;
  model?: string;
}

export interface CategoryBucketDraft {
  name: string;
  rewardValue: number;
  milesBlockSize: number | null;
  minimumSpend: number | null;
  maximumSpend: number | null;
  excludeFromRewards: boolean;
  inclusion: string | null;
}

export interface ProposedCardLimits {
  earningRate: number | null;
  earningBlockSize: number | null;
  minimumSpend: number | null;
  maximumSpend: number | null;
}

export interface ProposedSpendingTier {
  spendThreshold: number;
  earningRate: number | null;
  maximumSpend: number | null;
}

export interface ProposedSubcategory extends CategoryBucketDraft {
  flagColor: YnabFlagColor;
  priority: number;
  active: true;
}

export interface CategoryImportProposal {
  cardType: CreditCard['type'];
  cardLimits: ProposedCardLimits | null;
  subcategories: ProposedSubcategory[];
  spendingTiers: ProposedSpendingTier[] | null;
  notes: string[];
}

export type CategoryImportFailureKind =
  | 'missing_source'
  | 'invalid_url'
  | 'fetch_failed'
  | 'provider_failed'
  | 'unparseable';

export type CategoryImportFailure =
  | { kind: 'missing_source'; message: string }
  | { kind: 'invalid_url'; message: string }
  | { kind: 'fetch_failed'; message: string }
  | { kind: 'provider_failed'; message: string }
  | { kind: 'unparseable'; message: string };

export type CategoryImportResult =
  | { kind: 'ok'; proposal: CategoryImportProposal }
  | CategoryImportFailure;

export interface CategoryImportDeps {
  completeChat: (input: {
    provider: CategoryImportProvider;
    apiKey: string;
    model: string;
    system: string;
    user: string;
  }) => Promise<string>;
  fetchText: (url: string) => Promise<string>;
}

export type ExistingCategoryImportSubcategory =
  Pick<CardSubcategory, 'name' | 'flagColor'>
  & Partial<Pick<CardSubcategory, 'id' | 'createdAt'>>;

interface CategoryImportRequestBase {
  cardType: CreditCard['type'];
  existingSubcategories?: ExistingCategoryImportSubcategory[];
  earningRate?: number | null;
}

export type CategoryImportRequest = CategoryImportRequestBase & (
  | {
    source: CategoryImportSource;
    instructions?: never;
    url?: never;
  }
  | {
    source?: never;
    instructions?: string;
    url?: string;
  }
);

export interface CardCategoryPatch {
  subcategoriesEnabled: true;
  subcategories: CardSubcategory[];
  earningRate?: number | null;
  earningBlockSize?: number | null;
  minimumSpend?: number | null;
  maximumSpend?: number | null;
  spendingTiers?: CardSpendingTier[];
}

export interface ParsedCategoryImport {
  cardLimits: ProposedCardLimits | null;
  buckets: CategoryBucketDraft[];
  spendingTiers: ProposedSpendingTier[] | null;
  notes: string[];
}
