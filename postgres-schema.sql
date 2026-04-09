CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT,
    password_hash TEXT,
    auth_provider TEXT NOT NULL DEFAULT 'local',
    provider_user_id TEXT,
    nickname TEXT,
    locale TEXT NOT NULL DEFAULT 'ko-KR',
    timezone TEXT NOT NULL DEFAULT 'Asia/Seoul',
    status TEXT NOT NULL DEFAULT 'active',
    last_login_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_users_status
        CHECK (status IN ('active', 'deleted', 'suspended')),
    CONSTRAINT chk_users_auth_provider
        CHECK (auth_provider IN ('local', 'google', 'kakao', 'apple'))
);

CREATE UNIQUE INDEX ux_users_lower_email
    ON users (LOWER(email))
    WHERE email IS NOT NULL;

CREATE UNIQUE INDEX ux_users_provider
    ON users (auth_provider, provider_user_id)
    WHERE provider_user_id IS NOT NULL;

CREATE TRIGGER trg_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();

CREATE TABLE waitlist_signups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT NOT NULL,
    source TEXT NOT NULL DEFAULT 'landing',
    note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX ux_waitlist_signups_lower_email
    ON waitlist_signups (LOWER(email));

CREATE TABLE conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    session_id UUID,
    title TEXT,
    source_type TEXT NOT NULL DEFAULT 'manual',
    relationship_stage TEXT NOT NULL,
    meeting_channel TEXT NOT NULL,
    user_goal TEXT NOT NULL,
    save_mode TEXT NOT NULL DEFAULT 'temporary',
    raw_text_redacted TEXT,
    raw_text_storage_expires_at TIMESTAMPTZ,
    analysis_context JSONB NOT NULL DEFAULT '{}'::JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_conversations_owner
        CHECK (user_id IS NOT NULL OR session_id IS NOT NULL),
    CONSTRAINT chk_conversations_source_type
        CHECK (source_type IN ('manual', 'kakao', 'sms', 'dating_app', 'other')),
    CONSTRAINT chk_conversations_relationship_stage
        CHECK (relationship_stage IN (
            'before_meeting',
            'after_first_date',
            'after_second_date',
            'ongoing_chat',
            'cooling_down'
        )),
    CONSTRAINT chk_conversations_meeting_channel
        CHECK (meeting_channel IN (
            'blind_date',
            'dating_app',
            'marriage_agency',
            'mutual_friend',
            'other'
        )),
    CONSTRAINT chk_conversations_user_goal
        CHECK (user_goal IN (
            'continue_chat',
            'ask_for_date',
            'evaluate_interest',
            'decide_to_stop'
        )),
    CONSTRAINT chk_conversations_save_mode
        CHECK (save_mode IN ('temporary', 'saved'))
);

CREATE INDEX ix_conversations_user_id_created_at
    ON conversations (user_id, created_at DESC);

CREATE INDEX ix_conversations_session_id_created_at
    ON conversations (session_id, created_at DESC);

CREATE TRIGGER trg_conversations_updated_at
    BEFORE UPDATE ON conversations
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();

CREATE TABLE conversation_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    sender_role TEXT NOT NULL,
    message_text TEXT NOT NULL,
    sent_at TIMESTAMPTZ,
    sequence_no INT NOT NULL,
    message_length INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_conversation_messages_sender_role
        CHECK (sender_role IN ('self', 'other', 'unknown')),
    CONSTRAINT chk_conversation_messages_sequence_no
        CHECK (sequence_no > 0),
    CONSTRAINT chk_conversation_messages_length
        CHECK (message_length >= 0),
    CONSTRAINT uq_conversation_messages_sequence
        UNIQUE (conversation_id, sequence_no)
);

CREATE INDEX ix_conversation_messages_conversation_id_sequence
    ON conversation_messages (conversation_id, sequence_no);

CREATE TABLE analyses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    session_id UUID,
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    analysis_version TEXT NOT NULL DEFAULT 'v1',
    model_name TEXT,
    overall_summary TEXT NOT NULL,
    positive_signal_count INT NOT NULL DEFAULT 0,
    ambiguous_signal_count INT NOT NULL DEFAULT 0,
    caution_signal_count INT NOT NULL DEFAULT 0,
    confidence_level TEXT NOT NULL DEFAULT 'medium',
    recommended_action TEXT NOT NULL,
    recommended_action_reason TEXT NOT NULL,
    analysis_status TEXT NOT NULL DEFAULT 'queued',
    error_message TEXT,
    analysis_meta JSONB NOT NULL DEFAULT '{}'::JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    CONSTRAINT chk_analyses_owner
        CHECK (user_id IS NOT NULL OR session_id IS NOT NULL),
    CONSTRAINT chk_analyses_positive_signal_count
        CHECK (positive_signal_count >= 0),
    CONSTRAINT chk_analyses_ambiguous_signal_count
        CHECK (ambiguous_signal_count >= 0),
    CONSTRAINT chk_analyses_caution_signal_count
        CHECK (caution_signal_count >= 0),
    CONSTRAINT chk_analyses_confidence_level
        CHECK (confidence_level IN ('low', 'medium', 'high')),
    CONSTRAINT chk_analyses_analysis_status
        CHECK (analysis_status IN ('queued', 'processing', 'completed', 'failed')),
    CONSTRAINT chk_analyses_recommended_action
        CHECK (recommended_action IN (
            'keep_light',
            'suggest_date',
            'slow_down',
            'wait_for_response',
            'consider_stopping'
        ))
);

