'use client';

import { DomainPricingData } from '@/lib/types';

interface DomainPricingProps {
  data: DomainPricingData | null;
  isLoading: boolean;
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

function calculateAvgComparable(comparables: { domain: string; price: number }[]): number | null {
  if (comparables.length === 0) return null;
  const sum = comparables.reduce((acc, c) => acc + c.price, 0);
  return Math.round(sum / comparables.length);
}

export default function DomainPricing({ data, isLoading }: DomainPricingProps) {
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

  if (!data || (data.minOffer === null && data.estimate === null && data.comparables.length === 0 && data.regYear === null)) {
    return null; // Don't show anything if no pricing data
  }

  const avgComparable = calculateAvgComparable(data.comparables);
  const salePrice = data.minOffer;

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 overflow-hidden">
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

      {/* Comparables Section - Adobe-style dismissible tags */}
      {data.comparables.length > 0 && (
        <div className="mt-6 pt-5 border-t border-gray-200 w-full">
          <div className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-3">
            Comparable Sales
          </div>
          <div className="flex flex-wrap gap-2 max-w-full">
            {data.comparables.map((comp, index) => (
              <button
                key={index}
                type="button"
                className="inline-flex items-center gap-3 px-4 py-2 bg-white border border-gray-300 rounded-lg text-sm hover:bg-gray-50 transition-colors"
                onClick={() => {
                  // TODO: Implement delete functionality
                  console.log('Delete comparable:', comp.domain);
                }}
                aria-label={`Remove ${comp.domain}`}
              >
                <span>
                  <span className="font-medium text-gray-700">{comp.domain}</span>
                  <span className="ml-2 text-gray-400">{formatPrice(comp.price)}</span>
                </span>
                <span className="text-gray-400 text-lg leading-none">&times;</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
