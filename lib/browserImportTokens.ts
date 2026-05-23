export const IMPORT_APPROVAL_TOKEN_STORAGE_KEY = "dcf-dashboard:import-approval-token";
export const IMPORT_CONTEXT_TOKEN_STORAGE_KEY = "dcf-dashboard:import-context-token";

export const readBrowserImportApprovalToken = (): string | null => {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    return (
      window.sessionStorage.getItem(IMPORT_APPROVAL_TOKEN_STORAGE_KEY)?.trim() ||
      window.localStorage.getItem(IMPORT_APPROVAL_TOKEN_STORAGE_KEY)?.trim() ||
      null
    );
  } catch {
    return null;
  }
};

export const readBrowserImportContextToken = (): string | null => {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    return (
      window.sessionStorage.getItem(IMPORT_CONTEXT_TOKEN_STORAGE_KEY)?.trim() ||
      window.localStorage.getItem(IMPORT_CONTEXT_TOKEN_STORAGE_KEY)?.trim() ||
      readBrowserImportApprovalToken()
    );
  } catch {
    return null;
  }
};

export const readBrowserImportFactsToken = (): string | null => {
  if (typeof window === 'undefined') {
    return null;
  }
  try {
    return window.sessionStorage.getItem(IMPORT_CONTEXT_TOKEN_STORAGE_KEY)?.trim() ||
      window.localStorage.getItem(IMPORT_CONTEXT_TOKEN_STORAGE_KEY)?.trim() ||
      null;
  } catch {
    return null;
  }
};

export const writeBrowserImportApprovalToken = (token: string | null): void => {
  if (typeof window === "undefined") {
    return;
  }
  try {
    if (!token) {
      window.sessionStorage.removeItem(IMPORT_APPROVAL_TOKEN_STORAGE_KEY);
      window.localStorage.removeItem(IMPORT_APPROVAL_TOKEN_STORAGE_KEY);
      return;
    }
    window.sessionStorage.setItem(IMPORT_APPROVAL_TOKEN_STORAGE_KEY, token);
  } catch {
    // Ignore storage failures in restricted browser contexts.
  }
};

export const writeBrowserImportContextToken = (token: string | null): void => {
  if (typeof window === "undefined") {
    return;
  }
  try {
    if (!token) {
      window.sessionStorage.removeItem(IMPORT_CONTEXT_TOKEN_STORAGE_KEY);
      window.localStorage.removeItem(IMPORT_CONTEXT_TOKEN_STORAGE_KEY);
      return;
    }
    window.sessionStorage.setItem(IMPORT_CONTEXT_TOKEN_STORAGE_KEY, token);
  } catch {
    // Ignore storage failures in restricted browser contexts.
  }
};
