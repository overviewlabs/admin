import { createRoot, type Root } from "react-dom/client";

export interface WHOXOSReactRootHost {
  __whoxosReactRoot?: Root;
}

type CreateRoot = (container: Parameters<typeof createRoot>[0]) => Root;

/**
 * Keep one React root per browser window even if Vite evaluates the entry
 * module more than once during a development reload.
 */
export function getOrCreateWHOXOSReactRoot(
  host: object,
  container: Parameters<typeof createRoot>[0],
  create: CreateRoot = createRoot,
): Root {
  const rootHost = host as WHOXOSReactRootHost;
  if (rootHost.__whoxosReactRoot) return rootHost.__whoxosReactRoot;

  const root = create(container);
  rootHost.__whoxosReactRoot = root;
  return root;
}
