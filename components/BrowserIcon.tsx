import React from 'react';
import * as SimpleIcons from 'simple-icons';
import Image from 'next/image';

interface BrowserIconProps {
  browserName: string;
  size?: number;
  className?: string;
}

// Mapping of browser names to Simple Icons slugs (only browsers that exist in Simple Icons)
const simpleIconsMap: Record<string, string> = {
  // Chrome variants
  'chrome': 'googlechrome',
  'google chrome': 'googlechrome',
  'chrome (ios)': 'googlechrome',
  'crios': 'googlechrome',
  'chrome (webview)': 'googlechrome',
  'chromium': 'googlechrome',
  'chromium-webview': 'googlechrome',
  'android webview': 'googlechrome',
  'ios webview': 'googlechrome',

  // Firefox variants (use 'firefox' not 'firefoxbrowser')
  'firefox': 'firefox',
  'mozilla firefox': 'firefox',
  'firefox (ios)': 'firefox',
  'fxios': 'firefox',

  // Safari
  'safari': 'safari',
  'mobile safari': 'safari',

  // Opera
  'opera': 'opera',
  'opera mini': 'opera',

  // Brave
  'brave': 'brave',

  // Vivaldi
  'vivaldi': 'vivaldi',

  // Other browsers available in Simple Icons
  'android': 'android',
  'instagram': 'instagram',
  'facebook': 'facebook',
};

// Mapping for PNG fallback images (for browsers NOT in Simple Icons or special cases)
const pngIconMap: Record<string, string> = {
  // Special icons we want to keep
  'bot': '/images/bot.png',
  'other': '/images/other.png',

  // Edge variants (not in Simple Icons)
  'edge': '/images/browser/edge-chromium.png',
  'microsoft edge': '/images/browser/edge-chromium.png',
  'edge (chromium)': '/images/browser/edge-chromium.png',
  'edge chromium': '/images/browser/edge-chromium.png',
  'edge-chromium': '/images/browser/edge-chromium.png',

  // Samsung Internet (not in Simple Icons)
  'samsung': '/images/browser/samsung.png',
  'samsung internet': '/images/browser/samsung.png',

  // Yandex (not in Simple Icons)
  'yandex': '/images/browser/yandexbrowser.png',
  'yandex browser': '/images/browser/yandexbrowser.png',

  // IE (not in Simple Icons)
  'ie': '/images/browser/ie.png',
  'internet explorer': '/images/browser/ie.png',
  'msie': '/images/browser/ie.png',

  // Amazon Silk
  'silk': '/images/browser/silk.png',

  // Other browsers
  'aol': '/images/browser/aol.png',
  'blackberry': '/images/browser/blackberry.png',
  'beaker': '/images/browser/beaker.png',
  'miui': '/images/browser/miui.png',
  'curl': '/images/browser/curl.png',
  'kakaotalk': '/images/browser/kakaotalk.png',
};

export default function BrowserIcon({ browserName, size = 20, className = '' }: BrowserIconProps) {
  // Normalize browser name to lowercase for matching
  const normalizedName = browserName.toLowerCase().trim();

  // 1. Try to find in Simple Icons first
  let iconSlug = simpleIconsMap[normalizedName];

  // If no exact match, try partial matches in Simple Icons
  if (!iconSlug) {
    const matchingKey = Object.keys(simpleIconsMap).find(key =>
      normalizedName.includes(key) || key.includes(normalizedName)
    );
    if (matchingKey) {
      iconSlug = simpleIconsMap[matchingKey];
    }
  }

  // If found in Simple Icons, render SVG
  if (iconSlug) {
    try {
      // Convert slug to proper Simple Icons export name
      // Simple Icons exports are named: si + capitalized slug (e.g., siGooglechrome, siFirefoxbrowser)
      const iconKey = `si${iconSlug.charAt(0).toUpperCase()}${iconSlug.slice(1)}`;
      const icon = SimpleIcons[iconKey as keyof typeof SimpleIcons] as { title: string; hex: string; path: string } | undefined;

      if (icon) {
        return (
          <div
            className={`inline-flex items-center justify-center ${className}`}
            style={{ width: size, height: size }}
            title={browserName}
          >
            <svg
              role="img"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
              fill={`#${icon.hex}`}
              width={size}
              height={size}
            >
              <title>{icon.title}</title>
              <path d={icon.path} />
            </svg>
          </div>
        );
      }
    } catch (error) {
      console.error(`[BrowserIcon] Error loading Simple Icon for "${browserName}":`, error);
    }
  }

  // 2. Fall back to PNG images for browsers not in Simple Icons
  let pngPath = pngIconMap[normalizedName];

  // If no exact match, try partial matches in PNG map
  if (!pngPath) {
    const matchingKey = Object.keys(pngIconMap).find(key =>
      normalizedName.includes(key) || key.includes(normalizedName)
    );
    if (matchingKey) {
      pngPath = pngIconMap[matchingKey];
    }
  }

  // If found in PNG map, render Image
  if (pngPath) {
    return (
      <div
        className={`inline-flex items-center justify-center ${className}`}
        style={{ width: size, height: size }}
        title={browserName}
      >
        <Image
          src={pngPath}
          alt={browserName}
          width={size}
          height={size}
          unoptimized
          style={{
            objectFit: 'contain',
            width: '100%',
            height: '100%'
          }}
          onError={(e) => {
            // Fallback to unknown icon if PNG fails to load
            (e.target as HTMLImageElement).src = '/images/browser/unknown.png';
          }}
        />
      </div>
    );
  }

  // 3. Final fallback: generic question mark icon for truly unknown browser
  return (
    <div
      className={`inline-flex items-center justify-center ${className}`}
      style={{ width: size, height: size }}
      title={browserName}
    >
      <svg
        viewBox="0 0 24 24"
        xmlns="http://www.w3.org/2000/svg"
        fill="#9CA3AF"
        width={size}
        height={size}
      >
        <title>Other</title>
        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 17h-2v-2h2v2zm2.07-7.75l-.9.92C13.45 12.9 13 13.5 13 15h-2v-.5c0-1.1.45-2.1 1.17-2.83l1.24-1.26c.37-.36.59-.86.59-1.41 0-1.1-.9-2-2-2s-2 .9-2 2H8c0-2.21 1.79-4 4-4s4 1.79 4 4c0 .88-.36 1.68-.93 2.25z" />
      </svg>
    </div>
  );
}
