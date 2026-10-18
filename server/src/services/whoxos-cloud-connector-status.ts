import {
  whoxosCloudConnectorEnrollmentStatus,
  type WHOXOSCloudConnectorEnrollmentStatus,
} from "./whoxos-cloud-connector-enrollment.js";
import {
  createWHOXOSCloudConnector,
  whoxosCloudConnectorConfigFromEnv,
} from "./whoxos-cloud-connector.js";

export async function reconcileWHOXOSCloudConnectorEnrollmentStatus(
  env: NodeJS.ProcessEnv = process.env,
  request: typeof fetch = fetch,
): Promise<WHOXOSCloudConnectorEnrollmentStatus> {
  const local = whoxosCloudConnectorEnrollmentStatus(env);
  if (!local.configured) return local;
  const config = whoxosCloudConnectorConfigFromEnv(env);
  if (!config) return { ...local, configured: false, status: "not_configured" };
  try {
    const status = await createWHOXOSCloudConnector({ config, request }).getInstanceStatus();
    if (status === "active") return { ...local, configured: true, status: "active" };
    if (status === "suspended") return { ...local, configured: false, status: "suspended" };
    return { ...local, configured: false, status: "not_configured" };
  } catch {
    return { ...local, configured: false, status: "unverified" };
  }
}
