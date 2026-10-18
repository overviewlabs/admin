import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

interface SidebarContextValue {
  // Mobile drawer + back-compat (existing behavior, unchanged).
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  toggleSidebar: () => void;
  isMobile: boolean;
  // User-controlled desktop icon rail.
  collapsed: boolean;
  setCollapsed: (next: boolean) => void;
  toggleCollapsed: () => void;
  // Routes cannot lock the user-controlled rail.
  collapseLocked: boolean;
  // Expanding is an explicit action; hover peeking is disabled.
  peeking: boolean;
  setPeeking: (next: boolean) => void;
  // Legacy requests remain observable without affecting the global nav.
  forceCollapsed: boolean;
  setForceCollapsed: (next: boolean) => void;
  // Route-requested collapse retained for integration compatibility.
  routeRequestsCollapsed: boolean;
  setRouteRequestsCollapsed: (next: boolean) => void;
}

const SidebarContext = createContext<SidebarContextValue | null>(null);

const MOBILE_BREAKPOINT = 768;

export function SidebarProvider({ children }: { children: ReactNode }) {
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < MOBILE_BREAKPOINT);
  const [sidebarOpen, setSidebarOpen] = useState(() => window.innerWidth >= MOBILE_BREAKPOINT);

  const [routeRequestsCollapsed, setRouteRequestsCollapsed] = useState(false);
  const [forceCollapsed, setForceCollapsed] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
    const onChange = (e: MediaQueryListEvent) => {
      setIsMobile(e.matches);
      setSidebarOpen(!e.matches);
    };
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  const [desktopCollapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem("overviewlabs.sidebar.collapsed") === "1"; }
    catch { return false; }
  });
  useEffect(() => {
    try { localStorage.setItem("overviewlabs.sidebar.collapsed", desktopCollapsed ? "1" : "0"); }
    catch { /* Storage may be unavailable. */ }
  }, [desktopCollapsed]);
  const collapsed = !isMobile && desktopCollapsed;
  const collapseLocked = false;
  const peeking = false;
  const toggleCollapsed = useCallback(() => setCollapsed((value) => !value), []);
  const setPeeking = useCallback((_next: boolean) => {}, []);

  const toggleSidebar = useCallback(() => setSidebarOpen((v) => !v), []);

  const value = useMemo<SidebarContextValue>(
    () => ({
      sidebarOpen,
      setSidebarOpen,
      toggleSidebar,
      isMobile,
      collapsed,
      setCollapsed,
      toggleCollapsed,
      collapseLocked,
      peeking,
      setPeeking,
      forceCollapsed,
      setForceCollapsed,
      routeRequestsCollapsed,
      setRouteRequestsCollapsed,
    }),
    [
      sidebarOpen,
      setSidebarOpen,
      toggleSidebar,
      isMobile,
      collapsed,
      setCollapsed,
      toggleCollapsed,
      collapseLocked,
      peeking,
      setPeeking,
      forceCollapsed,
      setForceCollapsed,
      routeRequestsCollapsed,
      setRouteRequestsCollapsed,
    ],
  );

  return <SidebarContext.Provider value={value}>{children}</SidebarContext.Provider>;
}

export function useSidebar() {
  const ctx = useContext(SidebarContext);
  if (!ctx) {
    throw new Error("useSidebar must be used within SidebarProvider");
  }
  return ctx;
}
