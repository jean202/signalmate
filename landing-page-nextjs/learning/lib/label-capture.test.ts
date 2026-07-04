import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildDatasetJsonl,
  collectCaptureFiles,
  formatMessagesForReview,
  isTemperature,
  upsertLabel,
} from "./label-capture";
import type { Capture } from "./capture";

describe("isTemperature", () => {
  it("accepts only supported temperature labels", () => {
    expect(isTemperature("cold")).toBe(true);
    expect(isTemperature("neutral")).toBe(true);
    expect(isTemperature("warm")).toBe(true);
    expect(isTemperature("hot")).toBe(true);
    expect(isTemperature("maybe")).toBe(false);
  });
});

describe("collectCaptureFiles", () => {
  it("collects prefix-matching capture JSON files in filename order", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "signalmate-labels-"));
    await writeFile(path.join(dir, "gangho-0002.json"), "{}");
    await writeFile(path.join(dir, "gangho-0001.json"), "{}");
    await writeFile(path.join(dir, "other-0001.json"), "{}");

    const files = await collectCaptureFiles(dir, "gangho");

    expect(files.map((file) => path.basename(file))).toEqual([
      "gangho-0001.json",
      "gangho-0002.json",
    ]);
  });
});

describe("upsertLabel", () => {
  it("adds myLabel without changing messages", () => {
    const capture: Capture = {
      id: "gangho-0001",
      messages: [{ sender: "me", text: "안녕하세요" }],
    };

    expect(
      upsertLabel(capture, {
        temperature: "warm",
        topSignal: "상대가 질문을 이어갔다",
        nextMove: "가볍게 약속 후보를 제안한다",
      }),
    ).toEqual({
      id: "gangho-0001",
      messages: [{ sender: "me", text: "안녕하세요" }],
      myLabel: {
        temperature: "warm",
        topSignal: "상대가 질문을 이어갔다",
        nextMove: "가볍게 약속 후보를 제안한다",
      },
    });
  });
});

describe("formatMessagesForReview", () => {
  it("formats sender labels for terminal review", () => {
    const capture: Capture = {
      id: "x",
      messages: [
        { sender: "me", text: "안녕" },
        { sender: "them", text: "반가워" },
      ],
    };

    expect(formatMessagesForReview(capture)).toBe("나: 안녕\n상대: 반가워");
  });
});

describe("buildDatasetJsonl", () => {
  it("includes only captures with myLabel", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "signalmate-dataset-"));
    const labeled: Capture = {
      id: "a",
      messages: [{ sender: "me", text: "안녕" }],
      myLabel: {
        temperature: "neutral",
        topSignal: "아직 판단 근거가 적다",
        nextMove: "가볍게 대화를 이어간다",
      },
    };
    const unlabeled: Capture = {
      id: "b",
      messages: [{ sender: "them", text: "안녕" }],
    };
    const labeledPath = path.join(dir, "a.json");
    const unlabeledPath = path.join(dir, "b.json");
    await writeFile(labeledPath, JSON.stringify(labeled));
    await writeFile(unlabeledPath, JSON.stringify(unlabeled));

    const result = await buildDatasetJsonl([labeledPath, unlabeledPath]);

    expect(result.included).toBe(1);
    expect(result.skipped).toEqual(["b"]);
    expect(JSON.parse(result.jsonl.trim())).toEqual(labeled);
  });
});
