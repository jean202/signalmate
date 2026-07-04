import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildCaptureId,
  collectImageFiles,
  getImageMimeType,
} from "./image-input";

describe("getImageMimeType", () => {
  it("maps supported screenshot file extensions to MIME types", () => {
    expect(getImageMimeType("chat.PNG")).toBe("image/png");
    expect(getImageMimeType("chat.jpeg")).toBe("image/jpeg");
    expect(getImageMimeType("chat.jpg")).toBe("image/jpeg");
    expect(getImageMimeType("chat.webp")).toBe("image/webp");
    expect(getImageMimeType("chat.gif")).toBe("image/gif");
  });

  it("rejects unsupported files", () => {
    expect(getImageMimeType("chat.heic")).toBeNull();
    expect(getImageMimeType("notes.txt")).toBeNull();
  });
});

describe("collectImageFiles", () => {
  it("returns supported image files sorted by filename", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "signalmate-images-"));
    await writeFile(path.join(dir, "IMG_0002.PNG"), "x");
    await writeFile(path.join(dir, "IMG_0001.jpg"), "x");
    await writeFile(path.join(dir, "notes.txt"), "x");

    const files = await collectImageFiles(dir);

    expect(files.map((file) => path.basename(file))).toEqual([
      "IMG_0001.jpg",
      "IMG_0002.PNG",
    ]);
  });
});

describe("buildCaptureId", () => {
  it("uses the explicit id for single image mode", () => {
    expect(buildCaptureId({ id: "0004", index: 0 })).toBe("0004");
  });

  it("builds stable folder ids from a prefix and 1-based index", () => {
    expect(buildCaptureId({ idPrefix: "gangho", index: 0 })).toBe("gangho-0001");
    expect(buildCaptureId({ idPrefix: "gangho", index: 19 })).toBe("gangho-0020");
  });
});
