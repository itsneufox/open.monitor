import { AttachmentBuilder } from 'discord.js';
import { ChartData } from '../types';

export async function getChart(
  data: ChartData,
  color: number
): Promise<AttachmentBuilder> {
  if (!data.days || data.days.length === 0) {
    throw new Error('No chart data available');
  }

  const labels = data.days.map(day => {
    const date = new Date(day.date);
    return `${date.getDate().toString().padStart(2, '0')}/${(date.getMonth() + 1).toString().padStart(2, '0')}`;
  });

  const values = data.days.map(day => Math.max(0, day.value));
  const hexColor = `#${color.toString(16).padStart(6, '0')}`;
  const maxValue = Math.max(...values);

  const yAxisMax = Math.max(maxValue * 1.2, data.maxPlayers || 50, 30);

  const chartLabels = ['', ...labels, ''];
  const chartValues = [0, ...values, 0];

  const chartConfig = {
    type: 'line',
    data: {
      labels: chartLabels,
      datasets: [
        {
          label: 'Peak Players',
          data: chartValues,
          borderColor: hexColor,
          backgroundColor: hexColor + '15',
          fill: true,
          lineTension: 0.4, // This is the key for QuickChart smooth curves!
          borderWidth: 3,
          pointBackgroundColor: hexColor,
          pointBorderColor: '#FFFFFF',
          pointBorderWidth: 2,
          pointRadius: [0, ...Array(values.length).fill(5), 0],
          pointHoverRadius: [0, ...Array(values.length).fill(7), 0],
          pointHoverBorderWidth: 3,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        title: {
          display: true,
          text: `${data.name || 'Server'} - Player Activity Trends`,
          font: {
            size: 20,
            weight: 'bold',
          },
          color: '#FFFFFF',
          padding: 25,
        },
        legend: {
          display: true,
          position: 'top',
          labels: {
            color: '#FFFFFF',
            font: {
              size: 14,
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
          filter: function (tooltipItem: any) {
            return (
              tooltipItem.dataIndex !== 0 &&
              tooltipItem.dataIndex !== chartValues.length - 1
            );
          },
          callbacks: {
            title: function (context: any[]) {
              const item = context[0];
              if (
                item &&
                item.dataIndex > 0 &&
                item.dataIndex < chartLabels.length - 1
              ) {
                return `Date: ${labels[item.dataIndex - 1]}`;
              }
              return '';
            },
            label: function (context: any) {
              if (
                context.dataIndex > 0 &&
                context.dataIndex < chartValues.length - 1
              ) {
                return `Peak Players: ${context.parsed?.y || 0}`;
              }
              return '';
            },
          },
        },
      },
      scales: {
        x: {
          type: 'category',
          title: {
            display: true,
            text: 'Date (DD/MM)',
            color: '#CCCCCC',
            font: {
              size: 14,
              weight: 'bold',
            },
          },
          ticks: {
            color: '#CCCCCC',
            font: {
              size: 12,
            },
            maxRotation: 45,
            minRotation: 0,
            callback: function (value: any, index: number) {
              if (index === 0 || index === chartLabels.length - 1) {
                return '';
              }
              return chartLabels[index];
            },
          },
          grid: {
            color: '#444444',
            lineWidth: 1,
          },
        },
        y: {
          type: 'linear',
          position: 'left',
          min: 0,
          max: yAxisMax,
          beginAtZero: true,
          title: {
            display: true,
            text: 'Players',
            color: '#CCCCCC',
            font: {
              size: 14,
              weight: 'bold',
            },
          },
          ticks: {
            color: '#CCCCCC',
            font: {
              size: 12,
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
        mode: 'index',
      },
      animation: {
        duration: 0,
      },
    },
  };

  try {
    const encodedConfig = encodeURIComponent(JSON.stringify(chartConfig));
    const chartUrl = `https://quickchart.io/chart?backgroundColor=%23363940&width=900&height=500&c=${encodedConfig}`;

    const response = await fetch(chartUrl);
    if (!response.ok) {
      throw new Error(`QuickChart API error: ${response.status}`);
    }

    const imageBuffer = Buffer.from(await response.arrayBuffer());
    return new AttachmentBuilder(imageBuffer, { name: 'player-chart.png' });
  } catch (error) {
    console.error('Error generating chart:', error);
    throw new Error('Failed to generate chart');
  }
}
