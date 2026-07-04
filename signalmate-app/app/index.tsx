import { useRouter } from 'expo-router';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
} from 'react-native';

export default function HomeScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.hero}>
        <Text style={styles.logo}>💌 SignalMate</Text>
        <Text style={styles.tagline}>
          소개팅·썸 채팅을 붙여넣으면{'\n'}관계 신호를 분석해드려요
        </Text>
      </View>

      <View style={styles.features}>
        <FeatureItem icon="🔍" text="채팅 속 관심·주의 신호 감지" />
        <FeatureItem icon="📊" text="근거 기반 해석 (감이 아닌 패턴)" />
        <FeatureItem icon="💬" text="다음 메시지 추천" />
      </View>

      <TouchableOpacity
        style={styles.cta}
        onPress={() => router.push('/analyze')}
        activeOpacity={0.85}
      >
        <Text style={styles.ctaText}>채팅 분석 시작하기</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

function FeatureItem({ icon, text }: { icon: string; text: string }) {
  return (
    <View style={styles.featureRow}>
      <Text style={styles.featureIcon}>{icon}</Text>
      <Text style={styles.featureText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    paddingHorizontal: 24,
    justifyContent: 'space-between',
    paddingVertical: 48,
  },
  hero: {
    marginTop: 40,
    gap: 16,
  },
  logo: {
    fontSize: 28,
    fontWeight: '800',
    color: '#111',
  },
  tagline: {
    fontSize: 18,
    color: '#444',
    lineHeight: 28,
  },
  features: {
    gap: 16,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#f8f8f8',
    padding: 16,
    borderRadius: 12,
  },
  featureIcon: {
    fontSize: 22,
  },
  featureText: {
    fontSize: 15,
    color: '#333',
    fontWeight: '500',
  },
  cta: {
    backgroundColor: '#111',
    paddingVertical: 18,
    borderRadius: 14,
    alignItems: 'center',
  },
  ctaText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '700',
  },
});
