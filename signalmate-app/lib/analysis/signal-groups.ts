const MEETING_SIGNAL_KEYS = new Set([
  'meeting_positive_vibe',
  'meeting_low_reciprocity',
]);

const FOLLOW_UP_SIGNAL_KEYS = new Set([
  'post_meeting_followup_positive',
  'post_meeting_followup_caution',
]);

const UNCERTAINTY_SIGNAL_KEYS = new Set([
  'signal_conflict',
  'limited_signal',
  'sample_size',
]);

type GroupableSignal = { signalKey: string; displayOrder: number };

export type SignalGroups<T> = {
  meeting: T[];
  followUp: T[];
  chat: T[];
  uncertainty: T[];
};

export function groupSignalsByContext<T extends GroupableSignal>(signals: readonly T[]): SignalGroups<T> {
  const indexedGroups = signals.reduce<SignalGroups<Array<{ signal: T; inputOrder: number }>[number]>>(
    (groups, signal, inputOrder) => {
      const indexedSignal = { signal, inputOrder };
      if (MEETING_SIGNAL_KEYS.has(signal.signalKey)) groups.meeting.push(indexedSignal);
      else if (FOLLOW_UP_SIGNAL_KEYS.has(signal.signalKey)) groups.followUp.push(indexedSignal);
      else if (UNCERTAINTY_SIGNAL_KEYS.has(signal.signalKey)) groups.uncertainty.push(indexedSignal);
      else groups.chat.push(indexedSignal);
      return groups;
    },
    { meeting: [], followUp: [], chat: [], uncertainty: [] },
  );

  const sorted = (items: Array<{ signal: T; inputOrder: number }>) => items
    .sort((left, right) => (
      left.signal.displayOrder - right.signal.displayOrder || left.inputOrder - right.inputOrder
    ))
    .map(({ signal }) => signal);

  return {
    meeting: sorted(indexedGroups.meeting),
    followUp: sorted(indexedGroups.followUp),
    chat: sorted(indexedGroups.chat),
    uncertainty: sorted(indexedGroups.uncertainty),
  };
}
