/** @fileoverview Shared byte/size limits used across renderer, proxy, and Electron IPC. */

/** Base mebibyte unit in bytes. */
export const MIB = 1024 * 1024;

/** Unified raw Venice request-body limit (matches proxy + IPC + import/export caps). */
export const VENICE_MAX_BODY_BYTES = 25 * MIB;

/** Maximum raw upload file size accepted in the renderer. */
export const VENICE_MAX_RAW_UPLOAD_BYTES = VENICE_MAX_BODY_BYTES;

/** Maximum serialized (base64-expanded) upload payload allowed over IPC. */
export const VENICE_MAX_SERIALIZED_UPLOAD_BYTES = Math.floor((VENICE_MAX_RAW_UPLOAD_BYTES * 4) / 3);
