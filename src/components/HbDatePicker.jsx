import React, { useState, useRef, useEffect } from "react";
import { MONTHS_LONG as MONTH_NAMES, MONTHS_SHORT as SHORT_MONTHS } from "../utils/constants.js";

const DAY_NAMES = ["Mo","Di","Mi","Do","Fr","Sa","So"];

function parseISODate(value) {
  if (!value) return null;
  const p = value.split("-");
  return { y: Number(p[0]), m: Number(p[1]), d: Number(p[2]) };
}

function parseISOMonth(value) {
  if (!value) return null;
  const p = value.split("-");
  return { y: Number(p[0]), m: Number(p[1]) };
}

function daysInMonth(year, month) {
  return new Date(year, month, 0).getDate();
}

// Returns offset (Monday = 0) for the first day of the given month
function firstWeekday(year, month) {
  return (new Date(year, month - 1, 1).getDay() + 6) % 7;
}

const CalIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="3" y="4" width="18" height="18" rx="2" />
    <line x1="16" y1="2" x2="16" y2="6" />
    <line x1="8" y1="2" x2="8" y2="6" />
    <line x1="3" y1="10" x2="21" y2="10" />
  </svg>
);

const ChevLeft = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polyline points="15 18 9 12 15 6" />
  </svg>
);

const ChevRight = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polyline points="9 18 15 12 9 6" />
  </svg>
);

function useCloseOnOutside(open, setOpen, triggerRef, popoverRef) {
  useEffect(() => {
    if (!open) return;
    function onDown(e) {
      if (
        popoverRef.current && !popoverRef.current.contains(e.target) &&
        triggerRef.current && !triggerRef.current.contains(e.target)
      ) setOpen(false);
    }
    function onKey(e) { if (e.key === "Escape") setOpen(false); }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, setOpen, triggerRef, popoverRef]);
}

