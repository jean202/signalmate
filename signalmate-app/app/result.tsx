import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  Clipboard,
  Alert,
} from 'react-native';
import type { Signal, Recommendation } from '../lib/api';

const SIGNAL_CONFIG = {
  positive: { bg: '#f0fdf4', border: '#86efac', badge: '#16a34a', label: '긍정' },
  caution: { bg: '#fff7ed', border: '#fdba74', badge: '#ea580c', label: '주의' },
  ambiguous: { bg: '#f8fafc', border: '#cbd5e1', badge: '#64748b', label: '애매' },
};

export default function ResultScreen() {
  const { signals: rawSignals, recommendations: rawRecs } = useLocalSearchParams<{
    signals: string;
    recommendations: string;
  }>();
  const router = useRouter();

  const signals: Signal[] = rawSignals ? JSON.parse(rawSignals) : [];
  const recommendations: Recommendation[] = rawRecs ? JSON.parse(rawRecs) : [];

  const positiveCount = signals.filter((s) => s.type === 'positive').length;
  const cautionCount = signals.filter((s) => s.type === 'caution').length;

  function copyMessage(text: string) {
    Clipboard.setString(text);
    Alert.alert('복사됨', '메시지가 클립보드에 복사됐어요.');
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.container}>
        {/* 요약 배너 */}
        <View style={styles.summary}>
          <Text style={styles.summaryTitle}>분석 완료</Text>
          <View style={styles.summaryRow}>
            <SummaryBadge count={positiveCount} label="긍정 신호" color="#16a34a" />
            <SummaryBadge count={cautionCount} label="주의 신호" color="#ea580c" />
            <SummaryBadge count={recommendations.length} label="추천 메시지" color="#2563eb" />
          </View>
        </View>

        {/* 신호 카드 */}
        {signals.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>관계 신호</Text>
            {signals.map((signal) => (
              <SignalCard key={signal.id} signal={signal} />
            ))}
          </>
        )}

        {/* 추천 메시지 */}
        {recommendations.length > 0 && (
          <>
            <Text style={[styles.sectionTitle, { marginTop: 24 }]}>추천 메시지</Text>
            {recommendations.map((rec) => (
              <RecommendationCard key={rec.id} rec={rec} onCopy={copyMessage} />
            ))}
          </>
        )}

        <TouchableOpacity
          style={styles.retryBtn}
          onPress={() => router.replace('/analyze')}
          activeOpacity={0.8}
        >
          <Text style={styles.retryText}>다른 채팅 분석하기</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

function SummaryBadge({ count, label, color }: { count: number; label: string; color: string }) {
  return (
    <View style={styles.badge}>
      <Text style={[styles.badgeCount, { color }]}>{count}</Text>
      <Text style={styles.badgeLabel}>{label}</Text>
    </View>
  );
}

function SignalCard({ signal }: { signal: Signal }) {
  const cfg = SIGNAL_CONFIG[signal.type];
  return (
    <View style={[styles.signalCard, { backgroundColor: cfg.bg, borderColor: cfg.border }]}>
      <View style={styles.signalHeader}>
        <Text style={[styles.signalBadge, { color: cfg.badge }]}>{cfg.label}</Text>
        <Text style={styles.signalLabel}>{signal.label}</Text>
      </View>
      <Text style={styles.signalEvidence}>{signal.evidenceText}</Text>
    </View>
  );
}

function RecommendationCard({
  rec,
  onCopy,
}: {
  rec: Recommendation;
  onCopy: (text: string) => void;
}) {
  return (
    <View style={styles.recCard}>
      <Text style={styles.recMessage}>"{rec.messageText}"</Text>
      {rec.rationale && <Text style={styles.recRationale}>{rec.rationale}</Text>}
      <TouchableOpacity style={styles.copyBtn} onPress={() => onCopy(rec.messageText)} activeOpacity={0.7}>
        <Text style={styles.copyText}>복사</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#fff' },
  container: { padding: 24, paddingBottom: 48 },
  summary: {
    backgroundColor: '#f8f8f8',
    borderRadius: 16,
    padding: 20,
    marginBottom: 24,
  },
  summaryTitle: { fontSize: 15, fontWeight: '700', color: '#111', marginBottom: 12 },
  summaryRow: { flexDirection: 'row', gap: 16 },
  badge: { alignItems: 'center', flex: 1 },
  badgeCount: { fontSize: 28, fontWeight: '800' },
  badgeLabel: { fontSize: 11, color: '#666', marginTop: 2 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#111', marginBottom: 12 },
  signalCard: {
    borderWidth: 1.5,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
  },
  signalHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  signalBadge: { fontSize: 12, fontWeight: '700' },
  signalLabel: { fontSize: 14, fontWeight: '600', color: '#111', flex: 1 },
  signalEvidence: { fontSize: 13, color: '#555', lineHeight: 20 },
  recCard: {
    borderWidth: 1.5,
    borderColor: '#e0e7ff',
    backgroundColor: '#f5f7ff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  recMessage: { fontSize: 15, color: '#111', lineHeight: 22, marginBottom: 8, fontStyle: 'italic' },
  recRationale: { fontSize: 12, color: '#666', marginBottom: 10, lineHeight: 18 },
  copyBtn: {
    alignSelf: 'flex-end',
    backgroundColor: '#2563eb',
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 8,
  },
  copyText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  retryBtn: {
    marginTop: 32,
    borderWidth: 1.5,
    borderColor: '#111',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  retryText: { color: '#111', fontSize: 16, fontWeight: '600' },
});
