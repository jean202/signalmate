/**
 * 시드 데이터 생성 스크립트.
 *
 * 사용법: npx tsx scripts/seed-embeddings.ts
 *
 * 50건의 샘플 대화를 생성하고 임베딩을 저장합니다.
 * OPENAI_API_KEY 환경변수가 필요합니다.
 */

import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import OpenAI from "openai";

const DATABASE_URL =
  process.env.DATABASE_URL ??
  "postgresql://signalmate:signalmate_local@localhost:5433/signalmate?schema=public";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

if (!OPENAI_API_KEY) {
  console.error("OPENAI_API_KEY is required. Set it in .env.local or pass via environment.");
  process.exit(1);
}

const pool = new Pool({ connectionString: DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });
const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

// ─── 시드 데이터 정의 ────────────────────────────────

type SeedConversation = {
  rawText: string;
  relationshipStage: string;
  meetingChannel: string;
  userGoal: string;
  recommendedAction: string;
  outcomeLabel: string;
  overallSummary: string;
  positiveCount: number;
  ambiguousCount: number;
  cautionCount: number;
  signalTitles: string[];
};

const SEED_DATA: SeedConversation[] = [
  // ── 긍정적 진전 (positive_progress) ──
  {
    rawText: "나: 오늘 즐거웠어요!\n상대: 저도요 ㅎㅎ 다음에 또 만나요\n나: 네! 다음주 토요일 어때요?\n상대: 좋아요 그때 봐요~",
    relationshipStage: "after_first_date", meetingChannel: "blind_date", userGoal: "ask_for_date",
    recommendedAction: "suggest_date", outcomeLabel: "positive_progress",
    overallSummary: "첫 만남 후 상대가 다음 약속에 긍정적으로 응하고 있어요.",
    positiveCount: 3, ambiguousCount: 1, cautionCount: 0,
    signalTitles: ["대화가 이어지고 있어요", "다음 만남에 열려 있어요", "따뜻한 톤이에요"],
  },
  {
    rawText: "나: 주말에 뭐 해요?\n상대: 특별한 계획 없어요! 왜요?\n나: 같이 카페 가볼까요?\n상대: 오 좋아요! 어디로 갈까요?",
    relationshipStage: "ongoing_chat", meetingChannel: "dating_app", userGoal: "ask_for_date",
    recommendedAction: "suggest_date", outcomeLabel: "positive_progress",
    overallSummary: "상대가 만남 제안에 적극적으로 반응하고 장소까지 물어보고 있어요.",
    positiveCount: 3, ambiguousCount: 0, cautionCount: 0,
    signalTitles: ["적극적인 응답", "구체적 질문을 던짐", "빠른 답장"],
  },
  {
    rawText: "나: 어제 영화 재밌었어요\n상대: 진짜 좋았어요! 다음에는 뮤지컬 보러 갈까요?\n나: 오 좋죠!\n상대: 이번 달에 좋은 공연 있는지 찾아볼게요",
    relationshipStage: "after_second_date", meetingChannel: "mutual_friend", userGoal: "continue_chat",
    recommendedAction: "keep_light", outcomeLabel: "positive_progress",
    overallSummary: "상대가 먼저 다음 활동을 제안하고 준비까지 하겠다고 해요.",
    positiveCount: 4, ambiguousCount: 0, cautionCount: 0,
    signalTitles: ["상대가 먼저 제안", "구체적 계획", "주도적인 태도", "기대감 표현"],
  },
  {
    rawText: "나: 오늘 하루 어땠어요?\n상대: 바빴는데 너 생각나서 연락했어\n나: 헐 감동이야\n상대: ㅎㅎ 주말에 보고 싶다",
    relationshipStage: "after_first_date", meetingChannel: "dating_app", userGoal: "evaluate_interest",
    recommendedAction: "suggest_date", outcomeLabel: "positive_progress",
    overallSummary: "상대가 바쁜 중에도 먼저 연락하고 보고 싶다는 감정을 직접 표현했어요.",
    positiveCount: 4, ambiguousCount: 0, cautionCount: 0,
    signalTitles: ["먼저 연락", "감정 직접 표현", "만남 희망", "적극적 관심"],
  },
  {
    rawText: "나: 맛집 추천 좀 해줄래?\n상대: 이태원에 좋은 데 알아! 같이 가볼래?\n나: 오 언제?\n상대: 이번 주 금요일 어때? 내가 예약할게",
    relationshipStage: "ongoing_chat", meetingChannel: "mutual_friend", userGoal: "ask_for_date",
    recommendedAction: "suggest_date", outcomeLabel: "positive_progress",
    overallSummary: "상대가 맛집 질문을 함께 가자는 제안으로 연결하고 예약까지 해주겠다고 해요.",
    positiveCount: 4, ambiguousCount: 0, cautionCount: 0,
    signalTitles: ["데이트로 전환", "주도적 계획", "구체적 일정", "예약 의지"],
  },
  {
    rawText: "나: 사진 잘 찍네요\n상대: 고마워요! 다음에 같이 사진 찍으러 가요\n나: 어디가 좋을까요?\n상대: 한강 노을 예쁘더라고요 ㅎㅎ",
    relationshipStage: "before_meeting", meetingChannel: "dating_app", userGoal: "ask_for_date",
    recommendedAction: "suggest_date", outcomeLabel: "positive_progress",
    overallSummary: "아직 만나기 전인데 상대가 먼저 활동을 제안하고 장소까지 추천해요.",
    positiveCount: 3, ambiguousCount: 1, cautionCount: 0,
    signalTitles: ["활동 제안", "장소 추천", "취미 공유"],
  },
  {
    rawText: "나: 오늘 수고했어\n상대: 고마워 ㅎㅎ 요즘 너랑 얘기하는 게 하루 중 제일 좋은 시간이야\n나: 나도!\n상대: 이번 주 시간 되면 만나자",
    relationshipStage: "ongoing_chat", meetingChannel: "dating_app", userGoal: "evaluate_interest",
    recommendedAction: "suggest_date", outcomeLabel: "positive_progress",
    overallSummary: "상대가 감정을 솔직하게 표현하고 만남을 원하고 있어요.",
    positiveCount: 4, ambiguousCount: 0, cautionCount: 0,
    signalTitles: ["감정 고백", "대화 즐김", "만남 요청", "적극적 표현"],
  },
  {
    rawText: "나: 주말 잘 보냈어?\n상대: 응! 근데 너 없으니까 좀 심심했어\n나: ㅋㅋ 다음엔 같이 놀자\n상대: 무조건! 뭐 하고 싶어?",
    relationshipStage: "after_first_date", meetingChannel: "blind_date", userGoal: "ask_for_date",
    recommendedAction: "suggest_date", outcomeLabel: "positive_progress",
    overallSummary: "상대가 부재를 아쉬워하고 다음 만남에 적극적이에요.",
    positiveCount: 3, ambiguousCount: 0, cautionCount: 0,
    signalTitles: ["부재 아쉬움", "적극적 수락", "활동 제안 요청"],
  },
  {
    rawText: "나: 커피 좋아해요?\n상대: 네! 요즘 핸드드립에 빠졌어요\n나: 오 저도요! 좋은 카페 알아요\n상대: 진짜요? 꼭 데려가 주세요 ㅎㅎ",
    relationshipStage: "before_meeting", meetingChannel: "marriage_agency", userGoal: "ask_for_date",
    recommendedAction: "suggest_date", outcomeLabel: "positive_progress",
    overallSummary: "공통 관심사로 자연스럽게 만남이 성사될 분위기에요.",
    positiveCount: 3, ambiguousCount: 0, cautionCount: 0,
    signalTitles: ["공통 관심사", "만남 요청", "기대감 표현"],
  },
  {
    rawText: "나: 전시회 어땠어?\n상대: 너무 좋았어! 사진 보여줄게\n상대: [사진]\n상대: 다음에 같이 가자 꼭!\n나: 좋지!\n상대: 다음 주 전시도 있던데 ㅎㅎ",
    relationshipStage: "after_first_date", meetingChannel: "mutual_friend", userGoal: "continue_chat",
    recommendedAction: "suggest_date", outcomeLabel: "positive_progress",
    overallSummary: "상대가 사진을 공유하고 다음 만남을 두 번이나 언급했어요.",
    positiveCount: 4, ambiguousCount: 0, cautionCount: 0,
    signalTitles: ["일상 공유", "반복적 만남 언급", "주도적 제안", "기대감"],
  },

  // ── 중립 (neutral) ──
  {
    rawText: "나: 오늘 뭐 했어요?\n상대: 집에서 쉬었어요\n나: 주말에 시간 돼요?\n상대: 글쎄요 아직 모르겠어요",
    relationshipStage: "after_first_date", meetingChannel: "blind_date", userGoal: "ask_for_date",
    recommendedAction: "wait_for_response", outcomeLabel: "neutral",
    overallSummary: "상대가 응답은 하지만 구체적인 약속에는 유보적인 태도예요.",
    positiveCount: 1, ambiguousCount: 2, cautionCount: 0,
    signalTitles: ["응답은 함", "약속 유보", "짧은 답변"],
  },
  {
    rawText: "나: 안녕하세요 프로필 보고 관심이 생겨서 연락드려요\n상대: 안녕하세요 ㅎㅎ\n나: 취미가 뭐예요?\n상대: 운동이요\n나: 어떤 운동이요?\n상대: 헬스요",
    relationshipStage: "before_meeting", meetingChannel: "dating_app", userGoal: "evaluate_interest",
    recommendedAction: "keep_light", outcomeLabel: "neutral",
    overallSummary: "상대가 답하긴 하지만 단답 위주라 아직 관심도를 파악하기 어려워요.",
    positiveCount: 1, ambiguousCount: 2, cautionCount: 1,
    signalTitles: ["응답함", "단답 패턴", "질문 안 함", "짧은 답변"],
  },
  {
    rawText: "나: 지난번에 얘기한 맛집 가볼까요?\n상대: 아 네 좋아요\n나: 이번 주 토요일 어때요?\n상대: 토요일은 좀 힘들 것 같아요\n나: 그럼 언제가 좋아요?\n상대: 다음 주에 확인해 볼게요",
    relationshipStage: "after_first_date", meetingChannel: "mutual_friend", userGoal: "ask_for_date",
    recommendedAction: "wait_for_response", outcomeLabel: "neutral",
    overallSummary: "만남에는 동의하지만 일정을 미루는 패턴이 보여요. 관심은 있으나 우선순위가 아닐 수 있어요.",
    positiveCount: 1, ambiguousCount: 2, cautionCount: 1,
    signalTitles: ["원칙적 동의", "일정 미룸", "구체적 답변 회피", "응답은 함"],
  },
  {
    rawText: "나: 요즘 뭐 보고 있어요?\n상대: 넷플릭스 보고 있어요\n나: 뭐 보는데요?\n상대: 여러 가지요\n나: 추천해줘요!\n상대: 음 나중에 생각나면 말해줄게요",
    relationshipStage: "ongoing_chat", meetingChannel: "dating_app", userGoal: "continue_chat",
    recommendedAction: "slow_down", outcomeLabel: "neutral",
    overallSummary: "대화를 이어가지만 깊이 들어가는 걸 피하는 느낌이에요.",
    positiveCount: 1, ambiguousCount: 2, cautionCount: 1,
    signalTitles: ["답장은 함", "구체적 공유 회피", "나중에로 미룸", "단답 경향"],
  },
  {
    rawText: "나: 오늘 날씨 좋다\n상대: 그러게요\n나: 나가고 싶다\n상대: ㅎㅎ\n나: 같이 나갈래요?\n상대: 오늘은 좀 피곤해요",
    relationshipStage: "after_first_date", meetingChannel: "blind_date", userGoal: "ask_for_date",
    recommendedAction: "wait_for_response", outcomeLabel: "neutral",
    overallSummary: "가벼운 대화에는 응하지만 만남 제안에는 사양하고 있어요.",
    positiveCount: 1, ambiguousCount: 1, cautionCount: 1,
    signalTitles: ["대화 응답", "만남 거절", "피곤 핑계"],
  },
  {
    rawText: "나: 주말에 전시회 가는데 같이 갈래요?\n상대: 전시회 좋죠! 근데 이번 주는 선약이 있어요\n나: 다음에 가요!\n상대: 네 다음에요!",
    relationshipStage: "ongoing_chat", meetingChannel: "mutual_friend", userGoal: "ask_for_date",
    recommendedAction: "wait_for_response", outcomeLabel: "neutral",
    overallSummary: "관심은 보이지만 선약을 이유로 미루고 있어요. 다음 제안에 어떻게 반응하는지가 중요해요.",
    positiveCount: 1, ambiguousCount: 2, cautionCount: 0,
    signalTitles: ["관심 표현", "일정 거절", "다음으로 미룸"],
  },
  {
    rawText: "나: 점심 뭐 먹었어요?\n상대: 김치찌개요\n나: 맛있었어요?\n상대: 네\n나: 저는 파스타 먹었어요\n상대: 아 그래요",
    relationshipStage: "before_meeting", meetingChannel: "marriage_agency", userGoal: "evaluate_interest",
    recommendedAction: "keep_light", outcomeLabel: "neutral",
    overallSummary: "기본적인 대화는 하지만 상대가 대화를 확장하려는 노력이 없어요.",
    positiveCount: 0, ambiguousCount: 2, cautionCount: 1,
    signalTitles: ["단답 응답", "질문 없음", "소극적 참여"],
  },
  {
    rawText: "나: 영화 좋아해요?\n상대: 네 좋아해요\n나: 어떤 장르요?\n상대: 액션이요\n나: 요즘 괜찮은 거 있나 보러 갈까요?\n상대: 생각해 볼게요",
    relationshipStage: "before_meeting", meetingChannel: "dating_app", userGoal: "ask_for_date",
    recommendedAction: "wait_for_response", outcomeLabel: "neutral",
    overallSummary: "취미 얘기는 하지만 만남에 대해서는 확답을 주지 않고 있어요.",
    positiveCount: 1, ambiguousCount: 2, cautionCount: 0,
    signalTitles: ["취미 공유", "만남 유보", "생각해 볼게요 패턴"],
  },
  {
    rawText: "나: 오늘 하루 어땠어?\n상대: 평범했어\n나: 뭐 특별한 거 없었어?\n상대: 딱히\n나: 주말에 뭐 할 거야?\n상대: 아직 모르겠어",
    relationshipStage: "ongoing_chat", meetingChannel: "dating_app", userGoal: "evaluate_interest",
    recommendedAction: "slow_down", outcomeLabel: "neutral",
    overallSummary: "대화에 성의가 부족하고 단답 위주예요. 관심이 낮을 수 있어요.",
    positiveCount: 0, ambiguousCount: 2, cautionCount: 2,
    signalTitles: ["단답 반복", "무관심한 톤", "계획 없음", "질문 안 함"],
  },
  {
    rawText: "나: 이번 주 카페 어때요?\n상대: 이번 주는 좀 바빠요\n나: 다음 주는요?\n상대: 다음 주도 아직 모르겠네요 스케줄 나오면 알려줄게요\n나: 네 알겠어요!\n상대: 네!",
    relationshipStage: "after_first_date", meetingChannel: "marriage_agency", userGoal: "ask_for_date",
    recommendedAction: "wait_for_response", outcomeLabel: "neutral",
    overallSummary: "두 번 연속 일정을 미루고 있어요. 거절은 아니지만 우선순위가 낮을 수 있어요.",
    positiveCount: 0, ambiguousCount: 2, cautionCount: 1,
    signalTitles: ["연속 미룸", "불확실한 답변", "알려줄게요 패턴"],
  },

  // ── 부정적 (negative) ──
  {
    rawText: "나: 안녕하세요!\n상대: 네\n나: 프로필 보니까 취미가 같아서 반가워요\n상대: 아 그렇군요",
    relationshipStage: "before_meeting", meetingChannel: "dating_app", userGoal: "evaluate_interest",
    recommendedAction: "consider_stopping", outcomeLabel: "negative",
    overallSummary: "상대의 관심이 매우 낮아 보여요. 단답과 무관심한 반응이 지속되고 있어요.",
    positiveCount: 0, ambiguousCount: 0, cautionCount: 3,
    signalTitles: ["극단적 단답", "무관심", "대화 확장 의지 없음"],
  },
  {
    rawText: "나: 지난번에 재밌었어요!\n상대: 아 네\n나: 다음에 또 만날까요?\n상대: 요즘 좀 바쁘네요\n나: 언제 한가해요?\n상대: 잘 모르겠어요",
    relationshipStage: "after_first_date", meetingChannel: "blind_date", userGoal: "ask_for_date",
    recommendedAction: "consider_stopping", outcomeLabel: "negative",
    overallSummary: "만남 후 상대의 관심이 급격히 줄었어요. 연속 거절과 유보적 태도가 보여요.",
    positiveCount: 0, ambiguousCount: 1, cautionCount: 3,
    signalTitles: ["만남 거절", "관심 급감", "유보적 태도", "짧은 답변"],
  },
  {
    rawText: "나: 오늘 하루 어땠어?\n나: 맛있는 거 먹었어?\n나: 주말에 뭐 해?\n상대: 아 바빴어 ㅎㅎ 답장 늦어서 미안",
    relationshipStage: "ongoing_chat", meetingChannel: "dating_app", userGoal: "continue_chat",
    recommendedAction: "slow_down", outcomeLabel: "negative",
    overallSummary: "3개 메시지에 하나만 답하고 있어요. 대화 의지가 낮아 보여요.",
    positiveCount: 0, ambiguousCount: 1, cautionCount: 2,
    signalTitles: ["답장 지연", "일대다 응답", "관심 감소"],
  },
  {
    rawText: "나: 이번 주말 시간 돼요?\n상대: 이번 주는 힘들어요\n나: 그럼 다음 주는요?\n상대: 다음 주도 좀 애매해요\n나: 그럼 언제가 좋을까요?\n상대: 일정 좀 봐야 할 것 같아요",
    relationshipStage: "after_first_date", meetingChannel: "marriage_agency", userGoal: "ask_for_date",
    recommendedAction: "consider_stopping", outcomeLabel: "negative",
    overallSummary: "세 번 연속 일정을 미루며 구체적 답변을 피하고 있어요. 만남 의사가 없을 가능성이 높아요.",
    positiveCount: 0, ambiguousCount: 0, cautionCount: 3,
    signalTitles: ["반복 거절", "구체적 답변 회피", "만남 의사 없음"],
  },
  {
    rawText: "나: 점심 같이 먹을래요?\n상대: 오늘 약속이 있어서요\n나: 내일은요?\n상대: 내일도 힘들 것 같아요\n나: 알겠어요 좋은 하루 보내세요\n상대: 네 감사해요",
    relationshipStage: "ongoing_chat", meetingChannel: "mutual_friend", userGoal: "ask_for_date",
    recommendedAction: "consider_stopping", outcomeLabel: "negative",
    overallSummary: "정중하게 거절하고 있지만 대안을 제시하지 않아요. 관심이 없는 패턴이에요.",
    positiveCount: 0, ambiguousCount: 0, cautionCount: 3,
    signalTitles: ["정중한 거절", "대안 미제시", "관심 없음 신호"],
  },
  // ── 추가 다양한 케이스 ──
  {
    rawText: "나: 오늘 회사에서 웃긴 일 있었어\n상대: 뭔데 뭔데?\n나: 부장님이 넘어지셨어 ㅋㅋ\n상대: ㅋㅋㅋㅋ 괜찮으셔?\n나: 응 다행히 ㅎㅎ\n상대: 너 오늘도 야근이야?",
    relationshipStage: "ongoing_chat", meetingChannel: "dating_app", userGoal: "continue_chat",
    recommendedAction: "keep_light", outcomeLabel: "positive_progress",
    overallSummary: "상대가 적극적으로 리액션하고 당신의 일상에 관심을 보이고 있어요.",
    positiveCount: 3, ambiguousCount: 0, cautionCount: 0,
    signalTitles: ["적극적 리액션", "일상 관심", "되묻기 질문"],
  },
  {
    rawText: "나: 요즘 뭐 하면서 지내?\n상대: 회사 다니면서 요가 시작했어\n나: 오 요가 좋지! 어디서 해?\n상대: 집 근처 원데이 클래스! 너도 해볼래?\n나: 오 관심 있어!\n상대: 다음에 같이 가자 ㅎㅎ",
    relationshipStage: "before_meeting", meetingChannel: "dating_app", userGoal: "ask_for_date",
    recommendedAction: "suggest_date", outcomeLabel: "positive_progress",
    overallSummary: "상대가 취미를 공유하고 함께 하자고 먼저 제안했어요.",
    positiveCount: 3, ambiguousCount: 0, cautionCount: 0,
    signalTitles: ["취미 공유", "함께 하자 제안", "대화 주도"],
  },
  {
    rawText: "나: 지난 주말 어땠어요?\n상대: 친구들이랑 놀았어요\n나: 재밌었겠다!\n상대: 네 ㅎㅎ\n나: 우리도 다음에 어디 가볼까요?\n상대: 네 기회 되면요",
    relationshipStage: "after_first_date", meetingChannel: "blind_date", userGoal: "ask_for_date",
    recommendedAction: "wait_for_response", outcomeLabel: "neutral",
    overallSummary: "대화는 하지만 '기회 되면'이라는 유보적 표현이 보여요.",
    positiveCount: 1, ambiguousCount: 2, cautionCount: 0,
    signalTitles: ["응답함", "유보적 표현", "기회 되면 패턴"],
  },
  {
    rawText: "나: 안녕하세요\n상대: 안녕하세요!\n나: 반갑습니다\n상대: 네 반가워요 ㅎㅎ\n나: 어디 사세요?\n상대: 강남 쪽이요! 혹시 근처세요?",
    relationshipStage: "before_meeting", meetingChannel: "marriage_agency", userGoal: "evaluate_interest",
    recommendedAction: "keep_light", outcomeLabel: "positive_progress",
    overallSummary: "상대가 밝은 톤으로 응하고 먼저 질문을 던지며 관심을 보이고 있어요.",
    positiveCount: 2, ambiguousCount: 1, cautionCount: 0,
    signalTitles: ["밝은 톤", "되묻기 질문", "관심 표현"],
  },
  {
    rawText: "나: 주말에 등산 가는데 같이 갈래?\n상대: 등산은 별로야...\n나: 그럼 다른 거 할까?\n상대: 글쎄 뭐가 있을까\n나: 카페나 갈까?\n상대: 카페는 괜찮을 것 같기도",
    relationshipStage: "ongoing_chat", meetingChannel: "dating_app", userGoal: "ask_for_date",
    recommendedAction: "keep_light", outcomeLabel: "neutral",
    overallSummary: "처음 제안을 거절했지만 대안에는 약한 긍정을 보였어요. 아직 확실하지 않은 상태예요.",
    positiveCount: 1, ambiguousCount: 2, cautionCount: 1,
    signalTitles: ["첫 제안 거절", "대안에 약한 긍정", "불확실한 태도"],
  },
  {
    rawText: "나: 생일 축하해!\n상대: 고마워!! 기억해줘서 감동이야\n나: ㅎㅎ 선물 뭐 받고 싶어?\n상대: 너가 뭘 줘도 좋아 ㅎㅎ\n나: 그럼 맛있는 거 사줄게\n상대: 역시 ㅎㅎ 기대할게!",
    relationshipStage: "ongoing_chat", meetingChannel: "mutual_friend", userGoal: "ask_for_date",
    recommendedAction: "suggest_date", outcomeLabel: "positive_progress",
    overallSummary: "생일을 계기로 강한 감정적 연결이 생기고 있어요. 상대가 적극적으로 기대감을 표현해요.",
    positiveCount: 4, ambiguousCount: 0, cautionCount: 0,
    signalTitles: ["감동 표현", "너가 뭘 줘도 좋아", "기대감", "강한 호감"],
  },
  {
    rawText: "나: 어제 보내준 노래 좋더라\n상대: 진짜? 다행이다 ㅎㅎ\n나: 비슷한 거 더 추천해줘\n상대: 응 좋은 거 찾으면 바로 보내줄게\n나: 고마워!\n상대: 다음에 같이 콘서트 가자 재밌겠다",
    relationshipStage: "after_first_date", meetingChannel: "dating_app", userGoal: "continue_chat",
    recommendedAction: "suggest_date", outcomeLabel: "positive_progress",
    overallSummary: "음악 취향을 공유하면서 자연스럽게 콘서트 데이트를 제안했어요.",
    positiveCount: 3, ambiguousCount: 0, cautionCount: 0,
    signalTitles: ["취향 공유 의지", "활동 제안", "자연스러운 데이트 제안"],
  },
  {
    rawText: "나: 요즘 다이어트 중이야?\n상대: 응 좀 하려고\n나: 같이 운동할까?\n상대: 운동은 좀...\n나: 가볍게 산책 정도는?\n상대: 산책은 괜찮은데 요즘 시간이 없어서",
    relationshipStage: "ongoing_chat", meetingChannel: "mutual_friend", userGoal: "ask_for_date",
    recommendedAction: "slow_down", outcomeLabel: "neutral",
    overallSummary: "여러 제안에 부분적으로만 동의하고 결국 시간 핑계를 대고 있어요.",
    positiveCount: 0, ambiguousCount: 2, cautionCount: 2,
    signalTitles: ["부분 동의만", "시간 핑계", "회피 패턴", "소극적"],
  },
  {
    rawText: "나: 좋은 아침!\n나: 오늘 하루도 화이팅\n나: 점심 맛있게 먹어\n상대: 고마워! 바빠서 답장 못했어 미안ㅠ",
    relationshipStage: "ongoing_chat", meetingChannel: "dating_app", userGoal: "evaluate_interest",
    recommendedAction: "slow_down", outcomeLabel: "negative",
    overallSummary: "3개 메시지에 한 번만 답하고 있어요. 일방적인 대화가 되고 있어요.",
    positiveCount: 0, ambiguousCount: 1, cautionCount: 2,
    signalTitles: ["일방적 대화", "답장 지연", "미안 패턴"],
  },
  {
    rawText: "나: 저번에 말한 카페 예약했어요!\n상대: 아 그 카페요?\n나: 네! 이번 토요일 2시 어때요?\n상대: 이번 토요일이요... 사실 다른 약속이 생겨서요\n나: 다음 주는요?\n상대: 다음 주에 연락드릴게요",
    relationshipStage: "after_first_date", meetingChannel: "blind_date", userGoal: "ask_for_date",
    recommendedAction: "wait_for_response", outcomeLabel: "negative",
    overallSummary: "이미 예약까지 했는데 거절당했어요. 연락드릴게요는 불확실한 신호예요.",
    positiveCount: 0, ambiguousCount: 1, cautionCount: 2,
    signalTitles: ["약속 거절", "연락드릴게요", "주도권 뺏김"],
  },
  {
    rawText: "나: 오늘 날씨 진짜 좋다\n상대: 그러네요\n나: 밖에 나가고 싶다\n상대: 저도요\n나: 같이 나갈까요?\n상대: ㅎㅎ\n나: 진짜로요!\n상대: ㅋㅋ 네",
    relationshipStage: "before_meeting", meetingChannel: "dating_app", userGoal: "ask_for_date",
    recommendedAction: "keep_light", outcomeLabel: "neutral",
    overallSummary: "이모티콘과 단답 위주의 응답이에요. 거절은 아니지만 적극성은 부족해요.",
    positiveCount: 1, ambiguousCount: 2, cautionCount: 0,
    signalTitles: ["거절은 아님", "단답 위주", "소극적 동의"],
  },
  {
    rawText: "나: 요즘 어떻게 지내?\n상대: 바쁘게 지내고 있어 ㅎㅎ 너는?\n나: 나도 바빠 ㅋㅋ\n상대: 힘내! 주말에 쉬어\n나: 고마워 너도!\n상대: 응 ㅎㅎ 주말에 뭐 해?",
    relationshipStage: "ongoing_chat", meetingChannel: "mutual_friend", userGoal: "continue_chat",
    recommendedAction: "keep_light", outcomeLabel: "positive_progress",
    overallSummary: "가벼운 안부를 주고받으면서 상대도 질문을 되묻고 있어요. 편안한 관계 형성 중이에요.",
    positiveCount: 2, ambiguousCount: 1, cautionCount: 0,
    signalTitles: ["되묻기 질문", "격려 표현", "편안한 톤"],
  },
  {
    rawText: "나: 시험 어떻게 됐어?\n상대: 그럭저럭? 너 덕분에 좀 나았어\n나: 진짜? 도움이 됐다니 다행이다\n상대: 고마워 진짜! 밥 한번 살게\n나: 오 기대할게\n상대: 이번 주 금요일 시간 돼?",
    relationshipStage: "ongoing_chat", meetingChannel: "mutual_friend", userGoal: "evaluate_interest",
    recommendedAction: "suggest_date", outcomeLabel: "positive_progress",
    overallSummary: "상대가 고마움을 밥으로 보답하겠다며 구체적인 날짜까지 제안했어요.",
    positiveCount: 4, ambiguousCount: 0, cautionCount: 0,
    signalTitles: ["감사 표현", "밥 제안", "구체적 날짜", "적극적"],
  },
  {
    rawText: "나: 어제 보낸 사진 봤어?\n상대: 응 봤어\n나: 어땠어?\n상대: 괜찮았어\n나: 다음에 같이 가볼까?\n상대: 글쎄",
    relationshipStage: "after_first_date", meetingChannel: "dating_app", userGoal: "ask_for_date",
    recommendedAction: "slow_down", outcomeLabel: "negative",
    overallSummary: "상대 응답이 점점 짧아지고 있고, '글쎄'는 거절에 가까운 표현이에요.",
    positiveCount: 0, ambiguousCount: 1, cautionCount: 2,
    signalTitles: ["점점 짧아지는 답", "글쎄 = 거절", "관심 하락"],
  },
  {
    rawText: "나: 오늘 집에서 뭐 해?\n상대: 청소하고 있어 ㅎㅎ\n나: 부지런하다!\n상대: 아니야 밀린 거 하는 중 ㅋㅋ 너는?\n나: 나는 넷플릭스 보는 중\n상대: 뭐 보는데? 나도 다 하면 볼 건데",
    relationshipStage: "ongoing_chat", meetingChannel: "dating_app", userGoal: "continue_chat",
    recommendedAction: "keep_light", outcomeLabel: "positive_progress",
    overallSummary: "일상을 편하게 공유하며 당신의 활동에 관심을 보이고 있어요.",
    positiveCount: 2, ambiguousCount: 1, cautionCount: 0,
    signalTitles: ["일상 공유", "관심 질문", "편안한 분위기"],
  },
  {
    rawText: "나: 좋은 하루!\n상대: ㅎㅎ 고마워\n나: 오늘 뭐 먹었어?\n상대: 돈까스!\n나: 맛있겠다 어디서?\n상대: 회사 근처 맛집! 다음에 같이 가자 거기 진짜 맛있어",
    relationshipStage: "after_first_date", meetingChannel: "blind_date", userGoal: "continue_chat",
    recommendedAction: "suggest_date", outcomeLabel: "positive_progress",
    overallSummary: "일상 대화에서 자연스럽게 같이 가자는 제안이 나왔어요.",
    positiveCount: 3, ambiguousCount: 0, cautionCount: 0,
    signalTitles: ["맛집 공유", "같이 가자 제안", "적극적 추천"],
  },
  {
    rawText: "나: 오랜만이야\n상대: 어 오랜만 ㅎㅎ\n나: 잘 지냈어?\n상대: 응 그냥저냥\n나: 만나서 밥이나 먹자\n상대: 아 요즘 좀 바빠서... 나중에!",
    relationshipStage: "cooling_down", meetingChannel: "mutual_friend", userGoal: "ask_for_date",
    recommendedAction: "consider_stopping", outcomeLabel: "negative",
    overallSummary: "오랜만에 연락했는데 상대가 만남을 '나중에'로 미루고 있어요. 관계가 식어가고 있어요.",
    positiveCount: 0, ambiguousCount: 1, cautionCount: 2,
    signalTitles: ["나중에 패턴", "소극적 응답", "관계 냉각"],
  },
  {
    rawText: "나: 내일 비 온대\n상대: 아 진짜? 우산 챙겨야겠다\n나: ㅎㅎ 실내에서 뭐 할까?\n상대: 보드게임 카페 어때? 재밌다던데!\n나: 오 좋아!\n상대: 내가 찾아볼게 어디가 좋은지",
    relationshipStage: "after_second_date", meetingChannel: "dating_app", userGoal: "ask_for_date",
    recommendedAction: "suggest_date", outcomeLabel: "positive_progress",
    overallSummary: "날씨 얘기에서 자연스럽게 데이트 계획이 나왔고, 상대가 주도적으로 찾아보겠다고 해요.",
    positiveCount: 4, ambiguousCount: 0, cautionCount: 0,
    signalTitles: ["데이트 제안", "주도적 계획", "찾아보겠다", "적극적 참여"],
  },
  {
    rawText: "나: 어제 얘기한 거 생각해봤어?\n상대: 무슨 얘기?\n나: 같이 여행 가자는 거\n상대: 아... 여행은 좀 부담스러운데\n나: 가까운 데라도?\n상대: 음 좀 더 생각해 볼게",
    relationshipStage: "after_second_date", meetingChannel: "blind_date", userGoal: "ask_for_date",
    recommendedAction: "slow_down", outcomeLabel: "neutral",
    overallSummary: "여행 제안에 부담을 느끼고 있어요. 관계 속도 조절이 필요해 보여요.",
    positiveCount: 0, ambiguousCount: 2, cautionCount: 1,
    signalTitles: ["부담 표현", "속도 차이", "생각해볼게 유보"],
  },
  {
    rawText: "나: ㅎㅎ 귀엽다\n상대: 뭐가 ㅋㅋ\n나: 그냥 ㅎㅎ\n상대: 이상해 ㅋㅋ\n나: 칭찬인데!\n상대: ㅋㅋㅋ 고마워 ☺️",
    relationshipStage: "ongoing_chat", meetingChannel: "dating_app", userGoal: "evaluate_interest",
    recommendedAction: "keep_light", outcomeLabel: "positive_progress",
    overallSummary: "가벼운 플러팅에 긍정적으로 반응하고 있어요. 이모지까지 써서 호감을 표현해요.",
    positiveCount: 2, ambiguousCount: 1, cautionCount: 0,
    signalTitles: ["플러팅 수용", "이모지 사용", "밝은 분위기"],
  },
];