export function HbDatePicker({ value, onChange, disabled, style, className, placeholder = "Datum wählen" }) {
  const [open, setOpen] = useState(false);
  const [dropUp, setDropUp] = useState(false);
  const [viewYear, setViewYear] = useState(0);
  const [viewMonth, setViewMonth] = useState(1);
  const triggerRef = useRef(null);
  const popoverRef = useRef(null);

  const parsed = parseISODate(value);
  const now = new Date();
  const todayY = now.getFullYear();
  const todayM = now.getMonth() + 1;
  const todayD = now.getDate();

  // Initialise calendar view whenever the popover opens — derived from the open
  // transition rather than via an Effect (avoids set-state-in-effect).
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      const src = parsed ?? { y: todayY, m: todayM };
      setViewYear(src.y);
      setViewMonth(src.m);
    }
  }

  // Flip the popover upward when there is not enough room below the trigger.
  // Genuine DOM measurement after layout, so this must stay an Effect.
  useEffect(() => {
    let up = false;
    if (open) {
      const trigger = triggerRef.current;
      const popover = popoverRef.current;
      if (trigger && popover) {
        const triggerRect = trigger.getBoundingClientRect();
        const popHeight = popover.offsetHeight || 330;
        const spaceBelow = window.innerHeight - triggerRect.bottom;
        const spaceAbove = triggerRect.top;
        up = spaceBelow < popHeight + 12 && spaceAbove > spaceBelow;
      }
    }
    setDropUp(up);
  }, [open, viewMonth, viewYear]);

  useCloseOnOutside(open, setOpen, triggerRef, popoverRef);

  function prevMonth() {
    if (viewMonth === 1) { setViewMonth(12); setViewYear(y => y - 1); }
    else setViewMonth(m => m - 1);
  }
  function nextMonth() {
    if (viewMonth === 12) { setViewMonth(1); setViewYear(y => y + 1); }
    else setViewMonth(m => m + 1);
  }
  function selectDay(day) {
    onChange(`${viewYear}-${String(viewMonth).padStart(2, "0")}-${String(day).padStart(2, "0")}`);
    setOpen(false);
  }
  function selectToday() {
    onChange(`${todayY}-${String(todayM).padStart(2, "0")}-${String(todayD).padStart(2, "0")}`);
    setOpen(false);
  }

  const displayText = parsed
    ? `${String(parsed.d).padStart(2, "0")}. ${MONTH_NAMES[parsed.m - 1]} ${parsed.y}`
    : placeholder;

  // Build day cells: null = empty placeholder, number = day
  const offset = firstWeekday(viewYear, viewMonth);
  const total = daysInMonth(viewYear, viewMonth);
  const cells = Array(offset).fill(null);
  for (let d = 1; d <= total; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <div className={`hb-datepicker${className ? " " + className : ""}`} style={style}>
      <button
        ref={triggerRef}
        type="button"
        className={`hb-input hb-datepicker-trigger${open ? " hb-datepicker-trigger--open" : ""}`}
        onClick={() => setOpen(o => !o)}
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <span className="hb-datepicker-trigger-text" style={!parsed ? { color: "var(--muted)", opacity: 0.7 } : {}}>
          {displayText}
        </span>
        <span className="hb-datepicker-trigger-icon"><CalIcon /></span>
      </button>

      {open && (
        <div
          ref={popoverRef}
          className={`hb-datepicker-popover${dropUp ? " hb-datepicker-popover--up" : ""}`}
          role="dialog"
          aria-modal="true"
          aria-label="Datum wählen"
        >
          <div className="hb-datepicker-header">
            <button type="button" className="hb-datepicker-nav" onClick={prevMonth} aria-label="Vorheriger Monat">
              <ChevLeft />
            </button>
            <span className="hb-datepicker-month-label">
              {MONTH_NAMES[viewMonth - 1]} {viewYear}
            </span>
            <button type="button" className="hb-datepicker-nav" onClick={nextMonth} aria-label="Nächster Monat">
              <ChevRight />
            </button>
          </div>

          <div className="hb-datepicker-grid">
            {DAY_NAMES.map(d => (
              <div key={d} className="hb-datepicker-weekday">{d}</div>
            ))}
            {cells.map((day, i) => {
              if (!day) return <div key={`_${i}`} aria-hidden="true" />;
              const isSel = parsed && parsed.y === viewYear && parsed.m === viewMonth && parsed.d === day;
              const isToday = todayY === viewYear && todayM === viewMonth && todayD === day;
              return (
                <button
                  key={day}
                  type="button"
                  className={[
                    "hb-datepicker-day",
                    isSel ? "hb-datepicker-day--selected" : "",
                    isToday && !isSel ? "hb-datepicker-day--today" : "",
                  ].join(" ").trim()}
                  onClick={() => selectDay(day)}
                  aria-label={`${day}. ${MONTH_NAMES[viewMonth - 1]} ${viewYear}`}
                  aria-pressed={!!isSel}
                >
                  {day}
                </button>
              );
            })}
          </div>

          <div className="hb-datepicker-footer">
            <button type="button" className="hb-datepicker-today-btn" onClick={selectToday}>
              Heute
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function HbMonthPicker({ value, onChange, disabled, style, className }) {
  const [open, setOpen] = useState(false);
  const [dropUp, setDropUp] = useState(false);
  const [viewYear, setViewYear] = useState(0);
  const triggerRef = useRef(null);
  const popoverRef = useRef(null);

  const parsed = parseISOMonth(value);
  const now = new Date();
  const todayY = now.getFullYear();
  const todayM = now.getMonth() + 1;

  // Initialise view year whenever the popover opens — derived from the open
  // transition rather than via an Effect (avoids set-state-in-effect).
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) setViewYear(parsed?.y ?? todayY);
  }

  // Flip the popover upward when there is not enough room below the trigger.
  // Genuine DOM measurement after layout, so this must stay an Effect.
  useEffect(() => {
    let up = false;
    if (open) {
      const trigger = triggerRef.current;
      const popover = popoverRef.current;
      if (trigger && popover) {
        const triggerRect = trigger.getBoundingClientRect();
        const popHeight = popover.offsetHeight || 240;
        const spaceBelow = window.innerHeight - triggerRect.bottom;
        const spaceAbove = triggerRect.top;
        up = spaceBelow < popHeight + 12 && spaceAbove > spaceBelow;
      }
    }
    setDropUp(up);
  }, [open, viewYear]);

  useCloseOnOutside(open, setOpen, triggerRef, popoverRef);

  function selectMonth(month) {
    onChange(`${viewYear}-${String(month).padStart(2, "0")}`);
    setOpen(false);
  }

  const displayText = parsed
    ? `${MONTH_NAMES[parsed.m - 1]} ${parsed.y}`
    : "Monat wählen";

  return (
    <div className={`hb-datepicker hb-monthpicker${className ? " " + className : ""}`} style={style}>
      <button
        ref={triggerRef}
        type="button"
        className={`hb-input hb-datepicker-trigger${open ? " hb-datepicker-trigger--open" : ""}`}
        onClick={() => setOpen(o => !o)}
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <span className="hb-datepicker-trigger-text" style={!parsed ? { color: "var(--muted)", opacity: 0.7 } : {}}>
          {displayText}
        </span>
        <span className="hb-datepicker-trigger-icon"><CalIcon /></span>
      </button>

      {open && (
        <div
          ref={popoverRef}
          className={`hb-datepicker-popover hb-monthpicker-popover${dropUp ? " hb-datepicker-popover--up" : ""}`}
          role="dialog"
          aria-modal="true"
          aria-label="Monat wählen"
        >
          <div className="hb-datepicker-header">
            <button type="button" className="hb-datepicker-nav" onClick={() => setViewYear(y => y - 1)} aria-label="Vorheriges Jahr">
              <ChevLeft />
            </button>
            <span className="hb-datepicker-month-label">{viewYear}</span>
            <button type="button" className="hb-datepicker-nav" onClick={() => setViewYear(y => y + 1)} aria-label="Nächstes Jahr">
              <ChevRight />
            </button>
          </div>

          <div className="hb-monthpicker-grid">
            {SHORT_MONTHS.map((name, i) => {
              const month = i + 1;
              const isSel = parsed && parsed.y === viewYear && parsed.m === month;
              const isNow = todayY === viewYear && todayM === month;
              return (
                <button
                  key={month}
                  type="button"
                  className={[
                    "hb-monthpicker-month",
                    isSel ? "hb-datepicker-day--selected" : "",
                    isNow && !isSel ? "hb-datepicker-day--today" : "",
                  ].join(" ").trim()}
                  onClick={() => selectMonth(month)}
                  aria-pressed={!!isSel}
                >
                  {name}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
