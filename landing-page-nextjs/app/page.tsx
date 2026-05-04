import Link from "next/link";
import styles from "./page.module.css";
import { WaitlistForm } from "@/components/waitlist-form";

const proofPoints = [
  "감이 아니라, 대화 속 진짜 신호를 봐요",
  "회원가입 없이 바로 시작할 수 있어요",
  "다음에 뭐라고 보낼지까지 알려드려요",
];

const painPoints = [
  "답장은 오는데 약속은 흐려진다",
  "예의상 대화인지 실제 관심인지 헷갈린다",
  "첫 만남 후 어떤 메시지를 보내야 할지 모르겠다",
  "결국 친구에게 채팅 캡처를 보내고 의견을 구한다",
];

const signalCards = [
  {
    label: "좋은 신호",
    count: "04",
    title: "대화를 끊지 않고 이어가고 있어요",
    body: "답장이 짧더라도 끝까지 답을 해주고 있어요. 마음을 닫은 건 아니라는 뜻이에요.",
  },
  {
    label: "애매한 신호",
    count: "02",
    title: "질문을 잘 되묻지는 않아요",
    body: "관심이 없는 건 아니지만, 먼저 알아가려는 적극성은 아직 약해요. 지금은 가볍게 분위기를 유지하는 게 좋아요.",
  },
  {
    label: "조심할 신호",
    count: "01",
    title: "약속을 구체적으로 안 잡고 있어요",
    body: "대화는 이어지는데 만나자는 얘기는 흐려져요. 강하게 제안하기보다 공통 관심사로 자연스럽게 다시 연결해보세요.",
  },
];

const steps = [
  {
    number: "01",
    title: "대화를 붙여넣어요",
    body: "카카오톡이든 문자든 소개팅 앱이든, 그냥 그대로 복사해서 넣어주세요.",
  },
  {
    number: "02",
    title: "지금 상황을 골라요",
    body: "첫 만남 전인지, 애프터 고민 중인지, 분위기가 식는 것 같은지 선택해주세요.",
  },
  {
    number: "03",
    title: "결과랑 다음 메시지를 확인해요",
    body: "신호 분석부터 바로 복사해서 보낼 수 있는 메시지까지 한 번에 보여드려요.",
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
    note: "처음이세요? 가볍게 시작해보세요",
    items: ["간단 분석 1회", "신호 요약 확인", "저장 없이 바로 이용"],
  },
  {
    name: "Deep Read",
    price: "3,900원~",
    note: "더 자세히 보고 싶을 때",
    items: ["꼼꼼한 분석", "신호별 자세한 이유", "맞춤 메시지 추천"],
  },
  {
    name: "Pulse",
    price: "월 9,900원~",
    note: "자주 쓰시는 분들께",
    items: ["분석 결과 저장", "관계 흐름 한눈에 보기", "메시지 추천 더 다양하게"],
  },
];

