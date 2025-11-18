import React from 'react';
import * as SimpleIcons from 'simple-icons';
import Image from 'next/image';

interface OSIconProps {
  osName: string;
  size?: number;
  className?: string;
}

// Mapping of OS names to Simple Icons slugs (only for OSes available in Simple Icons)
const simpleIconsMap: Record<string, string> = {
  // macOS/iOS (use Apple icon for macOS)
  'macos': 'macos',
  'mac os x': 'macos',
  'mac os': 'macos',
  'ios': 'ios',
  'iphone os': 'ios',

  // Android
  'android': 'android',

  // Linux
  'linux': 'linux',
  'ubuntu': 'ubuntu',
  'debian': 'debian',
  'fedora': 'fedora',
  'arch': 'archlinux',
  'archlinux': 'archlinux',
  'mint': 'linuxmint',
  'linux mint': 'linuxmint',
  'manjaro': 'manjaro',
  'opensuse': 'opensuse',
  'rocky linux': 'rockylinux',
  'alma linux': 'almalinux',
  'almalinux': 'almalinux',
  'alpine': 'alpinelinux',
  'alpine linux': 'alpinelinux',
  'kali': 'kalilinux',
  'kali linux': 'kalilinux',

  // BSD
  'freebsd': 'freebsd',
  'openbsd': 'openbsd',
  'netbsd': 'netbsd',
  'bsd': 'bsd',
};

// Mapping for PNG fallback images (for OSes NOT in Simple Icons)
const pngIconMap: Record<string, string> = {
  // Shared icons across categories
  'bot': '/images/bot.png',
  'other': '/images/other.png',

  // Windows variants (not in Simple Icons)
  'windows': '/images/os/windows-10.png',
  'windows 10': '/images/os/windows-10.png',
  'windows 11': '/images/os/windows-10.png',
  'windows 8.1': '/images/os/windows-8-1.png',
  'windows 8': '/images/os/windows-8.png',
  'windows 7': '/images/os/windows-7.png',
  'windows xp': '/images/os/windows-xp.png',
  'windows server 2003': '/images/os/windows-server-2003.png',
  'windows phone': '/images/os/windows-10.png',
  'windows mobile': '/images/os/windows-mobile.png',

  // Chrome OS (use chromeos.png)
  'chrome os': '/images/os/chromeos.png',
  'chromeos': '/images/os/chromeos.png',
  'chromium os': '/images/os/chromeos.png',

  // Other OSes not in Simple Icons
  'solaris': '/images/os/sun-os.png',
  'sunos': '/images/os/sun-os.png',
  'sun os': '/images/os/sun-os.png',

  // Kindle uses Amazon icon
  'kindle': '/images/os/amazon-os.png',

  // Other legacy OSes
  'blackberry': '/images/os/blackberry-os.png',
  'qnx': '/images/os/qnx.png',
  'beos': '/images/os/beos.png',
};

export default function OSIcon({ osName, size = 20, className = '' }: OSIconProps) {
  // Normalize OS name to lowercase for matching
  const normalizedName = osName.toLowerCase().trim();

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
      // Simple Icons exports are named: si + capitalized slug (e.g., siMacos, siAndroid, siArchlinux)
      const iconKey = `si${iconSlug.charAt(0).toUpperCase()}${iconSlug.slice(1)}`;
      const icon = (SimpleIcons as any)[iconKey];

      if (icon) {
        return (
          <div
            className={`inline-flex items-center justify-center ${className}`}
            style={{ width: size, height: size }}
            title={osName}
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
      console.error(`[OSIcon] Error loading Simple Icon for "${osName}":`, error);
    }
  }

  // 2. Fall back to PNG images for OSes not in Simple Icons
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
        title={osName}
      >
        <Image
          src={pngPath}
          alt={osName}
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

  // 3. Final fallback: generic question mark icon for truly unknown OS
  return (
    <div
      className={`inline-flex items-center justify-center ${className}`}
      style={{ width: size, height: size }}
      title={osName}
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