// ─── 실행 ────────────────────────────────────────

async function main() {
  console.log(`Seeding ${SEED_DATA.length} conversations with embeddings...`);

  let successCount = 0;
  let errorCount = 0;

  for (const seed of SEED_DATA) {
    try {
      // 1. 대화 생성
      const messages = seed.rawText
        .split("\n")
        .filter((line) => line.trim())
        .map((line, index) => {
          const isOther = line.startsWith("상대:");
          const text = line.replace(/^(나|상대):?\s*/, "").trim();
          return {
            senderRole: isOther ? "other" as const : "self" as const,
            messageText: text,
            sentAt: null,
            sequenceNo: index + 1,
            messageLength: text.length,
          };
        });

      const conversation = await prisma.conversation.create({
        data: {
          title: `시드 대화 #${successCount + 1}`,
          sourceType: "seed",
          relationshipStage: seed.relationshipStage,
          meetingChannel: seed.meetingChannel,
          userGoal: seed.userGoal,
          saveMode: "saved",
          rawText: seed.rawText,
          messages: { create: messages },
        },
      });

      // 2. 요약 텍스트 생성
      const summaryText = [
        `관계단계: ${seed.relationshipStage}`,
        `만남경로: ${seed.meetingChannel}`,
        `목표: ${seed.userGoal}`,
        `메시지수: ${messages.length}개`,
        `긍정시그널: ${seed.positiveCount}개, 모호시그널: ${seed.ambiguousCount}개, 주의시그널: ${seed.cautionCount}개`,
        `추천액션: ${seed.recommendedAction}`,
        `시그널: ${seed.signalTitles.join(", ")}`,
        `요약: ${seed.overallSummary}`,
      ].join("\n");

      // 3. 임베딩 생성
      const embeddingResponse = await openai.embeddings.create({
        model: "text-embedding-3-small",
        input: summaryText,
      });

      const vector = embeddingResponse.data[0].embedding;
      const vectorStr = `[${vector.join(",")}]`;

      // 4. DB 저장
      await prisma.$executeRawUnsafe(
        `INSERT INTO conversation_embeddings (id, conversation_id, summary_text, outcome_label, embedding, created_at)
         VALUES (gen_random_uuid(), $1, $2, $3, $4::vector, NOW())`,
        conversation.id,
        summaryText,
        seed.outcomeLabel,
        vectorStr,
      );

      successCount++;
      process.stdout.write(`\r  Progress: ${successCount}/${SEED_DATA.length}`);
    } catch (error) {
      errorCount++;
      console.error(`\n  Error seeding conversation: ${error}`);
    }
  }

  console.log(`\n\nDone! ${successCount} conversations seeded, ${errorCount} errors.`);
  await prisma.$disconnect();
  await pool.end();
}

main().catch(console.error);
