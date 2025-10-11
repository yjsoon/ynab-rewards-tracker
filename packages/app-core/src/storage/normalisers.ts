import { UNFLAGGED_FLAG, YNAB_FLAG_COLORS, type YnabFlagColor } from '../ynab/constants';

import type {
  CardReference,
  CardSubcategory,
  CreditCard,
  HiddenCard,
  HiddenCardReason,
  StorageData,
  SubcategoryReference,
  ThemeGroup,
} from './types';
import type {
  MutableCard,
  MutableCardReference,
  MutableStorageData,
  MutableSubcategory,
  MutableSubcategoryReference,
  MutableThemeGroup,
} from './internal-types';

function shouldLogDevelopmentWarnings(): boolean {
  return process.env.NODE_ENV !== 'production';
}

function createRandomId(prefix: string): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
  } catch {
    // Ignore and fall back to Math.random
  }
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

export function createSubcategoryId(): string {
  return createRandomId('subcat');
}

export function createGroupId(): string {
  return createRandomId('group');
}

export function getFallbackFlagName(
  flagColor: YnabFlagColor,
  flagNames?: Partial<Record<YnabFlagColor, string>>
): string {
  if (flagNames && flagNames[flagColor]) {
    return flagNames[flagColor] as string;
  }

  if (flagColor === UNFLAGGED_FLAG.value) {
    return UNFLAGGED_FLAG.label;
  }

  const match = YNAB_FLAG_COLORS.find((flag) => flag.value === flagColor);
  if (match) {
    return match.label;
  }

  return flagColor.charAt(0).toUpperCase() + flagColor.slice(1);
}

export function normaliseSubcategory(
  subcategory: MutableSubcategory,
  card: MutableCard,
  index: number,
  flagNames?: Partial<Record<YnabFlagColor, string>>
): CardSubcategory {
  const nowIso = new Date().toISOString();
  const flagColor =
    (subcategory.flagColor as YnabFlagColor | undefined) && typeof subcategory.flagColor === 'string'
      ? (subcategory.flagColor as YnabFlagColor)
      : UNFLAGGED_FLAG.value;

  const createdAt = typeof subcategory.createdAt === 'string' ? subcategory.createdAt : nowIso;
  const updatedAt = typeof subcategory.updatedAt === 'string' ? subcategory.updatedAt : nowIso;

  const rewardValueFallback = typeof card.earningRate === 'number' ? card.earningRate : 0;

  return {
    id:
      typeof subcategory.id === 'string' && subcategory.id.length > 0
        ? subcategory.id
        : createSubcategoryId(),
    name:
      typeof subcategory.name === 'string' && subcategory.name.trim().length > 0
        ? subcategory.name.trim()
        : getFallbackFlagName(flagColor, flagNames),
    flagColor,
    rewardValue:
      typeof subcategory.rewardValue === 'number' && Number.isFinite(subcategory.rewardValue)
        ? subcategory.rewardValue
        : rewardValueFallback,
    milesBlockSize:
      typeof subcategory.milesBlockSize === 'number' && Number.isFinite(subcategory.milesBlockSize)
        ? subcategory.milesBlockSize
        : null,
    minimumSpend:
      typeof subcategory.minimumSpend === 'number' && Number.isFinite(subcategory.minimumSpend)
        ? subcategory.minimumSpend
        : subcategory.minimumSpend === 0
        ? 0
        : null,
    maximumSpend:
      typeof subcategory.maximumSpend === 'number' && Number.isFinite(subcategory.maximumSpend)
        ? subcategory.maximumSpend
        : subcategory.maximumSpend === 0
        ? 0
        : null,
    priority:
      typeof subcategory.priority === 'number' && Number.isFinite(subcategory.priority)
        ? subcategory.priority
        : index,
    active: typeof subcategory.active === 'boolean' ? subcategory.active : true,
    excludeFromRewards:
      typeof subcategory.excludeFromRewards === 'boolean' ? subcategory.excludeFromRewards : false,
    createdAt,
    updatedAt,
  };
}

