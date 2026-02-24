'use client';

import {
    Chart as ChartJS,
    CategoryScale, LinearScale, PointElement, LineElement,
    Title, Tooltip, Filler,
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import { useRef } from 'react';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Filler);

interface Props {
    evaluations: number[]; // index 0 = start pos, i = after move i
    currentIndex: number;
    onSelectMove: (index: number) => void;
}

export default function EvalChart({ evaluations, currentIndex, onSelectMove }: Props) {
    const chartRef = useRef<ChartJS<'line'> | null>(null);

    const data = {
        labels: evaluations.map((_, i) => i),
        datasets: [{
            label: 'Evaluation',
            data: evaluations.map(e => Math.max(-10, Math.min(10, e / 100))),
            borderColor: '#ffffff',
            borderWidth: 2,
            pointRadius: 0,
            pointHoverRadius: 4,
            fill: true,
            tension: 0.1,
            backgroundColor: (ctx: any) => {
                const canvas = ctx.chart.ctx;
                const gradient = canvas.createLinearGradient(0, 0, 0, 150);
                gradient.addColorStop(0, 'rgba(255,255,255,0.5)');
                gradient.addColorStop(0.5, 'rgba(129,182,76,0.5)');
                gradient.addColorStop(1, 'rgba(40,40,40,0.8)');
                return gradient;
            },
        }],
    };

    const options: Parameters<typeof Line>[0]['options'] = {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        plugins: {
            legend: { display: false },
            tooltip: {
                mode: 'index', intersect: false,
                backgroundColor: 'rgba(38,36,33,0.9)',
                titleColor: '#fff', bodyColor: '#fff',
                borderColor: '#403d39', borderWidth: 1,
                callbacks: {
                    label: (c) => {
                        const v = c.parsed.y ?? 0;
                        return `Eval: ${v > 0 ? '+' : ''}${v.toFixed(2)}`;
                    },
                },
            },
        },
        scales: {
            x: { display: false },
            y: {
                display: true, position: 'right', min: -10, max: 10,
                grid: { color: '#403d39' },
                ticks: { color: '#8b8987', font: { family: 'Nunito', size: 10 } },
            },
        },
        interaction: { mode: 'nearest', axis: 'x', intersect: false },
        onClick: (_e, activeEls) => {
            if (activeEls.length > 0) onSelectMove(activeEls[0].index);
        },
    };

    return (
        <div style={{ padding: '15px', height: 120, borderBottom: '1px solid #403d39', flexShrink: 0 }}>
            <Line ref={chartRef} data={data} options={options} />
        </div>
    );
}
