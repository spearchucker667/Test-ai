import React, { useState } from "react";
import StorageService from "../services/storageService";
import { galleryFilename } from "../utils/image";
import { downloadImage } from "../utils/download";
import { upscaleGalleryImage, downloadAllGallery } from "../services/imageWorkflowService";
import { Chip } from "../components/Chip";
import { StatusBlock } from "../components/StatusBlock";
import { ImageActionModal } from "../components/ImageActionModal";
import { AppState, AppDispatch } from "../types/app";
import { GalleryImage } from "../types/storage";

export function GalleryModule({ state, dispatch }: { state: AppState; dispatch: AppDispatch }) {
  const [expanded, setExpanded] = useState<GalleryImage | null>(null);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [upscalingId, setUpscalingId] = useState("");

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

  async function upscale(item: GalleryImage) {
    setError("");
    setStatus("");
    setUpscalingId(item.id);
    try {
      const saved = await upscaleGalleryImage(item, dispatch);
      setExpanded(saved);
      setStatus(`Enhanced/upscaled copy saved: ${saved.id}`);
    } catch (err: any) {
      setError(err.message || "Upscale failed");
      dispatch({ type: "ADD_TOAST", toast: { id: crypto.randomUUID(), message: err.message || "Upscale failed", type: "error" } });
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
          <Chip>{state.chats?.length || 0} chats</Chip>
          <button
            className="btn"
            onClick={() => downloadAllGallery(state.gallery, (msg, type) => dispatch({ type: "ADD_TOAST", toast: { id: crypto.randomUUID(), message: msg, type } }))}
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
          {state.gallery.map((item: GalleryImage, index: number) => (
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
                  {item.batchCount && item.batchCount > 1 && <Chip>Batch {item.batchIndex}/{item.batchCount}</Chip>}
                </div>
                <div className="tiny muted">
                  {new Date(item.timestamp).toLocaleString()}
                </div>
                <div className="small muted">{item.prompt}</div>
                <div className="chip-row">
                  <button
                    className="btn"
                    onClick={async () => {
                      await downloadImage(item.image, galleryFilename(item.prompt, item.timestamp));
                      dispatch({ type: "ADD_TOAST", toast: { id: crypto.randomUUID(), message: "Downloaded image", type: "info" } });
                    }}
                  >
                    Download
                  </button>
                  <button
                    className="btn"
                    onClick={() => upscale(item)}
                    disabled={
                      upscalingId === item.id || item.image?.startsWith("http") || item.upscaled
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
            <Chip>{(state as any).chats?.length || 0}</Chip>
          </div>
          <div className="grid">
            {((state as any).chats || []).slice(0, 8).map((c: any) => (
              <div className="model-item" key={c.id}>
                <div className="small">
                  <strong>{c.model}</strong> ·{" "}
                  {new Date(c.timestamp).toLocaleString()}
                </div>
                <div className="small muted">{c.prompt}</div>
              </div>
            ))}
            {!((state as any).chats?.length) && (
              <div className="small muted">No saved chat completions yet.</div>
            )}
          </div>
        </div>
      </div>

      <ImageActionModal
        image={expanded}
        isUpscaling={expanded ? upscalingId === expanded.id : false}
        onClose={() => setExpanded(null)}
        onDownload={async () => {
          if (!expanded) return;
          await downloadImage(expanded.image, galleryFilename(expanded.prompt, expanded.timestamp));
          dispatch({ type: "ADD_TOAST", toast: { id: crypto.randomUUID(), message: "Downloaded image", type: "info" } });
        }}
        onUpscale={() => expanded && upscale(expanded)}
        onDelete={() => expanded && remove(expanded.id)}
      />
    </section>
  );
}
