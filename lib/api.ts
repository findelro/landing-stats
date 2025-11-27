import { supabase } from './supabase';
import { withRetry } from './retry';

export interface DashboardOptions {
  domains?: string[];
  excludeSelfReferrals?: boolean;
  groupReferrersByDomain?: boolean;
  minViews?: number;
  maxResultsPerSection?: number;
  includeBots?: boolean;
}

export interface EventsDashboardOptions {
  maxResultsPerSection?: number;
  includeBots?: boolean;
  excludeAcknowledged?: boolean;
}

export interface ApiError extends Error {
  code?: string;
  details?: unknown;
  attempts?: number;
}

// Convert date string (yyyy-MM-dd) to timestamp for Supabase RPC calls
// For start dates: use beginning of day (00:00:00)
// For end dates: use end of day (23:59:59)
const formatStartDate = (dateStr: string): string => {
  return `${dateStr}T00:00:00Z`;
};

const formatEndDate = (dateStr: string): string => {
  return `${dateStr}T23:59:59Z`;
};

// Function to get all dashboard data in a single call with retry logic
export const getDashboardData = async (
  startDate: string,
  endDate: string,
  options: DashboardOptions = {}
) => {
  try {
    const result = await withRetry(
      async () => {
        const { data, error } = await supabase.rpc('get_dashboard_data', {
          start_date: formatStartDate(startDate),
          end_date: formatEndDate(endDate),
          domains: options.domains || null,
          exclude_self_referrals: options.excludeSelfReferrals ?? true,
          group_referrers_by_domain: options.groupReferrersByDomain ?? true,
          min_views: options.minViews ?? 1,
          max_results_per_section: options.maxResultsPerSection ?? 50,
          include_bots: options.includeBots ?? true
        });

        if (error) {
          const apiError = new Error(
            error.message || 'Failed to fetch dashboard data'
          ) as ApiError;
          apiError.code = error.code;
          apiError.details = error.details;
          throw apiError;
        }

        return data;
      },
      {
        maxRetries: 3,
        initialDelayMs: 1000,
        maxDelayMs: 5000,
      }
    );

    return result || {
      domains: [],
      referrers: [],
      browsers: [],
      os: [],
      devices: [],
      countries: []
    };
  } catch (error: unknown) {
    console.error('Error fetching dashboard data:', error);

    const errorMessage = error instanceof Error ? error.message : 'Failed to fetch dashboard data after multiple attempts';
    const apiError = new Error(errorMessage) as ApiError;
    apiError.code = (error as ApiError).code || 'FETCH_ERROR';
    apiError.details = (error as ApiError).details;
    apiError.attempts = (error as ApiError).attempts;

    throw apiError;
  }
};

// Additional API function for external referrers with retry logic
export const getExternalReferrers = async (
  startDate: string,
  endDate: string,
  domains?: string[]
) => {
  try {
    const result = await withRetry(
      async () => {
        const { data, error } = await supabase.rpc('get_external_referrers', {
          start_date: formatStartDate(startDate),
          end_date: formatEndDate(endDate),
          domains: domains || null
        });

        if (error) {
          const apiError = new Error(
            error.message || 'Failed to fetch external referrers'
          ) as ApiError;
          apiError.code = error.code;
          apiError.details = error.details;
          throw apiError;
        }

        return data;
      },
      {
        maxRetries: 3,
        initialDelayMs: 1000,
        maxDelayMs: 5000,
      }
    );

    return result || [];
  } catch (error: unknown) {
    console.error('Error fetching external referrers:', error);

    const errorMessage = error instanceof Error ? error.message : 'Failed to fetch external referrers after multiple attempts';
    const apiError = new Error(errorMessage) as ApiError;
    apiError.code = (error as ApiError).code || 'FETCH_ERROR';
    apiError.details = (error as ApiError).details;
    apiError.attempts = (error as ApiError).attempts;

    throw apiError;
  }
};

// Function to get events dashboard data with retry logic
export const getEventsDashboardData = async (
  startDate: string,
  endDate: string,
  options: EventsDashboardOptions = {}
) => {
  try {
    const result = await withRetry(
      async () => {
        const { data, error } = await supabase.rpc('get_events_dashboard_data', {
          start_date: formatStartDate(startDate),
          end_date: formatEndDate(endDate),
          max_results_per_section: options.maxResultsPerSection ?? 50,
          include_bots: options.includeBots ?? true,
          exclude_acknowledged: options.excludeAcknowledged ?? true
        });

        if (error) {
          const apiError = new Error(
            error.message || 'Failed to fetch events dashboard data'
          ) as ApiError;
          apiError.code = error.code;
          apiError.details = error.details;
          throw apiError;
        }

        return data;
      },
      {
        maxRetries: 3,
        initialDelayMs: 1000,
        maxDelayMs: 5000,
      }
    );

    return result || {
      event_types: [],
      browsers: [],
      os: [],
      devices: [],
      countries: []
    };
  } catch (error: unknown) {
    console.error('Error fetching events dashboard data:', error);

    const errorMessage = error instanceof Error ? error.message : 'Failed to fetch events dashboard data after multiple attempts';
    const apiError = new Error(errorMessage) as ApiError;
    apiError.code = (error as ApiError).code || 'FETCH_ERROR';
    apiError.details = (error as ApiError).details;
    apiError.attempts = (error as ApiError).attempts;

    throw apiError;
  }
}; 