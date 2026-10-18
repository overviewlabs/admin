import type { Config } from "../config.js";
import type { StorageProvider } from "./types.js";
import { createLocalDiskStorageProvider } from "./local-disk-provider.js";
import { createS3StorageProvider } from "./s3-provider.js";
import { createPrimaryFileProvider } from "./primary-file-provider.js";

export function createStorageProviderFromConfig(config: Config): StorageProvider {
  if (process.env.WHOXOS_PRIMARY_FILES_CONFIG) {
    return createPrimaryFileProvider(config.storageLocalDiskBaseDir, process.env.WHOXOS_PRIMARY_FILES_CONFIG);
  }
  if (config.storageProvider === "local_disk") {
    return createLocalDiskStorageProvider(config.storageLocalDiskBaseDir);
  }

  return createS3StorageProvider({
    bucket: config.storageS3Bucket,
    region: config.storageS3Region,
    endpoint: config.storageS3Endpoint,
    prefix: config.storageS3Prefix,
    forcePathStyle: config.storageS3ForcePathStyle,
  });
}
