import React, { useState, useEffect } from "react";
import StorageService from "../services/storageService";
import { stripDataUrlPrefix, extractImages, galleryFilename } from "../utils/image";
import { downloadDataUrl } from "../utils/download";
import { veniceFetch } from "../services/veniceClient";
import { Chip } from "../components/Chip";
import { StatusBlock } from "../components/StatusBlock";

function downloadAllGallery(items: any[]) {
  if (!items?.length) return;
  items.forEach((item, index) => {
    setTimeout(() => {
      if (!item.image) return;
      downloadDataUrl(item.image, galleryFilename(item, index));
    }, index * 250);
  });
}

export function GalleryModule({ state, dispatch }: { state: any; dispatch: any }) {
  const [expanded, setExpanded] = useState<any>(null);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [upscalingId, setUpscalingId] = useState("");

  useEffect(() => {
    if (expanded) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [expanded]);

  async function remove(id: string) {
    await StorageService.deleteItem("images", id);
    const items = await StorageService.getItems("images");
    dispatch({ type: "SET_GALLERY", items });
    if (expanded?.id === id) setExpanded(null);
  }

  async function clearImages() {
    await StorageService.clearStore("images");
    dispatch({ type: "SET_GALLERY", items: [] });
    setExpanded(null);
  }

  async function upscale(item: any) {
    setError("");
    setStatus("");
    setUpscalingId(item.id);
    try {
      const cleanB64 = stripDataUrlPrefix(item.image);
      const { data } = await veniceFetch("/image/upscale", {
        method: "POST",
        body: { image: cleanB64, scale: 2 },
        dispatch,
        retry: true,
      });

      const upscaledImage = data?.dataUrl || extractImages(data)[0];
      if (!upscaledImage)
        throw new Error(
          "Upscale response did not contain detectable image data."
        );

      const record = {
        ...item,
        id: crypto.randomUUID(),
        image: upscaledImage,
        upscaled: true,
        parentId: item.id,
        timestamp: Date.now(),
      };
      await StorageService.saveItem("images", record);
      const items = await StorageService.getItems("images");
      dispatch({ type: "SET_GALLERY", items });

      setExpanded(record);
      setStatus(`Enhanced/upscaled copy saved: ${record.id}`);
    } catch (err: any) {
      setError(err.message || "Upscale failed");
    } finally {
      setUpscalingId("");
    }
  }

  return (
    <section className="content-card">
      <div className="toolbar">
        <div>
          <h2>Library</h2>
          <div className="small muted">
            Generated images are stored in IndexedDB, not localStorage.
          </div>
        </div>
        <div className="chip-row">
          <Chip>{state.gallery.length} images</Chip>
          <Chip>{state.chats.length} chats</Chip>
          <button
            className="btn"
            onClick={() => downloadAllGallery(state.gallery)}
            disabled={!state.gallery.length}
          >
            Save all gallery
          </button>
          <button
            className="btn danger"
            onClick={clearImages}
            disabled={!state.gallery.length}
          >
            Clear image gallery
          </button>
        </div>
      </div>

      <div className="body grid">
        <StatusBlock error={error} success={status} />

        <div className="gallery">
          {state.gallery.map((item: any, index: number) => (
            <div className="gallery-card" key={item.id}>
              <img
                src={item.image}
                alt={item.prompt || "Generated image"}
                onClick={() => setExpanded(item)}
              />
              <div className="meta">
                <div className="small">
                  <strong>{item.model}</strong>{" "}
                  {item.upscaled && <Chip>upscaled</Chip>}
                  {item.batchCount > 1 && <Chip>Batch {item.batchIndex}/{item.batchCount}</Chip>}
                </div>
                <div className="tiny muted">
                  {new Date(item.timestamp).toLocaleString()}
                </div>
                <div className="small muted">{item.prompt}</div>
                <div className="chip-row">
                  <button
                    className="btn"
                    onClick={() =>
                      downloadDataUrl(item.image, galleryFilename(item, index))
                    }
                    disabled={item.image?.startsWith("http")}
                  >
                    Download
                  </button>
                  <button
                    className="btn"
                    onClick={() => upscale(item)}
                    disabled={
                      upscalingId === item.id || item.image?.startsWith("http")
                    }
                  >
                    {upscalingId === item.id ? "Enhancing…" : "Enhance"}
                  </button>
                  <button
                    className="btn danger"
                    onClick={() => remove(item.id)}
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>

        {!state.gallery.length && (
          <div className="notice small">
            No saved images yet. Generate an image and it will auto-save here.
          </div>
        )}

        <div className="panel pad">
          <div className="panel-header">
            <div className="panel-title">Recent chat records</div>
            <Chip>{state.chats.length}</Chip>
          </div>
          <div className="grid">
            {state.chats.slice(0, 8).map((c: any) => (
              <div className="model-item" key={c.id}>
                <div className="small">
                  <strong>{c.model}</strong> ·{" "}
                  {new Date(c.timestamp).toLocaleString()}
                </div>
                <div className="small muted">{c.prompt}</div>
              </div>
            ))}
            {!state.chats.length && (
              <div className="small muted">No saved chat completions yet.</div>
            )}
          </div>
        </div>
      </div>

      {expanded && (
        <div className="modal-backdrop" onClick={() => setExpanded(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-image">
              <img
                src={expanded.image}
                alt={expanded.prompt || "Expanded gallery image"}
              />
            </div>
            <div className="modal-side">
              <div
                className="chip-row"
                style={{ justifyContent: "space-between" }}
              >
                <Chip>{expanded.upscaled ? "upscaled" : "original"}</Chip>
                <button className="btn ghost" onClick={() => setExpanded(null)}>
                  Close
                </button>
              </div>

              <div>
                <div className="tiny muted" style={{ marginBottom: 6 }}>
                  Prompt
                </div>
                <div className="prompt-box">
                  {expanded.prompt || "No prompt saved."}
                </div>
              </div>

              <div className="small muted">
                Model:{" "}
                <span className="mono">{expanded.model || "unknown"}</span>
                <br />
                Created:{" "}
                {expanded.timestamp
                  ? new Date(expanded.timestamp).toLocaleString()
                  : "unknown"}
                {expanded.batchCount > 1 && (
                  <>
                    <br />
                    Batch: {expanded.batchIndex}/{expanded.batchCount}
                  </>
                )}
              </div>

              <button
                className="btn primary full"
                onClick={() =>
                  downloadDataUrl(expanded.image, galleryFilename(expanded))
                }
                disabled={expanded.image?.startsWith("http")}
              >
                Save image
              </button>
              <button
                className="btn full"
                onClick={() => upscale(expanded)}
                disabled={
                  upscalingId === expanded.id ||
                  expanded.image?.startsWith("http")
                }
              >
                {upscalingId === expanded.id ? "Enhancing…" : "Enhance & upscale"}
              </button>
              <button
                className="btn danger full"
                onClick={() => remove(expanded.id)}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
