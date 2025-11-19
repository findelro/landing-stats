import { NextRequest, NextResponse } from 'next/server';
import { getEventsDashboardData } from '@/lib/api';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const maxResults = searchParams.get('maxResults');
    const includeBots = searchParams.get('includeBots') === 'true';

    if (!startDate || !endDate) {
      return NextResponse.json(
        { error: 'startDate and endDate are required' },
        { status: 400 }
      );
    }

    const startDateTime = new Date(startDate);
    const endDateTime = new Date(endDate);

    // If start and end dates are the same, adjust the end time to the end of the day
    if (startDate === endDate) {
      endDateTime.setHours(23, 59, 59, 999);
    }

    const eventsData = await getEventsDashboardData(
      startDateTime,
      endDateTime,
      {
        maxResultsPerSection: maxResults ? parseInt(maxResults) : 200,
        includeBots: includeBots
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
