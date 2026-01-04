/**
 * Client for the Sniper API at api.findelro.xyz
 */

const API_BASE_URL = 'https://api.findelro.xyz';

interface ApiResponse<T> {
  data: T;
}

interface ApiErrorResponse {
  error: string;
  detail?: string;
}

class SniperApiError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public detail?: string
  ) {
    super(message);
    this.name = 'SniperApiError';
  }
}

async function fetchApi<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const apiKey = process.env.SNIPER_API_KEY;

  if (!apiKey) {
    throw new SniperApiError('SNIPER_API_KEY not configured', 500);
  }

  const url = `${API_BASE_URL}${endpoint}`;

  const response = await fetch(url, {
    ...options,
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!response.ok) {
    const errorData = await response.json() as ApiErrorResponse;
    throw new SniperApiError(
      errorData.error || 'API request failed',
      response.status,
      errorData.detail
    );
  }

  return response.json() as Promise<T>;
}

export interface SniperDomain {
  domain_name: string;
  state: string;
  strategy: string;
  max_bid: number | null;
  current_price: number | null;
  minimum_next_bid: number | null;
  winning: boolean | null;
  current_end_time: string | null;
  original_end_time: string | null;
  auction_id: string | null;
  created_at: string | null;
}

export interface SniperBid {
  id: number;
  domain_name: string;
  amount: number | null;
  result: string | null;
  winning: boolean | null;
  created_at: string | null;
  response: string | null;
}

export interface SniperEvent {
  id: number;
  domain_name: string;
  event_type: string;
  old_state: string | null;
  new_state: string | null;
  details: string | null;
  created_at: string | null;
}

export async function getSniperDomains(
  filter?: 'active' | 'finished'
): Promise<SniperDomain[]> {
  const params = filter ? `?filter=${filter}` : '';
  const response = await fetchApi<ApiResponse<SniperDomain[]>>(
    `/api/v1/sniper/domains${params}`
  );
  return response.data;
}

export async function getSniperDomain(
  domainName: string
): Promise<SniperDomain> {
  const response = await fetchApi<ApiResponse<SniperDomain>>(
    `/api/v1/sniper/domains/${encodeURIComponent(domainName)}`
  );
  return response.data;
}

export async function getSniperBids(
  domainName?: string,
  limit: number = 100
): Promise<SniperBid[]> {
  const params = new URLSearchParams();
  if (domainName) params.set('domain_name', domainName);
  if (limit) params.set('limit', limit.toString());

  const queryString = params.toString();
  const response = await fetchApi<ApiResponse<SniperBid[]>>(
    `/api/v1/sniper/bids${queryString ? `?${queryString}` : ''}`
  );
  return response.data;
}

export async function getSniperEvents(
  domainName?: string,
  limit: number = 100
): Promise<SniperEvent[]> {
  const params = new URLSearchParams();
  if (domainName) params.set('domain_name', domainName);
  if (limit) params.set('limit', limit.toString());

  const queryString = params.toString();
  const response = await fetchApi<ApiResponse<SniperEvent[]>>(
    `/api/v1/sniper/events${queryString ? `?${queryString}` : ''}`
  );
  return response.data;
}
