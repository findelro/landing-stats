'use client';

import { useMemo } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Filler,
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import { format, eachDayOfInterval, parseISO } from 'date-fns';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Filler
);

interface PageviewsChartProps {
  pageviewsByDay: { day: string; pageviews: number }[];
  startDate: string;
  endDate: string;
}

export default function PageviewsChart({ pageviewsByDay, startDate, endDate }: PageviewsChartProps) {
  const chartData = useMemo(() => {
    // Generate all days in the date range
    const days = eachDayOfInterval({
      start: parseISO(startDate),
      end: parseISO(endDate),
    });

    // Create a map from the pre-aggregated data
    const pageviewsMap = new Map<string, number>();
    pageviewsByDay.forEach(item => {
      pageviewsMap.set(item.day, item.pageviews);
    });

    // Build chart data with all days (including zeros)
    const labels = days.map(day => format(day, 'MMM d'));
    const rawData = days.map(day => pageviewsMap.get(format(day, 'yyyy-MM-dd')) || 0);

    // Replace leading zeros with null so the line doesn't draw until first traffic
    const firstNonZeroIndex = rawData.findIndex(val => val > 0);
    const data = rawData.map((val, idx) =>
      firstNonZeroIndex === -1 || idx < firstNonZeroIndex ? null : val
    );

    return {
      labels,
      datasets: [
        {
          label: 'Pageviews',
          data,
          borderColor: 'rgb(59, 130, 246)',
          backgroundColor: 'rgba(59, 130, 246, 0.1)',
          fill: true,
          tension: 0.3,
          spanGaps: false,
          pointRadius: 3,
          pointHoverRadius: 5,
          pointBackgroundColor: 'rgb(59, 130, 246)',
          pointBorderColor: 'white',
          pointBorderWidth: 2,
        },
      ],
    };
  }, [pageviewsByDay, startDate, endDate]);

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: false,
      },
      tooltip: {
        backgroundColor: 'white',
        titleColor: '#111827',
        bodyColor: '#374151',
        borderColor: '#e5e7eb',
        borderWidth: 1,
        padding: 12,
        displayColors: false,
        callbacks: {
          title: (items: { label: string }[]) => items[0]?.label || '',
          label: (item: { raw: unknown }) => `${item.raw} pageviews`,
        },
      },
    },
    scales: {
      x: {
        grid: {
          display: false,
        },
        border: {
          display: false,
        },
        ticks: {
          color: '#9ca3af',
          font: {
            size: 11,
          },
          maxRotation: 0,
          autoSkip: true,
          maxTicksLimit: 10,
        },
      },
      y: {
        beginAtZero: true,
        grid: {
          color: '#f3f4f6',
        },
        border: {
          display: false,
        },
        ticks: {
          color: '#9ca3af',
          font: {
            size: 11,
          },
          precision: 0,
        },
      },
    },
    interaction: {
      intersect: false,
      mode: 'index' as const,
    },
  };

  return (
    <div className="h-64">
      <Line data={chartData} options={options} />
    </div>
  );
}
