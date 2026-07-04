const BASE_URL = 'https://landing-page-nextjs-rust-six.vercel.app/api/v1';

export type ContextType =
  | 'first_date_followup'
  | 'some_stage'
  | 'dating_app'
  | 'acquaintance';

export interface Signal {
  id: string;
  type: 'positive' | 'caution' | 'ambiguous';
  label: string;
  evidenceText: string;
  confidence: number;
}

export interface Recommendation {
  id: string;
  messageText: string;
  tone: string;
  rationale: string;
}

export interface AnalysisResult {
  analysisId: string;
  overallSentiment: 'positive' | 'neutral' | 'negative';
  signals: Signal[];
  recommendations: Recommendation[];
}

export async function createConversation(rawText: string): Promise<string> {
  const res = await fetch(`${BASE_URL}/conversations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rawText }),
  });
  if (!res.ok) throw new Error('대화 생성 실패');
  const data = await res.json();
  return data.id;
}

export async function runAnalysis(
  conversationId: string,
  context: ContextType,
  onSignals: (signals: Signal[]) => void,
  onRecommendations: (recs: Recommendation[]) => void,
): Promise<void> {
  const res = await fetch(
    `${BASE_URL}/conversations/${conversationId}/analyses/stream`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ context, mode: 'hybrid' }),
    },
  );

  if (!res.ok) throw new Error('분석 실패');

  const reader = res.body?.getReader();
  const decoder = new TextDecoder();
  if (!reader) throw new Error('스트림 없음');

  let buffer = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      try {
        const event = JSON.parse(line.slice(6));
        if (event.type === 'rule_complete' || event.type === 'signals_enhanced') {
          if (event.signals) onSignals(event.signals);
        }
        if (event.type === 'recommendations_ready') {
          if (event.recommendations) onRecommendations(event.recommendations);
        }
      } catch {
        // 파싱 실패 무시
      }
    }
  }
}
