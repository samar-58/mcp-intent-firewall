-- CreateEnum
CREATE TYPE "McpTransport" AS ENUM ('STDIO', 'HTTP');

-- CreateEnum
CREATE TYPE "PolicyEffect" AS ENUM ('ALLOW', 'BLOCK', 'REQUIRE_APPROVAL', 'VALIDATE');

-- CreateEnum
CREATE TYPE "ApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'DENIED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "PolicyDecision" AS ENUM ('ALLOW', 'BLOCK', 'REQUIRE_APPROVAL');

-- CreateEnum
CREATE TYPE "ToolCallOutcome" AS ENUM ('ALLOWED', 'BLOCKED', 'PENDING_APPROVAL', 'APPROVED', 'DENIED', 'ERROR');

-- CreateTable
CREATE TABLE "McpServerConfig" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "transport" "McpTransport" NOT NULL DEFAULT 'STDIO',
    "command" TEXT NOT NULL,
    "argsJson" JSONB NOT NULL DEFAULT '[]',
    "envJson" JSONB NOT NULL DEFAULT '{}',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "McpServerConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Conversation" (
    "id" TEXT NOT NULL,
    "title" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "contentJson" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PolicyRule" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "effect" "PolicyEffect" NOT NULL,
    "scopeJson" JSONB NOT NULL DEFAULT '{}',
    "conditionJson" JSONB NOT NULL DEFAULT '{}',
    "priority" INTEGER NOT NULL DEFAULT 100,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PolicyRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApprovalRequest" (
    "id" TEXT NOT NULL,
    "status" "ApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "conversationId" TEXT NOT NULL,
    "intentJson" JSONB NOT NULL,
    "geminiFunctionCallJson" JSONB NOT NULL,
    "decisionJson" JSONB,
    "resultJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "ApprovalRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ToolCallLog" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "serverName" TEXT NOT NULL,
    "toolName" TEXT NOT NULL,
    "normalizedFunctionName" TEXT NOT NULL,
    "argsJson" JSONB NOT NULL,
    "intentJson" JSONB NOT NULL,
    "decision" "PolicyDecision" NOT NULL,
    "matchedRulesJson" JSONB NOT NULL DEFAULT '[]',
    "outcome" "ToolCallOutcome" NOT NULL,
    "resultJson" JSONB,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ToolCallLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentRunLog" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "userMessage" TEXT NOT NULL,
    "finalResponse" TEXT,
    "tokenUsageJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentRunLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "McpServerConfig_name_key" ON "McpServerConfig"("name");

-- CreateIndex
CREATE INDEX "Message_conversationId_createdAt_idx" ON "Message"("conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "ApprovalRequest_status_createdAt_idx" ON "ApprovalRequest"("status", "createdAt");

-- CreateIndex
CREATE INDEX "ApprovalRequest_conversationId_createdAt_idx" ON "ApprovalRequest"("conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "ToolCallLog_conversationId_createdAt_idx" ON "ToolCallLog"("conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "ToolCallLog_serverName_toolName_idx" ON "ToolCallLog"("serverName", "toolName");

-- CreateIndex
CREATE INDEX "ToolCallLog_decision_outcome_idx" ON "ToolCallLog"("decision", "outcome");

-- CreateIndex
CREATE INDEX "AgentRunLog_conversationId_createdAt_idx" ON "AgentRunLog"("conversationId", "createdAt");

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalRequest" ADD CONSTRAINT "ApprovalRequest_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ToolCallLog" ADD CONSTRAINT "ToolCallLog_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentRunLog" ADD CONSTRAINT "AgentRunLog_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
