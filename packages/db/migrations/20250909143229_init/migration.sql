-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "name" TEXT,
    "emailVerified" DATETIME,
    "image" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,
    CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionToken" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expires" DATETIME NOT NULL,
    CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "VerificationToken" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Connection" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "budgetId" TEXT,
    "accessTokenEnc" TEXT NOT NULL,
    "refreshTokenEnc" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "scope" TEXT NOT NULL,
    "serverKnowledge" JSONB NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Connection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Budget" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ynabId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "connectionId" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "YnabAccount" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ynabId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "onBudget" BOOLEAN NOT NULL,
    "closed" BOOLEAN NOT NULL,
    "flagColor" TEXT,
    "budgetId" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "CategoryGroup" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ynabId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "hidden" BOOLEAN NOT NULL,
    "budgetId" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "Category" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ynabId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "hidden" BOOLEAN NOT NULL,
    "groupId" TEXT NOT NULL,
    "budgetId" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "Payee" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ynabId" TEXT NOT NULL,
    "nameHash" TEXT NOT NULL,
    "namePreview" TEXT,
    "budgetId" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "Transaction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ynabId" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    "amountMilli" INTEGER NOT NULL,
    "cleared" TEXT NOT NULL,
    "approved" BOOLEAN NOT NULL,
    "memoHash" TEXT,
    "flagColor" TEXT,
    "accountId" TEXT NOT NULL,
    "categoryId" TEXT,
    "payeeId" TEXT,
    "importId" TEXT,
    "transferAccountId" TEXT,
    "scheduled" BOOLEAN NOT NULL DEFAULT false,
    "subTxCount" INTEGER NOT NULL DEFAULT 0
);

-- CreateTable
CREATE TABLE "Split" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "transactionId" TEXT NOT NULL,
    "amountMilli" INTEGER NOT NULL,
    "categoryId" TEXT,
    "memoHash" TEXT
);

-- CreateTable
CREATE TABLE "Card" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "issuer" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "valuationCentsPerPoint" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true
);

-- CreateTable
CREATE TABLE "RewardRule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "cardId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "scopeJson" JSONB NOT NULL,
    "windowJson" JSONB NOT NULL,
    "rewardJson" JSONB NOT NULL,
    "capsJson" JSONB NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "stacking" TEXT NOT NULL DEFAULT 'max'
);

-- CreateTable
CREATE TABLE "AccrualWindow" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "cardId" TEXT NOT NULL,
    "windowStart" DATETIME NOT NULL,
    "windowEnd" DATETIME NOT NULL,
    "cadence" TEXT NOT NULL,
    "capOverallMilli" INTEGER,
    "earnedMilli" INTEGER NOT NULL DEFAULT 0,
    "points" INTEGER NOT NULL DEFAULT 0,
    "breakageMilli" INTEGER
);

-- CreateTable
CREATE TABLE "AccrualLine" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "accrualWindowId" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "splitId" TEXT,
    "ruleId" TEXT NOT NULL,
    "eligibleMilli" INTEGER NOT NULL,
    "rewardKind" TEXT NOT NULL,
    "rewardAmountRaw" INTEGER NOT NULL,
    "appliedCapMilli" INTEGER NOT NULL,
    "notes" TEXT
);

-- CreateTable
CREATE TABLE "SyncState" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "connectionId" TEXT NOT NULL,
    "sinceDate" DATETIME NOT NULL,
    "serverKnowledgeByResourceJson" JSONB NOT NULL,
    "lastRunAt" DATETIME,
    "status" TEXT NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Account_provider_providerAccountId_key" ON "Account"("provider", "providerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_sessionToken_key" ON "Session"("sessionToken");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_token_key" ON "VerificationToken"("token");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_identifier_token_key" ON "VerificationToken"("identifier", "token");

-- CreateIndex
CREATE UNIQUE INDEX "Budget_ynabId_key" ON "Budget"("ynabId");

-- CreateIndex
CREATE UNIQUE INDEX "YnabAccount_ynabId_key" ON "YnabAccount"("ynabId");

-- CreateIndex
CREATE UNIQUE INDEX "CategoryGroup_ynabId_key" ON "CategoryGroup"("ynabId");

-- CreateIndex
CREATE UNIQUE INDEX "Category_ynabId_key" ON "Category"("ynabId");

-- CreateIndex
CREATE UNIQUE INDEX "Payee_ynabId_key" ON "Payee"("ynabId");

-- CreateIndex
CREATE UNIQUE INDEX "Transaction_ynabId_key" ON "Transaction"("ynabId");