const faqs = [
  {
    question: "상대 마음을 정확히 맞혀주나요?",
    answer:
      "아니요. 마음을 함부로 단정하지 않아요. 대신 대화에서 보이는 신호들을 차근차근 알려드려요. 결국 결정하는 건 본인이니까요.",
  },
  {
    question: "카카오톡이랑 연동해야 하나요?",
    answer:
      "아니요, 그냥 대화를 복사해서 붙여넣기만 하면 돼요. 별도 연동이나 로그인 없이 바로 써보실 수 있어요.",
  },
  {
    question: "제가 넣은 대화는 저장되나요?",
    answer:
      "기본은 저장하지 않아요. 원하실 때만 직접 선택해서 저장하실 수 있으니까 안심하고 사용하세요.",
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
            <a href="#method">어떻게 동작해요?</a>
            <a href="#pricing">요금제</a>
            <a href="#waitlist" className={styles.navButton}>
              먼저 써보기
            </a>
          </nav>
        </header>

        <div className={styles.heroGrid}>
          <div className={styles.heroCopy}>
            <p className={styles.eyebrow}>이 사람, 진짜 나한테 관심 있을까?</p>
            <h1 className={styles.title}>
              대화만 보여주세요,
              <br />
              마음을 읽어드릴게요
            </h1>
            <p className={styles.description}>
              소개팅, 썸, 연애 초기. 답장은 오는데 마음은 모르겠는 그 순간,
              대화 속 신호를 읽고 어떻게 답하면 좋을지까지 알려드려요.
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
              <span className={styles.panelKicker}>분석 결과 미리보기</span>
              <span className={styles.panelScore}>좋은 신호 4 · 애매한 신호 2 · 조심 1</span>
            </div>
            <div className={styles.panelSummary}>
              대화는 잘 이어지고 있지만, 아직 확신은 이른 단계예요.
              지금은 부담 없이 가볍게 이어가는 게 좋겠어요.
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
              💡 너무 들이대기보다, 자연스럽게 공통 관심사로 다시 말 걸어보세요
            </div>
          </aside>
        </div>
      </section>

      <section className={styles.ribbon}>
        <div className={styles.ribbonTrack}>
          <span>친구한테 묻는 것보다 또렷하게</span>
          <span>운세 말고, 진짜 대화 분석</span>
          <span>점수가 아니라 이유까지</span>
          <span>다음 메시지까지 함께</span>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionIntro}>
          <p className={styles.sectionLabel}>이런 적 있으시죠?</p>
          <h2>혼자 보기엔 너무 헷갈리는 순간들</h2>
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
          <p className={styles.sectionLabel}>이렇게 도와드려요</p>
          <h2>점수가 아니라, 왜 그렇게 보이는지 함께 알려드려요</h2>
        </div>
        <div className={styles.methodGrid}>
          <article className={styles.methodCard}>
            <h3>좋은 신호 / 애매한 신호 / 조심할 신호</h3>
            <p>
              답장 속도, 질문을 되묻는 빈도, 약속을 잡으려는 의지, 대화를 이어가는
              방식까지 꼼꼼히 봐서 알려드려요.
            </p>
          </article>
          <article className={styles.methodCard}>
            <h3>왜 그렇게 보이는지 설명</h3>
            <p>
              그냥 결과만 던지지 않아요. 어떤 부분에서 그 신호가 보였는지
              구체적인 이유를 함께 보여드려요.
            </p>
          </article>
          <article className={styles.methodCard}>
            <h3>지금 보낼 메시지 제안</h3>
            <p>
              가볍게 이어갈까? 만나자고 해볼까? 아니면 좀 기다려볼까?
              상황에 맞는 메시지를 바로 복사해서 쓸 수 있게 드려요.
            </p>
          </article>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionIntro}>
          <p className={styles.sectionLabel}>딱 3단계</p>
          <h2>1분이면 충분해요</h2>
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
          <p className={styles.sectionLabel}>결과 미리보기</p>
          <h2>한눈에 알아보고, 바로 메시지를 보낼 수 있어요</h2>
        </div>
        <div className={styles.previewGrid}>
          <div className={styles.previewBoard}>
            <div className={styles.previewBoardHeader}>
              <span>오늘 대화 분석 결과</span>
              <strong>조심스럽게 분석</strong>
            </div>
            <p className={styles.previewBoardSummary}>
              관심은 분명히 있어 보이지만, 아직은 서로 알아가는 단계예요.
              너무 앞서가기보다 지금 분위기를 잘 유지해보세요.
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
              <span>이렇게 보내보세요</span>
              <strong>가볍게 이어가기</strong>
            </div>
            <ul className={styles.recommendationList}>
              {recommendations.map((message) => (
                <li key={message}>{message}</li>
              ))}
            </ul>
            <p className={styles.recommendationHint}>
              💌 지금은 마음을 너무 진하게 표현하기보단, 공통 관심사로 자연스럽게 이어가는 게 좋아요.
            </p>
          </div>
        </div>
      </section>

      <section className={styles.section} id="pricing">
        <div className={styles.sectionIntro}>
          <p className={styles.sectionLabel}>요금제</p>
          <h2>필요한 만큼만, 부담 없이</h2>
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
          <p className={styles.sectionLabel}>자주 묻는 질문</p>
          <h2>궁금한 점이 있으세요?</h2>
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
            <p className={styles.sectionLabel}>먼저 만나보세요</p>
            <h2>가장 먼저 써보실 분들을 모십니다</h2>
            <p>
              소개팅 후 답장 분석, 애프터 고민, 다음 메시지 추천. 진짜 필요한 순간에
              가장 먼저 SignalMate를 써보실 수 있도록 준비 중이에요.
              이메일을 남겨주시면 오픈하자마자 알려드릴게요.
            </p>
          </div>
          <WaitlistForm />
        </div>
      </section>
    </main>
  );
}
