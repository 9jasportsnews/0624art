export type UrlMatch =
  | { type: 'hostname'; value: string }
  | { type: 'fullUrlStartsWith'; value: string };

export type ClickTarget = { kind: 'css'; selector: string };

export type NavigationCase = {
  id: string;
  label: string;
  click: ClickTarget;
  expect: {
    url: UrlMatch | UrlMatch[];
  };
  /** GTM 動態綁定下載連結時設為 true */
  gtmClick?: boolean;
};

export type SiteConfig = {
  id: string;
  name: string;
  homeUrl: string;
  homePopupContainer?: string;
  homePopupDismissSelector?: string;
  gtmReadyWaitMs?: number;
  navigations: NavigationCase[];
};
