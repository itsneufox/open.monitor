import { ChartJSNodeCanvas } from 'chartjs-node-canvas';
import { AttachmentBuilder } from 'discord.js';
import { ChartData } from '../types';
import { TimezoneHelper } from './timezoneHelper';

const chartJSNodeCanvas = new ChartJSNodeCanvas({
  width: 900,
  height: 500,
  backgroundColour: '#363940',
  chartCallback: ChartJS => {
    ChartJS.defaults.responsive = false;
    ChartJS.defaults.maintainAspectRatio = false;

    ChartJS.defaults.font = {
      family: 'Arial, sans-serif',
      size: 12,
    };
  },
});

export async function generateChart(
  data: ChartData,
  color: number
): Promise<AttachmentBuilder> {
  const chartData = (data as any).value ? (data as any).value : data;

  console.log('Chart Debug Info:', {
    hasValue: !!(data as any).value,
    originalDataKeys: Object.keys(data),
    chartDataKeys: Object.keys(chartData),
    daysLength: chartData.days?.length,
    firstFewDays: chartData.days?.slice(0, 3),
    serverName: chartData.name,
  });

  if (!chartData.days || chartData.days.length === 0) {
    throw new Error('No chart data available');
  }

  const sortedDays = chartData.days.sort((a: any, b: any) => a.date - b.date);

  console.log('Processed Chart Data:', {
    sortedDaysCount: sortedDays.length,
    dateRange: {
      first: new Date(sortedDays[0]?.date),
      last: new Date(sortedDays[sortedDays.length - 1]?.date),
    },
    valueRange: {
      min: Math.min(...sortedDays.map((d: any) => d.value)),
      max: Math.max(...sortedDays.map((d: any) => d.value)),
    },
    sampleValues: sortedDays
      .slice(0, 5)
      .map((d: any) => ({ value: d.value, date: new Date(d.date) })),
  });

  const labels = sortedDays.map((day: any) => {
    const date = new Date(day.date);
    return date.getDate().toString();
  });

  const values = sortedDays.map((day: any) => Math.max(0, day.value));
  const hexColor = `#${color.toString(16).padStart(6, '0')}`;
  const maxValue = Math.max(...values);
  const yAxisMax = Math.max(Math.ceil(maxValue * 1.15), 10);

  const firstDate = new Date(sortedDays[0]?.date || Date.now());
  const lastDate = new Date(
    sortedDays[sortedDays.length - 1]?.date || Date.now()
  );

  const firstDay = sortedDays[0];
  const timezone = firstDay?.timezone || 'GMT+0';
  const dayResetHour = firstDay?.dayResetHour ?? 0;

  let titleText = '';
  if (
    firstDate.getMonth() === lastDate.getMonth() &&
    firstDate.getFullYear() === lastDate.getFullYear()
  ) {
    const monthName = firstDate.toLocaleDateString('en-US', { month: 'long' });
    titleText = `Peak Players - ${monthName} ${firstDate.getFullYear()} (${timezone})`;
  } else {
    const startMonth = firstDate.toLocaleDateString('en-US', { month: 'long' });
    const endMonth = lastDate.toLocaleDateString('en-US', { month: 'long' });
    const year = lastDate.getFullYear();
    titleText = `Peak Players - ${startMonth} to ${endMonth} ${year} (${timezone})`;
  }

  let xAxisTitle = '';
  if (
    firstDate.getMonth() === lastDate.getMonth() &&
    firstDate.getFullYear() === lastDate.getFullYear()
  ) {
    const monthName = firstDate.toLocaleDateString('en-US', { month: 'long' });
    xAxisTitle = `Day of ${monthName} ${firstDate.getFullYear()}`;
  } else {
    const startMonth = firstDate.toLocaleDateString('en-US', { month: 'long' });
    const endMonth = lastDate.toLocaleDateString('en-US', { month: 'long' });
    xAxisTitle = `Day of Month (${startMonth} - ${endMonth} ${lastDate.getFullYear()})`;
  }

  const dayResetInfo =
    dayResetHour === 0
      ? 'Daily reset: Midnight'
      : `Daily reset: ${TimezoneHelper.formatDayResetTime(dayResetHour)}`;

  const configuration = {
    type: 'line' as const,
    data: {
      labels: labels,
      datasets: [
        {
          label: 'Peak Players',
          data: values,
          borderColor: hexColor,
          backgroundColor: hexColor + '20',
          fill: true,
          tension: 0.4,
          borderWidth: 3,
          pointBackgroundColor: hexColor,
          pointBorderColor: '#FFFFFF',
          pointBorderWidth: 2,
          pointRadius: 5,
          pointHoverRadius: 7,
          pointHoverBorderWidth: 3,
        },
      ],
    },
    options: {
      responsive: false,
      maintainAspectRatio: false,
      layout: {
        padding: {
          top: 20,
          right: 60,
          bottom: 20,
          left: 20,
        },
      },
      plugins: {
        title: {
          display: true,
          text: titleText,
          color: '#FFFFFF',
          font: {
            size: 20,
            weight: 'bold' as const,
            family: 'Arial, sans-serif',
          },
          padding: {
            top: 10,
            bottom: 20,
          },
        },
        legend: {
          display: true,
          position: 'top' as const,
          labels: {
            color: '#FFFFFF',
            font: {
              size: 14,
              family: 'Arial, sans-serif',
            },
            usePointStyle: true,
            padding: 20,
          },
        },
        tooltip: {
          backgroundColor: 'rgba(0, 0, 0, 0.9)',
          titleColor: '#FFFFFF',
          bodyColor: '#FFFFFF',
          borderColor: hexColor,
          borderWidth: 2,
          cornerRadius: 8,
          displayColors: false,
          titleFont: {
            family: 'Arial, sans-serif',
          },
          bodyFont: {
            family: 'Arial, sans-serif',
          },
          callbacks: {
            title: function (context: any[]) {
              const item = context[0];
              const dataIndex = item.dataIndex;
              const fullDate = new Date(
                sortedDays[dataIndex]?.date || Date.now()
              );
              const fullDateStr = fullDate.toLocaleDateString('en-US', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              });
              return fullDateStr;
            },
            label: function (context: any) {
              return `Peak Players: ${context.parsed.y}`;
            },
            afterLabel: function () {
              return dayResetInfo;
            },
          },
        },
      },
      scales: {
        x: {
          type: 'category' as const,
          title: {
            display: true,
            text: xAxisTitle,
            color: '#CCCCCC',
            font: {
              size: 14,
              weight: 'bold' as const,
              family: 'Arial, sans-serif',
            },
          },
          ticks: {
            color: '#CCCCCC',
            font: {
              size: 12,
              family: 'Arial, sans-serif',
            },
            maxRotation: 0,
            minRotation: 0,
            callback: function (value: any, index: number) {
              if (labels.length <= 31) {
                return labels[index];
              } else {
                return index % 3 === 0 ? labels[index] : '';
              }
            },
          },
          grid: {
            color: '#444444',
            lineWidth: 1,
          },
        },
        y: {
          type: 'linear' as const,
          position: 'left' as const,
          min: 0,
          max: yAxisMax,
          beginAtZero: true,
          title: {
            display: true,
            text: 'Players',
            color: '#CCCCCC',
            font: {
              size: 14,
              weight: 'bold' as const,
              family: 'Arial, sans-serif',
            },
          },
          ticks: {
            color: '#CCCCCC',
            font: {
              size: 12,
              family: 'Arial, sans-serif',
            },
            precision: 0,
            stepSize: Math.max(1, Math.ceil(yAxisMax / 10)),
            callback: function (value: any) {
              const numValue = Number(value);
              return Number.isInteger(numValue) && numValue >= 0
                ? numValue.toString()
                : '';
            },
          },
          grid: {
            color: '#444444',
            lineWidth: 1,
            drawBorder: true,
          },
        },
      },
      interaction: {
        intersect: false,
        mode: 'index' as const,
      },
      animation: {
        duration: 0,
      },
    },
  };

  try {
    const imageBuffer = await chartJSNodeCanvas.renderToBuffer(configuration);
    return new AttachmentBuilder(imageBuffer, { name: 'player-chart.png' });
  } catch (error) {
    console.error('Error generating chart with Chart.js:', error);
    throw new Error('Failed to generate chart');
  }
}
