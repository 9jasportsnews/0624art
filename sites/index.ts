import { jitabet } from './jitabet';
import type { SiteConfig } from './types';

const SITE_MAP: Record<string, SiteConfig> = {
  [jitabet.id]: jitabet
};

export function getSite(siteId: string): SiteConfig {
  const site = SITE_MAP[siteId];
  if (!site) {
    throw new Error(`Unknown SITE_ID: ${siteId}`);
  }
  return site;
}

export type { SiteConfig, NavigationCase, UrlMatch } from './types';
