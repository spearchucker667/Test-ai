import React, { useEffect, useRef } from "react";
import { Chip } from "./Chip";
import { GalleryImage } from "../types/storage";
import { useFocusTrap } from "../hooks/useFocusTrap";

interface ImageActionModalProps {
  image: GalleryImage | null;
  isUpscaling?: boolean;
  onClose: () => void;
  onDownload: () => void;
  onUpscale: () => void;
  onDelete: () => void;
}

export function ImageActionModal({
  image,
  isUpscaling,
  onClose,
  onDownload,
  onUpscale,
  onDelete,
}: ImageActionModalProps) {
  const downloadRef = useRef<HTMLButtonElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const returnFocusRef = useRef<Element | null>(null);

  useEffect(() => {
    if (image) {
      // Capture the element that triggered the modal so we can return focus on close.
      returnFocusRef.current = document.activeElement;
      document.body.style.overflow = "hidden";
      setTimeout(() => downloadRef.current?.focus(), 50);
    } else {
      document.body.style.overflow = "";
      if (returnFocusRef.current instanceof HTMLElement) {
        returnFocusRef.current.focus();
      }
      returnFocusRef.current = null;
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [image]);

  useFocusTrap(modalRef, !!image, onClose);

  if (!image) return null;

  return (
    <div
      className="modal-backdrop"
      onClick={onClose}
      role="presentation"
    >
      <div
        ref={modalRef}
        className="modal image-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
      >
        <div className="modal-image">
          <img src={image.image} alt={image.prompt} />
        </div>
        <div className="modal-side pad">
          <div className="toolbar" style={{ borderBottom: "none", padding: 0 }}>
            <h2 id="modal-title">Image details</h2>
              <button className="btn sm" onClick={onClose} aria-label="Close modal">
                Close
              </button>
            </div>
            
            <div className="grid">
              <div className="small muted">Prompt</div>
              <div
                className="panel pad small"
                style={{ maxHeight: 120, overflowY: "auto" }}
              >
                {image.prompt}
              </div>

              {image.negative && (
                <>
                  <div className="small muted">Negative prompt</div>
                  <div
                    className="panel pad small"
                    style={{ maxHeight: 80, overflowY: "auto" }}
                  >
                    {image.negative}
                  </div>
                </>
              )}

              <div className="small muted">Details</div>
              <div className="small">
                <strong>Model:</strong> {image.model}
                <br />
                {image.width && image.height && (
                  <>
                    <strong>Size:</strong> {image.width} × {image.height}
                    <br />
                  </>
                )}
                <strong>Timestamp:</strong>{" "}
                {image.timestamp ? new Date(image.timestamp).toLocaleString() : "unknown"}
                {image.batchCount && image.batchCount > 1 && (
                  <>
                    <br />
                    <strong>Batch:</strong> {image.batchIndex}/{image.batchCount}
                  </>
                )}
                {image.upscaled && (
                  <>
                    <br />
                    <Chip tone="ok" className="sm">Upscaled</Chip>
                  </>
                )}
              </div>
            </div>

            <div className="grid two" style={{ marginTop: "auto", paddingTop: 16 }}>
              <button ref={downloadRef} className="btn" onClick={onDownload}>
                Download
              </button>
              <button
                className="btn primary"
                onClick={onUpscale}
                disabled={isUpscaling || image.upscaled}
              >
                {isUpscaling ? "Upscaling..." : image.upscaled ? "Already upscaled" : "Enhance & upscale"}
              </button>
              <button
                className="btn danger"
                onClick={onDelete}
                style={{ gridColumn: "1 / -1" }}
              >
                Delete
              </button>
          </div>
        </div>
      </div>
    </div>
  );
}
