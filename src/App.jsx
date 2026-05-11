import HaushaltsbuchApp from "./HaushaltsbuchApp.jsx";
import { ToastProvider } from "./components/Toast.jsx";
import { ConfirmProvider } from "./components/ConfirmDialog.jsx";
import { ThemeColorsProvider } from "./hooks/useThemeColors.jsx";
import ErrorBoundary from "./components/ErrorBoundary.jsx";

export default function App() {
  return (
    <ErrorBoundary>
      <ThemeColorsProvider>
        <ToastProvider>
          <ConfirmProvider>
            <HaushaltsbuchApp />
          </ConfirmProvider>
        </ToastProvider>
      </ThemeColorsProvider>
    </ErrorBoundary>
  );
}
