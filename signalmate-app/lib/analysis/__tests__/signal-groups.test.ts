import type { AnalysisSignal } from '../types';
import { groupSignalsByContext } from '../signal-groups';

function signal(signalKey: string, displayOrder = 0, id = signalKey): AnalysisSignal {
  return {
    id,
    signalType: 'positive',
    signalKey,
    title: signalKey,
    description: `${signalKey} description`,
    evidenceText: `${signalKey} evidence`,
    confidenceLevel: 'medium',
    displayOrder,
  };
}

describe('groupSignalsByContext', () => {
  test('실제 만남과 후속 연락 신호를 채팅보다 앞 그룹으로 분리한다', () => {
    const groups = groupSignalsByContext([
      signal('warm_tone'),
      signal('meeting_positive_vibe'),
      signal('post_meeting_followup_positive'),
    ]);

    expect(groups.meeting.map((item) => item.signalKey)).toEqual(['meeting_positive_vibe']);
    expect(groups.followUp.map((item) => item.signalKey)).toEqual(['post_meeting_followup_positive']);
    expect(groups.chat.map((item) => item.signalKey)).toEqual(['warm_tone']);
  });

  test('불확실성 신호를 별도 그룹으로 분리하고 모든 입력을 한 번씩만 보존한다', () => {
    const signals = [
      signal('signal_conflict', 3),
      signal('limited_signal', 2),
      signal('sample_size', 1),
      signal('unknown_chat_signal', 0),
      signal('meeting_low_reciprocity', 4),
      signal('post_meeting_followup_caution', 5),
    ];

    const groups = groupSignalsByContext(signals);
    const groupedIds = [
      ...groups.meeting,
      ...groups.followUp,
      ...groups.chat,
      ...groups.uncertainty,
    ].map((item) => item.id);

    expect(groupedIds).toHaveLength(signals.length);
    expect(new Set(groupedIds)).toEqual(new Set(signals.map((item) => item.id)));
    expect(groups.uncertainty.map((item) => item.signalKey)).toEqual([
      'sample_size',
      'limited_signal',
      'signal_conflict',
    ]);
  });

  test('각 그룹은 displayOrder 오름차순이며 같은 순서에서는 입력 순서를 유지한다', () => {
    const groups = groupSignalsByContext([
      signal('chat-later', 4),
      signal('chat-first-tie', 2),
      signal('chat-second-tie', 2),
      signal('meeting_low_reciprocity', 8),
      signal('meeting_positive_vibe', 1),
    ]);

    expect(groups.chat.map((item) => item.signalKey)).toEqual([
      'chat-first-tie',
      'chat-second-tie',
      'chat-later',
    ]);
    expect(groups.meeting.map((item) => item.signalKey)).toEqual([
      'meeting_positive_vibe',
      'meeting_low_reciprocity',
    ]);
  });
});
