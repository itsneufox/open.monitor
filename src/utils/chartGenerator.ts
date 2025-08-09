import { ChartJSNodeCanvas } from 'chartjs-node-canvas';
import { AttachmentBuilder } from 'discord.js';
import { ChartData } from '../types';

const chartJSNodeCanvas = new ChartJSNodeCanvas({
    width: 900,
    height: 500,
    backgroundColour: '#363940',
    chartCallback: (ChartJS) => {
        ChartJS.defaults.responsive = false;
        ChartJS.defaults.maintainAspectRatio = false;
    },
});

export async function generateChart(
    data: ChartData,
    color: number
): Promise<AttachmentBuilder> {
    if (!data.days || data.days.length === 0) {
        throw new Error('No chart data available');
    }

    const labels = data.days.map(day => {
        const date = new Date(day.date);
        return date.getDate().toString();
    });

    const values = data.days.map(day => Math.max(0, day.value));
    const hexColor = `#${color.toString(16).padStart(6, '0')}`;
    const maxValue = Math.max(...values);
    const yAxisMax = Math.max(Math.ceil(maxValue * 1.15), 10);

    const firstDate = new Date(data.days[0]?.date || Date.now());
    const lastDate = new Date(data.days[data.days.length - 1]?.date || Date.now());

    let titleText = '';
    if (firstDate.getMonth() === lastDate.getMonth() && firstDate.getFullYear() === lastDate.getFullYear()) {
        const monthName = firstDate.toLocaleDateString('en-US', { month: 'long' });
        titleText = `Peak Players from ${monthName} ${firstDate.getFullYear()}`;
    } else {
        const startMonth = firstDate.toLocaleDateString('en-US', { month: 'long' });
        const endMonth = lastDate.toLocaleDateString('en-US', { month: 'long' });
        const year = lastDate.getFullYear();
        titleText = `Peak Players from ${startMonth} to ${endMonth} ${year}`;
    }

    let xAxisTitle = '';
    if (firstDate.getMonth() === lastDate.getMonth() && firstDate.getFullYear() === lastDate.getFullYear()) {
        const monthName = firstDate.toLocaleDateString('en-US', { month: 'long' });
        xAxisTitle = `Day of ${monthName} ${firstDate.getFullYear()}`;
    } else {
        const startMonth = firstDate.toLocaleDateString('en-US', { month: 'long' });
        const endMonth = lastDate.toLocaleDateString('en-US', { month: 'long' });
        xAxisTitle = `Day of Month (${startMonth} - ${endMonth} ${lastDate.getFullYear()})`;
    }

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
                    callbacks: {
                        title: function (context: any[]) {
                            const item = context[0];
                            const dataIndex = item.dataIndex;
                            const fullDate = new Date(data.days[dataIndex]?.date || Date.now());
                            const fullDateStr = fullDate.toLocaleDateString('en-US', {
                                weekday: 'long',
                                year: 'numeric',
                                month: 'long',
                                day: 'numeric'
                            });
                            return fullDateStr;
                        },
                        label: function (context: any) {
                            return `Peak Players: ${context.parsed.y}`;
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
                        },
                    },
                    ticks: {
                        color: '#CCCCCC',
                        font: {
                            size: 12,
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