import { SECRET_PROVIDERS, type SecretProvider } from "@whoxos/shared";

export function getConfiguredSecretProvider(): SecretProvider {
  const configuredProvider = process.env.WHOXOS_SECRETS_PROVIDER;
  return configuredProvider && SECRET_PROVIDERS.includes(configuredProvider as SecretProvider)
    ? configuredProvider as SecretProvider
    : "local_encrypted";
}
