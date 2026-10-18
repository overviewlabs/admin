import { useState } from "react";
import { Search } from "lucide-react";
import { useNavigate } from "@/lib/router";
import { useSidebar } from "../context/SidebarContext";
import { SidebarNavItem } from "./SidebarNavItem";
export function SidebarSearch() {
  const [query, setQuery] = useState("");
  const navigate = useNavigate();
  const { collapsed, peeking, isMobile, setSidebarOpen } = useSidebar();
  if (collapsed && !peeking) return <SidebarNavItem to="/search" label="Search" icon={Search} />;
  return <form role="search" className="mx-2 mb-2" onSubmit={event => {
    event.preventDefault();
    navigate(`/search${query.trim() ? `?q=${encodeURIComponent(query.trim())}` : ""}`);
    if (isMobile) setSidebarOpen(false);
  }}><div className="flex items-center gap-2 rounded-lg border border-border bg-background px-2 py-1.5 focus-within:ring-2 focus-within:ring-ring"><Search aria-hidden="true" className="h-4 w-4 shrink-0 text-muted-foreground" /><input type="search" aria-label="Search organization" placeholder="Search…" value={query} onChange={event => setQuery(event.target.value)} className="min-w-0 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground" /></div></form>;
}
