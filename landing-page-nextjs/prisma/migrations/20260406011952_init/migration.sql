-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "vector";

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('active', 'deleted', 'suspended');

-- CreateEnum
CREATE TYPE "AuthProvider" AS ENUM ('local', 'google', 'kakao', 'apple');

-- CreateEnum
CREATE TYPE "SourceType" AS ENUM ('manual', 'kakao', 'sms', 'dating_app', 'other');

-- CreateEnum
CREATE TYPE "RelationshipStage" AS ENUM ('before_meeting', 'after_first_date', 'after_second_date', 'ongoing_chat', 'cooling_down');

-- CreateEnum
CREATE TYPE "MeetingChannel" AS ENUM ('blind_date', 'dating_app', 'marriage_agency', 'mutual_friend', 'other');

-- CreateEnum
CREATE TYPE "UserGoal" AS ENUM ('continue_chat', 'ask_for_date', 'evaluate_interest', 'decide_to_stop');

-- CreateEnum
CREATE TYPE "SaveMode" AS ENUM ('temporary', 'saved');

-- CreateEnum
CREATE TYPE "SenderRole" AS ENUM ('self', 'other', 'unknown');

-- CreateEnum
CREATE TYPE "ConfidenceLevel" AS ENUM ('low', 'medium', 'high');

-- CreateEnum
CREATE TYPE "RecommendedAction" AS ENUM ('keep_light', 'suggest_date', 'slow_down', 'wait_for_response', 'consider_stopping');

-- CreateEnum
CREATE TYPE "AnalysisStatus" AS ENUM ('queued', 'processing', 'completed', 'failed');

-- CreateEnum
CREATE TYPE "SignalType" AS ENUM ('positive', 'ambiguous', 'caution');

-- CreateEnum
CREATE TYPE "RecommendationType" AS ENUM ('next_message', 'tone_guide', 'avoid_phrase');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('active', 'canceled', 'expired', 'paused');

