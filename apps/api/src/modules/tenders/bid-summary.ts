import type { BidSummary } from "@buildguard/shared-types";

type BidWithLineItemsAndContractor = {
  id: string;
  contractorProfileId: string;
  contractorProfile: { companyName: string };
  totalAmountMinor: bigint;
  currency: string;
  proposedStartDate: Date | null;
  proposedEndDate: Date | null;
  paymentTermsDescription: string;
  status: string;
  submittedAt: Date;
  lineItems: { description: string; quantity: unknown; unitAmountMinor: bigint; currency: string }[];
};

export function toBidSummary(bid: BidWithLineItemsAndContractor): BidSummary {
  return {
    id: bid.id,
    contractorProfileId: bid.contractorProfileId,
    companyName: bid.contractorProfile.companyName,
    totalAmountMinor: bid.totalAmountMinor.toString(),
    currency: bid.currency,
    proposedStartDate: bid.proposedStartDate?.toISOString() ?? null,
    proposedEndDate: bid.proposedEndDate?.toISOString() ?? null,
    paymentTermsDescription: bid.paymentTermsDescription,
    status: bid.status as BidSummary["status"],
    submittedAt: bid.submittedAt.toISOString(),
    lineItems: bid.lineItems.map((li) => ({
      description: li.description,
      quantity: Number(li.quantity),
      unitAmountMinor: li.unitAmountMinor.toString(),
      currency: li.currency,
    })),
  };
}
