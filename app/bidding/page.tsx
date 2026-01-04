'use client';

import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import Header from '@/components/Header';
import StatsCard from '@/components/StatsCard';
import { SniperDomain } from '@/lib/types';

const INITIAL_ITEMS = 10;
const ITEMS_PER_LOAD = 10;

function getStateColor(state: string): string {
  switch (state) {
    case 'won':
      return 'bg-green-100 text-green-800';
    case 'lost':
      return 'bg-red-100 text-red-800';
    case 'error':
      return 'bg-red-100 text-red-800';
    case 'cancelled':
      return 'bg-gray-100 text-gray-800';
    case 'sniping':
      return 'bg-yellow-100 text-yellow-800';
    case 'approaching':
      return 'bg-orange-100 text-orange-800';
    case 'watching':
      return 'bg-blue-100 text-blue-800';
    case 'pending':
      return 'bg-purple-100 text-purple-800';
    default:
      return 'bg-gray-100 text-gray-800';
  }
}

function formatTimeRemaining(endTime: string | null): string {
  if (!endTime) return '-';

  const now = new Date();
  const end = new Date(endTime);
  const diff = end.getTime() - now.getTime();

  if (diff <= 0) return 'Ended';

  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((diff % (1000 * 60)) / 1000);

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  } else {
    return `${seconds}s`;
  }
}

function formatPrice(price: number | null): string {
  if (price === null || price === undefined) return '-';
  return `$${Number(price).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

interface DomainTableProps {
  domains: SniperDomain[];
  title: string;
  showState?: boolean;
  initialItems?: number;
}

function DomainTable({ domains, title, showState = true, initialItems = INITIAL_ITEMS }: DomainTableProps) {
  const [itemsToShow, setItemsToShow] = useState(initialItems);

  const displayedDomains = domains.slice(0, itemsToShow);
  const hasMoreData = itemsToShow < domains.length;

  if (domains.length === 0) {
    return (
      <div className="text-gray-500 text-center py-8">
        No {title.toLowerCase()} found
      </div>
    );
  }

  return (
    <>
      <table className="min-w-full divide-y divide-gray-100">
        <thead className="bg-white">
          <tr>
            <th scope="col" className="px-4 py-3 text-left text-sm font-semibold text-gray-900 tracking-wider">
              {title}
            </th>
            {showState && (
              <th scope="col" className="px-4 py-3 text-left text-sm font-semibold text-gray-900 tracking-wider">
                State
              </th>
            )}
            <th scope="col" className="px-4 py-3 text-right text-sm font-semibold text-gray-900 tracking-wider">
              Max Bid
            </th>
            <th scope="col" className="px-4 py-3 text-right text-sm font-semibold text-gray-900 tracking-wider">
              Current
            </th>
            <th scope="col" className="px-4 py-3 text-center text-sm font-semibold text-gray-900 tracking-wider">
              Winning
            </th>
            <th scope="col" className="px-4 py-3 text-right text-sm font-semibold text-gray-900 tracking-wider">
              Time Left
            </th>
            <th scope="col" className="px-4 py-3 text-left text-sm font-semibold text-gray-900 tracking-wider">
              End Time
            </th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-100">
          {displayedDomains.map((domain) => (
            <tr key={domain.domain_name} className="hover:bg-gray-50">
              <td className="px-4 py-3 text-sm font-medium text-gray-900">
                {domain.domain_name}
              </td>
              {showState && (
                <td className="px-4 py-3">
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStateColor(domain.state)}`}>
                    {domain.state}
                  </span>
                </td>
              )}
              <td className="px-4 py-3 text-right text-sm font-semibold text-gray-900">
                {formatPrice(domain.max_bid)}
              </td>
              <td className="px-4 py-3 text-right text-sm text-gray-900">
                {formatPrice(domain.current_price)}
              </td>
              <td className="px-4 py-3 text-center">
                {domain.winning === true && (
                  <span className="text-green-600 font-bold">✓</span>
                )}
                {domain.winning === false && (
                  <span className="text-red-600">✗</span>
                )}
                {domain.winning === null && (
                  <span className="text-gray-400">-</span>
                )}
              </td>
              <td className="px-4 py-3 text-right text-sm">
                <span className={
                  domain.current_end_time && new Date(domain.current_end_time).getTime() - Date.now() < 10 * 60 * 1000
                    ? 'text-red-600 font-medium'
                    : 'text-gray-900'
                }>
                  {formatTimeRemaining(domain.current_end_time)}
                </span>
              </td>
              <td className="px-4 py-3 text-sm text-gray-500">
                {domain.current_end_time
                  ? format(new Date(domain.current_end_time), 'MMM d, HH:mm:ss')
                  : '-'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Pagination footer - same style as TableWithPercentage */}
      {(hasMoreData || itemsToShow > initialItems) && (
        <div className="flex justify-center items-center py-3 space-x-2">
          {hasMoreData && (
            <>
              <button
                className="flex items-center px-3 py-1.5 text-sm text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded-md transition-colors duration-200"
                onClick={() => setItemsToShow(prev => Math.min(prev + ITEMS_PER_LOAD, domains.length))}
              >
                More
                <svg className="ml-1 w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              <span className="text-gray-400">|</span>
              <button
                className="flex items-center px-3 py-1.5 text-sm text-gray-600 hover:text-gray-800 hover:bg-gray-50 rounded-md transition-colors duration-200"
                onClick={() => setItemsToShow(domains.length)}
              >
                Show All ({domains.length - itemsToShow} remaining)
              </button>
            </>
          )}
          {itemsToShow >= domains.length && domains.length > initialItems && (
            <>
              <button
                className="flex items-center px-3 py-1.5 text-sm text-gray-600 hover:text-gray-800 hover:bg-gray-50 rounded-md transition-colors duration-200"
                onClick={() => setItemsToShow(initialItems)}
              >
                Show Less
                <svg className="ml-1 w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                </svg>
              </button>
              <span className="text-gray-400">|</span>
              <span className="text-sm text-gray-500">
                Showing all {domains.length} items
              </span>
            </>
          )}
        </div>
      )}
    </>
  );
}

