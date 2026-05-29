// Code Owner: fayeblade (@spearchucker667)
/**
 * @fileoverview Conditional logger that no-ops in production builds.
 *
 * Use this instead of raw console.* calls to avoid leaking development
 * diagnostics into end-user production builds.
 */
import { AppConfig } from "./configSchema";

const noop = () => {};

/** Warn sink — active in development/test, silent in production. */
export const warn =
  AppConfig.NODE_ENV === "production"
    ? noop
    : (...args: unknown[]) => console.warn(...args);

/** Error sink — active in development/test, silent in production. */
export const error =
  AppConfig.NODE_ENV === "production"
    ? noop
    : (...args: unknown[]) => console.error(...args);
