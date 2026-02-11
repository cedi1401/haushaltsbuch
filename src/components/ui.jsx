import React from "react";

export function Card({ children, style }) {
  return (
    <div className="hb-card" style={style}>
      {children}
    </div>
  );
}

export function CardContent({ children }) {
  return <div className="hb-card-content">{children}</div>;
}

export function Button({ children, onClick, variant = "solid", disabled, type = "button", style, className }) {
  const cls = [
    variant === "outline" ? "hb-btn hb-btn-outline" : "hb-btn",
    className,
  ].filter(Boolean).join(" ");
  return (
    <button className={cls} onClick={onClick} disabled={disabled} type={type} style={style}>
      {children}
    </button>
  );
}