export default function BiddingPage() {
  const [domains, setDomains] = useState<SniperDomain[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [, setTick] = useState(0);

  // Fetch all domains (no filter - we'll filter client-side)
  useEffect(() => {
    const fetchDomains = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch('/api/bidding?filter=all');

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to fetch data');
        }

        const result = await response.json();
        setDomains(result.data);
      } catch (err) {
        console.error('Error fetching bidding data:', err);
        setError(err instanceof Error ? err.message : 'An unknown error occurred');
      } finally {
        setIsLoading(false);
      }
    };

    fetchDomains();

    // Refresh every 30 seconds
    const interval = setInterval(fetchDomains, 30000);
    return () => clearInterval(interval);
  }, []);

  // Update time remaining every second
  useEffect(() => {
    const interval = setInterval(() => {
      setTick(t => t + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Split domains into active and finished
  const activeDomains = domains.filter(d => !['won', 'lost', 'cancelled', 'error'].includes(d.state));
  const finishedDomains = domains.filter(d => ['won', 'lost', 'cancelled', 'error'].includes(d.state));
  const wonCount = domains.filter(d => d.state === 'won').length;
  const lostCount = domains.filter(d => d.state === 'lost').length;

  if (isLoading) {
    return (
      <>
        <Header />
        <main>
          <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
            </div>
          </div>
        </main>
      </>
    );
  }

  if (error) {
    return (
      <>
        <Header />
        <main>
          <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
            <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded relative" role="alert">
              <strong className="font-bold">Error: </strong>
              <span className="block sm:inline">{error}</span>
            </div>
          </div>
        </main>
      </>
    );
  }

  return (
    <>
      <Header />
      <main>
        <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
          <div className="space-y-6">
            {/* Active Sniping Sessions - Primary Section */}
            <StatsCard title={`Active Sniping Sessions (${activeDomains.length})`}>
              <DomainTable
                domains={activeDomains}
                title="Domain"
                showState={true}
                initialItems={20}
              />
            </StatsCard>

            {/* Summary Stats */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-6 md:gap-8">
                <div className="space-y-1">
                  <div className="text-xs font-medium text-gray-500 uppercase tracking-wider">Total Domains</div>
                  <div className="text-2xl font-semibold text-gray-900">{domains.length}</div>
                </div>
                <div className="space-y-1">
                  <div className="text-xs font-medium text-gray-500 uppercase tracking-wider">Active</div>
                  <div className="text-2xl font-semibold text-blue-600">{activeDomains.length}</div>
                </div>
                <div className="space-y-1">
                  <div className="text-xs font-medium text-gray-500 uppercase tracking-wider">Won</div>
                  <div className="text-2xl font-semibold text-green-600">{wonCount}</div>
                </div>
                <div className="space-y-1">
                  <div className="text-xs font-medium text-gray-500 uppercase tracking-wider">Lost</div>
                  <div className="text-2xl font-semibold text-red-600">{lostCount}</div>
                </div>
              </div>
            </div>

            {/* Finished Auctions */}
            {finishedDomains.length > 0 && (
              <StatsCard title={`Finished Auctions (${finishedDomains.length})`}>
                <DomainTable
                  domains={finishedDomains}
                  title="Domain"
                  showState={true}
                  initialItems={INITIAL_ITEMS}
                />
              </StatsCard>
            )}

            {/* Auto-refresh indicator */}
            <div className="text-center text-xs text-gray-400">
              Auto-refreshes every 30 seconds
            </div>
          </div>
        </div>
      </main>
    </>
  );
}