export function normaliseCard(
  card: MutableCard,
  flagNames?: Partial<Record<YnabFlagColor, string>>
): CreditCard {
  if (!card.billingCycle) {
    card.billingCycle = {
      type: 'calendar',
    };
  }
  if (typeof card.featured !== 'boolean') {
    card.featured = typeof card.active === 'boolean' ? Boolean(card.active) : true;
  }

  const mutableCard = { ...card } as MutableCard;

  if ('active' in mutableCard) {
    Reflect.deleteProperty(mutableCard, 'active');
  }

  const subcategoriesEnabled = typeof mutableCard.subcategoriesEnabled === 'boolean'
    ? mutableCard.subcategoriesEnabled
    : false;

  const rawSubcategories = Array.isArray(mutableCard.subcategories)
    ? mutableCard.subcategories
    : [];

  const seenFlags = new Set<YnabFlagColor>();
  const normalisedSubcategories: CardSubcategory[] = [];

  rawSubcategories.forEach((subcategory, index) => {
    const normalised = normaliseSubcategory(subcategory as MutableSubcategory, mutableCard, index, flagNames);
    if (!seenFlags.has(normalised.flagColor)) {
      normalisedSubcategories.push(normalised);
      seenFlags.add(normalised.flagColor);
    } else if (shouldLogDevelopmentWarnings()) {
      console.warn(
        `Duplicate flag colour detected: "${normalised.flagColor}". ` +
          `Subcategory "${normalised.name}" (index ${index}) was skipped. ` +
          `Each subcategory must have a unique flag colour.`
      );
    }
  });

  if (subcategoriesEnabled && !seenFlags.has(UNFLAGGED_FLAG.value)) {
    normalisedSubcategories.push({
      id: createSubcategoryId(),
      name: getFallbackFlagName(UNFLAGGED_FLAG.value, flagNames),
      flagColor: UNFLAGGED_FLAG.value,
      rewardValue: typeof mutableCard.earningRate === 'number' ? mutableCard.earningRate : 0,
      milesBlockSize: null,
      minimumSpend: null,
      maximumSpend: null,
      priority: normalisedSubcategories.length,
      active: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  }

  normalisedSubcategories.sort((a, b) => a.priority - b.priority);

  normalisedSubcategories.forEach((subcategory, index) => {
    subcategory.priority = index;
  });

  mutableCard.subcategoriesEnabled = subcategoriesEnabled;
  mutableCard.subcategories = normalisedSubcategories;

  if (typeof mutableCard.issuer !== 'string') {
    mutableCard.issuer = 'Unknown';
  }

  return mutableCard as CreditCard;
}

export function normaliseThemeGroup(
  group: MutableThemeGroup,
  storage: MutableStorageData,
  fallbackPriority = 0
): ThemeGroup {
  const nowIso = new Date().toISOString();
  const id = typeof group.id === 'string' && group.id.length > 0 ? group.id : createGroupId();
  const name = typeof group.name === 'string' && group.name.trim().length > 0 ? group.name.trim() : 'Untitled Theme';
  const description = typeof group.description === 'string' && group.description.trim().length > 0
    ? group.description.trim()
    : undefined;
  const colour = typeof group.colour === 'string' && group.colour.trim().length > 0
    ? group.colour.trim()
    : undefined;
  const createdAt = typeof group.createdAt === 'string' ? group.createdAt : nowIso;
  const updatedAt = typeof group.updatedAt === 'string' ? group.updatedAt : nowIso;
  const priority = typeof group.priority === 'number' && Number.isFinite(group.priority)
    ? group.priority
    : fallbackPriority;

  const cardSubcategoryMap = new Map<string, Set<string>>();
  (storage.cards || []).forEach((card) => {
    if (!card || typeof card.id !== 'string') {
      return;
    }
    const subSet = new Set<string>();
    if (Array.isArray(card.subcategories)) {
      card.subcategories.forEach((sub) => {
        if (sub && typeof sub.id === 'string') {
          subSet.add(sub.id);
        }
      });
    }
    cardSubcategoryMap.set(card.id, subSet);
  });

  const rawSubcategories = Array.isArray(group.subcategories) ? group.subcategories : [];
  const rawCards = Array.isArray(group.cards) ? group.cards : [];
  const seenSubcategories = new Set<string>();
  const subcategories: SubcategoryReference[] = [];
  const seenCards = new Set<string>();
  const cards: CardReference[] = [];

  rawSubcategories.forEach((entry) => {
    const ref = entry as MutableSubcategoryReference;
    const cardId = typeof ref.cardId === 'string' ? ref.cardId : '';
    const subcategoryId = typeof ref.subcategoryId === 'string' ? ref.subcategoryId : '';
    if (!cardId || !subcategoryId) {
      return;
    }
    const validSubcategories = cardSubcategoryMap.get(cardId);
    if (!validSubcategories || !validSubcategories.has(subcategoryId)) {
      return;
    }
    const key = `${cardId}:${subcategoryId}`;
    if (seenSubcategories.has(key)) {
      return;
    }
    seenSubcategories.add(key);
    subcategories.push({ cardId, subcategoryId });
  });

  rawCards.forEach((entry) => {
    const ref = entry as MutableCardReference;
    const cardId = typeof ref.cardId === 'string' ? ref.cardId : '';
    if (!cardId || !cardSubcategoryMap.has(cardId)) {
      return;
    }
    if (seenCards.has(cardId)) {
      return;
    }
    seenCards.add(cardId);
    cards.push({ cardId });
  });

  return {
    id,
    name,
    description,
    colour,
    priority,
    subcategories,
    cards,
    createdAt,
    updatedAt,
  };
}

export function pruneThemeGroups(storage: MutableStorageData): void {
  if (!Array.isArray(storage.themeGroups)) {
    storage.themeGroups = [];
    return;
  }

  const normalised = storage.themeGroups.map((group, index) =>
    normaliseThemeGroup({ ...group } as MutableThemeGroup, storage, index)
  );

  normalised.sort((a, b) => a.priority - b.priority);
  normalised.forEach((group, index) => {
    group.priority = index;
  });

  storage.themeGroups = normalised;
}

export function normaliseHiddenCards(hiddenCards: unknown[]): HiddenCard[] {
  if (!Array.isArray(hiddenCards)) {
    return [];
  }

  const now = Date.now();
  const cardMap = new Map<string, { hiddenUntil: number; reason: HiddenCardReason }>();

  for (const entry of hiddenCards) {
    if (!entry || typeof entry !== 'object') {
      continue;
    }

    const candidate = entry as Record<string, unknown>;
    const cardId = typeof candidate.cardId === 'string' ? candidate.cardId.trim() : '';
    const hiddenUntilValue = typeof candidate.hiddenUntil === 'string' ? candidate.hiddenUntil : '';
    const allowedReasons: HiddenCardReason[] = ['maximum_spend_reached'];
    const reason =
      typeof candidate.reason === 'string' && allowedReasons.includes(candidate.reason as HiddenCardReason)
        ? (candidate.reason as HiddenCardReason)
        : 'maximum_spend_reached';

    if (!cardId || !hiddenUntilValue) {
      continue;
    }

    const expiry = new Date(hiddenUntilValue);
    if (Number.isNaN(expiry.getTime())) {
      continue;
    }

    const expiryTime = expiry.getTime();
    if (expiryTime <= now) {
      continue;
    }

    const existing = cardMap.get(cardId);
    if (!existing || expiryTime > existing.hiddenUntil) {
      cardMap.set(cardId, { hiddenUntil: expiryTime, reason });
    }
  }

  return Array.from(cardMap.entries())
    .map(([cardId, { hiddenUntil, reason }]) => ({
      cardId,
      hiddenUntil: new Date(hiddenUntil).toISOString(),
      reason,
    }))
    .sort((a, b) => new Date(a.hiddenUntil).getTime() - new Date(b.hiddenUntil).getTime());
}

export function areHiddenCardListsEqual(left: HiddenCard[] | undefined, right: HiddenCard[]): boolean {
  if (!Array.isArray(left) || left.length !== right.length) {
    return false;
  }

  for (let index = 0; index < right.length; index += 1) {
    const a = left[index];
    const b = right[index];
    if (!a || a.cardId !== b.cardId || a.hiddenUntil !== b.hiddenUntil || a.reason !== b.reason) {
      return false;
    }
  }

  return true;
}

export function createDefaultStorage(): StorageData {
  return {
    ynab: {},
    cards: [],
    rules: [],
    tagMappings: [],
    calculations: [],
    themeGroups: [],
    hiddenCards: [],
    settings: {
      theme: 'light',
      currency: 'USD',
      dashboardViewMode: 'summary',
      cardOrdering: {},
      collapsedCardGroups: {},
    },
  };
}