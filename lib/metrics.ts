import { format, subDays } from 'date-fns';
import { supabase } from './supabase';
import { DomainStats, ReferrerStats, BrowserStats, OSStats, DeviceStats, CountryStats, DomainHit } from './types';

// Helper function to get date range
export const getDateRange = (days: number = 7) => {
  const end = new Date();
  const start = subDays(end, days);
  return {
    start: format(start, 'yyyy-MM-dd'),
    end: format(end, 'yyyy-MM-dd'),
  };
};

// Get unique visitors count by IP for a specific domain
const getUniqueVisitors = async (domain: string, startDate: string, endDate: string) => {
  const { data, error } = await supabase
    .from('metrics_page_views')
    .select('ip')
    .eq('domain', domain)
    .gte('timestamp', `${startDate}T00:00:00Z`)
    .lte('timestamp', `${endDate}T23:59:59Z`);
  
  if (error || !data) return 0;
  
  // Count unique IPs
  const uniqueIps = new Set(data.map(item => item.ip));
  return uniqueIps.size;
};

// Get domain stats
export const getDomainStats = async (startDate: string, endDate: string): Promise<DomainStats[]> => {
  // First get all page views in the date range
  const { data, error } = await supabase
    .from('metrics_page_views')
    .select('domain')
    .gte('timestamp', `${startDate}T00:00:00Z`)
    .lte('timestamp', `${endDate}T23:59:59Z`);
  
  if (error || !data || data.length === 0) return [];

  // Count domains
  const domainCounts: Record<string, number> = {};
  data.forEach(item => {
    if (!domainCounts[item.domain]) {
      domainCounts[item.domain] = 0;
    }
    domainCounts[item.domain]++;
  });
  
  // Calculate total views
  const totalViews = data.length;

  // Get unique visitors for each domain
  const domainsWithVisitors = await Promise.all(
    Object.entries(domainCounts).map(async ([domain, views]) => {
      const visitors = await getUniqueVisitors(domain, startDate, endDate);
      return {
        domain,
        views,
        visitors,
        percentage: Math.round((views / totalViews) * 1000) / 10,
      };
    })
  );

  return domainsWithVisitors.sort((a, b) => b.views - a.views);
};

// Get referrer stats
export const getReferrerStats = async (startDate: string, endDate: string): Promise<ReferrerStats[]> => {
  const { data, error } = await supabase
    .from('metrics_page_views')
    .select('referrer_normalized, ip')
    .gte('timestamp', `${startDate}T00:00:00Z`)
    .lte('timestamp', `${endDate}T23:59:59Z`)
    .not('referrer_normalized', 'is', null);
  
  if (error || !data || data.length === 0) return [];
  
  // Count referrers and track unique visitors
  const referrerStats: Record<string, { views: number, visitors: Set<string> }> = {};
  
  data.forEach(item => {
    if (!referrerStats[item.referrer_normalized]) {
      referrerStats[item.referrer_normalized] = { views: 0, visitors: new Set() };
    }
    referrerStats[item.referrer_normalized].views++;
    referrerStats[item.referrer_normalized].visitors.add(item.ip);
  });
  
  // Calculate total views
  const totalViews = data.length;
  
  // Format the results
  const results: ReferrerStats[] = Object.entries(referrerStats).map(([referrer, stats]) => ({
    referrer,
    views: stats.views,
    visitors: stats.visitors.size,
    percentage: Math.round((stats.views / totalViews) * 1000) / 10,
  }));

  return results.sort((a, b) => b.views - a.views);
};

