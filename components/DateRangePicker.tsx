import React from 'react';

interface DateRangePickerProps {
  startDate: string;
  endDate: string;
  onRangeChange: (startDate: string, endDate: string) => void;
  includeBots: boolean;
  onIncludeBotsChange: (include: boolean) => void;
  className?: string;
  earliestDate?: string; // ISO date string for LTD (life-to-date) button
}

export default function DateRangePicker({
  startDate,
  endDate,
  onRangeChange,
  includeBots,
  onIncludeBotsChange,
  className = '',
  earliestDate,
}: DateRangePickerProps) {
  const handleStartDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onRangeChange(e.target.value, endDate);
  };

  const handleEndDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onRangeChange(startDate, e.target.value);
  };

  const handleBotsCheckboxChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onIncludeBotsChange(e.target.checked);
  };

  // Quick date range presets
  const selectToday = () => {
    const today = new Date();
    const formattedDate = today.toISOString().split('T')[0];
    
    onRangeChange(
      formattedDate,
      formattedDate
    );
  };

  const selectLast7Days = () => {
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - 7);
    
    onRangeChange(
      start.toISOString().split('T')[0],
      end.toISOString().split('T')[0]
    );
  };

  const selectLast30Days = () => {
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - 30);

    onRangeChange(
      start.toISOString().split('T')[0],
      end.toISOString().split('T')[0]
    );
  };

  const selectLTD = () => {
    if (!earliestDate) return;
    const end = new Date();
    onRangeChange(
      earliestDate,
      end.toISOString().split('T')[0]
    );
  };

  return (
    <div className={`flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-4 items-center ${className}`}>
      <div className="flex items-center space-x-4">
        <div className="flex items-center">
          <input
            id="include-bots"
            name="include-bots"
            type="checkbox"
            checked={includeBots}
            onChange={handleBotsCheckboxChange}
            className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
          />
          <label htmlFor="include-bots" className="ml-2 block text-sm text-gray-900">
            Include Bots
          </label>
        </div>
      </div>
      <div className="flex items-center space-x-2">
        <label htmlFor="start-date" className="text-sm font-medium text-gray-700">
          From:
        </label>
        <input
          id="start-date"
          type="date"
          value={startDate}
          onChange={handleStartDateChange}
          className="shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block border-gray-300 rounded-md"
        />
      </div>
      <div className="flex items-center space-x-2">
        <label htmlFor="end-date" className="text-sm font-medium text-gray-700">
          To:
        </label>
        <input
          id="end-date"
          type="date"
          value={endDate}
          onChange={handleEndDateChange}
          className="shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block border-gray-300 rounded-md"
        />
      </div>
      <div className="flex space-x-2">
        <button
          type="button"
          onClick={selectToday}
          className="inline-flex items-center px-2.5 py-1.5 border border-gray-300 text-xs font-medium rounded text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
        >
          Today
        </button>
        <button
          type="button"
          onClick={selectLast7Days}
          className="inline-flex items-center px-2.5 py-1.5 border border-gray-300 text-xs font-medium rounded text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
        >
          Last 7 days
        </button>
        <button
          type="button"
          onClick={selectLast30Days}
          className="inline-flex items-center px-2.5 py-1.5 border border-gray-300 text-xs font-medium rounded text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
        >
          Last 30 days
        </button>
        {earliestDate && (
          <button
            type="button"
            onClick={selectLTD}
            className="inline-flex items-center px-2.5 py-1.5 border border-gray-300 text-xs font-medium rounded text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
            title="Life to date - show all data from the beginning"
          >
            LTD
          </button>
        )}
      </div>
    </div>
  );
} 