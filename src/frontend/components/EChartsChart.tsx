import React, { useEffect, useRef } from 'react';
import * as echarts from 'echarts';
import type { ChartSpec } from '../../lib/dashboard/types.js';

interface EChartsChartProps {
  chart: ChartSpec;
}

export const EChartsChart: React.FC<EChartsChartProps> = ({ chart }) => {
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstance = useRef<echarts.EChartsType | null>(null);

  useEffect(() => {
    if (!chartRef.current) return;

    if (!chartInstance.current) {
      chartInstance.current = echarts.init(chartRef.current, undefined, {
        renderer: 'svg',
      });
    }

    const instance = chartInstance.current;

    // Palette
    const colors = ['#6366f1', '#06b6d4', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6', '#3b82f6'];

    let option: echarts.EChartsOption = {
      backgroundColor: 'transparent',
      color: colors,
      textStyle: {
        fontFamily: "'Inter', sans-serif",
      },
      tooltip: {
        trigger: chart.chartType === 'donut' ? 'item' : 'axis',
        backgroundColor: 'rgba(15, 23, 42, 0.95)',
        borderColor: 'rgba(255, 255, 255, 0.1)',
        textStyle: {
          color: '#f8fafc',
          fontSize: 12,
        },
      },
      grid: {
        top: 30,
        right: 20,
        bottom: 40,
        left: 50,
        containLabel: true,
      },
    };

    if (chart.chartType === 'donut') {
      const pieData = chart.series[0]?.data || [];
      option = {
        ...option,
        tooltip: {
          trigger: 'item',
          formatter: '{b}: {c} ({d}%)',
          backgroundColor: 'rgba(15, 23, 42, 0.95)',
          borderColor: 'rgba(255, 255, 255, 0.1)',
          textStyle: { color: '#f8fafc' },
        },
        legend: {
          orient: 'horizontal',
          bottom: 0,
          textStyle: { color: '#94a3b8', fontSize: 11 },
        },
        series: [
          {
            name: chart.title,
            type: 'pie',
            radius: ['45%', '70%'],
            center: ['50%', '45%'],
            avoidLabelOverlap: true,
            itemStyle: {
              borderRadius: 6,
              borderColor: '#111827',
              borderWidth: 2,
            },
            label: {
              show: false,
              position: 'center',
            },
            emphasis: {
              label: {
                show: true,
                fontSize: 14,
                fontWeight: 'bold',
                color: '#f8fafc',
              },
            },
            data: pieData as any,
          },
        ],
      };
    } else if (chart.chartType === 'line') {
      const markPoints = (chart.anomalyMarkers || []).map(m => ({
        coord: [m.periodOrLabel, m.value],
        name: 'Anomaly',
        value: '⚠ Spike',
        itemStyle: { color: '#f43f5e' },
      }));

      option = {
        ...option,
        xAxis: {
          type: 'category',
          data: chart.categories || [],
          name: chart.xAxisLabel,
          axisLine: { lineStyle: { color: 'rgba(255, 255, 255, 0.15)' } },
          axisLabel: { color: '#94a3b8', fontSize: 11 },
        },
        yAxis: {
          type: 'value',
          name: chart.yAxisLabel,
          axisLine: { lineStyle: { color: 'rgba(255, 255, 255, 0.15)' } },
          axisLabel: { color: '#94a3b8', fontSize: 11 },
          splitLine: { lineStyle: { color: 'rgba(255, 255, 255, 0.05)' } },
        },
        series: [
          {
            name: chart.series[0]?.name || 'Volume',
            type: 'line',
            smooth: true,
            data: chart.series[0]?.data as any,
            lineStyle: { width: 3, color: '#10b981' },
            itemStyle: { color: '#10b981' },
            areaStyle: {
              color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                { offset: 0, color: 'rgba(16, 185, 129, 0.35)' },
                { offset: 1, color: 'rgba(16, 185, 129, 0.02)' },
              ]),
            },
            markPoint: {
              data: markPoints,
            },
          },
        ],
      };
    } else if (chart.chartType === 'histogram' || chart.chartType === 'bar') {
      option = {
        ...option,
        xAxis: {
          type: 'category',
          data: chart.categories || [],
          name: chart.xAxisLabel,
          axisLine: { lineStyle: { color: 'rgba(255, 255, 255, 0.15)' } },
          axisLabel: { color: '#94a3b8', fontSize: 11 },
        },
        yAxis: {
          type: 'value',
          name: chart.yAxisLabel,
          axisLine: { lineStyle: { color: 'rgba(255, 255, 255, 0.15)' } },
          axisLabel: { color: '#94a3b8', fontSize: 11 },
          splitLine: { lineStyle: { color: 'rgba(255, 255, 255, 0.05)' } },
        },
        series: [
          {
            name: chart.series[0]?.name || 'Frequency',
            type: 'bar',
            barWidth: chart.chartType === 'histogram' ? '90%' : '50%',
            data: chart.series[0]?.data as any,
            itemStyle: {
              borderRadius: [4, 4, 0, 0],
              color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                { offset: 0, color: chart.chartType === 'histogram' ? '#6366f1' : '#06b6d4' },
                { offset: 1, color: chart.chartType === 'histogram' ? '#4338ca' : '#0891b2' },
              ]),
            },
          },
        ],
      };
    } else if (chart.chartType === 'scatter') {
      option = {
        ...option,
        tooltip: {
          trigger: 'item',
          formatter: (params: any) => {
            const data = params.data as [number, number];
            return `${chart.xAxisLabel || 'X'}: ${data[0]}<br/>${chart.yAxisLabel || 'Y'}: ${data[1]}`;
          },
          backgroundColor: 'rgba(15, 23, 42, 0.95)',
          borderColor: 'rgba(255, 255, 255, 0.1)',
          textStyle: { color: '#f8fafc' },
        },
        xAxis: {
          type: 'value',
          name: chart.xAxisLabel,
          axisLine: { lineStyle: { color: 'rgba(255, 255, 255, 0.15)' } },
          axisLabel: { color: '#94a3b8', fontSize: 11 },
          splitLine: { lineStyle: { color: 'rgba(255, 255, 255, 0.05)' } },
        },
        yAxis: {
          type: 'value',
          name: chart.yAxisLabel,
          axisLine: { lineStyle: { color: 'rgba(255, 255, 255, 0.15)' } },
          axisLabel: { color: '#94a3b8', fontSize: 11 },
          splitLine: { lineStyle: { color: 'rgba(255, 255, 255, 0.05)' } },
        },
        series: [
          {
            name: 'Data Point',
            type: 'scatter',
            symbolSize: 10,
            data: chart.series[0]?.data as any,
            itemStyle: {
              color: '#a855f7',
              borderColor: '#ffffff',
              borderWidth: 1,
            },
          },
        ],
      };
    }

    instance.setOption(option, true);

    const handleResize = () => {
      instance.resize();
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, [chart]);

  return (
    <div className={`chart-card ${chart.width}`} id={`chart-${chart.id}`}>
      <div className="chart-header">
        <h3 className="chart-title">{chart.title}</h3>
        <p className="chart-description">{chart.description}</p>
      </div>

      <div ref={chartRef} className="chart-canvas" aria-label={chart.title} />

      <div className="chart-footer">
        {chart.causationCaveat && (
          <div className="chart-caveat">
            <strong>CAUTION:</strong> {chart.causationCaveat}
          </div>
        )}
        <div className="chart-evidence">
          <strong>Evidence:</strong> {chart.evidenceRef}
        </div>
      </div>
    </div>
  );
};
