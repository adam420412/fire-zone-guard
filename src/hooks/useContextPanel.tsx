import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

export type ContextEntityType = "building" | "company" | "task";

type ContextPanelState = {
  isOpen: boolean;
  entityType: ContextEntityType | null;
  entityId: string | null;
};

type ContextPanelApi = ContextPanelState & {
  openPanel: (type: ContextEntityType, id: string) => void;
  closePanel: () => void;
};

const ContextPanelContext = createContext<ContextPanelApi | null>(null);

export function ContextPanelProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ContextPanelState>({
    isOpen: false,
    entityType: null,
    entityId: null,
  });

  const openPanel = useCallback((type: ContextEntityType, id: string) => {
    setState({ isOpen: true, entityType: type, entityId: id });
  }, []);

  const closePanel = useCallback(() => {
    setState((s) => ({ ...s, isOpen: false }));
  }, []);

  const value = useMemo<ContextPanelApi>(
    () => ({ ...state, openPanel, closePanel }),
    [state, openPanel, closePanel]
  );

  return <ContextPanelContext.Provider value={value}>{children}</ContextPanelContext.Provider>;
}

export function useContextPanel(): ContextPanelApi {
  const ctx = useContext(ContextPanelContext);
  if (!ctx) throw new Error("useContextPanel must be used within ContextPanelProvider");
  return ctx;
}
