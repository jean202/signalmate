import Link from "next/link";
import styles from "./page.module.css";
import { WaitlistForm } from "@/components/waitlist-form";

const proofPoints = [
  "점술형 판정이 아니라 대화 패턴 기반 해석",
  "비저장 모드 기준으로 첫 분석 가능",
  "결과만이 아니라 다음 메시지까지 제안",
];

const painPoints = [
  "답장은 오는데 약속은 흐려진다",
  "예의상 대화인지 실제 관심인지 헷갈린다",
  "첫 만남 후 어떤 메시지를 보내야 할지 모르겠다",
  "결국 친구에게 채팅 캡처를 보내고 의견을 구한다",
];

const signalCards = [
  {
    label: "Positive",
    count: "04",
    title: "대화를 끊지 않고 이어가고 있어요",
    body: "상대는 답장이 길지 않아도 흐름을 끊지 않고 다시 반응합니다. 관계를 완전히 닫은 패턴은 아닙니다.",
  },
  {
    label: "Ambiguous",
    count: "02",
    title: "질문을 되돌려주는 비율은 낮아요",
    body: "호감은 있을 수 있지만 주도적 탐색 단계로 보기는 어렵습니다. 지금은 가볍게 온도를 유지하는 편이 자연스럽습니다.",
  },
  {
    label: "Caution",
    count: "01",
    title: "약속 구체화는 아직 약합니다",
    body: "대화 자체는 이어지지만 일정 확정 의지가 충분히 드러나지 않습니다. 강한 제안보다 공통 화제를 활용한 연결이 더 적합합니다.",
  },
];

const steps = [
  {
    number: "01",
    title: "채팅을 붙여넣습니다",
    body: "카카오톡, 문자, 소개팅 앱 대화를 그대로 넣을 수 있습니다.",
  },
  {
    number: "02",
    title: "지금 상황을 선택합니다",
    body: "첫 만남 전인지, 애프터 전인지, 관계가 식는 중인지 간단히 선택합니다.",
  },
  {
    number: "03",
    title: "신호와 다음 액션을 확인합니다",
    body: "긍정, 애매, 주의 신호와 바로 보낼 수 있는 메시지 제안을 함께 봅니다.",
  },
];

const recommendations = [
  "오늘 얘기했던 전시 생각보다 계속 기억나네요. 다음에 시간 맞으면 다른 곳도 같이 가보면 재밌을 것 같아요.",
  "이번 주는 바쁘셨죠? 조금 여유 생기면 지난번 이야기한 곳 같이 가볼까요?",
  "가볍게 이어가고 싶어서 그런데, 지난번 그 얘기 생각나서 웃겼어요.",
];

const plans = [
  {
    name: "Lite",
    price: "무료",
    note: "처음 써보는 사용자용",
    items: ["간단 분석 1회", "신호 요약 확인", "비저장 모드 지원"],
  },
  {
    name: "Deep Read",
    price: "3,900원~",
    note: "한 번 더 정확히 보고 싶을 때",
    items: ["심화 분석", "근거 카드 전체 공개", "다음 메시지 추천"],
  },
  {
    name: "Pulse",
    price: "월 9,900원~",
    note: "반복적으로 쓰는 사용자용",
    items: ["분석 저장", "관계 타임라인", "메시지 추천 확장"],
  },
];

const faqs = [
  {
    question: "상대의 진짜 마음을 맞혀주나요?",
    answer:
      "아니요. SignalMate는 상대 감정을 단정하지 않습니다. 대신 채팅 속 패턴을 근거로 관계 신호를 구조화해 보여줍니다.",
  },
  {
    question: "카카오톡 연동이 필요한가요?",
    answer:
      "초기 버전은 붙여넣기 방식으로 시작하는 것이 적합합니다. 메신저 연동 없이도 빠르게 체험할 수 있습니다.",
  },
  {
    question: "채팅 내용이 저장되나요?",
    answer:
      "비저장 모드를 기본 흐름 중 하나로 두고, 저장 여부는 사용자가 직접 선택하도록 설계합니다.",
  },
];

