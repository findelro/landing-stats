import { supabase } from './supabase';
import { format } from 'date-fns';

export interface DashboardOptions {
  domains?: string[];
  excludeSelfReferrals?: boolean;
  groupReferrersByDomain?: boolean;
  minViews?: number;
  maxResultsPerSection?: number;
  includeBots?: boolean;
}

// Format the date for the Supabase API call
const formatDate = (date: Date): string => {
  return format(date, "yyyy-MM-dd'T'HH:mm:ss'Z'");
};

// Function to get all dashboard data in a single call
export const getDashboardData = async (
  startDate: Date,
  endDate: Date,
  options: DashboardOptions = {}
) => {
  const { data, error } = await supabase.rpc('get_dashboard_data', {
    start_date: formatDate(startDate),
    end_date: formatDate(endDate),
    domains: options.domains || null,
    exclude_self_referrals: options.excludeSelfReferrals ?? true,
    group_referrers_by_domain: options.groupReferrersByDomain ?? true,
    min_views: options.minViews ?? 1,
    max_results_per_section: options.maxResultsPerSection ?? 50,
    include_bots: options.includeBots ?? true
  });
  
  if (error) {
    console.error('Error fetching dashboard data:', error);
    return {
      domains: [],
      referrers: [],
      browsers: [],
      os: [],
      devices: [],
      countries: []
    };
  }
  
  return data || {
    domains: [],
    referrers: [],
    browsers: [],
    os: [],
    devices: [],
    countries: []
  };
};

// Additional API function for external referrers
export const getExternalReferrers = async (
  startDate: Date,
  endDate: Date,
  domains?: string[]
) => {
  const { data, error } = await supabase.rpc('get_external_referrers', {
    start_date: formatDate(startDate),
    end_date: formatDate(endDate),
    domains: domains || null
  });

  if (error) {
    console.error('Error fetching referrers:', error);
    return [];
  }

  return data || [];
}; 