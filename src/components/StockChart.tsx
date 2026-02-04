import { useEffect, useRef } from "react";
import {
  CandlestickSeries,
  ColorType,
  HistogramSeries,
  LineSeries,
  type BusinessDay,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
  createChart,
  createSeriesMarkers,
} from "lightweight-charts";
import type { StockBar, Timeframe } from "../api/barData";

export type ChartHover = {
  time?: string;
  open?: number;
  high?: number;
  low?: number;
  close?: number;
  volume?: number;
};

export type ChartMarker = {
  time: UTCTimestamp;
  position: "aboveBar" | "belowBar";
  color: string;
  shape: "arrowUp" | "arrowDown";
  text: string;
};

export type StockChartProps = {
  bars: StockBar[];
  showCandles: boolean;
  showLine: boolean;
  showVolume: boolean;
  resetKey: number;
  timeframe: Timeframe;
  onHover?: (hover: ChartHover | null) => void;
  onScrollNearStart?: () => void;
  markers?: ChartMarker[];
  height?: number;
  minTime?: string;
  maxTime?: string;
  lockVisibleRange?: boolean;
};

function toUtcTimestamp(value: string): UTCTimestamp | null {
  const t = new Date(value).getTime();
  if (Number.isNaN(t)) return null;
  return Math.floor(t / 1000) as UTCTimestamp;
}

function isBusinessDay(time: UTCTimestamp | BusinessDay | string): time is BusinessDay {
  return typeof time === "object" && time !== null && "year" in time;
}

