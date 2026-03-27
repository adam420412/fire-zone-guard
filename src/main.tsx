import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Unregister any stale Service Workers from PWA testing
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then(async (registrations) => {
    let reloaded = false;
    for (const registration of registrations) {
      await registration.unregister();
      reloaded = true;
    }
    if (reloaded) {
      window.location.reload();
    }
  });
}

createRoot(document.getElementById("root")!).render(<App />);
