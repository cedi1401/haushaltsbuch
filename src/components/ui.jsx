import React from "react";

export function Card({ children, style, className }) {
  return (
    <div className={`hb-card${className ? ` ${className}` : ""}`} style={style}>
      {children}
    </div>
  );
}

export function CardContent({ children, style }) {
  return <div className="hb-card-content" style={style}>{children}</div>;
}

export function Button({ children, onClick, variant = "solid", size, disabled, type = "button", style, className }) {
  const cls = [
    variant === "outline" ? "hb-btn hb-btn-outline" : "hb-btn",
    size === "sm" ? "hb-btn-sm" : null,
    className,
  ].filter(Boolean).join(" ");
  return (
    <button className={cls} onClick={onClick} disabled={disabled} type={type} style={style}>
      {children}
    </button>
  );
}