-- CreateEnum
CREATE TYPE "BillingProvider" AS ENUM ('stripe', 'toss', 'manual');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('pending', 'paid', 'failed', 'refunded');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT,
    "password_hash" TEXT,
    "auth_provider" "AuthProvider" NOT NULL DEFAULT 'local',
    "provider_user_id" TEXT,
    "nickname" TEXT,
    "locale" TEXT NOT NULL DEFAULT 'ko-KR',
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Seoul',
    "status" "UserStatus" NOT NULL DEFAULT 'active',
    "last_login_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "waitlist_signups" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'landing',
    "note" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "waitlist_signups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversations" (
    "id" UUID NOT NULL,
    "user_id" UUID,
    "session_id" UUID,
    "title" TEXT,
    "source_type" "SourceType" NOT NULL DEFAULT 'manual',
    "relationship_stage" "RelationshipStage" NOT NULL,
    "meeting_channel" "MeetingChannel" NOT NULL,
    "user_goal" "UserGoal" NOT NULL,
    "save_mode" "SaveMode" NOT NULL DEFAULT 'temporary',
    "raw_text_redacted" TEXT,
    "raw_text_storage_expires_at" TIMESTAMPTZ(6),
    "analysis_context" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversation_messages" (
    "id" UUID NOT NULL,
    "conversation_id" UUID NOT NULL,
    "sender_role" "SenderRole" NOT NULL,
    "message_text" TEXT NOT NULL,
    "sent_at" TIMESTAMPTZ(6),
    "sequence_no" INTEGER NOT NULL,
    "message_length" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conversation_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "analyses" (
    "id" UUID NOT NULL,
    "user_id" UUID,
    "session_id" UUID,
    "conversation_id" UUID NOT NULL,
    "analysis_version" TEXT NOT NULL DEFAULT 'v1',
    "model_name" TEXT,
    "overall_summary" TEXT NOT NULL,
    "positive_signal_count" INTEGER NOT NULL DEFAULT 0,
    "ambiguous_signal_count" INTEGER NOT NULL DEFAULT 0,
    "caution_signal_count" INTEGER NOT NULL DEFAULT 0,
    "confidence_level" "ConfidenceLevel" NOT NULL DEFAULT 'medium',
    "recommended_action" "RecommendedAction" NOT NULL,
    "recommended_action_reason" TEXT NOT NULL,
    "analysis_status" "AnalysisStatus" NOT NULL DEFAULT 'queued',
    "error_message" TEXT,
    "analysis_meta" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ(6),

    CONSTRAINT "analyses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "analysis_signals" (
    "id" UUID NOT NULL,
    "analysis_id" UUID NOT NULL,
    "signal_type" "SignalType" NOT NULL,
    "signal_key" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "evidence_text" TEXT NOT NULL,
    "confidence_level" "ConfidenceLevel" NOT NULL DEFAULT 'medium',
    "metrics" JSONB NOT NULL DEFAULT '{}',
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "analysis_signals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "analysis_recommendations" (
    "id" UUID NOT NULL,
    "analysis_id" UUID NOT NULL,
    "recommendation_type" "RecommendationType" NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "rationale" TEXT NOT NULL,
    "tone_label" TEXT,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "analysis_recommendations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscriptions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "plan_code" TEXT NOT NULL,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'active',
    "billing_provider" "BillingProvider" NOT NULL,
    "provider_subscription_id" TEXT,
    "current_period_start" TIMESTAMPTZ(6) NOT NULL,
    "current_period_end" TIMESTAMPTZ(6) NOT NULL,
    "cancel_at_period_end" BOOLEAN NOT NULL DEFAULT false,
    "started_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ended_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "analysis_id" UUID,
    "subscription_id" UUID,
    "payment_provider" "BillingProvider" NOT NULL,
    "provider_payment_id" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'KRW',
    "payment_status" "PaymentStatus" NOT NULL DEFAULT 'pending',
    "paid_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversation_embeddings" (
    "id" UUID NOT NULL,
    "conversation_id" UUID NOT NULL,
    "summary_text" TEXT NOT NULL,
    "outcome_label" TEXT,
    "embedding" vector(1536) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conversation_embeddings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_usage_logs" (
    "id" UUID NOT NULL,
    "analysis_id" UUID,
    "model_name" TEXT NOT NULL,
    "chain_step" TEXT,
    "input_tokens" INTEGER NOT NULL,
    "output_tokens" INTEGER NOT NULL,
    "total_tokens" INTEGER NOT NULL,
    "cost_usd" DOUBLE PRECISION NOT NULL,
    "duration_ms" INTEGER NOT NULL,
    "success" BOOLEAN NOT NULL DEFAULT true,
    "error_message" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_usage_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "users_email_idx" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_auth_provider_provider_user_id_key" ON "users"("auth_provider", "provider_user_id");

-- CreateIndex
CREATE INDEX "waitlist_signups_email_idx" ON "waitlist_signups"("email");

-- CreateIndex
CREATE INDEX "conversations_user_id_created_at_idx" ON "conversations"("user_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "conversations_session_id_created_at_idx" ON "conversations"("session_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "conversation_messages_conversation_id_sequence_no_idx" ON "conversation_messages"("conversation_id", "sequence_no");

-- CreateIndex
CREATE UNIQUE INDEX "conversation_messages_conversation_id_sequence_no_key" ON "conversation_messages"("conversation_id", "sequence_no");

-- CreateIndex
CREATE INDEX "analyses_user_id_created_at_idx" ON "analyses"("user_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "analyses_session_id_created_at_idx" ON "analyses"("session_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "analyses_conversation_id_created_at_idx" ON "analyses"("conversation_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "analysis_signals_analysis_id_display_order_idx" ON "analysis_signals"("analysis_id", "display_order");

-- CreateIndex
CREATE INDEX "analysis_recommendations_analysis_id_display_order_idx" ON "analysis_recommendations"("analysis_id", "display_order");

-- CreateIndex
CREATE INDEX "subscriptions_user_id_status_idx" ON "subscriptions"("user_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_provider_subscription_id_key" ON "subscriptions"("provider_subscription_id");

-- CreateIndex
CREATE INDEX "payments_user_id_created_at_idx" ON "payments"("user_id", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "payments_provider_payment_id_key" ON "payments"("provider_payment_id");

-- CreateIndex
CREATE UNIQUE INDEX "conversation_embeddings_conversation_id_key" ON "conversation_embeddings"("conversation_id");

-- CreateIndex
CREATE INDEX "ai_usage_logs_analysis_id_idx" ON "ai_usage_logs"("analysis_id");

-- CreateIndex
CREATE INDEX "ai_usage_logs_created_at_idx" ON "ai_usage_logs"("created_at" DESC);

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_messages" ADD CONSTRAINT "conversation_messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analyses" ADD CONSTRAINT "analyses_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analyses" ADD CONSTRAINT "analyses_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analysis_signals" ADD CONSTRAINT "analysis_signals_analysis_id_fkey" FOREIGN KEY ("analysis_id") REFERENCES "analyses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analysis_recommendations" ADD CONSTRAINT "analysis_recommendations_analysis_id_fkey" FOREIGN KEY ("analysis_id") REFERENCES "analyses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_analysis_id_fkey" FOREIGN KEY ("analysis_id") REFERENCES "analyses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "subscriptions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_embeddings" ADD CONSTRAINT "conversation_embeddings_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
