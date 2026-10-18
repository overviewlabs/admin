/**
 * @deprecated WHOXOS ID is identity-only. Import the WHOXOS Cloud
 * connector names from `whoxos-cloud-connector.ts` for new code.
 *
 * These aliases keep source compatibility while deployments and persisted app
 * definitions move from the former WHOXOS ID broker prototype.
 */
export {
  GMAIL_CONNECTOR_SCOPES,
  GMAIL_MCP_URL,
  GOOGLE_WORKSPACE_CONNECTOR_PROFILES,
  WHOXOSCloudConnectorError as WHOXOSIdConnectorError,
  createWHOXOSCloudConnector as createWHOXOSIdGmailConnector,
  whoxosCloudConnectorCapabilitiesFromEnv as whoxosIdGoogleConnectorCapabilitiesFromEnv,
  whoxosCloudConnectorConfigFromEnv as whoxosIdGmailConnectorConfigFromEnv,
} from "./whoxos-cloud-connector.js";

export type {
  WHOXOSCloudConnector as WHOXOSIdGmailConnector,
  WHOXOSCloudConnector as WHOXOSIdGoogleWorkspaceConnector,
  WHOXOSCloudConnectorConfig as WHOXOSIdGmailConnectorConfig,
  WHOXOSCloudConnectorEnvironment as WHOXOSIdConnectorEnvironment,
  WHOXOSCloudConnectorOperation as WHOXOSIdConnectorOperation,
  SealedGmailCredentials,
  SealedGoogleWorkspaceCredentials,
} from "./whoxos-cloud-connector.js";
