-- DropIndex
DROP INDEX "Cart_customerId_status_idx";

-- DropIndex
DROP INDEX "Cart_expiresAt_idx";

-- DropIndex
DROP INDEX "CartItem_cartId_idx";

-- CreateIndex
-- Serves both findActiveByCustomer (customerId + status equality) and the
-- guest-cart sweep (status + customerId equality, expiresAt range) as one
-- index; the old two-index split was redundant once column order was fixed.
CREATE INDEX "Cart_status_customerId_expiresAt_idx" ON "Cart"("status", "customerId", "expiresAt");

-- AddForeignKey
-- Self-relation: a merge target that never existed is refused by the
-- database, not discovered later. SetNull is fine here — the source cart is
-- an inert tombstone once merged, so losing this pointer is harmless.
ALTER TABLE "Cart" ADD CONSTRAINT "Cart_mergedIntoId_fkey" FOREIGN KEY ("mergedIntoId") REFERENCES "Cart"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
-- Restrict, not the default SetNull: an order is never deleted, so this FK
-- exists to refuse a bad delete loudly, not to survive one by quietly
-- forgetting which order a cart produced.
ALTER TABLE "Cart" ADD CONSTRAINT "Cart_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
-- Restrict: the guest-cart sweep already excludes ordered carts by status and
-- orderId, but if that invariant is ever broken, this FK must block the
-- delete, not silently orphan the order's idempotency key.
ALTER TABLE "Order" ADD CONSTRAINT "Order_cartId_fkey" FOREIGN KEY ("cartId") REFERENCES "Cart"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
