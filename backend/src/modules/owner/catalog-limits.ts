import {
  DEFAULT_CATALOG_DESCRIPTION_LIMITS,
  MAX_CATALOG_DESCRIPTION_LIMIT,
  MIN_CATALOG_DESCRIPTION_LIMIT,
  normalizeCatalogDescriptionLimits,
  type CatalogDescriptionLimits,
} from "../../common/constants/catalog-description-limits";
import { getPlatformContent } from "../public/content.service";

export {
  DEFAULT_CATALOG_DESCRIPTION_LIMITS,
  MAX_CATALOG_DESCRIPTION_LIMIT,
  MIN_CATALOG_DESCRIPTION_LIMIT,
  normalizeCatalogDescriptionLimits,
  type CatalogDescriptionLimits,
};

export async function getCatalogDescriptionLimits(): Promise<CatalogDescriptionLimits> {
  const content = await getPlatformContent();
  return normalizeCatalogDescriptionLimits(
    content.operations.ownerApp.catalogDescriptionLimits,
  );
}
