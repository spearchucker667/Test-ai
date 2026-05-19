export function downloadDataUrl(dataUrl: string, filename: string) {
  if (!dataUrl) return;

  try {
    // Convert to Blob as it occasionally bypasses some soft sandbox download restrictions
    const arr = dataUrl.split(",");
    const mime = arr[0].match(/:(.*?);/)?.[1] || "image/png";
    const bstr = atob(arr[1] || "");
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) {
      u8arr[n] = bstr.charCodeAt(n);
    }
    const blob = new Blob([u8arr], { type: mime });
    const blobUrl = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(blobUrl), 100);
  } catch (e) {
    // Fallback to dataUrl directly
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  // Display a global toast because `a.click()` silently fails when sandbox `allow-downloads` is missing
  const existing = document.getElementById("dl-toast");
  if (existing) existing.remove();
  const toast = document.createElement("div");
  toast.id = "dl-toast";
  toast.innerHTML =
    "⬇️ Download triggered.<br/><span style='font-size:12px;color:var(--muted);'>If blocked by the preview window, <b>Right-Click / Long-Press</b> the image to save it natively.</span>";
  Object.assign(toast.style, {
    position: "fixed",
    bottom: "24px",
    left: "50%",
    transform: "translateX(-50%)",
    background: "var(--panel-strong)",
    border: "1px solid var(--warn)",
    color: "var(--text)",
    padding: "12px 18px",
    borderRadius: "12px",
    zIndex: "99999",
    fontSize: "14px",
    boxShadow: "0 8px 32px rgba(0,0,0,0.6)",
    textAlign: "center",
    lineHeight: "1.4",
    pointerEvents: "none",
    transition: "opacity 0.5s ease",
  });
  document.body.appendChild(toast);
  setTimeout(() => {
    if (toast) toast.style.opacity = "0";
    setTimeout(() => toast && toast.remove(), 500);
  }, 5000);
}

export function copyText(value: string) {
  return navigator.clipboard.writeText(String(value || ""));
}
