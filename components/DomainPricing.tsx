'use client';

import { useState, useEffect, useCallback } from 'react';
import { DomainPricingData, DomainComparable } from '@/lib/types';

interface DomainPricingProps {
  data: DomainPricingData | null;
  isLoading: boolean;
  sourceDomain: string;
}

function formatPrice(price: number | null): string {
  if (price === null) return '-';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(price);
}

function calculateAvgComparable(comparables: DomainComparable[]): number | null {
  if (comparables.length === 0) return null;
  const sum = comparables.reduce((acc, c) => acc + c.price, 0);
  return Math.round(sum / comparables.length);
}

export default function DomainPricing({ data, isLoading, sourceDomain }: DomainPricingProps) {
  // Local state for comparables - enables optimistic updates
  const [comparables, setComparables] = useState<DomainComparable[]>([]);
  const [deletingDomain, setDeletingDomain] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Sync comparables from props when data changes
  useEffect(() => {
    if (data?.comparables) {
      setComparables(data.comparables);
    }
  }, [data?.comparables]);

  // Clear error after 3 seconds
  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => setError(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [error]);

  // Optimistic delete with rollback on failure
  const handleDismissComparable = useCallback(async (similarDomain: string) => {
    // Store current state for potential rollback
    const previousComparables = [...comparables];

    // Optimistically remove from UI immediately
    setComparables(prev => prev.filter(c => c.domain !== similarDomain));
    setDeletingDomain(similarDomain);
    setError(null);

    try {
      const response = await fetch('/api/domain-pricing', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceDomain,
          similarDomain
        })
      });

      if (!response.ok) {
        throw new Error('Failed to dismiss comparable');
      }
    } catch (err) {
      // Rollback on failure
      setComparables(previousComparables);
      setError(`Failed to dismiss ${similarDomain}`);
      console.error('Error dismissing comparable:', err);
    } finally {
      setDeletingDomain(null);
    }
  }, [comparables, sourceDomain]);

  if (isLoading) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="animate-pulse grid grid-cols-2 md:grid-cols-4 gap-6">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="space-y-3">
              <div className="h-3 bg-gray-200 rounded w-20"></div>
              <div className="h-7 bg-gray-200 rounded w-24"></div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!data || (data.minOffer === null && data.estimate === null && comparables.length === 0 && data.regYear === null)) {
    return null;
  }

  const avgComparable = calculateAvgComparable(comparables);
  const salePrice = data.minOffer;

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 overflow-hidden">
      {/* Error notification */}
      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md text-red-700 text-sm">
          {error}
        </div>
      )}

      {/* Main Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-6 md:gap-8">
        {/* Sale Price */}
        {salePrice !== null && (
          <div className="space-y-1">
            <div className="text-xs font-medium text-gray-500 uppercase tracking-wider">Sale Price</div>
            <div className="text-2xl font-bold text-green-600">{formatPrice(salePrice)}</div>
          </div>
        )}

        {/* Estimate */}
        {data.estimate !== null && (
          <div className="space-y-1">
            <div className="text-xs font-medium text-gray-500 uppercase tracking-wider">Estimate</div>
            <div className="text-2xl font-semibold text-gray-900">{formatPrice(data.estimate)}</div>
            {salePrice !== null && data.estimate > salePrice && (
              <div className="text-sm text-green-600 font-medium">
                {formatPrice(data.estimate - salePrice)} below
              </div>
            )}
          </div>
        )}

        {/* Avg Comparable */}
        {avgComparable !== null && (
          <div className="space-y-1">
            <div className="text-xs font-medium text-gray-500 uppercase tracking-wider">Avg Comparable</div>
            <div className="text-2xl font-semibold text-gray-900">{formatPrice(avgComparable)}</div>
            {salePrice !== null && avgComparable > salePrice && (
              <div className="text-sm text-green-600 font-medium">
                {Math.round(((avgComparable - salePrice) / avgComparable) * 100)}% below avg
              </div>
            )}
          </div>
        )}

        {/* Registration Year */}
        {data.regYear !== null && (
          <div className="space-y-1">
            <div className="text-xs font-medium text-gray-500 uppercase tracking-wider">Registered</div>
            <div className="text-2xl font-semibold text-gray-900">{data.regYear}</div>
            <div className="text-sm text-gray-500">
              {new Date().getFullYear() - data.regYear} years old
            </div>
          </div>
        )}

        {/* Status Badge */}
        {data.status && data.status !== 'listed' && (
          <div className="space-y-1">
            <div className="text-xs font-medium text-gray-500 uppercase tracking-wider">Status</div>
            <div className={`inline-flex items-center px-3 py-1.5 rounded-md text-sm font-semibold ${
              data.status === 'sold' ? 'bg-purple-100 text-purple-800' :
              data.status === 'under_contract' ? 'bg-yellow-100 text-yellow-800' :
              data.status === 'expired' ? 'bg-red-100 text-red-800' :
              'bg-gray-100 text-gray-800'
            }`}>
              {data.status.replace('_', ' ').toUpperCase()}
            </div>
          </div>
        )}
      </div>

      {/* Comparables Section - Dismissible tags */}
      {comparables.length > 0 && (
        <div className="mt-6 pt-5 border-t border-gray-200">
          <div className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-3">
            Comparable Sales
          </div>
          <div className="flex flex-wrap gap-2">
            {comparables.map((comp) => (
              <div
                key={comp.domain}
                className={`inline-flex items-center bg-white border border-gray-300 rounded-lg text-sm ${
                  deletingDomain === comp.domain ? 'opacity-50' : ''
                }`}
              >
                <span className="px-3 py-2">
                  <span className="font-medium text-gray-700">{comp.domain}</span>
                  <span className="ml-2 text-gray-400">{formatPrice(comp.price)}</span>
                </span>
                <button
                  type="button"
                  disabled={deletingDomain === comp.domain}
                  className={`px-3 py-2 border-l border-gray-300 text-gray-400 transition-colors ${
                    deletingDomain === comp.domain
                      ? 'cursor-not-allowed'
                      : 'cursor-pointer hover:bg-gray-100 hover:text-gray-600'
                  }`}
                  onClick={() => handleDismissComparable(comp.domain)}
                  aria-label={`Remove ${comp.domain}`}
                >
                  <span className="text-lg leading-none">&times;</span>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
