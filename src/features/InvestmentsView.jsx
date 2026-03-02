import React, { useState } from "react";
import InvestmentsOverview from "./InvestmentsOverview.jsx";
import PortfolioDetail from "./PortfolioDetail.jsx";
import { Button } from "../components/ui.jsx";

export default function InvestmentsView({ activeBook, toCHF, onUpdateBook, todayISO }) {
  const [subView, setSubView] = useState("overview"); // "overview" | "detail"
  const [selectedPortfolioId, setSelectedPortfolioId] = useState(null);

  const portfolios = activeBook?.investmentPortfolios || [];
  const selectedPortfolio = portfolios.find((p) => p.id === selectedPortfolioId) || null;

  function openPortfolio(id) {
    setSelectedPortfolioId(id);
    setSubView("detail");
  }

  function goBack() {
    setSubView("overview");
    setSelectedPortfolioId(null);
  }

  return (
    <div>
      {/* Breadcrumb */}
      <div style={{ marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
        <button
          className={`hb-breadcrumb-link${subView === "overview" ? " hb-breadcrumb-active" : ""}`}
          style={{
            background: "none",
            border: "none",
            cursor: subView === "detail" ? "pointer" : "default",
            padding: 0,
            fontSize: 14,
            fontWeight: 600,
            color: subView === "detail" ? "var(--accent)" : "var(--text)",
          }}
          onClick={subView === "detail" ? goBack : undefined}
          type="button"
        >
          INVESTMENTS
        </button>
        {subView === "detail" && selectedPortfolio && (
          <>
            <span className="hb-muted" style={{ fontSize: 14 }}>&gt;</span>
            <span style={{ fontSize: 14, fontWeight: 600 }}>{selectedPortfolio.name}</span>
          </>
        )}
      </div>

      {subView === "detail" && selectedPortfolio ? (
        <PortfolioDetail
          activeBook={activeBook}
          portfolio={selectedPortfolio}
          toCHF={toCHF}
          onUpdateBook={onUpdateBook}
          todayISO={todayISO}
          onBack={goBack}
        />
      ) : (
        <InvestmentsOverview
          activeBook={activeBook}
          toCHF={toCHF}
          onUpdateBook={onUpdateBook}
          todayISO={todayISO}
          onOpenPortfolio={openPortfolio}
        />
      )}
    </div>
  );
}