export default function Home() {
  return (
    <main className={styles.page}>
      <div className={styles.backgroundGlow} />
      <section className={styles.hero}>
        <header className={styles.topbar}>
          <div className={styles.brand}>
            <span className={styles.brandMark}>S</span>
            <span className={styles.brandText}>SignalMate</span>
          </div>
          <nav className={styles.nav}>
            <a href="#method">How It Works</a>
            <a href="#pricing">Pricing</a>
            <a href="#waitlist" className={styles.navButton}>
              Early Access
            </a>
          </nav>
        </header>

        <div className={styles.heroGrid}>
          <div className={styles.heroCopy}>
            <p className={styles.eyebrow}>CHAT-BASED RELATIONSHIP SIGNALS</p>
            <h1 className={styles.title}>
              채팅 속 관계 신호를 읽고,
              <br />
              다음 메시지까지 정리해줍니다
            </h1>
            <p className={styles.description}>
              소개팅, 썸, 연애 초기 단계의 대화를 바탕으로 긍정 신호, 애매한 신호,
              주의 신호를 나눠 보여주고 지금 어떤 메시지를 보내면 좋은지 제안합니다.
            </p>
            <div className={styles.heroActions}>
              <Link href="/analyze" className={styles.primaryCta}>
                채팅 분석 시작하기
              </Link>
              <a href="#preview" className={styles.secondaryCta}>
                결과 예시 보기
              </a>
            </div>
            <ul className={styles.proofList}>
              {proofPoints.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>

          <aside className={styles.heroPanel}>
            <div className={styles.panelHeader}>
              <span className={styles.panelKicker}>ANALYSIS SNAPSHOT</span>
              <span className={styles.panelScore}>관심 신호 4 / 애매 2 / 주의 1</span>
            </div>
            <div className={styles.panelSummary}>
              상대는 대화를 닫지 않고 이어가고 있지만, 아직 적극적인 확신 단계는 아닙니다.
              지금은 부담 없이 온도를 유지하는 메시지가 맞습니다.
            </div>
            <div className={styles.panelSignals}>
              {signalCards.map((card) => (
                <article key={card.title} className={styles.signalCard}>
                  <div className={styles.signalMeta}>
                    <span>{card.label}</span>
                    <strong>{card.count}</strong>
                  </div>
                  <h2>{card.title}</h2>
                  <p>{card.body}</p>
                </article>
              ))}
            </div>
            <div className={styles.panelFootnote}>
              추천 액션: 강하게 밀기보다 공통 화제로 자연스럽게 다시 연결하기
            </div>
          </aside>
        </div>
      </section>

      <section className={styles.ribbon}>
        <div className={styles.ribbonTrack}>
          <span>친구 조언보다 구조적</span>
          <span>점술보다 현실적</span>
          <span>숫자보다 근거 중심</span>
          <span>결과보다 행동 제안</span>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionIntro}>
          <p className={styles.sectionLabel}>WHY THIS EXISTS</p>
          <h2>이런 순간 때문에 사람들은 결국 채팅 캡처를 친구에게 보냅니다</h2>
        </div>
        <div className={styles.painGrid}>
          {painPoints.map((point, index) => (
            <article key={point} className={styles.painCard}>
              <span className={styles.painIndex}>0{index + 1}</span>
              <p>{point}</p>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.section} id="method">
        <div className={styles.sectionIntro}>
          <p className={styles.sectionLabel}>SIGNAL OVER FORTUNE</p>
          <h2>숫자만 던지지 않고, 왜 그렇게 보였는지 설명합니다</h2>
        </div>
        <div className={styles.methodGrid}>
          <article className={styles.methodCard}>
            <h3>긍정 / 애매 / 주의 신호 분리</h3>
            <p>
              답장 템포, 질문 비율, 약속 구체성, 후속 반응 흐름을 기준으로 관계
              신호를 나눠 보여줍니다.
            </p>
          </article>
          <article className={styles.methodCard}>
            <h3>근거 카드 제공</h3>
            <p>
              결과마다 어떤 패턴을 보고 그렇게 해석했는지 문장 근거를 함께
              제시합니다.
            </p>
          </article>
          <article className={styles.methodCard}>
            <h3>다음 메시지 추천</h3>
            <p>
              지금은 가볍게 이어갈지, 약속을 제안할지, 텀을 둘지 상황별로 바로
              써먹을 수 있는 액션을 줍니다.
            </p>
          </article>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionIntro}>
          <p className={styles.sectionLabel}>THREE STEPS</p>
          <h2>분석까지 걸리는 흐름은 짧아야 합니다</h2>
        </div>
        <div className={styles.stepsGrid}>
          {steps.map((step) => (
            <article key={step.number} className={styles.stepCard}>
              <span className={styles.stepNumber}>{step.number}</span>
              <h3>{step.title}</h3>
              <p>{step.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.previewSection} id="preview">
        <div className={styles.sectionIntro}>
          <p className={styles.sectionLabel}>RESULT PREVIEW</p>
          <h2>결과는 한눈에 읽히고, 바로 행동으로 이어져야 합니다</h2>
        </div>
        <div className={styles.previewGrid}>
          <div className={styles.previewBoard}>
            <div className={styles.previewBoardHeader}>
              <span>오늘 대화 분석 결과</span>
              <strong>Medium confidence</strong>
            </div>
            <p className={styles.previewBoardSummary}>
              관심 신호는 분명히 보이지만, 지금 단계에서는 강한 확신보다 탐색형
              흐름에 가깝습니다.
            </p>
            <div className={styles.previewSignalList}>
              {signalCards.map((card) => (
                <div key={card.label} className={styles.previewSignalRow}>
                  <span>{card.label}</span>
                  <p>{card.title}</p>
                </div>
              ))}
            </div>
          </div>

          <div className={styles.recommendationPanel}>
            <div className={styles.recommendationHeader}>
              <span>NEXT MESSAGE OPTIONS</span>
              <strong>가볍게 이어가기</strong>
            </div>
            <ul className={styles.recommendationList}>
              {recommendations.map((message) => (
                <li key={message}>{message}</li>
              ))}
            </ul>
            <p className={styles.recommendationHint}>
              지금은 감정 표현을 무겁게 올리기보다, 공통 화제를 활용한 연결이 더
              안전합니다.
            </p>
          </div>
        </div>
      </section>

      <section className={styles.section} id="pricing">
        <div className={styles.sectionIntro}>
          <p className={styles.sectionLabel}>MONETIZATION</p>
          <h2>필요할 때는 가볍게, 반복되면 더 깊게</h2>
        </div>
        <div className={styles.pricingGrid}>
          {plans.map((plan) => (
            <article key={plan.name} className={styles.planCard}>
              <div className={styles.planHeader}>
                <h3>{plan.name}</h3>
                <p>{plan.note}</p>
              </div>
              <strong className={styles.planPrice}>{plan.price}</strong>
              <ul className={styles.planList}>
                {plan.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionIntro}>
          <p className={styles.sectionLabel}>FAQ</p>
          <h2>신뢰를 깎는 표현보다, 설계 원칙을 먼저 보여줍니다</h2>
        </div>
        <div className={styles.faqList}>
          {faqs.map((faq) => (
            <article key={faq.question} className={styles.faqItem}>
              <h3>{faq.question}</h3>
              <p>{faq.answer}</p>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.waitlistSection} id="waitlist">
        <div className={styles.waitlistCard}>
          <div className={styles.waitlistCopy}>
            <p className={styles.sectionLabel}>EARLY ACCESS</p>
            <h2>애매한 채팅을 감으로만 보지 않으려는 사람들을 먼저 모읍니다</h2>
            <p>
              첫 베타는 소개팅 후속 대화, 애프터 판단, 다음 메시지 추천에 집중합니다.
              대기자 등록을 받아 초기 인터뷰와 베타 테스트 대상으로 연결하는 흐름을
              상정했습니다.
            </p>
          </div>
          <WaitlistForm />
        </div>
      </section>
    </main>
  );
}
