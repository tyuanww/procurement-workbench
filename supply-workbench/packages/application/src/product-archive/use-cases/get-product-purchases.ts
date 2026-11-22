import { matchChannel, type PurchaseScope } from '@sw/domain';
import type { GetProductPurchases, GetProductPurchasesDeps } from '../boundary.js';
import { purchasesOf } from './cards.js';

export const makeGetProductPurchases =
  (deps: GetProductPurchasesDeps): GetProductPurchases =>
  async (input) => {
    const facts = await deps.products.load({ productId: input.productId });
    const scope: PurchaseScope = input.scope ?? 'all_channels';
    const distribution = purchasesOf(facts, scope);
    return {
      scope,
      rows: facts.purchaseRows.flatMap((row) => {
        const channelMatch = matchChannel({ lineBarcode: row.barcodeRaw, product: facts.product, scope });
        return channelMatch === null ? [] : [{ orderLine: row.orderLine, channelMatch }];
      }),
      inTransit: facts.inTransitRows.flatMap((row) => {
        const channelMatch = matchChannel({ lineBarcode: row.barcodeRaw, product: facts.product, scope });
        return channelMatch === null ? [] : [{ row: row.row, channelMatch }];
      }),
      ...distribution,
    };
  };