// Get domain hits history
export const getDomainHits = async (domain: string, startDate: string, endDate: string, includeBots: boolean = true): Promise<DomainHit[]> => {
  let query = supabase
    .from('metrics_page_views')
    .select('path, referrer_normalized, ip, timestamp, country')
    .eq('domain_normalized', domain)
    .gte('timestamp', `${startDate}T00:00:00Z`)
    .lte('timestamp', `${endDate}T23:59:59Z`);

  if (!includeBots) {
    query = query.neq('browser_normalized', 'Bot');
  }

  const { data, error } = await query.order('timestamp', { ascending: false });
  
  if (error) {
    console.error("Error fetching domain hits:", error);
    return [];
  }
  
  if (!data || data.length === 0) return [];
  
  console.log("Raw database results with country:", data.slice(0, 3));
  
  const hits = data.map(item => ({
    page: item.path || '/',
    referrer: item.referrer_normalized || '',
    ip: item.ip,
    timestamp: item.timestamp,
    country: item.country || 'unknown'
  }));
  
  console.log("Processed hits with country:", hits.slice(0, 3));
  
  return hits;
};

// Get browser stats
export const getBrowserStats = async (startDate: string, endDate: string): Promise<BrowserStats[]> => {
  const { data, error } = await supabase
    .from('metrics_page_views')
    .select('browser_normalized, ip')
    .gte('timestamp', `${startDate}T00:00:00Z`)
    .lte('timestamp', `${endDate}T23:59:59Z`)
    .not('browser_normalized', 'is', null);
  
  if (error || !data || data.length === 0) return [];
  
  const browsers: Record<string, { views: number, ips: Set<string> }> = {};
  
  data.forEach(item => {
    const browser = item.browser_normalized;
    
    if (!browsers[browser]) {
      browsers[browser] = { views: 0, ips: new Set() };
    }
    
    browsers[browser].views++;
    browsers[browser].ips.add(item.ip);
  });
  
  const totalViews = data.length;
  
  const browserStats = Object.entries(browsers).map(([browser, stats]) => ({
    browser,
    views: stats.views,
    visitors: stats.ips.size,
    percentage: Math.round((stats.views / totalViews) * 1000) / 10,
  }));
  
  return browserStats.sort((a, b) => b.views - a.views);
};

// Get OS stats
export const getOSStats = async (startDate: string, endDate: string): Promise<OSStats[]> => {
  const { data, error } = await supabase
    .from('metrics_page_views')
    .select('os_normalized, ip')
    .gte('timestamp', `${startDate}T00:00:00Z`)
    .lte('timestamp', `${endDate}T23:59:59Z`)
    .not('os_normalized', 'is', null);
  
  if (error || !data || data.length === 0) return [];
  
  const operatingSystems: Record<string, { views: number, ips: Set<string> }> = {};
  
  data.forEach(item => {
    const os = item.os_normalized;
    
    if (!operatingSystems[os]) {
      operatingSystems[os] = { views: 0, ips: new Set() };
    }
    
    operatingSystems[os].views++;
    operatingSystems[os].ips.add(item.ip);
  });
  
  const totalViews = data.length;
  
  const osStats = Object.entries(operatingSystems).map(([os, stats]) => ({
    os,
    views: stats.views,
    visitors: stats.ips.size,
    percentage: Math.round((stats.views / totalViews) * 1000) / 10,
  }));
  
  return osStats.sort((a, b) => b.views - a.views);
};

// Get device stats
export const getDeviceStats = async (startDate: string, endDate: string): Promise<DeviceStats[]> => {
  const { data, error } = await supabase
    .from('metrics_page_views')
    .select('device_normalized, ip')
    .gte('timestamp', `${startDate}T00:00:00Z`)
    .lte('timestamp', `${endDate}T23:59:59Z`)
    .not('device_normalized', 'is', null);
  
  if (error || !data || data.length === 0) return [];
  
  const devices: Record<string, { views: number, ips: Set<string> }> = {};
  
  data.forEach(item => {
    const device = item.device_normalized;
    
    if (!devices[device]) {
      devices[device] = { views: 0, ips: new Set() };
    }
    
    devices[device].views++;
    devices[device].ips.add(item.ip);
  });
  
  const totalViews = data.length;
  
  const deviceStats = Object.entries(devices).map(([device, stats]) => ({
    device,
    views: stats.views,
    visitors: stats.ips.size,
    percentage: Math.round((stats.views / totalViews) * 1000) / 10,
  }));
  
  return deviceStats.sort((a, b) => b.views - a.views);
};

