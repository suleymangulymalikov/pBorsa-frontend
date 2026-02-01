import { useEffect, useMemo, useRef, useState } from "react";
import type { StockInfo } from "../api/stocks";

type StockSelectProps = {
  value: string;
  options: StockInfo[];
  onChange: (symbol: string) => void;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
};

const MAX_RESULTS = 200;

export default function StockSelect({
  value,
  options,
  onChange,
  placeholder = "Search by symbol or company",
  disabled = false,
  required = false,
}: StockSelectProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");

  const selected = useMemo(
    () =>
      options.find(
        (opt) => String(opt.symbol).toUpperCase() === value.toUpperCase(),
      ),
    [options, value],
  );

  const filtered = useMemo(() => {
    if (!query) return options;
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((opt) => {
      const symbol = String(opt.symbol ?? "").toLowerCase();
      const name = String(opt.name ?? "").toLowerCase();
      return symbol.includes(q) || name.includes(q);
    });
  }, [options, query]);

  const visible = filtered.slice(0, MAX_RESULTS);
  const showMore = filtered.length > MAX_RESULTS;

  useEffect(() => {
    const handler = (event: MouseEvent) => {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setQuery("");
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleSelect = (symbol: string) => {
    onChange(symbol);
    setIsOpen(false);
    setQuery("");
  };

  const inputValue = isOpen ? query : selected?.symbol ?? value ?? "";

  return (
    <div ref={rootRef} className="relative">
      <input
        className="mt-2 w-full rounded-lg border border-[#1f2e44] bg-[#0b1728] px-3 py-2 text-sm text-white"
        value={inputValue}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => {
          if (disabled) return;
          setIsOpen(true);
          setQuery("");
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && visible.length > 0) {
            e.preventDefault();
            handleSelect(String(visible[0].symbol));
          }
          if (e.key === "Escape") {
            e.preventDefault();
            setIsOpen(false);
            setQuery("");
          }
        }}
        placeholder={placeholder}
        disabled={disabled}
        required={required}
      />

      {isOpen ? (
        <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-lg border border-[#1f2e44] bg-[#0b1728] shadow-lg">
          <div className="max-h-64 overflow-auto">
            {visible.length === 0 ? (
              <div className="px-3 py-2 text-xs text-[var(--muted)]">
                {options.length === 0
                  ? "No stocks available."
                  : "No matching stocks."}
              </div>
            ) : (
              visible.map((opt) => {
                const symbol = String(opt.symbol ?? "").toUpperCase();
                const isSelected = symbol === value.toUpperCase();
                return (
                  <button
                    type="button"
                    key={symbol}
                    className={
                      isSelected
                        ? "flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm text-white hover:bg-[#132033]"
                        : "flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm text-white/90 hover:bg-[#132033]"
                    }
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => handleSelect(symbol)}
                  >
                    <span className="font-semibold">{symbol}</span>
                    <span className="text-xs text-[var(--muted)]">
                      {opt.name ?? "-"}
                    </span>
                  </button>
                );
              })
            )}
          </div>
          {showMore ? (
            <div className="border-t border-[#132033] px-3 py-2 text-xs text-[var(--muted)]">
              Showing first {MAX_RESULTS} results. Refine your search to see
              more.
            </div>
          ) : null}
        </div>
      ) : null}

      {selected ? (
        <div className="mt-1 text-xs text-[var(--muted)]">
          Selected: {selected.symbol}
          {selected.name ? ` — ${selected.name}` : ""}
        </div>
      ) : null}
    </div>
  );
}
