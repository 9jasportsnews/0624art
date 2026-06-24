/** 站點版本（可選；預設首頁不帶 version 參數） */
export const JITABET_VERSION = process.env.JITABET_VERSION ?? '6.46.6-fc';

const versionedHome = 'https://www.jitabet.cloud/?version=6.46.6-fc';

/**
 * 語系首頁 URL
 * 英文／孟加拉文目前共用同一入口，實際語系由站內語言設定決定。
 * 若要固定語系可設 HOME_URL（例如切換語言後的完整網址）。
 */
export const jitabetLocales = {
  en: {
    id: 'en',
    label: 'English',
    homeUrl: versionedHome,
  },
  bn: {
    id: 'bn',
    label: 'বাংলা',
    homeUrl: versionedHome,
  },
} as const;

export type JitabetLocaleId = keyof typeof jitabetLocales;

export function resolveJitabetHomeUrl(): string {
  if (process.env.HOME_URL) {
    return process.env.HOME_URL;
  }
  const locale = (process.env.SITE_LOCALE ?? 'bn') as JitabetLocaleId;
  return jitabetLocales[locale]?.homeUrl ?? versionedHome;
}

/** E2E 測試帳號（驗證碼由 .checknum_img OCR 自動填入） */
export const testAccount = {
  username: process.env.TEST_USERNAME?.trim() || 'Testing04',
  password: process.env.TEST_PASSWORD?.trim() || 'jt44444',
};
