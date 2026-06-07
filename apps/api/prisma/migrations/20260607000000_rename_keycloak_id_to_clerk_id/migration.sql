-- Rename keycloakId to clerkId on Customer table
ALTER TABLE "Customer" RENAME COLUMN "keycloakId" TO "clerkId";

-- Rename the unique index to match the new column name
ALTER INDEX "Customer_keycloakId_key" RENAME TO "Customer_clerkId_key";
