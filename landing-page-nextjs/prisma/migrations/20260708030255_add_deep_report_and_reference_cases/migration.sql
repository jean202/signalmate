-- CreateTable
CREATE TABLE "deep_reports" (
    "id" UUID NOT NULL,
    "analysis_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'generating',
    "content_json" JSONB,
    "draft_check_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ(6),

    CONSTRAINT "deep_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reference_cases" (
    "id" UUID NOT NULL,
    "summary_text" TEXT NOT NULL,
    "situation_type" TEXT NOT NULL,
    "outcome_label" TEXT NOT NULL,
    "lesson" TEXT NOT NULL,
    "embedding" vector(1536) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reference_cases_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "deep_reports_analysis_id_key" ON "deep_reports"("analysis_id");

-- CreateIndex
CREATE INDEX "deep_reports_user_id_created_at_idx" ON "deep_reports"("user_id", "created_at" DESC);

-- AddForeignKey
ALTER TABLE "deep_reports" ADD CONSTRAINT "deep_reports_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deep_reports" ADD CONSTRAINT "deep_reports_analysis_id_fkey" FOREIGN KEY ("analysis_id") REFERENCES "analyses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
