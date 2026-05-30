/**
 * Central legal, brand, and disclaimer constants for Venice Forge.
 * Import these instead of scattering legal strings across components.
 */

export const APP_NAME = "Venice Forge";

export const APP_DESCRIPTOR =
  "Unofficial third-party desktop client for the Venice API";

export const SHORT_UNOFFICIAL_NOTICE =
  "Unofficial third-party client for the Venice API. Not affiliated with, endorsed by, sponsored by, or approved by Venice.ai, Inc.";

export const FULL_UNOFFICIAL_NOTICE =
  "Venice Forge is an unofficial, third-party desktop client for the Venice API. It is not affiliated with, endorsed by, sponsored by, approved by, or maintained by Venice.ai, Inc.";

export const TRADEMARK_NOTICE =
  '“Venice”, “Venice.ai”, the Venice wordmark, the Venice seal, the Venice keys mark, the Venice lockup, and related marks are trademarks or trade dress of Venice.ai, Inc. Use of these names and marks in Venice Forge is solely for nominative identification of API compatibility and provider integration.';

export const ASSET_NOTICE =
  "Official Venice brand assets displayed in this app remain the property of Venice.ai, Inc. They are not owned by this project and are not covered by this project's open-source license except where Venice.ai, Inc. expressly permits such use.";

export const NO_LEGAL_ADVICE_NOTICE =
  "This application and its documentation do not provide legal advice and do not represent a determination of trademark, copyright, licensing, regulatory, or contractual compliance.";

export const NO_CRITICAL_USE_NOTICE =
  "Venice Forge is not a compliance, legal, medical, financial, or safety-critical system.";

export const OFFICIAL_LINKS = {
  terms: "https://venice.ai/legal/tos",
  privacy: "https://venice.ai/legal/privacy",
  apiDocs: "https://docs.venice.ai",
  brand: "https://venice.ai/brand",
} as const;

/**
 * First-run acknowledgment copy. Shown once per local profile.
 */
export const FIRST_RUN_COPY = {
  title: "Welcome to Venice Forge",
  body: `**18+ Age Requirement & Content Warning**
You must be 18 years or older to use this application. This app connects to unrestricted AI endpoints that may generate explicit or sensitive content, including the inherent risk of producing AI-generated images that may inappropriately represent minors (CSAM). By proceeding, you confirm you are 18+ and assume all responsibility for the generated content.

${FULL_UNOFFICIAL_NOTICE}

${TRADEMARK_NOTICE}

Any Venice names or brand assets shown here are used only to identify compatibility with the Venice API and provider integration. Review the official Venice Terms of Service, Privacy Policy, API Documentation, and Brand Guidelines before use.

${NO_LEGAL_ADVICE_NOTICE}

${NO_CRITICAL_USE_NOTICE}`,
  agreeLabel: "I understand and am 18+",
  docsLabel: "View official Venice docs",
} as const;

/**
 * Storage key for first-run acknowledgment persistence.
 */
export const FIRST_RUN_ACK_KEY = "vf.legal.firstRunAcknowledged";

/**
 * Settings key for resetting legal acknowledgment.
 */
export const SETTINGS_LEGAL_ACK_KEY = "vf.legal.resetAcknowledgment";
