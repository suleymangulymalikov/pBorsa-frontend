import { useEffect, useRef } from "react";
import {
  ColorType,
  LineSeries,
  type BusinessDay,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
  createChart,
} from "lightweight-charts";

export type BalancePoint = {
  timestamp: string;
  balance: number;
};

export type BalanceChartProps = {
  points: BalancePoint[];
  height?: number;
  resetKey?: number;
  minTime?: string;
  maxTime?: string;
  lockVisibleRange?: boolean;
};

function toUtcTimestamp(value: string): UTCTimestamp | null {
  const t = new Date(value).getTime();
  if (Number.isNaN(t)) return null;
  return Math.floor(t / 1000) as UTCTimestamp;
}

export default function BalanceChart({
  points,
  height = 320,
  resetKey = 0,
  minTime,
  maxTime,
  lockVisibleRange = true,
}: BalanceChartProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const lineRef = useRef<ISeriesApi<"Line"> | null>(null);
  const timeBoundsRef = useRef<{ min?: UTCTimestamp; max?: UTCTimestamp }>({});
  const lockVisibleRangeRef = useRef(lockVisibleRange);

  useEffect(() => {
    lockVisibleRangeRef.current = lockVisibleRange;
  }, [lockVisibleRange]);

  useEffect(() => {
    const minTs = minTime ? toUtcTimestamp(minTime) : null;
    const maxTs = maxTime ? toUtcTimestamp(maxTime) : null;
    timeBoundsRef.current = {
      min: minTs ?? undefined,
      max: maxTs ?? undefined,
    };
    if (
      lockVisibleRangeRef.current &&
      chartRef.current &&
      minTs &&
      maxTs &&
      minTs < maxTs
    ) {
      chartRef.current.timeScale().setVisibleRange({ from: minTs, to: maxTs });
    }
  }, [minTime, maxTime]);

  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: "#0b1728" },
        textColor: "#cbd5f5",
        fontFamily: "Space Grotesk, IBM Plex Sans, sans-serif",
      },
      grid: {
        vertLines: { color: "rgba(59, 77, 104, 0.35)" },
        horzLines: { color: "rgba(59, 77, 104, 0.35)" },
      },
      rightPriceScale: {
        borderColor: "rgba(59, 77, 104, 0.5)",
      },
      timeScale: {
        borderColor: "rgba(59, 77, 104, 0.5)",
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 0,
        barSpacing: 8,
        minBarSpacing: 4,
        fixLeftEdge: true,
        fixRightEdge: true,
      },
      crosshair: {
        mode: 0,
      },
      width: containerRef.current.clientWidth,
      height: containerRef.current.clientHeight,
    });

    const line = chart.addSeries(LineSeries, {
      color: "#38bdf8",
      lineWidth: 2,
    });

    chartRef.current = chart;
    lineRef.current = line;

    const clampVisibleRange = (range: {
      from: UTCTimestamp | BusinessDay;
      to: UTCTimestamp | BusinessDay;
    } | null) => {
      if (!lockVisibleRangeRef.current) return;
      if (!range) return;
      const min = timeBoundsRef.current.min;
      const max = timeBoundsRef.current.max;
      if (!min || !max || min >= max) return;
      if (typeof range.from !== "number" || typeof range.to !== "number") return;

      let from = range.from as UTCTimestamp;
      let to = range.to as UTCTimestamp;

      const boundsWidth = max - min;
      const rangeWidth = to - from;

      if (rangeWidth >= boundsWidth) {
        chart.timeScale().setVisibleRange({ from: min, to: max });
        return;
      }

      let changed = false;
      if (from < min) {
        const shift = min - from;
        from = min;
        to = Math.min(max, (to + shift) as UTCTimestamp);
        changed = true;
      }

      if (to > max) {
        const shift = to - max;
        to = max;
        from = Math.max(min, (from - shift) as UTCTimestamp);
        changed = true;
      }

      if (changed) {
        chart.timeScale().setVisibleRange({ from, to });
      }
    };

    chart.timeScale().subscribeVisibleTimeRangeChange(clampVisibleRange);

    const resizeObserver = new ResizeObserver(() => {
      if (!containerRef.current) return;
      chart.applyOptions({
        width: containerRef.current.clientWidth,
        height: containerRef.current.clientHeight,
      });
    });

    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
      chart.timeScale().unsubscribeVisibleTimeRangeChange(clampVisibleRange);
      chart.remove();
      chartRef.current = null;
      lineRef.current = null;
    };
  }, []);

  useEffect(() => {
    const line = lineRef.current;
    if (!line) return;

    const pointMap = new Map<UTCTimestamp, number>();
    points.forEach((p) => {
      const time = toUtcTimestamp(p.timestamp);
      if (!time) return;
      const value = Number(p.balance);
      if (!Number.isFinite(value)) return;
      pointMap.set(time, value);
    });

    const lineData = Array.from(pointMap.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([time, value]) => ({ time, value }));

    line.setData(lineData as Parameters<typeof line.setData>[0]);
  }, [points]);

  useEffect(() => {
    if (!chartRef.current) return;
    const min = timeBoundsRef.current.min;
    const max = timeBoundsRef.current.max;
    if (lockVisibleRangeRef.current && min && max && min < max) {
      chartRef.current.timeScale().setVisibleRange({ from: min, to: max });
      return;
    }
    chartRef.current.timeScale().fitContent();
  }, [resetKey]);

  return (
    <div className="w-full" style={{ height: `${height}px` }}>
      <div ref={containerRef} className="h-full w-full" />
    </div>
  );
}