CREATE INDEX ix_analyses_user_id_created_at
    ON analyses (user_id, created_at DESC);

CREATE INDEX ix_analyses_session_id_created_at
    ON analyses (session_id, created_at DESC);

CREATE INDEX ix_analyses_conversation_id_created_at
    ON analyses (conversation_id, created_at DESC);

CREATE TABLE analysis_signals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    analysis_id UUID NOT NULL REFERENCES analyses(id) ON DELETE CASCADE,
    signal_type TEXT NOT NULL,
    signal_key TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    evidence_text TEXT NOT NULL,
    confidence_level TEXT NOT NULL DEFAULT 'medium',
    metrics JSONB NOT NULL DEFAULT '{}'::JSONB,
    display_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_analysis_signals_signal_type
        CHECK (signal_type IN ('positive', 'ambiguous', 'caution')),
    CONSTRAINT chk_analysis_signals_confidence_level
        CHECK (confidence_level IN ('low', 'medium', 'high')),
    CONSTRAINT chk_analysis_signals_display_order
        CHECK (display_order >= 0)
);

CREATE INDEX ix_analysis_signals_analysis_id_display_order
    ON analysis_signals (analysis_id, display_order);

CREATE TABLE analysis_recommendations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    analysis_id UUID NOT NULL REFERENCES analyses(id) ON DELETE CASCADE,
    recommendation_type TEXT NOT NULL,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    rationale TEXT NOT NULL,
    tone_label TEXT,
    display_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_analysis_recommendations_type
        CHECK (recommendation_type IN ('next_message', 'tone_guide', 'avoid_phrase')),
    CONSTRAINT chk_analysis_recommendations_display_order
        CHECK (display_order >= 0)
);

CREATE INDEX ix_analysis_recommendations_analysis_id_display_order
    ON analysis_recommendations (analysis_id, display_order);

CREATE TABLE subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    plan_code TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',
    billing_provider TEXT NOT NULL,
    provider_subscription_id TEXT,
    current_period_start TIMESTAMPTZ NOT NULL,
    current_period_end TIMESTAMPTZ NOT NULL,
    cancel_at_period_end BOOLEAN NOT NULL DEFAULT FALSE,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ended_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_subscriptions_status
        CHECK (status IN ('active', 'canceled', 'expired', 'paused')),
    CONSTRAINT chk_subscriptions_billing_provider
        CHECK (billing_provider IN ('stripe', 'toss', 'manual'))
);

CREATE INDEX ix_subscriptions_user_id_status
    ON subscriptions (user_id, status);

CREATE UNIQUE INDEX ux_subscriptions_provider_subscription_id
    ON subscriptions (provider_subscription_id)
    WHERE provider_subscription_id IS NOT NULL;

CREATE TRIGGER trg_subscriptions_updated_at
    BEFORE UPDATE ON subscriptions
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();

CREATE TABLE payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    analysis_id UUID REFERENCES analyses(id) ON DELETE SET NULL,
    subscription_id UUID REFERENCES subscriptions(id) ON DELETE SET NULL,
    payment_provider TEXT NOT NULL,
    provider_payment_id TEXT NOT NULL,
    amount INT NOT NULL,
    currency TEXT NOT NULL DEFAULT 'KRW',
    payment_status TEXT NOT NULL DEFAULT 'pending',
    paid_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_payments_amount
        CHECK (amount >= 0),
    CONSTRAINT chk_payments_provider
        CHECK (payment_provider IN ('stripe', 'toss', 'manual')),
    CONSTRAINT chk_payments_status
        CHECK (payment_status IN ('pending', 'paid', 'failed', 'refunded'))
);

CREATE UNIQUE INDEX ux_payments_provider_payment_id
    ON payments (provider_payment_id);

CREATE INDEX ix_payments_user_id_created_at
    ON payments (user_id, created_at DESC);
