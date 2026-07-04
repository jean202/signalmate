<!-- AGENTS.md 와 CLAUDE.md 는 동일하게 유지됩니다. 한쪽을 수정하면 다른 쪽도 같이 수정하세요. -->
# signalmate — Project Guide (CLAUDE.md = AGENTS.md)

## 개요
소개팅·썸 초기 채팅을 붙여넣으면 관계 신호를 분석하고 다음 메시지를 제안하는 AI 서비스.

## 스택 & 실행
- Next.js 15 / TypeScript / Claude API / pgvector(RAG), Prisma, docker-compose
- 모노레포: `signalmate-app/`(메인), `landing-page-nextjs/`, `prisma/`
- 개발: 각 앱 폴더에서 `npm run dev`  · 인프라: `docker compose up -d`

## 다음 작업 시작 시
- DB 스키마 변경은 Prisma migration으로. LLM 호출은 fallback·견고한 JSON 파싱 포함.
