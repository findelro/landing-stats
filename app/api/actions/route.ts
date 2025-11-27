import { NextRequest, NextResponse } from 'next/server';
import { getEventsDashboardData } from '@/lib/api';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const maxResults = searchParams.get('maxResults');
    const filter = searchParams.get('filter') || 'real';
    const includeBots = filter === 'all';
    const excludeAcknowledged = searchParams.get('excludeAcknowledged') !== 'false'; // Default to true

    if (!startDate || !endDate) {
      return NextResponse.json(
        { error: 'startDate and endDate are required' },
        { status: 400 }
      );
    }

    // Pass date strings directly - no Date() manipulation needed!
    const eventsData = await getEventsDashboardData(
      startDate,
      endDate,
      {
        maxResultsPerSection: maxResults ? parseInt(maxResults) : 200,
        includeBots: includeBots,
        excludeAcknowledged: excludeAcknowledged
      }
    );

    return NextResponse.json({ data: eventsData });
  } catch (error: unknown) {
    console.error('API Error:', error);

    const errorMessage = error instanceof Error ? error.message : 'An error occurred while fetching events data';
    const errorCode = (error as { code?: string }).code;
    const attempts = (error as { attempts?: number }).attempts;

    // Extract error details for better debugging
    const errorResponse = {
      error: errorMessage,
      code: errorCode || 'UNKNOWN_ERROR',
      attempts: attempts,
      timestamp: new Date().toISOString(),
    };

    // Determine appropriate status code
    let statusCode = 500;
    if (errorCode === 'PGRST301' || errorCode === 'PGRST302') {
      statusCode = 401; // Authentication errors
    } else if (errorMessage.includes('timeout')) {
      statusCode = 504; // Gateway timeout
    } else if (errorMessage.includes('connection')) {
      statusCode = 503; // Service unavailable
    }

    return NextResponse.json(errorResponse, { status: statusCode });
  }
}
