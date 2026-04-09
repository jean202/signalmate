import type { Metadata } from "next";
import { AnalysisExperience } from "@/components/analysis-experience";

export const metadata: Metadata = {
  title: "SignalMate | Interactive Analysis",
  description: "Paste a chat, choose the context, and preview SignalMate's relationship signal analysis flow.",
};

export default function AnalyzePage() {
  return <AnalysisExperience />;
}
