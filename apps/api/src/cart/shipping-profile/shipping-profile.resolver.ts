import { Injectable } from '@nestjs/common';
import { ArticleIdentityDto } from '@vp-parts-shop/shared';
import { ArticleReadCache, CrossReferencesService } from '../../catalog';
import { SupplierCatalogRepository } from '../../inventory';
import type { ShippingProfile } from '../../tecdoc';
import {
  ResolvedShippingProfile,
  isFullyMeasured,
  preferMeasured,
} from '../cart-shipping';
import { estimateFromEquivalents } from './equivalents-estimate';

/**
 * What a part weighs and packs into, from the most trusted source that knows:
 * the suppliers' catalogue, then TecDoc, then the parts that replace it. Each
 * later source fills only what the earlier ones left out. The chain is
 * described in docs/DELIVERY-PROVIDERS.md.
 */
@Injectable()
export class ShippingProfileResolver {
  constructor(
    private readonly supplierCatalog: SupplierCatalogRepository,
    private readonly articles: ArticleReadCache,
    private readonly crossReferences: CrossReferencesService,
  ) {}

  async resolve({
    brandId,
    articleNumber,
  }: ArticleIdentityDto): Promise<ResolvedShippingProfile> {
    const fromCatalog = await this.supplierCatalog.findPackageProfile({
      brandId,
      articleNumber,
    });

    if (isFullyMeasured(fromCatalog)) {
      return asMeasured(fromCatalog);
    }

    const tecDocBrandId = Number(brandId);
    const { shippingProfile } = await this.articles.read(
      tecDocBrandId,
      articleNumber,
    );
    const known = preferMeasured(fromCatalog, shippingProfile);

    if (known.weightGrams !== null) {
      return asMeasured(known);
    }

    const estimate = await this.estimateFromCrossReferences(
      tecDocBrandId,
      articleNumber,
    );

    return estimate === null
      ? asMeasured(known)
      : { ...preferMeasured(known, estimate), isEstimated: true };
  }

  private async estimateFromCrossReferences(
    brandId: number,
    articleNumber: string,
  ): Promise<ShippingProfile | null> {
    const candidates = await this.crossReferences.getCandidates(
      brandId,
      articleNumber,
    );
    const profiles = await this.supplierCatalog.findPackageProfiles(
      candidates.map((candidate) => ({
        brandId: candidate.brandId,
        articleNumber: candidate.articleNumber,
      })),
    );

    return estimateFromEquivalents(profiles);
  }
}

function asMeasured(profile: ShippingProfile): ResolvedShippingProfile {
  return { ...profile, isEstimated: false };
}
