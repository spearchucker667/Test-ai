import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./veniceClient", () => ({
  veniceFetch: vi.fn(),
}));

vi.mock("../utils/download", () => ({
  downloadImage: vi.fn(),
}));

import { veniceFetch } from "./veniceClient";
import { downloadImage } from "../utils/download";
import { downloadAllGallery, generateImageWithWatermarkFallback } from "./imageWorkflowService";

describe("generateImageWithWatermarkFallback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("retries once without hide_watermark when watermark is rejected", async () => {
    const onWatermarkRetry = vi.fn();
    vi.mocked(veniceFetch)
      .mockRejectedValueOnce(Object.assign(new Error("watermark parameter rejected"), { status: 400 }))
      .mockResolvedValueOnce({ data: { images: ["abc"] } } as any);

    const result = await generateImageWithWatermarkFallback(
      "flux-dev",
      { prompt: "test", width: 1024, height: 1024, disableWatermark: true },
      { onWatermarkRetry }
    );

    expect(result).toEqual({ data: { images: ["abc"] } });
    expect(onWatermarkRetry).toHaveBeenCalledTimes(1);
    expect(vi.mocked(veniceFetch)).toHaveBeenCalledTimes(2);
    expect(vi.mocked(veniceFetch).mock.calls[0][1]).toMatchObject({
      method: "POST",
      body: expect.objectContaining({ hide_watermark: true }),
    });
    expect(vi.mocked(veniceFetch).mock.calls[1][1]).toMatchObject({
      method: "POST",
      body: expect.not.objectContaining({ hide_watermark: true }),
    });
  });

  it("does not retry for non-watermark errors", async () => {
    vi.mocked(veniceFetch).mockRejectedValueOnce(Object.assign(new Error("bad request"), { status: 400 }));

    await expect(
      generateImageWithWatermarkFallback("flux-dev", { prompt: "test", width: 1024, height: 1024 })
    ).rejects.toThrow("bad request");

    expect(vi.mocked(veniceFetch)).toHaveBeenCalledTimes(1);
  });
});

describe("downloadAllGallery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("counts direct-download fallbacks as failed rather than confirmed saves", async () => {
    vi.mocked(downloadImage).mockResolvedValue({ confirmed: false, usedFallback: true });
    const addToast = vi.fn();
    const onProgress = vi.fn();

    await downloadAllGallery(
      [{ id: "img-1", image: "https://example.com/image.png", prompt: "test", model: "flux-dev", timestamp: 1 }],
      addToast,
      { onProgress }
    );

    expect(onProgress).toHaveBeenCalledWith(1, 1);
    expect(addToast).toHaveBeenLastCalledWith("Saved 0 images (1 failed).", "success");
  });
});
