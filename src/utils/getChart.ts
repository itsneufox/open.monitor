import { AttachmentBuilder } from 'discord.js';
import { ChartData } from '../types';

export async function getChart(data: ChartData, color: number): Promise<AttachmentBuilder> {
  // Validate data
  if (!data.days || data.days.length === 0) {
    throw new Error('No chart data available');
  }

  // Format dates and values for chart
  const labels = data.days.map(day => {
    const date = new Date(day.date);
    // Format as DD/MM
    return `${date.getDate().toString().padStart(2, '0')}/${(date.getMonth() + 1).toString().padStart(2, '0')}`;
  });
  
  const values = data.days.map(day => Math.max(0, day.value)); // Ensure no negative values

  // Convert color to hex string
  const hexColor = `#${color.toString(16).padStart(6, '0')}`;

  // Create chart configuration for QuickChart
  const chartConfig = {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Max Players',
          data: values,
          borderColor: hexColor,
          backgroundColor: hexColor + '33', // 33 for 20% opacity
          fill: true,
          tension: 0.4,
        },
      ],
    },
    options: {
      plugins: {
        title: {
          display: true,
          text: `${data.name || 'Unknown Server'} - Player Activity (Last ${data.days.length} Days)`,
          font: {
            size: 18,
          },
          color: '#FFFFFF'
        },
        legend: {
          position: 'bottom',
          labels: {
            color: '#FFFFFF'
          }
        },
      },
      scales: {
        x: {
          ticks: {
            color: '#FFFFFF'
          },
          grid: {
            color: '#404040'
          }
        },
        y: {
          beginAtZero: true,
          suggestedMax: Math.max(data.maxPlayers || 50, Math.max(...values) + 5),
          ticks: {
            precision: 0,
            color: '#FFFFFF'
          },
          grid: {
            color: '#404040'
          }
        },
      },
    },
  };

  try {
    // Encode chart config for URL
    const encodedConfig = encodeURIComponent(JSON.stringify(chartConfig));
    
    // Generate chart URL using QuickChart API
    const chartUrl = `https://quickchart.io/chart?backgroundColor=%23363940&width=800&height=400&c=${encodedConfig}`;
    
    // Fetch the chart image
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