import React, { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { countries } from 'countries-list';
import OSIcon from './OSIcon';
import BrowserIcon from './BrowserIcon';

// Simplified TableData interface that doesn't require an index signature
interface TableData {
  visitors: number;
  percentage: number;
}

interface TableWithPercentageProps<T extends TableData> {
  data: T[];
  title: string;
  nameKey: keyof T;
  showFlags?: boolean;
  className?: string;
  namePlaceholder?: string;
  startDate?: string;
  endDate?: string;
  initialItemsToShow?: number;
  itemsPerLoad?: number;
  showAllByDefault?: boolean;
}

export default function TableWithPercentage<T extends TableData>({
  data,
  title,
  nameKey,
  showFlags = false,
  className = '',
  namePlaceholder = 'Other',
  startDate,
  endDate,
  initialItemsToShow = 10,
  itemsPerLoad = 20,
  showAllByDefault = false,
}: TableWithPercentageProps<T>) {
  const pathname = usePathname();
  const isHomePage = pathname === '/';
  
  // State for progressive loading
  const [itemsToShow, setItemsToShow] = useState(
    showAllByDefault ? data.length : initialItemsToShow
  );

  if (!data || data.length === 0) {
    return <div className="text-gray-500 text-center py-4">No data available</div>;
  }

  // Sort data by visitors in descending order
  const sortedData = [...data].sort((a, b) => b.visitors - a.visitors);
  
  // Get the data to display based on current state
  const displayedData = sortedData.slice(0, itemsToShow);
  const hasMoreData = itemsToShow < sortedData.length;

  // Function to load more items
  const handleLoadMore = () => {
    setItemsToShow(prev => Math.min(prev + itemsPerLoad, sortedData.length));
  };

  // Function to show all items
  const handleShowAll = () => {
    setItemsToShow(sortedData.length);
  };

  // Function to show less items (back to initial)
  const handleShowLess = () => {
    setItemsToShow(initialItemsToShow);
  };

  // Function to get the appropriate icon for devices (only used for devices now)
  const getDeviceIcon = (name: string): string => {
    const normalizedName = name.toLowerCase().replace(/\s+/g, '-');

    // Shared icons
    if (name === 'Bot') return '/images/bot.png';
    if (name === 'Other') return '/images/other.png';

    // Device mappings
    if (normalizedName.includes('desktop')) return '/images/device/desktop.png';
    if (normalizedName.includes('laptop')) return '/images/device/laptop.png';
    if (normalizedName.includes('mobile') || normalizedName.includes('phone')) return '/images/device/mobile.png';
    if (normalizedName.includes('tablet')) return '/images/device/tablet.png';

    return `/images/device/${normalizedName}.png`;
  };

  // Function to check if item is a referrer
  const isReferrer = () => {
    return title === 'Referrers' && nameKey === 'referrer';
  };

  // Function to check if item is a domain
  const isDomain = () => {
    return title === 'Domains' && nameKey === 'domain';
  };

  // Function to check if item is an action type
  const isActionType = () => {
    return title === 'Event Types' && nameKey === 'event_type';
  };

  // Function to render the name cell based on item type
  const renderNameCell = (item: T, index: number, keyValue: string, displayName: string) => {
    // Determine if item should be clickable
    const isClickableReferrer = isReferrer() && isHomePage && displayName !== namePlaceholder;
    const isClickableDomain = isDomain() && isHomePage && displayName !== namePlaceholder;
    const isClickableActionType = isActionType() && displayName !== namePlaceholder;

    if (isClickableReferrer) {
      const href = `/referrer?domain=${encodeURIComponent(displayName)}${startDate ? `&startDate=${startDate}` : ''}${endDate ? `&endDate=${endDate}` : ''}`;

      return (
        <Link href={href} className="flex items-center hover:text-blue-600 cursor-pointer">
          {title === 'OS' ? (
            <div className="w-5 h-5 mr-2 relative flex-shrink-0 flex items-center justify-center">
              <OSIcon osName={displayName} size={20} />
            </div>
          ) : title === 'Browsers' ? (
            <div className="w-5 h-5 mr-2 relative flex-shrink-0 flex items-center justify-center">
              <BrowserIcon browserName={displayName} size={20} />
            </div>
          ) : title === 'Devices' ? (
            <div className="w-5 h-5 mr-2 relative flex-shrink-0 flex items-center justify-center">
              <Image
                src={getDeviceIcon(displayName)}
                alt={displayName}
                width={20}
                height={20}
                unoptimized
                style={{
                  objectFit: 'contain',
                  width: '100%',
                  height: '100%'
                }}
                onError={(e) => {
                  // Fallback to unknown icon if the specific icon fails to load
                  (e.target as HTMLImageElement).src = '/images/browser/unknown.png';
                }}
              />
            </div>
          ) : null}
          <span>{displayName}</span>
        </Link>
      );
    }

    if (isClickableDomain) {
      const href = `/domain?domain=${encodeURIComponent(displayName)}${startDate ? `&startDate=${startDate}` : ''}${endDate ? `&endDate=${endDate}` : ''}`;

      return (
        <Link href={href} className="flex items-center hover:text-blue-600">
          <span>{displayName}</span>
        </Link>
      );
    }

    if (isClickableActionType) {
      const href = `/action-type?actionType=${encodeURIComponent(displayName)}${startDate ? `&startDate=${startDate}` : ''}${endDate ? `&endDate=${endDate}` : ''}`;

      return (
        <Link href={href} className="flex items-center hover:text-blue-600">
          <span>{displayName}</span>
        </Link>
      );
    }

    return (
      <div className="flex items-center">
        {title === 'OS' ? (
          <div className="w-5 h-5 mr-2 relative flex-shrink-0 flex items-center justify-center">
            <OSIcon osName={displayName} size={20} />
          </div>
        ) : title === 'Browsers' ? (
          <div className="w-5 h-5 mr-2 relative flex-shrink-0 flex items-center justify-center">
            <BrowserIcon browserName={displayName} size={20} />
          </div>
        ) : title === 'Devices' ? (
          <div className="w-5 h-5 mr-2 relative flex-shrink-0 flex items-center justify-center">
            <Image
              src={getDeviceIcon(displayName)}
              alt={displayName}
              width={20}
              height={20}
              unoptimized
              style={{
                objectFit: 'contain',
                width: '100%',
                height: '100%'
              }}
              onError={(e) => {
                // Fallback to unknown icon if the specific icon fails to load
                (e.target as HTMLImageElement).src = '/images/browser/unknown.png';
              }}
            />
          </div>
        ) : null}
        <span>{displayName}</span>
      </div>
    );
  };

  return (
    <div className={`${className}`}>
      <table className="min-w-full divide-y divide-gray-100">
        <thead className="bg-white">
          <tr>
            <th scope="col" className="px-4 py-3 text-left text-sm font-semibold text-gray-900 tracking-wider">
              {title}
            </th>
            <th scope="col" className="px-4 py-3 text-right text-sm font-semibold text-gray-900 tracking-wider">
              Visitors
            </th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-100">
          {displayedData.map((item, index) => {
            // Safely convert the key value to string
            const keyValue = String(item[nameKey] || '');
            const isUnknown = keyValue.toUpperCase() === 'ZZ' || !keyValue;
            const displayName = isUnknown ? namePlaceholder : keyValue;
            
            return (
              <tr
                key={index}
                className="hover:bg-gray-50"
              >
                <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900">
                  {showFlags ? (
                    <div className="flex items-center">
                      <span className="mr-2 w-5 h-5 flex items-center justify-center">{getCountryFlag(keyValue)}</span>
                      <span>{keyValue === 'ZZ' ? 'Other' : (countries[keyValue.toUpperCase() as keyof typeof countries]?.name || 'Other')}</span>
                    </div>
                  ) : (
                    renderNameCell(item, index, keyValue, displayName)
                  )}
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-right text-sm">
                  <div className="relative flex items-center justify-end h-full">
                    <span className="font-semibold text-gray-900 pr-[52px]">
                      {item.visitors.toLocaleString()}
                    </span>
                    <div className="absolute right-[40px] top-1/2 transform -translate-y-1/2 w-px h-5 bg-gray-900"></div>
                    <div className="absolute right-0 top-1/2 transform -translate-y-1/2">
                      {/* Container for percentage and bar */}
                      <div className="relative flex items-center">
                        {/* Bar graph extending to the right */}
                        <div className="absolute left-0 w-[120px]">
                          <div
                            className="absolute top-1/2 -translate-y-1/2 left-0 h-5 bg-blue-50"
                            style={{
                              width: `calc(60px * ${item.percentage} / 100)`,
                            }}
                          ></div>
                        </div>
                        {/* Percentage text */}
                        <span className="relative z-10 w-[40px] text-center text-gray-900 px-1 py-0.5">
                          {item.percentage.toFixed(0)}%
                        </span>
                      </div>
                    </div>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {/* Pagination footer - only show if there's more data or we're showing more than initial */}
      {(hasMoreData || (itemsToShow > initialItemsToShow && !showAllByDefault)) && (
        <div className="flex justify-center items-center py-3 space-x-2">
          {hasMoreData && (
            <>
              <button 
                className="flex items-center px-3 py-1.5 text-sm text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded-md transition-colors duration-200" 
                onClick={handleLoadMore}
                aria-label={`Load ${itemsPerLoad} more items`}
              >
                More
                <svg className="ml-1 w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              <span className="text-gray-400" aria-hidden="true">|</span>
              <button 
                className="flex items-center px-3 py-1.5 text-sm text-gray-600 hover:text-gray-800 hover:bg-gray-50 rounded-md transition-colors duration-200" 
                onClick={handleShowAll}
                aria-label={`Show all ${sortedData.length} items`}
              >
                Show All ({sortedData.length - itemsToShow} remaining)
              </button>
            </>
          )}
          {itemsToShow >= sortedData.length && sortedData.length > initialItemsToShow && !showAllByDefault && (
            <>
              <button 
                className="flex items-center px-3 py-1.5 text-sm text-gray-600 hover:text-gray-800 hover:bg-gray-50 rounded-md transition-colors duration-200" 
                onClick={handleShowLess}
                aria-label={`Show only first ${initialItemsToShow} items`}
              >
                Show Less
                <svg className="ml-1 w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                </svg>
              </button>
              <span className="text-gray-400" aria-hidden="true">|</span>
              <span className="text-sm text-gray-500">
                Showing all {sortedData.length} items
              </span>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// Helper function to get country flag emoji
function getCountryFlag(countryCode: string): string {
  if (!countryCode || countryCode.length !== 2) {
    return '🏴';
  }
  
  // Special case for "ZZ" - return white flag
  if (countryCode.toUpperCase() === 'ZZ') {
    return '🏳️';
  }
  
  const codePoints = countryCode
    .toUpperCase()
    .split('')
    .map(char => 127397 + char.charCodeAt(0));
  
  return String.fromCodePoint(...codePoints);
} 