// Get country stats
export const getCountryStats = async (startDate: string, endDate: string): Promise<CountryStats[]> => {
  const { data, error } = await supabase
    .from('metrics_page_views')
    .select('country, ip')
    .gte('timestamp', `${startDate}T00:00:00Z`)
    .lte('timestamp', `${endDate}T23:59:59Z`)
    .not('country', 'is', null);
  
  if (error || !data || data.length === 0) return [];
  
  const countries: Record<string, { views: number, ips: Set<string> }> = {};
  
  data.forEach(item => {
    if (!countries[item.country]) {
      countries[item.country] = { views: 0, ips: new Set() };
    }
    
    countries[item.country].views++;
    countries[item.country].ips.add(item.ip);
  });
  
  const totalViews = data.length;
  
  const countryStats = Object.entries(countries).map(([country, stats]) => ({
    country,
    views: stats.views,
    visitors: stats.ips.size,
    percentage: Math.round((stats.views / totalViews) * 1000) / 10,
  }));
  
  return countryStats.sort((a, b) => b.views - a.views);
};

// Get browser stats for a specific domain
export const getBrowserStatsForDomain = async (domain: string, startDate: string, endDate: string, includeBots: boolean = true): Promise<BrowserStats[]> => {
  const query = supabase
    .from('metrics_page_views')
    .select('browser_normalized, os_normalized, device_normalized, ip')
    .eq('domain_normalized', domain)
    .gte('timestamp', `${startDate}T00:00:00Z`)
    .lte('timestamp', `${endDate}T23:59:59Z`);

  const { data: rawData, error } = await query;
  
  if (error || !rawData || rawData.length === 0) return [];
  
  // Filter bots in code to ensure consistency
  const filteredData = includeBots 
    ? rawData 
    : rawData.filter(item => item.browser_normalized !== 'Bot');
  
  if (filteredData.length === 0) return [];

  const browsers: Record<string, { views: number, ips: Set<string> }> = {};
  
  filteredData.forEach(item => {
    const browser = item.browser_normalized === 'Bot' ? 'Bot' : (item.browser_normalized || 'Other');
    
    if (!browsers[browser]) {
      browsers[browser] = { views: 0, ips: new Set() };
    }
    
    browsers[browser].views++;
    browsers[browser].ips.add(item.ip);
  });
  
  const totalVisitors = new Set(filteredData.map(item => item.ip)).size;
  
  const browserStats = Object.entries(browsers).map(([browser, stats]) => ({
    browser,
    views: stats.views,
    visitors: stats.ips.size,
    percentage: totalVisitors > 0 ? Math.round((stats.ips.size / totalVisitors) * 100) : 0,
  }));
  
  return browserStats.sort((a, b) => b.visitors - a.visitors);
};

// Get OS stats for a specific domain
export const getOSStatsForDomain = async (domain: string, startDate: string, endDate: string, includeBots: boolean = true): Promise<OSStats[]> => {
  const query = supabase
    .from('metrics_page_views')
    .select('browser_normalized, os_normalized, device_normalized, ip')
    .eq('domain_normalized', domain)
    .gte('timestamp', `${startDate}T00:00:00Z`)
    .lte('timestamp', `${endDate}T23:59:59Z`);

  const { data: rawData, error } = await query;
  
  if (error || !rawData || rawData.length === 0) return [];
  
  const filteredData = includeBots 
    ? rawData 
    : rawData.filter(item => item.browser_normalized !== 'Bot');

  if (filteredData.length === 0) return [];
  
  const operatingSystems: Record<string, { views: number, ips: Set<string> }> = {};
  
  filteredData.forEach(item => {
    const os = item.browser_normalized === 'Bot' ? 'Bot' : (item.os_normalized || 'Other');
    
    if (!operatingSystems[os]) {
      operatingSystems[os] = { views: 0, ips: new Set() };
    }
    
    operatingSystems[os].views++;
    operatingSystems[os].ips.add(item.ip);
  });
  
  const totalVisitors = new Set(filteredData.map(item => item.ip)).size;
  
  const osStats = Object.entries(operatingSystems).map(([os, stats]) => ({
    os,
    views: stats.views,
    visitors: stats.ips.size,
    percentage: totalVisitors > 0 ? Math.round((stats.ips.size / totalVisitors) * 100) : 0,
  }));
  
  return osStats.sort((a, b) => b.visitors - a.visitors);
};

