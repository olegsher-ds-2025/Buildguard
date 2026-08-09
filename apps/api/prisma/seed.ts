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

  await prisma.contractorProfile.upsert({
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

  const sharonEarthworks = await prisma.contractorProfile.findFirst({ where: { companyName: "Sharon Earthworks" } });
  if (!sharonEarthworks) {
    await prisma.contractorProfile.create({
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

  const levi = await prisma.contractorProfile.findFirst({ where: { companyName: "Levi Plumbing & Systems" } });
  if (!levi) {
    await prisma.contractorProfile.create({
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
