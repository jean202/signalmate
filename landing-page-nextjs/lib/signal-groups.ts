type SignalLike = {
  signalKey: string;
};

export type SignalGroups<T extends SignalLike> = {
  chat: T[];
  meeting: T[];
  followUp: T[];
  uncertainty: T[];
};

const meetingSignalKeys = new Set([
  "meeting_positive_vibe",
  "meeting_low_reciprocity",
]);

const followUpSignalKeys = new Set([
  "post_meeting_followup_positive",
  "post_meeting_followup_caution",
]);

const uncertaintySignalKeys = new Set([
  "signal_conflict",
  "limited_signal",
  "sample_size",
]);

export function groupSignalsByContext<T extends SignalLike>(signals: T[]): SignalGroups<T> {
  return signals.reduce<SignalGroups<T>>(
    (groups, signal) => {
      if (meetingSignalKeys.has(signal.signalKey)) {
        groups.meeting.push(signal);
      } else if (followUpSignalKeys.has(signal.signalKey)) {
        groups.followUp.push(signal);
      } else if (uncertaintySignalKeys.has(signal.signalKey)) {
        groups.uncertainty.push(signal);
      } else {
        groups.chat.push(signal);
      }

      return groups;
    },
    { chat: [], meeting: [], followUp: [], uncertainty: [] },
  );
}