// Get device stats for a specific domain
export const getDeviceStatsForDomain = async (domain: string, startDate: string, endDate: string, includeBots: boolean = true): Promise<DeviceStats[]> => {
  const query = supabase
    .from('metrics_page_views')
    .select('browser_normalized, os_normalized, device_normalized, ip')
    .eq('domain_normalized', domain)
    .gte('timestamp', `${startDate}T00:00:00Z`)
    .lte('timestamp', `${endDate}T23:59:59Z`);

  const { data: rawData, error } = await query;
  
  if (error || !rawData || rawData.length === 0) return [];
  
  const filteredData = includeBots 
    ? rawData 
    : rawData.filter(item => item.browser_normalized !== 'Bot');

  if (filteredData.length === 0) return [];
  
  const devices: Record<string, { views: number, ips: Set<string> }> = {};
  
  filteredData.forEach(item => {
    const device = item.browser_normalized === 'Bot' ? 'Bot' : (item.device_normalized || 'Other');
    
    if (!devices[device]) {
      devices[device] = { views: 0, ips: new Set() };
    }
    
    devices[device].views++;
    devices[device].ips.add(item.ip);
  });
  
  const totalVisitors = new Set(filteredData.map(item => item.ip)).size;
  
  const deviceStats = Object.entries(devices).map(([device, stats]) => ({
    device,
    views: stats.views,
    visitors: stats.ips.size,
    percentage: totalVisitors > 0 ? Math.round((stats.ips.size / totalVisitors) * 100) : 0,
  }));
  
  return deviceStats.sort((a, b) => b.visitors - a.visitors);
};

// Get country stats for a specific domain
export const getCountryStatsForDomain = async (domain: string, startDate: string, endDate: string, includeBots: boolean = true): Promise<CountryStats[]> => {
  const query = supabase
    .from('metrics_page_views')
    .select('browser_normalized, country, ip')
    .eq('domain_normalized', domain)
    .gte('timestamp', `${startDate}T00:00:00Z`)
    .lte('timestamp', `${endDate}T23:59:59Z`);

  const { data: rawData, error } = await query;
  
  if (error || !rawData || rawData.length === 0) return [];
  
  const filteredData = includeBots 
    ? rawData 
    : rawData.filter(item => item.browser_normalized !== 'Bot');

  if (filteredData.length === 0) return [];

  const countries: Record<string, { views: number, ips: Set<string> }> = {};
  
  filteredData.forEach(item => {
    const country = item.country || 'Other';

    if (!countries[country]) {
      countries[country] = { views: 0, ips: new Set() };
    }
    
    countries[country].views++;
    countries[country].ips.add(item.ip);
  });
  
  const totalVisitors = new Set(filteredData.map(item => item.ip)).size;
  
  const countryStats = Object.entries(countries).map(([country, stats]) => ({
    country,
    views: stats.views,
    visitors: stats.ips.size,
    percentage: totalVisitors > 0 ? Math.round((stats.ips.size / totalVisitors) * 100) : 0,
  }));

  return countryStats.sort((a, b) => b.visitors - a.visitors);
}; 