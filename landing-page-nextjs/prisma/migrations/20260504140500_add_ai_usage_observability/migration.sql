ALTER TABLE "ai_usage_logs"
    ADD COLUMN "cache_read_input_tokens" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN "cache_creation_input_tokens" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN "retry_count" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN "timeout_ms" INTEGER,
    ADD COLUMN "fallback_stage" TEXT,
    ADD COLUMN "quality_warnings" JSONB;

CREATE INDEX "ai_usage_logs_chain_step_created_at_idx"
    ON "ai_usage_logs"("chain_step", "created_at" DESC);

CREATE INDEX "ai_usage_logs_fallback_stage_created_at_idx"
    ON "ai_usage_logs"("fallback_stage", "created_at" DESC);
