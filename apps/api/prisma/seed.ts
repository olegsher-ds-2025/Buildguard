import { PrismaClient } from "@prisma/client";
import * as argon2 from "argon2";

const prisma = new PrismaClient();

// amount_minor is always minor units (agorot for ILS), per the design doc's
// money-as-integers rule — this keeps the spec tables below readable in
// whole shekels (matching docs/demo/index.html's figures) while storing the
// correct minor-unit values.
const ils = (shekels: number) => BigInt(Math.round(shekels * 100));

// Mirrors docs/demo/index.html's "Villa Sharon" scenario — phase names,
// weights (via budget share), budget figures, and the same three findings —
// so the real app can be sanity-checked against the validated static demo.
async function main() {
  const ownerPasswordHash = await argon2.hash("owner-password-123");
  const staffPasswordHash = await argon2.hash("staff-password-123");
  const contractorPasswordHash = await argon2.hash("contractor-password-123");

  const owner = await prisma.user.upsert({
    where: { email: "owner@buildguard.dev" },
    update: {},
    create: {
      email: "owner@buildguard.dev",
      passwordHash: ownerPasswordHash,
      displayName: "D. Mizrahi",
      userType: "customer",
    },
  });

  const staff = await prisma.user.upsert({
    where: { email: "staff@buildguard.dev" },
    update: {},
    create: {
      email: "staff@buildguard.dev",
      passwordHash: staffPasswordHash,
      displayName: "T. Barak (Ops)",
      userType: "staff",
      staffProfile: { create: { staffRole: "trust_safety_admin" } },
    },
  });

  const amirUser = await prisma.user.upsert({
    where: { email: "amir@amir-cohen-construction.example" },
    update: {},
    create: {
      email: "amir@amir-cohen-construction.example",
      passwordHash: contractorPasswordHash,
      displayName: "Amir Cohen",
      userType: "customer",
    },
  });

  const amir = await prisma.contractorProfile.upsert({
    where: { userId: amirUser.id },
    update: {},
    create: {
      userId: amirUser.id,
      companyName: "Amir Cohen Construction",
      licenseNumber: "CON-4471",
      licenseExpiryDate: new Date("2027-06-30"),
      insuranceExpiryDate: new Date("2027-01-31"),
      verificationStatus: "verified",
      verifiedAt: new Date(),
      verifiedByStaffUserId: staff.id,
    },
  });

  let sharon = await prisma.contractorProfile.findFirst({ where: { companyName: "Sharon Earthworks" } });
  if (!sharon) {
    sharon = await prisma.contractorProfile.create({
      data: {
        companyName: "Sharon Earthworks",
        licenseNumber: "CON-2290",
        licenseExpiryDate: new Date("2027-03-31"),
        verificationStatus: "verified",
        verifiedAt: new Date(),
        verifiedByStaffUserId: staff.id,
      },
    });
  }

  // Deliberately included in the tender invitations below (see the M8 tender
  // fixture) so the "invited but unverified can't bid" business rule
  // (BidsService.submit) is exercisable against seed data, not just unit tests.
  let levi = await prisma.contractorProfile.findFirst({ where: { companyName: "Levi Plumbing & Systems" } });
  if (!levi) {
    levi = await prisma.contractorProfile.create({
      data: {
        companyName: "Levi Plumbing & Systems",
        licenseNumber: "CON-8834",
        verificationStatus: "pending",
      },
    });
  }

  let project = await prisma.project.findFirst({ where: { name: "Villa Sharon" } });
  if (!project) {
    project = await prisma.project.create({
      data: {
        name: "Villa Sharon",
        address: "3 Ha'Zayit St, Kfar Saba",
        projectType: "single_family",
        ownerUserId: owner.id,
        status: "active",
        startDate: new Date("2026-03-01"),
        targetCompletionDate: new Date("2027-02-28"),
      },
    });
  }

  await prisma.projectMember.upsert({
    where: { projectId_userId: { projectId: project.id, userId: owner.id } },
    update: {},
    create: { projectId: project.id, userId: owner.id, role: "owner", acceptedAt: new Date() },
  });
  await prisma.projectMember.upsert({
    where: { projectId_userId: { projectId: project.id, userId: amirUser.id } },
    update: {},
    create: { projectId: project.id, userId: amirUser.id, role: "contractor", acceptedAt: new Date() },
  });

  const phaseSpecs = [
    { name: "Foundations", sequenceNo: 1, budget: ils(420_000), status: "verified" },
    { name: "Structure", sequenceNo: 2, budget: ils(780_000), status: "in_progress" },
    { name: "Envelope", sequenceNo: 3, budget: ils(390_000), status: "in_progress" },
    { name: "Systems", sequenceNo: 4, budget: ils(460_000), status: "not_started" },
    { name: "Finishing", sequenceNo: 5, budget: ils(300_000), status: "not_started" },
  ] as const;

  const phases: Record<string, { id: string }> = {};
  for (const spec of phaseSpecs) {
    const phase = await prisma.phase.upsert({
      where: { id: `${project.id}-${spec.sequenceNo}` }, // never matches on first run; upsert falls to create
      update: {},
      create: {
        id: `${project.id}-${spec.sequenceNo}`,
        projectId: project.id,
        name: spec.name,
        sequenceNo: spec.sequenceNo,
        budgetPlannedMinor: spec.budget,
        currency: "ILS",
        status: spec.status,
      },
    });
    phases[spec.name] = phase;
  }

  // Task completion per phase feeds the M1+ progress calc (§ build plan: task
  // completion + verified-milestone ratio, budget-weighted across phases).
  const taskCompletionByPhase: Record<string, number> = {
    Foundations: 100,
    Structure: 78,
    Envelope: 12,
    Systems: 0,
    Finishing: 0,
  };
  for (const [name, phase] of Object.entries(phases)) {
    const existingTask = await prisma.task.findFirst({ where: { phaseId: phase.id } });
    if (!existingTask) {
      await prisma.task.create({
        data: {
          phaseId: phase.id,
          name: `${name} — main scope`,
          weight: 1,
          percentComplete: taskCompletionByPhase[name],
          status: taskCompletionByPhase[name] === 100 ? "done" : taskCompletionByPhase[name] > 0 ? "in_progress" : "not_started",
        },
      });
    }
  }

  await prisma.milestone.upsert({
    where: { id: `${phases.Foundations.id}-m1` },
    update: {},
    create: {
      id: `${phases.Foundations.id}-m1`,
      phaseId: phases.Foundations.id,
      name: "Foundations complete",
      status: "verified",
      verifiedAt: new Date(),
      verifiedByUserId: owner.id,
    },
  });
  await prisma.milestone.upsert({
    where: { id: `${phases.Structure.id}-m1` },
    update: {},
    create: {
      id: `${phases.Structure.id}-m1`,
      phaseId: phases.Structure.id,
      name: "Structure complete",
      status: "pending",
      dueDate: new Date("2026-09-15"),
    },
  });

  const budget = await prisma.budget.upsert({
    where: { projectId: project.id },
    update: {},
    create: { projectId: project.id, currency: "ILS", tolerancePct: 0.1 },
  });

  const budgetLineSpecs = [
    { category: "Foundations & earthworks", phase: "Foundations", planned: ils(420_000), actual: ils(438_200) },
    { category: "Structure & concrete", phase: "Structure", planned: ils(780_000), actual: ils(651_000) },
    { category: "Envelope & roofing", phase: "Envelope", planned: ils(390_000), actual: ils(47_300) },
    { category: "Systems", phase: "Systems", planned: ils(460_000), actual: ils(92_000) },
    { category: "Finishing", phase: "Finishing", planned: ils(300_000), actual: 0n },
    { category: "Contingency", phase: null as string | null, planned: ils(100_000), actual: ils(54_900) },
  ];

  for (const spec of budgetLineSpecs) {
    let line = await prisma.budgetLine.findFirst({ where: { budgetId: budget.id, category: spec.category } });
    if (!line) {
      line = await prisma.budgetLine.create({
        data: {
          budgetId: budget.id,
          phaseId: spec.phase ? phases[spec.phase].id : null,
          category: spec.category,
          plannedAmountMinor: spec.planned,
          currency: "ILS",
        },
      });
    }
    if (spec.actual > 0n) {
      const existingInvoice = await prisma.invoice.findFirst({ where: { budgetLineId: line.id } });
      if (!existingInvoice) {
        await prisma.invoice.create({
          data: {
            budgetLineId: line.id,
            amountMinor: spec.actual,
            currency: "ILS",
            vendorName: spec.category,
            status: "approved",
            approvedAt: new Date(),
            approvedByUserId: owner.id,
          },
        });
      }
    }
  }

  const findingSpecs = [
    {
      key: "rebar-c4",
      phase: "Structure",
      kind: "exposed_reinforcement",
      severity: 4,
      confidence: 0.91,
      description: "Exposed reinforcement — column C-4",
      costMin: ils(1_800),
      costMax: ils(3_200),
    },
    {
      key: "guardrail-l2",
      phase: "Structure",
      kind: "missing_guardrail",
      severity: 5,
      confidence: 0.88,
      description: "Missing edge guardrail — level 2, south",
      costMin: ils(400),
      costMax: ils(700),
    },
    {
      key: "damp-north",
      phase: "Envelope",
      kind: "damp_patch",
      severity: 3,
      confidence: 0.76,
      description: "Damp patch — north wall, ground floor",
      costMin: ils(900),
      costMax: ils(2_400),
    },
  ];

  for (const spec of findingSpecs) {
    const existing = await prisma.siteCapture.findFirst({ where: { objectKey: `seed/${spec.key}.jpg` } });
    if (existing) continue;

    const capture = await prisma.siteCapture.create({
      data: {
        projectId: project.id,
        phaseId: phases[spec.phase].id,
        uploadedByUserId: amirUser.id,
        objectKey: `seed/${spec.key}.jpg`,
        status: "processed",
      },
    });

    await prisma.detection.create({
      data: {
        siteCaptureId: capture.id,
        kind: spec.kind,
        severity: spec.severity,
        confidence: spec.confidence,
        boundingBox: { x: 0.3, y: 0.2, w: 0.25, h: 0.25 },
        estimatedCostMinMinor: spec.costMin,
        estimatedCostMaxMinor: spec.costMax,
        currency: "ILS",
        description: spec.description,
        status: "suggested",
      },
    });
  }

  // --- Tenders & Contractors (M8) -------------------------------------------

  const workCategoryNames = ["excavation", "structure_concrete", "roofing", "plumbing", "electrical", "finishing"];
  const workCategories: Record<string, { id: string }> = {};
  for (const name of workCategoryNames) {
    workCategories[name] = await prisma.workCategory.upsert({
      where: { name },
      update: {},
      create: { name },
    });
  }

  // Both verified contractors declare specializations + availability so
  // they're candidates for the matching engine's prefilter (build plan §1).
  await prisma.contractorCategory.upsert({
    where: {
      contractorProfileId_workCategoryId: {
        contractorProfileId: amir.id,
        workCategoryId: workCategories.electrical.id,
      },
    },
    update: {},
    create: { contractorProfileId: amir.id, workCategoryId: workCategories.electrical.id },
  });
  await prisma.contractorCategory.upsert({
    where: {
      contractorProfileId_workCategoryId: {
        contractorProfileId: amir.id,
        workCategoryId: workCategories.structure_concrete.id,
      },
    },
    update: {},
    create: { contractorProfileId: amir.id, workCategoryId: workCategories.structure_concrete.id },
  });
  await prisma.contractorCategory.upsert({
    where: {
      contractorProfileId_workCategoryId: { contractorProfileId: sharon.id, workCategoryId: workCategories.excavation.id },
    },
    update: {},
    create: { contractorProfileId: sharon.id, workCategoryId: workCategories.excavation.id },
  });
  await prisma.contractorProfile.update({ where: { id: amir.id }, data: { currentlyAvailable: true } });
  await prisma.contractorProfile.update({ where: { id: sharon.id }, data: { currentlyAvailable: true } });

  // One published (invited_bidding) tender on the Systems phase's electrical
  // scope, left un-awarded — the e2e test drives select-winner/sign itself
  // against this fixture rather than asserting on a pre-awarded state.
  let tender = await prisma.tender.findFirst({ where: { projectId: project.id, title: "Systems phase — electrical rewire" } });
  if (!tender) {
    tender = await prisma.tender.create({
      data: {
        projectId: project.id,
        workCategoryId: workCategories.electrical.id,
        title: "Systems phase — electrical rewire",
        scopeDescription: "Full electrical rough-in and finish for the Systems phase, per approved plans.",
        budgetMinMinor: ils(380_000),
        budgetMaxMinor: ils(460_000),
        currency: "ILS",
        plannedStartDate: new Date("2026-10-01"),
        plannedEndDate: new Date("2026-12-15"),
        status: "invited_bidding",
        createdByUserId: owner.id,
        publishedAt: new Date(),
      },
    });

    // Levi is invited despite `pending` verification specifically to prove
    // the "invited but unverified can't bid" rule (BidsService.submit) is
    // reachable from seed data, not just unit tests.
    const invitationSpecs = [
      { contractorProfileId: amir.id, matchScore: 0.81, status: "bid_submitted" as const },
      { contractorProfileId: sharon.id, matchScore: 0.62, status: "bid_submitted" as const },
      { contractorProfileId: levi.id, matchScore: 0.55, status: "invited" as const },
    ];
    for (const spec of invitationSpecs) {
      await prisma.tenderInvitation.create({
        data: {
          tenderId: tender.id,
          contractorProfileId: spec.contractorProfileId,
          matchScore: spec.matchScore,
          status: spec.status,
        },
      });
    }

    const amirBid = await prisma.bid.create({
      data: {
        tenderId: tender.id,
        contractorProfileId: amir.id,
        totalAmountMinor: ils(415_000),
        currency: "ILS",
        proposedStartDate: new Date("2026-10-05"),
        proposedEndDate: new Date("2026-12-10"),
        paymentTermsDescription: "30% on start, 40% at rough-in inspection, 30% on completion",
      },
    });
    await prisma.bidLineItem.createMany({
      data: [
        { bidId: amirBid.id, description: "Rough-in wiring, all floors", quantity: 1, unitAmountMinor: ils(240_000), currency: "ILS" },
        { bidId: amirBid.id, description: "Panel + fixtures + finish", quantity: 1, unitAmountMinor: ils(175_000), currency: "ILS" },
      ],
    });

    const sharonBid = await prisma.bid.create({
      data: {
        tenderId: tender.id,
        contractorProfileId: sharon.id,
        totalAmountMinor: ils(452_000),
        currency: "ILS",
        proposedStartDate: new Date("2026-10-12"),
        proposedEndDate: new Date("2026-12-20"),
        paymentTermsDescription: "50% on start, 50% on completion",
      },
    });
    await prisma.bidLineItem.createMany({
      data: [
        { bidId: sharonBid.id, description: "Full electrical scope", quantity: 1, unitAmountMinor: ils(452_000), currency: "ILS" },
      ],
    });
  }

  // A second, already-awarded-and-signed contract (Sharon Earthworks,
  // excavation/Foundations) — kept separate from the tender above so that
  // fixture stays un-awarded for the e2e test to drive itself. This one
  // exists purely to give Trust Score (M9) real, non-zero seed data: a
  // signed Contract (the review's structural eligibility barrier) and a
  // published Review.
  let foundationsTender = await prisma.tender.findFirst({
    where: { projectId: project.id, title: "Foundations — excavation & earthworks" },
  });
  if (!foundationsTender) {
    foundationsTender = await prisma.tender.create({
      data: {
        projectId: project.id,
        workCategoryId: workCategories.excavation.id,
        title: "Foundations — excavation & earthworks",
        scopeDescription: "Site excavation and earthworks ahead of foundation pour.",
        budgetMinMinor: ils(180_000),
        budgetMaxMinor: ils(220_000),
        currency: "ILS",
        plannedStartDate: new Date("2026-03-05"),
        plannedEndDate: new Date("2026-04-10"),
        status: "invited_bidding",
        createdByUserId: owner.id,
        publishedAt: new Date("2026-02-20"),
      },
    });
    await prisma.tenderInvitation.create({
      data: { tenderId: foundationsTender.id, contractorProfileId: sharon.id, matchScore: 0.74, status: "bid_submitted" },
    });
    const foundationsBid = await prisma.bid.create({
      data: {
        tenderId: foundationsTender.id,
        contractorProfileId: sharon.id,
        totalAmountMinor: ils(205_000),
        currency: "ILS",
        proposedStartDate: new Date("2026-03-05"),
        proposedEndDate: new Date("2026-04-08"),
        paymentTermsDescription: "50% on start, 50% on completion",
      },
    });
    const foundationsContract = await prisma.contract.create({
      data: {
        tenderId: foundationsTender.id,
        projectId: project.id,
        contractorProfileId: sharon.id,
        winningBidId: foundationsBid.id,
        totalAmountMinor: foundationsBid.totalAmountMinor,
        currency: "ILS",
        status: "completed",
        signedAt: new Date("2026-03-01"),
        signedByOwnerUserId: owner.id,
      },
    });
    await prisma.tender.update({ where: { id: foundationsTender.id }, data: { status: "awarded" } });
    await prisma.bid.update({ where: { id: foundationsBid.id }, data: { status: "accepted" } });

    await prisma.review.create({
      data: {
        projectId: project.id,
        contractorProfileId: sharon.id,
        reviewerUserId: owner.id,
        contractId: foundationsContract.id,
        rating: 5,
        comment: "On schedule, clean site, no surprises on the invoice.",
      },
    });
  }

  console.log("Seed complete:", {
    project: project.name,
    owner: owner.email,
    staff: staff.email,
    contractor: amirUser.email,
  });
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