export default function StockChart({
  bars,
  showCandles,
  showLine,
  showVolume,
  resetKey,
  timeframe,
  onHover,
  onScrollNearStart,
  markers,
  height = 420,
  minTime,
  maxTime,
  lockVisibleRange = false,
}: StockChartProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const lineRef = useRef<ISeriesApi<"Line"> | null>(null);
  const volumeRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const markersPluginRef = useRef<any>(null);

  const barMapRef = useRef<Map<number, StockBar>>(new Map());
  const onScrollNearStartRef = useRef(onScrollNearStart);
  const timeBoundsRef = useRef<{ min?: UTCTimestamp; max?: UTCTimestamp }>({});
  const markersRef = useRef<ChartMarker[]>([]);

  useEffect(() => {
    onScrollNearStartRef.current = onScrollNearStart;
  }, [onScrollNearStart]);

  useEffect(() => {
    const minTs = minTime ? toUtcTimestamp(minTime) : null;
    const maxTs = maxTime ? toUtcTimestamp(maxTime) : null;
    timeBoundsRef.current = {
      min: minTs ?? undefined,
      max: maxTs ?? undefined,
    };
    if (
      lockVisibleRange &&
      chartRef.current &&
      minTs &&
      maxTs &&
      minTs < maxTs
    ) {
      chartRef.current.timeScale().setVisibleRange({
        from: minTs,
        to: maxTs,
      });
    }
  }, [minTime, maxTime, lockVisibleRange]);

  useEffect(() => {
    const map = new Map<number, StockBar>();
    bars.forEach((b) => {
      if (!b.timestamp) return;
      const time = toUtcTimestamp(b.timestamp);
      if (!time) return;
      map.set(time, b);
    });
    barMapRef.current = map;
  }, [bars]);

  useEffect(() => {
    if (!containerRef.current) return;

    // Determine if timeframe is intraday for time visibility
    const isIntraday = ["1Min", "5Min", "15Min", "30Min", "1Hour", "4Hour"].includes(timeframe);

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
        timeVisible: isIntraday,
        secondsVisible: false,
        rightOffset: 5,
        barSpacing: 8,
        minBarSpacing: 4,
      },
      crosshair: {
        mode: 0,
      },
      width: containerRef.current.clientWidth,
      height: containerRef.current.clientHeight,
    });

    const candle = chart.addSeries(CandlestickSeries, {
      upColor: "#22c55e",
      downColor: "#ef4444",
      borderDownColor: "#ef4444",
      borderUpColor: "#22c55e",
      wickDownColor: "#ef4444",
      wickUpColor: "#22c55e",
    });

    const line = chart.addSeries(LineSeries, {
      color: "#38bdf8",
      lineWidth: 2,
    });

    const volume = chart.addSeries(HistogramSeries, {
      color: "rgba(56, 189, 248, 0.5)",
      priceFormat: { type: "volume" },
      priceScaleId: "",
    });

    volume.priceScale().applyOptions({
      scaleMargins: { top: 0.8, bottom: 0 },
    });

    // Create markers plugin for the candle series
    const markersPlugin = createSeriesMarkers(candle, []);
    markersPluginRef.current = markersPlugin;

    chartRef.current = chart;
    candleRef.current = candle;
    lineRef.current = line;
    volumeRef.current = volume;

    chart.subscribeCrosshairMove((param) => {
      if (!onHover) return;
      if (!param.time) {
        onHover(null);
        return;
      }
      let time: UTCTimestamp | null;
      if (typeof param.time === "number") {
        time = param.time as UTCTimestamp;
      } else if (isBusinessDay(param.time)) {
        time = toUtcTimestamp(
          `${param.time.year}-${String(param.time.month).padStart(2, "0")}-${String(param.time.day).padStart(2, "0")}T00:00:00Z`,
        );
      } else {
        // param.time is a string
        time = toUtcTimestamp(param.time);
      }
      if (!time) {
        onHover(null);
        return;
      }
      const bar = barMapRef.current.get(time as number);
      if (!bar) {
        onHover(null);
        return;
      }
      onHover({
        time: bar.timestamp,
        open: bar.open,
        high: bar.high,
        low: bar.low,
        close: bar.close,
        volume: bar.volume,
      });
    });

    // Subscribe to visible range changes for infinite scroll
    chart.timeScale().subscribeVisibleLogicalRangeChange((logicalRange) => {
      if (!logicalRange) return;
      const barsInfo = candle.barsInLogicalRange(logicalRange);
      if (barsInfo && barsInfo.barsBefore < 50) {
        onScrollNearStartRef.current?.();
      }
    });

    const clampVisibleRange = (range: { from: UTCTimestamp | BusinessDay; to: UTCTimestamp | BusinessDay } | null) => {
      if (!lockVisibleRange) return;
      if (!range) return;
      const min = timeBoundsRef.current.min;
      const max = timeBoundsRef.current.max;
      if (!min || !max) return;
      if (typeof range.from !== "number" || typeof range.to !== "number") return;
      let from = range.from as UTCTimestamp;
      let to = range.to as UTCTimestamp;
      if (min >= max) return;

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
      markersPluginRef.current?.detach();
      chart.remove();
      chartRef.current = null;
      candleRef.current = null;
      lineRef.current = null;
      volumeRef.current = null;
      markersPluginRef.current = null;
    };
  }, [onHover, timeframe]);

  useEffect(() => {
    const candle = candleRef.current;
    const line = lineRef.current;
    const volume = volumeRef.current;
    if (!candle || !line || !volume) return;

    const candleData = bars
      .map((b) => {
        if (!b.timestamp) return null;
        if (
          b.open === undefined ||
          b.high === undefined ||
          b.low === undefined ||
          b.close === undefined
        ) {
          return null;
        }
        const time = toUtcTimestamp(b.timestamp);
        if (!time) return null;
        return {
          time,
          open: b.open,
          high: b.high,
          low: b.low,
          close: b.close,
        };
      })
      .filter(Boolean);

    const lineData = bars
      .map((b) => {
        if (!b.timestamp || b.close === undefined) return null;
        const time = toUtcTimestamp(b.timestamp);
        if (!time) return null;
        return { time, value: b.close };
      })
      .filter(Boolean);

    const volumeData = bars
      .map((b) => {
        if (!b.timestamp || b.volume === undefined) return null;
        const time = toUtcTimestamp(b.timestamp);
        if (!time) return null;
        const isUp =
          b.close !== undefined && b.open !== undefined && b.close >= b.open;
        return {
          time,
          value: b.volume,
          color: isUp ? "rgba(34, 197, 94, 0.5)" : "rgba(239, 68, 68, 0.5)",
        };
      })
      .filter(Boolean);

    candle.setData(candleData as Parameters<typeof candle.setData>[0]);
    line.setData(lineData as Parameters<typeof line.setData>[0]);
    volume.setData(volumeData as Parameters<typeof volume.setData>[0]);

    // Re-apply markers after setting data to prevent them from disappearing
    // Use requestAnimationFrame to ensure the chart has finished processing the new data
    const applyMarkers = () => {
      const markersPlugin = markersPluginRef.current;
      if (markersPlugin && markersRef.current.length > 0) {
        const seriesMarkers = markersRef.current.map((m) => ({
          time: m.time,
          position: m.position,
          color: m.color,
          shape: m.shape,
          text: m.text,
        }));
        markersPlugin.setMarkers(seriesMarkers);
      }
    };

    // Apply immediately and also after a frame to handle async chart updates
    applyMarkers();
    requestAnimationFrame(applyMarkers);
  }, [bars]);

  useEffect(() => {
    candleRef.current?.applyOptions({ visible: showCandles });
  }, [showCandles]);

  useEffect(() => {
    lineRef.current?.applyOptions({ visible: showLine });
  }, [showLine]);

  useEffect(() => {
    volumeRef.current?.applyOptions({ visible: showVolume });
  }, [showVolume]);

  useEffect(() => {
    if (!chartRef.current) return;
    const min = timeBoundsRef.current.min;
    const max = timeBoundsRef.current.max;
    if (lockVisibleRange && min && max && min < max) {
      chartRef.current.timeScale().setVisibleRange({ from: min, to: max });
      return;
    }
    chartRef.current.timeScale().fitContent();
  }, [resetKey, lockVisibleRange]);

  useEffect(() => {
    // Store markers in ref for re-application on zoom
    markersRef.current = markers || [];

    const markersPlugin = markersPluginRef.current;
    if (!markersPlugin) return;
    if (!markers || markers.length === 0) {
      markersPlugin.setMarkers([]);
      return;
    }
    // Convert ChartMarker to SeriesMarker format
    const seriesMarkers = markers.map((m) => ({
      time: m.time,
      position: m.position,
      color: m.color,
      shape: m.shape,
      text: m.text,
    }));
    markersPlugin.setMarkers(seriesMarkers);
  }, [markers, bars]);

  return (
    <div className="w-full" style={{ height: `${height}px` }}>
      <div ref={containerRef} className="h-full w-full" />
    </div>
  );
}
