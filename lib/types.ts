export interface PageView {
  id: number;
  timestamp: string;
  ip: string;
  country: string;
  user_agent: string;
  browser_normalized: string;
  os_normalized: string;
  device_normalized: string;
  referrer: string;
  referrer_normalized: string;
  domain: string;
  path: string;
}

export interface DomainStats {
  domain: string;
  views: number;
  visitors: number;
  percentage: number;
}

export interface ReferrerStats {
  referrer: string;
  views: number;
  visitors: number;
  percentage: number;
}

export interface ReferrerTargetStats {
  referrerPage: string;
  targetPage: string;
  views: number;
  visitors: number;
  percentage: number;
}

export interface BrowserStats {
  browser: string;
  views: number;
  visitors: number;
  percentage: number;
}

export interface OSStats {
  os: string;
  views: number;
  visitors: number;
  percentage: number;
}

export interface DeviceStats {
  device: string;
  views: number;
  visitors: number;
  percentage: number;
}

export interface CountryStats {
  country: string;
  views: number;
  visitors: number;
  percentage: number;
}

export interface DomainHit {
  page: string;
  referrer: string;
  ip: string;
  timestamp: string;
  country: string;
} 