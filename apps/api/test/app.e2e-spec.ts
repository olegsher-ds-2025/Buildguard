import "reflect-metadata";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma/prisma.service";
import { StorageService } from "../src/modules/storage/storage.service";
import { LabTestsMonitorService } from "../src/modules/lab-tests/lab-tests-monitor.service";

// Mirrors main.ts's bootstrap exactly (prefix, validation pipe, BigInt
// serialization) since this test drives a real Nest app over HTTP via
// supertest, not main.ts's own bootstrap() function.
(BigInt.prototype as unknown as { toJSON(): string }).toJSON = function () {
  return this.toString();
};

/**
 * Runs against a real Postgres database — `npm run test:e2e` migrates and
 * seeds it first (see package.json). This is the same Villa Sharon fixture
 * the build plan's manual curl/browser verification used throughout
 * development; the numbers asserted here are the same ones verified by
 * hand against the running API and encoded in projects.service.spec.ts.
 */
describe("BuildGuard API (e2e)", () => {
  let app: INestApplication;
  let server: import("http").Server;

  let ownerToken: string;
  let staffToken: string;
  let amirToken: string;
  let projectId: string;
  let tenderId: string;
  let winningBidId: string;
  let winningBidAmountMinor: string;
  let contractId: string;
  let sharonContractorProfileId: string;
  let amirContractorProfileId: string;
  let reviewId: string;
  let disputeId: string;

  beforeAll(async () => {
    // No object storage in the test run: uploads "succeed" once a presigned URL was issued for the key.
    const uploaded = new Set<string>();
    const fakeStorage = {
      getUploadUrl: async (key: string) => {
        uploaded.add(key);
        return `http://storage.test/${key}`;
      },
      getDownloadUrl: async (key: string) => `http://storage.test/${key}`,
      objectExists: async (key: string) => uploaded.has(key),
      getObjectBuffer: async (key: string) => (uploaded.has(key) ? Buffer.from(key) : null),
    };
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(StorageService)
      .useValue(fakeStorage)
      .compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix("api/v1");
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    server = app.getHttpServer();
  });

  afterAll(async () => {
    await app.close();
  });

  it("GET /health returns ok", async () => {
    const res = await request(server).get("/api/v1/health");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
  });

  it("customer and staff login return distinct-aud tokens", async () => {
    const customerRes = await request(server)
      .post("/api/v1/auth/customer/login")
      .send({ email: "owner@buildguard.dev", password: "owner-password-123" });
    expect(customerRes.status).toBe(201);
    ownerToken = customerRes.body.accessToken;

    const staffRes = await request(server)
      .post("/api/v1/auth/staff/login")
      .send({ email: "staff@buildguard.dev", password: "staff-password-123" });
    expect(staffRes.status).toBe(201);
    staffToken = staffRes.body.accessToken;

    const decode = (jwt: string) => JSON.parse(Buffer.from(jwt.split(".")[1], "base64url").toString());
    expect(decode(ownerToken)).toMatchObject({ aud: "monitor", userType: "customer" });
    expect(decode(staffToken)).toMatchObject({ aud: "admin", userType: "staff", staffRole: "trust_safety_admin" });
  });

  it("rejects wrong password and cross-realm credentials", async () => {
    const wrongPw = await request(server)
      .post("/api/v1/auth/customer/login")
      .send({ email: "owner@buildguard.dev", password: "not-the-password" });
    expect(wrongPw.status).toBe(401);

    const crossRealm = await request(server)
      .post("/api/v1/auth/staff/login")
      .send({ email: "owner@buildguard.dev", password: "owner-password-123" });
    expect(crossRealm.status).toBe(401);
  });

  it("lists the seeded project and returns a correctly budget-weighted dashboard", async () => {
    const listRes = await request(server).get("/api/v1/projects").set("Authorization", `Bearer ${ownerToken}`);
    expect(listRes.status).toBe(200);
    expect(listRes.body).toHaveLength(1);
    expect(listRes.body[0].name).toBe("Villa Sharon");
    projectId = listRes.body[0].id;

    const dashRes = await request(server)
      .get(`/api/v1/projects/${projectId}/dashboard`)
      .set("Authorization", `Bearer ${ownerToken}`);
    expect(dashRes.status).toBe(200);
    // Same figures verified by hand against the running API during M2 and
    // encoded in projects.service.spec.ts — Foundations 100%, Structure
    // 48.75% (task completion blended with an unverified milestone),
    // budget-weighted overall 36.04%, burn rate 1.45x critical.
    expect(dashRes.body.overallProgressPct).toBe(36.04);
    expect(dashRes.body.phases.find((p: { name: string }) => p.name === "Structure").progressPct).toBe(48.75);
    expect(dashRes.body.budget.burnTier).toBe("critical");
  });

  it("404s (not 403s) when a non-member requests a project's dashboard", async () => {
    const res = await request(server)
      .get(`/api/v1/projects/${projectId}/dashboard`)
      .set("Authorization", `Bearer ${staffToken}`);
    expect(res.status).toBe(404);
  });

  it("404s for a bogus project id even for a real member", async () => {
    const res = await request(server)
      .get("/api/v1/projects/00000000-0000-0000-0000-000000000000/dashboard")
      .set("Authorization", `Bearer ${ownerToken}`);
    expect(res.status).toBe(404);
  });

  it("rejects a customer token on staff-only admin routes", async () => {
    const res = await request(server).get("/api/v1/admin/contractors").set("Authorization", `Bearer ${ownerToken}`);
    expect(res.status).toBe(403);
  });

  it("rejects unauthenticated requests to protected routes", async () => {
    const res = await request(server).get("/api/v1/projects");
    expect(res.status).toBe(401);
  });

  it("staff can list contractors and see the seeded verification states", async () => {
    const res = await request(server).get("/api/v1/admin/contractors").set("Authorization", `Bearer ${staffToken}`);
    expect(res.status).toBe(200);
    const byName = Object.fromEntries(
      res.body.map((c: { companyName: string; verificationStatus: string }) => [c.companyName, c.verificationStatus]),
    );
    expect(byName["Amir Cohen Construction"]).toBe("verified");
  });

  it("lists the seeded findings, all suggested", async () => {
    const res = await request(server)
      .get(`/api/v1/projects/${projectId}/findings`)
      .set("Authorization", `Bearer ${ownerToken}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(3);
    expect(res.body.every((f: { status: string }) => f.status === "suggested")).toBe(true);
  });

  it("approving a finding creates a real Defect and is reflected in the dashboard's open-findings count", async () => {
    const findingsRes = await request(server)
      .get(`/api/v1/projects/${projectId}/findings`)
      .set("Authorization", `Bearer ${ownerToken}`);
    const target = findingsRes.body[0];

    const approveRes = await request(server)
      .post(`/api/v1/projects/${projectId}/findings/${target.id}/approve`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({});
    expect(approveRes.status).toBe(201);
    expect(approveRes.body.defectId).toEqual(expect.any(String));

    const doubleApprove = await request(server)
      .post(`/api/v1/projects/${projectId}/findings/${target.id}/approve`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({});
    expect(doubleApprove.status).toBe(400);

    const dashRes = await request(server)
      .get(`/api/v1/projects/${projectId}/dashboard`)
      .set("Authorization", `Bearer ${ownerToken}`);
    expect(dashRes.body.openFindingsCount).toBe(2);
  });

  it("logs Amir (the invited, verified contractor) in for the Tenders & Contractors flow below", async () => {
    const res = await request(server)
      .post("/api/v1/auth/customer/login")
      .send({ email: "amir@amir-cohen-construction.example", password: "contractor-password-123" });
    expect(res.status).toBe(201);
    amirToken = res.body.accessToken;
  });

  it("a contractor is 403'd on budget-bearing and project-record endpoints, even by direct API call", async () => {
    const base = `/api/v1/projects/${projectId}`;
    for (const path of ["/dashboard", "/findings", "/documents", "/chat/messages"]) {
      const res = await request(server).get(`${base}${path}`).set("Authorization", `Bearer ${amirToken}`);
      expect(res.status).toBe(403);
    }
    const asked = await request(server)
      .post(`${base}/chat/messages`)
      .set("Authorization", `Bearer ${amirToken}`)
      .send({ content: "What is the budget?" });
    expect(asked.status).toBe(403);
  });

  it("an inspector can read the dashboard and findings", async () => {
    const login = await request(server)
      .post("/api/v1/auth/customer/login")
      .send({ email: "inspector@buildguard.dev", password: "inspector-password-123" });
    expect(login.status).toBe(201);
    const token = login.body.accessToken;
    for (const path of ["/dashboard", "/findings"]) {
      const res = await request(server).get(`/api/v1/projects/${projectId}${path}`).set("Authorization", `Bearer ${token}`);
      expect(res.status).toBe(200);
    }
  });

  it("lists the 15 seeded system checklist templates with their hold points", async () => {
    const list = await request(server).get("/api/v1/checklist-templates").set("Authorization", `Bearer ${ownerToken}`);
    expect(list.status).toBe(200);
    expect(list.body).toHaveLength(15);
    expect(list.body.every((t: { isSystem: boolean }) => t.isSystem)).toBe(true);

    const plumbing = list.body.find((t: { stageNo: number }) => t.stageNo === 5);
    const detail = await request(server)
      .get(`/api/v1/checklist-templates/${plumbing.id}`)
      .set("Authorization", `Bearer ${ownerToken}`);
    expect(detail.status).toBe(200);
    expect(detail.body.holdPoints).toHaveLength(4);
    expect(detail.body.items.length).toBe(plumbing.itemCount);
  });

  it("cloning a template makes a private copy only its owner can see", async () => {
    const list = await request(server).get("/api/v1/checklist-templates").set("Authorization", `Bearer ${ownerToken}`);
    const clone = await request(server)
      .post(`/api/v1/checklist-templates/${list.body[0].id}/clone`)
      .set("Authorization", `Bearer ${ownerToken}`);
    expect(clone.status).toBe(201);
    expect(clone.body.isSystem).toBe(false);
    expect(clone.body.basedOnTemplateId).toBe(list.body[0].id);

    const ownerList = await request(server).get("/api/v1/checklist-templates").set("Authorization", `Bearer ${ownerToken}`);
    expect(ownerList.body).toHaveLength(16);

    const login = await request(server)
      .post("/api/v1/auth/customer/login")
      .send({ email: "inspector@buildguard.dev", password: "inspector-password-123" });
    const inspectorToken = login.body.accessToken;
    const otherList = await request(server).get("/api/v1/checklist-templates").set("Authorization", `Bearer ${inspectorToken}`);
    expect(otherList.body).toHaveLength(15);
    const peek = await request(server)
      .get(`/api/v1/checklist-templates/${clone.body.id}`)
      .set("Authorization", `Bearer ${inspectorToken}`);
    expect(peek.status).toBe(404);
  });

  describe("inspections and the defect workflow", () => {
    let inspectorToken: string;
    let structurePhaseId: string;
    let planeInspectionId: string;
    let defectId: string;
    let amirUserId: string;
    const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

    it("an inspector starts an inspection and a failed item opens one checklist defect", async () => {
      const login = await request(server)
        .post("/api/v1/auth/customer/login")
        .send({ email: "inspector@buildguard.dev", password: "inspector-password-123" });
      inspectorToken = login.body.accessToken;

      const dash = await request(server).get(`/api/v1/projects/${projectId}/dashboard`).set(auth(ownerToken));
      structurePhaseId = dash.body.phases.find((p: { name: string }) => p.name === "Structure").id;
      const templates = await request(server).get("/api/v1/checklist-templates").set(auth(inspectorToken));
      const plumbing = templates.body.find((t: { stageNo: number }) => t.stageNo === 5);

      const created = await request(server)
        .post(`/api/v1/projects/${projectId}/inspections`)
        .set(auth(inspectorToken))
        .send({ phaseId: structurePhaseId, templateId: plumbing.id });
      expect(created.status).toBe(201);
      expect(created.body.items.length).toBe(plumbing.itemCount);
      const inspectionId = created.body.id;
      const first = created.body.items[0];

      const failed = await request(server)
        .post(`/api/v1/projects/${projectId}/inspections/${inspectionId}/results`)
        .set(auth(inspectorToken))
        .send({ checklistItemId: first.id, outcome: "fail", severity: 4 });
      expect(failed.status).toBe(201);
      expect(failed.body.outcome).toBe("fail");
      defectId = failed.body.defectId;
      expect(defectId).toBeTruthy();

      const again = await request(server)
        .post(`/api/v1/projects/${projectId}/inspections/${inspectionId}/results`)
        .set(auth(inspectorToken))
        .send({ checklistItemId: first.id, outcome: "fail" });
      expect(again.body.defectId).toBe(defectId);

      const incomplete = await request(server)
        .post(`/api/v1/projects/${projectId}/inspections/${inspectionId}/complete`)
        .set(auth(inspectorToken));
      expect(incomplete.status).toBe(400);
    });

    it("a measurement is only enforced after its threshold is reviewed", async () => {
      const prisma = app.get(PrismaService);
      const candidates = await prisma.checklistItem.findMany({
        where: { template: { ownerUserId: null }, itemType: "measurement" },
        include: { template: true },
      });
      const target = candidates.find((i) => (i.thresholds as unknown[]).length === 1 && (i.thresholds as { op: string }[])[0].op === "≤")!;
      const limit = (target.thresholds as { value: number }[])[0].value;

      const created = await request(server)
        .post(`/api/v1/projects/${projectId}/inspections`)
        .set(auth(inspectorToken))
        .send({ phaseId: structurePhaseId, templateId: target.templateId });
      planeInspectionId = created.body.id;
      const record = () =>
        request(server)
          .post(`/api/v1/projects/${projectId}/inspections/${planeInspectionId}/results`)
          .set(auth(inspectorToken))
          .send({ checklistItemId: target.id, outcome: "ok", numericValue: limit + 10 });

      const unreviewed = await record();
      expect(unreviewed.body).toMatchObject({ outcome: "ok", outOfThreshold: false, defectId: null });

      await prisma.checklistItem.update({ where: { id: target.id }, data: { thresholdsReviewed: true } });
      const reviewed = await record();
      expect(reviewed.body).toMatchObject({ outcome: "fail", outOfThreshold: true });
      expect(reviewed.body.defectId).toBeTruthy();
    });

    it("an item that needs a before-cover photo cannot be marked ok until one is attached", async () => {
      const prisma = app.get(PrismaService);
      const flagged = await prisma.checklistItem.findFirstOrThrow({
        where: { requiresBeforeCoverPhoto: true, template: { ownerUserId: null, stageNo: 2 } },
      });
      const created = await request(server)
        .post(`/api/v1/projects/${projectId}/inspections`)
        .set(auth(inspectorToken))
        .send({ phaseId: structurePhaseId, templateId: flagged.templateId });
      const inspectionId = created.body.id;
      const mark = () =>
        request(server)
          .post(`/api/v1/projects/${projectId}/inspections/${inspectionId}/results`)
          .set(auth(inspectorToken))
          .send({ checklistItemId: flagged.id, outcome: "ok" });

      expect((await mark()).status).toBe(400);

      const inspector = await prisma.user.findUniqueOrThrow({ where: { email: "inspector@buildguard.dev" } });
      await prisma.photo.create({
        data: {
          id: "00000000-0000-4000-8000-0000000000a1",
          projectId,
          tag: "before_cover",
          inspectionId,
          checklistItemId: flagged.id,
          objectKey: "test/before-cover",
          uploadedByUserId: inspector.id,
        },
      });
      const ok = await mark();
      expect(ok.status).toBe(201);
      expect(ok.body).toMatchObject({ outcome: "ok", beforeCoverPhotoCount: 1 });
    });

    it("assign, contractor start/fix, inspector verify; contractor sees only their own defects", async () => {
      const members = await request(server).get(`/api/v1/projects/${projectId}/members`).set(auth(ownerToken));
      amirUserId = members.body.find((m: { role: string }) => m.role === "contractor").userId;

      const before = await request(server).get(`/api/v1/projects/${projectId}/defects`).set(auth(amirToken));
      expect(before.body).toHaveLength(0);

      const assigned = await request(server)
        .post(`/api/v1/projects/${projectId}/defects/${defectId}/assign`)
        .set(auth(inspectorToken))
        .send({ assigneeUserId: amirUserId });
      expect(assigned.status).toBe(201);

      const mine = await request(server).get(`/api/v1/projects/${projectId}/defects`).set(auth(amirToken));
      expect(mine.body.map((d: { id: string }) => d.id)).toEqual([defectId]);

      const act = (token: string, action: string) =>
        request(server).post(`/api/v1/projects/${projectId}/defects/${defectId}/${action}`).set(auth(token)).send({});
      expect((await act(amirToken, "start")).status).toBe(201);
      expect((await act(amirToken, "fix")).status).toBe(400);
      await app.get(PrismaService).photo.create({
        data: {
          id: "00000000-0000-4000-8000-0000000000b1",
          projectId,
          tag: "after",
          defectId,
          objectKey: "test/after",
          uploadedByUserId: amirUserId,
        },
      });
      expect((await act(amirToken, "fix")).status).toBe(201);
      expect((await act(amirToken, "verify")).status).toBe(403);
      const verified = await act(inspectorToken, "verify");
      expect(verified.status).toBe(201);
      expect(verified.body.status).toBe("closed");
    });
  });

  it("an owner edits their own cloned template; system templates stay read-only", async () => {
    const auth = { Authorization: `Bearer ${ownerToken}` };
    const list = await request(server).get("/api/v1/checklist-templates").set(auth);
    const system = list.body.find((t: { isSystem: boolean }) => t.isSystem);

    const blocked = await request(server).patch(`/api/v1/checklist-templates/${system.id}`).set(auth).send({ title: "x" });
    expect(blocked.status).toBe(403);

    const clone = await request(server).post(`/api/v1/checklist-templates/${system.id}/clone`).set(auth);
    const id = clone.body.id;
    const [first, second] = clone.body.items;

    expect((await request(server).patch(`/api/v1/checklist-templates/${id}`).set(auth).send({ title: "התבנית שלי" })).status).toBe(204);

    const added = await request(server)
      .post(`/api/v1/checklist-templates/${id}/items`)
      .set(auth)
      .send({ text: "סעיף חדש", phaseKind: "after", itemType: "measurement", thresholds: [{ op: "≤", value: 3, unit: 'מ"מ' }], afterItemId: first.id });
    expect(added.status).toBe(201);
    expect(added.body.sortOrder).toBe(first.sortOrder + 1);

    const reviewed = await request(server)
      .patch(`/api/v1/checklist-templates/${id}/items/${added.body.id}`)
      .set(auth)
      .send({ thresholdsReviewed: true });
    expect(reviewed.body.thresholdsReviewed).toBe(true);

    await request(server).post(`/api/v1/checklist-templates/${id}/items/${added.body.id}/move`).set(auth).send({ direction: "down" }).expect(204);
    const detail = await request(server).get(`/api/v1/checklist-templates/${id}`).set(auth);
    expect(detail.body.title).toBe("התבנית שלי");
    expect(detail.body.items[1].id).toBe(second.id);
    expect(detail.body.items[2].id).toBe(added.body.id);

    const hp = await request(server).post(`/api/v1/checklist-templates/${id}/hold-points`).set(auth).send({ text: "אין להמשיך ללא אישור" });
    expect(hp.status).toBe(201);
    await request(server).delete(`/api/v1/checklist-templates/${id}/hold-points/${hp.body.id}`).set(auth).expect(204);
    await request(server).delete(`/api/v1/checklist-templates/${id}/items/${added.body.id}`).set(auth).expect(204);
    await request(server).delete(`/api/v1/checklist-templates/${id}`).set(auth).expect(204);
  });

  it("lists the seeded tenders, including one still open for bidding", async () => {
    const res = await request(server)
      .get(`/api/v1/projects/${projectId}/tenders`)
      .set("Authorization", `Bearer ${ownerToken}`);
    expect(res.status).toBe(200);
    // Two seeded tenders: the electrical one (left un-awarded for this flow
    // to drive itself) and a second, already-awarded Foundations tender
    // that exists purely to give Trust Score (M9) non-zero seed data.
    expect(res.body).toHaveLength(2);
    const open = res.body.find((t: { status: string }) => t.status === "invited_bidding");
    expect(open).toBeDefined();
    tenderId = open.id;
  });

  it("a contractor is 403'd on the owner/PM-only bid comparison endpoint", async () => {
    const res = await request(server)
      .get(`/api/v1/projects/${projectId}/tenders/${tenderId}/bids`)
      .set("Authorization", `Bearer ${amirToken}`);
    expect(res.status).toBe(403);
  });

  it("owner sees both seeded bids (Amir + Sharon) on the comparison endpoint", async () => {
    const res = await request(server)
      .get(`/api/v1/projects/${projectId}/tenders/${tenderId}/bids`)
      .set("Authorization", `Bearer ${ownerToken}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    const byCompany = Object.fromEntries(res.body.map((b: { companyName: string; id: string }) => [b.companyName, b]));
    expect(byCompany["Amir Cohen Construction"]).toBeDefined();
    winningBidId = byCompany["Amir Cohen Construction"].id;
    winningBidAmountMinor = byCompany["Amir Cohen Construction"].totalAmountMinor;
  });

  it("selecting a winner creates a Contract in draft and awards the tender", async () => {
    const res = await request(server)
      .post(`/api/v1/projects/${projectId}/tenders/${tenderId}/select-winner`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ bidId: winningBidId });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe("draft");
    contractId = res.body.id;

    const tenderRes = await request(server)
      .get(`/api/v1/projects/${projectId}/tenders/${tenderId}`)
      .set("Authorization", `Bearer ${ownerToken}`);
    expect(tenderRes.body.tender.status).toBe("awarded");
  });

  it("signing the contract sets signedAt exactly once (a second sign 400s)", async () => {
    const signRes = await request(server)
      .post(`/api/v1/projects/${projectId}/contracts/${contractId}/sign`)
      .set("Authorization", `Bearer ${ownerToken}`);
    expect(signRes.status).toBe(201);
    expect(signRes.body.status).toBe("signed");
    expect(signRes.body.signedAt).toEqual(expect.any(String));

    const doubleSign = await request(server)
      .post(`/api/v1/projects/${projectId}/contracts/${contractId}/sign`)
      .set("Authorization", `Bearer ${ownerToken}`);
    expect(doubleSign.status).toBe(400);
  });

  it("generates payment milestones summing to the winning bid's total amount", async () => {
    const res = await request(server)
      .get(`/api/v1/projects/${projectId}/contracts/${contractId}/payment-milestones`)
      .set("Authorization", `Bearer ${ownerToken}`);
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThan(0);
    const sum = res.body.reduce((acc: bigint, m: { amountMinor: string }) => acc + BigInt(m.amountMinor), 0n);
    expect(sum.toString()).toBe(BigInt(winningBidAmountMinor).toString());
  });

  describe("hold points gate approval and payment", () => {
    let inspectorToken: string;
    let phaseId: string;
    let milestoneId: string;
    const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
    const holdPoints = async () =>
      (await request(server).get(`/api/v1/projects/${projectId}/hold-points?phaseId=${phaseId}`).set(auth(ownerToken))).body;
    const release = () =>
      request(server)
        .post(`/api/v1/projects/${projectId}/contracts/${contractId}/payment-milestones/${milestoneId}/release`)
        .set(auth(ownerToken));
    const approve = () => request(server).post(`/api/v1/projects/${projectId}/phases/${phaseId}/approve`).set(auth(inspectorToken));

    it("an unapproved phase, then an open hold point, each block payment release", async () => {
      inspectorToken = (
        await request(server).post("/api/v1/auth/customer/login").send({ email: "inspector@buildguard.dev", password: "inspector-password-123" })
      ).body.accessToken;
      const dash = await request(server).get(`/api/v1/projects/${projectId}/dashboard`).set(auth(ownerToken));
      phaseId = dash.body.phases.find((p: { name: string }) => p.name === "Structure").id;
      const milestones = await request(server)
        .get(`/api/v1/projects/${projectId}/contracts/${contractId}/payment-milestones`)
        .set(auth(ownerToken));
      milestoneId = milestones.body.find((m: { phaseId: string }) => m.phaseId === phaseId).id;

      const open = (await holdPoints()).filter((h: { state: string }) => h.state === "open");
      expect(open.length).toBeGreaterThan(0);

      expect((await release()).status).toBe(409);
      const blocked = await approve();
      expect(blocked.status).toBe(409);
      expect(blocked.body.openHoldPoints.length).toBe(open.length);
    });

    it("closing needs an attachment; only the owner can bypass, with a reason", async () => {
      const [first, second] = (await holdPoints()).filter((h: { state: string }) => h.state === "open");
      const signUrl = (id: string) => `/api/v1/projects/${projectId}/hold-points/${id}`;

      const noAttachment = await request(server)
        .post(`${signUrl(first.id)}/sign`)
        .set(auth(inspectorToken))
        .send({ signerName: "מהנדס כהן", signerCapacity: "engineer" });
      expect(noAttachment.status).toBe(400);

      const prisma = app.get(PrismaService);
      const inspectorUser = await prisma.user.findUniqueOrThrow({ where: { email: "inspector@buildguard.dev" } });
      const photo = await prisma.photo.create({
        data: { id: "00000000-0000-4000-8000-0000000000c1", projectId, tag: "approval", objectKey: "test/approval", uploadedByUserId: inspectorUser.id },
      });
      const signed = await request(server)
        .post(`${signUrl(first.id)}/sign`)
        .set(auth(inspectorToken))
        .send({ signerName: "מהנדס כהן", signerCapacity: "engineer", photoId: photo.id });
      expect(signed.status).toBe(201);
      expect(signed.body).toMatchObject({ state: "signed", signerName: "מהנדס כהן", photoId: photo.id });

      const reason = { reason: "הקונסטרוקטור אישר בכתב בדוא״ל, התיעוד יצורף" };
      expect((await request(server).post(`${signUrl(second.id)}/bypass`).set(auth(inspectorToken)).send(reason)).status).toBe(403);
      expect((await request(server).post(`${signUrl(second.id)}/bypass`).set(auth(ownerToken)).send({ reason: "קצר" })).status).toBe(400);
      const bypassed = await request(server).post(`${signUrl(second.id)}/bypass`).set(auth(ownerToken)).send(reason);
      expect(bypassed.status).toBe(201);
      expect(bypassed.body).toMatchObject({ state: "bypassed", reason: reason.reason });
    });

    it("once every hold point is closed the phase can be approved and paid, but a reopen blocks it again", async () => {
      const prisma = app.get(PrismaService);
      const inspectorUser = await prisma.user.findUniqueOrThrow({ where: { email: "inspector@buildguard.dev" } });
      for (const h of (await holdPoints()).filter((x: { state: string }) => x.state === "open")) {
        const res = await request(server)
          .post(`/api/v1/projects/${projectId}/hold-points/${h.id}/bypass`)
          .set(auth(ownerToken))
          .send({ reason: `סגירה לצורך בדיקת מערכת ${inspectorUser.id}` });
        expect(res.status).toBe(201);
      }

      expect((await approve()).status).toBe(201);
      const target = (await holdPoints())[0];
      await request(server).post(`/api/v1/projects/${projectId}/hold-points/${target.id}/reopen`).set(auth(inspectorToken)).send({}).expect(201);
      const reopenedRelease = await release();
      expect(reopenedRelease.status).toBe(409);
      expect(reopenedRelease.body.openHoldPoints).toHaveLength(1);

      await request(server)
        .post(`/api/v1/projects/${projectId}/hold-points/${target.id}/bypass`)
        .set(auth(ownerToken))
        .send({ reason: "נסגר שוב לאחר בדיקה חוזרת של המפקח" })
        .expect(201);
      const released = await release();
      expect(released.status).toBe(201);
      expect(released.body.status).toBe("released");
      expect((await release()).status).toBe(400);
    });

    it("the supervisor, not the contractor, drives the gate", async () => {
      const [any] = await holdPoints();
      const reopen = await request(server)
        .post(`/api/v1/projects/${projectId}/hold-points/${any.id}/reopen`)
        .set(auth(amirToken))
        .send({});
      expect(reopen.status).toBe(403);
      expect((await request(server).post(`/api/v1/projects/${projectId}/phases/${phaseId}/approve`).set(auth(amirToken))).status).toBe(403);
    });
  });

  describe("lab tests, timed tests and notifications", () => {
    const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
    const daysAgo = (d: number) => new Date(Date.now() - d * 24 * 60 * 60 * 1000).toISOString();
    let inspectorToken: string;
    let pourId: string;

    it("concrete: a failed cube blocks formwork removal until a passing retest", async () => {
      inspectorToken = (
        await request(server).post("/api/v1/auth/customer/login").send({ email: "inspector@buildguard.dev", password: "inspector-password-123" })
      ).body.accessToken;
      const base = `/api/v1/projects/${projectId}`;

      const unknownGrade = await request(server)
        .post(`${base}/concrete-pours`)
        .set(auth(inspectorToken))
        .send({ element: "עמוד", concreteGrade: "ב-50", castAt: daysAgo(8) });
      expect(unknownGrade.status).toBe(400);

      const created = await request(server)
        .post(`${base}/concrete-pours`)
        .set(auth(inspectorToken))
        .send({ element: "תקרה קומה א", concreteGrade: "ב-30", spanMeters: 4, castAt: daysAgo(8) });
      expect(created.status).toBe(201);
      expect(created.body).toMatchObject({ requiredMpa28: 33, formworkStatus: "ready" });
      pourId = created.body.id;

      const failed = await request(server).post(`${base}/concrete-pours/${pourId}/results`).set(auth(inspectorToken)).send({ ageDays: 7, strengthMpa: 15 });
      expect(failed.body.results[0]).toMatchObject({ ageDays: 7, verdict: "fail" });
      expect(failed.body.formworkStatus).toBe("blocked_failed_cubes");
      expect((await request(server).post(`${base}/concrete-pours/${pourId}/formwork-removed`).set(auth(inspectorToken))).status).toBe(409);

      const alerts = await request(server).get("/api/v1/notifications?unread=true").set(auth(ownerToken));
      expect(alerts.body.some((n: { type: string; payload: { pourId: string } }) => n.type === "cube_failed" && n.payload.pourId === pourId)).toBe(true);

      const retest = await request(server).post(`${base}/concrete-pours/${pourId}/results`).set(auth(inspectorToken)).send({ ageDays: 7, strengthMpa: 22 });
      expect(retest.body.results[0].verdict).toBe("pass");
      expect(retest.body.formworkStatus).toBe("ready");
      const removed = await request(server).post(`${base}/concrete-pours/${pourId}/formwork-removed`).set(auth(inspectorToken));
      expect(removed.status).toBe(201);
      expect(removed.body.formworkStatus).toBe("removed");
      expect((await request(server).post(`${base}/concrete-pours/${pourId}/formwork-removed`).set(auth(inspectorToken))).status).toBe(400);

      expect((await request(server).get(`${base}/concrete-pours`).set(auth(amirToken))).status).toBe(403);
    });

    it("timed tests: too early is refused, and a pressure drop fails the test", async () => {
      const base = `/api/v1/projects/${projectId}/timed-tests`;
      const started = await request(server)
        .post(base)
        .set(auth(inspectorToken))
        .send({ kind: "pressure", location: "מטבח", startReading: 10, startedAt: new Date(Date.now() - 25 * 3600_000).toISOString() });
      expect(started.status).toBe(201);
      expect(started.body).toMatchObject({ durationHours: 24, status: "due" });

      const dropped = await request(server).post(`${base}/${started.body.id}/complete`).set(auth(inspectorToken)).send({ outcome: "passed", endReading: 9 });
      expect(dropped.body.status).toBe("failed");

      const flood = await request(server).post(base).set(auth(inspectorToken)).send({ kind: "flood", location: "גג" });
      expect(flood.body).toMatchObject({ durationHours: 72, status: "running" });
      expect((await request(server).post(`${base}/${flood.body.id}/complete`).set(auth(inspectorToken)).send({ outcome: "passed" })).status).toBe(409);
    });

    it("the monitor raises due and coordination notifications once, and they can be read", async () => {
      const prisma = app.get(PrismaService);
      const inspector = await prisma.user.findUniqueOrThrow({ where: { email: "inspector@buildguard.dev" } });
      await prisma.concretePour.create({
        data: { projectId, element: "תקרה קומה ב", concreteGrade: "ב-30", requiredMpa28: 33, castAt: new Date(Date.now() + 2 * 24 * 3600_000), createdByUserId: inspector.id },
      });
      await request(server)
        .post(`/api/v1/projects/${projectId}/timed-tests`)
        .set(auth(inspectorToken))
        .send({ kind: "pressure", location: "אמבטיה", startReading: 12, startedAt: new Date(Date.now() - 30 * 3600_000).toISOString() })
        .expect(201);
      const monitor = app.get(LabTestsMonitorService);
      const first = await monitor.run(new Date());
      expect(first).toBeGreaterThan(0);
      expect(await monitor.run(new Date())).toBe(0);

      const unread = await request(server).get("/api/v1/notifications?unread=true").set(auth(inspectorToken));
      const types = unread.body.map((n: { type: string }) => n.type);
      expect(types).toEqual(expect.arrayContaining(["pour_coordination", "timed_test_due"]));

      await request(server).post(`/api/v1/notifications/${unread.body[0].id}/read`).set(auth(inspectorToken)).expect(204);
      await request(server).post("/api/v1/notifications/read-all").set(auth(inspectorToken)).expect(204);
      const after = await request(server).get("/api/v1/notifications?unread=true").set(auth(inspectorToken));
      expect(after.body).toHaveLength(0);
      expect((await request(server).post(`/api/v1/notifications/${unread.body[0].id}/read`).set(auth(ownerToken))).status).toBe(404);
    });
  });

  describe("daily logs, reports and Form 4", () => {
    const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
    const binary = (res: request.Response, cb: (err: Error | null, body: Buffer) => void) => {
      const chunks: Buffer[] = [];
      res.on("data", (c: Buffer) => chunks.push(c));
      res.on("end", () => cb(null, Buffer.concat(chunks)));
    };
    let inspectorToken: string;
    let logId: string;

    it("a daily log is created once per day, edited while a draft, then locked on approval", async () => {
      inspectorToken = (
        await request(server).post("/api/v1/auth/customer/login").send({ email: "inspector@buildguard.dev", password: "inspector-password-123" })
      ).body.accessToken;
      const base = `/api/v1/projects/${projectId}/daily-logs`;

      const created = await request(server)
        .post(base)
        .set(auth(inspectorToken))
        .send({ logDate: "2026-10-13", weatherCode: 0, temperatureC: 27, headcount: [{ name: "Amir Cohen Construction", workers: 12 }], workDone: "יציקת תקרה קומה א׳", safetyOk: true });
      expect(created.status).toBe(201);
      expect(created.body).toMatchObject({ status: "draft", logDate: "2026-10-13", weatherCode: 0 });
      logId = created.body.id;
      expect((await request(server).post(base).set(auth(inspectorToken)).send({ logDate: "2026-10-13" })).status).toBe(409);

      const edited = await request(server).put(`${base}/${logId}`).set(auth(inspectorToken)).send({ workDone: "יציקת תקרה והכנות חשמל" });
      expect(edited.body.workDone).toBe("יציקת תקרה והכנות חשמל");

      expect((await request(server).get(base).set(auth(amirToken))).status).toBe(403);

      const approved = await request(server).post(`${base}/${logId}/approve`).set(auth(inspectorToken));
      expect(approved.status).toBe(201);
      expect(approved.body.status).toBe("locked");
      expect(approved.body.contentHash).toMatch(/^[0-9a-f]{64}$/);
      expect((await request(server).put(`${base}/${logId}`).set(auth(inspectorToken)).send({ workDone: "x" })).status).toBe(409);
    });

    it("a retried request with the same Idempotency-Key replays the first response instead of duplicating", async () => {
      const send = () =>
        request(server)
          .post(`/api/v1/projects/${projectId}/daily-logs`)
          .set(auth(inspectorToken))
          .set("Idempotency-Key", "offline-queue-1")
          .send({ logDate: "2026-10-14", workDone: "נשלח מתור אופליין" });
      const first = await send();
      const retry = await send();
      expect(first.status).toBe(201);
      expect(retry.status).toBe(201);
      expect(retry.body.id).toBe(first.body.id);

      const list = await request(server).get(`/api/v1/projects/${projectId}/daily-logs`).set(auth(inspectorToken));
      expect(list.body.filter((l: { logDate: string }) => l.logDate === "2026-10-14")).toHaveLength(1);

      const failing = () =>
        request(server).post(`/api/v1/projects/${projectId}/daily-logs`).set(auth(inspectorToken)).set("Idempotency-Key", "bad-1").send({ logDate: "nope" });
      expect((await failing()).status).toBe(400);
      expect((await failing()).status).toBe(400);
    });

    it("the daily log exports as a real PDF carrying its integrity hash", async () => {
      const res = await request(server)
        .get(`/api/v1/projects/${projectId}/daily-logs/${logId}/pdf`)
        .set(auth(inspectorToken))
        .buffer(true)
        .parse(binary);
      expect(res.status).toBe(200);
      expect(res.headers["content-type"]).toContain("application/pdf");
      expect((res.body as Buffer).subarray(0, 5).toString()).toBe("%PDF-");
    });

    it("an inspection report renders as a PDF", async () => {
      const templates = await request(server).get("/api/v1/checklist-templates").set(auth(inspectorToken));
      const stage5 = templates.body.find((t: { stageNo: number; isSystem: boolean }) => t.stageNo === 5 && t.isSystem);
      const dash = await request(server).get(`/api/v1/projects/${projectId}/dashboard`).set(auth(ownerToken));
      const phaseId = dash.body.phases.find((p: { name: string }) => p.name === "Structure").id;
      const inspection = await request(server)
        .post(`/api/v1/projects/${projectId}/inspections`)
        .set(auth(inspectorToken))
        .send({ phaseId, templateId: stage5.id });
      await request(server)
        .post(`/api/v1/projects/${projectId}/inspections/${inspection.body.id}/results`)
        .set(auth(inspectorToken))
        .send({ checklistItemId: inspection.body.items[1].id, outcome: "fail", note: "נמצא שיפוע הפוך" });

      const res = await request(server)
        .get(`/api/v1/projects/${projectId}/inspections/${inspection.body.id}/report.pdf`)
        .set(auth(inspectorToken))
        .buffer(true)
        .parse(binary);
      expect(res.status).toBe(200);
      expect((res.body as Buffer).subarray(0, 5).toString()).toBe("%PDF-");
      expect((await request(server).get(`/api/v1/projects/${projectId}/inspections/${inspection.body.id}/report.pdf`).set(auth(amirToken))).status).toBe(403);
    });

    it("Form 4 readiness needs a document per requirement and feeds the building file", async () => {
      const base = `/api/v1/projects/${projectId}/form4`;
      const before = await request(server).get(base).set(auth(inspectorToken));
      expect(before.body).toMatchObject({ satisfiedCount: 0, totalCount: 9, readinessPct: 0 });
      expect(before.body.blockers.unapprovedPhases).toBeGreaterThan(0);

      expect((await request(server).put(`${base}/gas_tightness`).set(auth(inspectorToken)).send({ satisfied: true })).status).toBe(400);
      expect((await request(server).put(`${base}/nonsense`).set(auth(inspectorToken)).send({ satisfied: false })).status).toBe(404);

      const documents = await request(server).get(`/api/v1/projects/${projectId}/documents`).set(auth(ownerToken));
      const after = await request(server)
        .put(`${base}/gas_tightness`)
        .set(auth(inspectorToken))
        .send({ satisfied: true, documentId: documents.body[0].id, note: "אושר" });
      expect(after.status).toBe(200);
      expect(after.body).toMatchObject({ satisfiedCount: 1, readinessPct: 11 });
      expect((await request(server).get(base).set(auth(amirToken))).status).toBe(403);

      const zip = await request(server).get(`/api/v1/projects/${projectId}/building-file.zip`).set(auth(inspectorToken)).buffer(true).parse(binary);
      expect(zip.status).toBe(200);
      expect(zip.headers["content-type"]).toContain("application/zip");
      expect((zip.body as Buffer).subarray(0, 2).toString()).toBe("PK");
      expect((zip.body as Buffer).includes(Buffer.from("00-summary.pdf"))).toBe(true);
      expect((zip.body as Buffer).includes(Buffer.from("daily-log-2026-10-13.pdf"))).toBe(true);
    });
  });

  describe("AI quote comparison", () => {
    const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
    const base = () => `/api/v1/projects/${projectId}/quote-comparisons`;

    it("uploads quotes, reads them, flags risks, and compares them against the stage's requirements", async () => {
      const created = await request(server).post(base()).set(auth(ownerToken)).send({ title: "קבלן יסודות", stageNo: 2 });
      expect(created.status).toBe(201);
      const id = created.body.id;

      for (const filename of ["אבי.pdf", "בני.pdf", "גדעון.pdf"]) {
        const upload = await request(server).post(`${base()}/${id}/quotes/upload`).set(auth(ownerToken)).send({ filename, contentType: "application/pdf" });
        expect(upload.status).toBe(201);
        expect(upload.body.uploadUrl).toContain(upload.body.quoteId);
        const confirmed = await request(server)
          .post(`${base()}/${id}/quotes/${upload.body.quoteId}/confirm`)
          .set(auth(ownerToken))
          .send({ filename, contentType: "application/pdf" });
        expect(confirmed.status).toBe(201);
      }

      const analyzed = await request(server).post(`${base()}/${id}/analyze`).set(auth(ownerToken));
      expect(analyzed.status).toBe(201);
      expect(analyzed.body.quotes).toHaveLength(3);
      expect(analyzed.body.quotes.every((q: { status: string; extraction: unknown }) => q.status === "extracted" && q.extraction)).toBe(true);
      expect(analyzed.body.analysis.quoteIds).toHaveLength(3);
      expect(analyzed.body.analysis.requirementCoverage.length).toBeGreaterThan(0);
      for (const row of analyzed.body.analysis.scopeMatrix) expect(row.coverage).toHaveLength(3);

      const fetched = await request(server).get(`${base()}/${id}`).set(auth(ownerToken));
      expect(fetched.body.analysis.recommendedQuoteId).toBe(analyzed.body.analysis.recommendedQuoteId);
    });

    it("refuses an upload that never reached storage, an empty analysis, and anyone but owner or PM", async () => {
      const created = await request(server).post(base()).set(auth(ownerToken)).send({ title: "ריק" });
      const id = created.body.id;
      const missing = await request(server)
        .post(`${base()}/${id}/quotes/00000000-0000-4000-8000-00000000dead/confirm`)
        .set(auth(ownerToken))
        .send({ filename: "x.pdf", contentType: "application/pdf" });
      expect(missing.status).toBe(400);
      expect((await request(server).post(`${base()}/${id}/analyze`).set(auth(ownerToken))).status).toBe(400);

      const bad = await request(server).post(`${base()}/${id}/quotes/upload`).set(auth(ownerToken)).send({ filename: "x.exe", contentType: "application/x-msdownload" });
      expect(bad.status).toBe(400);

      expect((await request(server).get(base()).set(auth(amirToken))).status).toBe(403);
      const inspector = (
        await request(server).post("/api/v1/auth/customer/login").send({ email: "inspector@buildguard.dev", password: "inspector-password-123" })
      ).body.accessToken;
      expect((await request(server).get(base()).set(auth(inspector))).status).toBe(403);
    });
  });

  it("Sharon Earthworks (seeded, already-completed contract + 5-star review) has a non-zero Trust Score", async () => {
    const contractorsRes = await request(server)
      .get("/api/v1/admin/contractors")
      .set("Authorization", `Bearer ${staffToken}`);
    const sharon = contractorsRes.body.find((c: { companyName: string }) => c.companyName === "Sharon Earthworks");
    sharonContractorProfileId = sharon.id;

    const res = await request(server)
      .get(`/api/v1/contractor-profiles/${sharonContractorProfileId}/trust-score`)
      .set("Authorization", `Bearer ${ownerToken}`);
    expect(res.status).toBe(200);
    expect(res.body.sampleSize).toBe(1);
    expect(res.body.score).toBeGreaterThan(0);
    const disputesComponent = res.body.components.find((c: { key: string }) => c.key === "disputes");
    expect(disputesComponent.value).toBe(1); // no low-rating reviews yet
  });

  it("owner leaves a review on Amir's freshly-signed contract, and a duplicate review is rejected", async () => {
    const createRes = await request(server)
      .post(`/api/v1/projects/${projectId}/reviews`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ contractId, rating: 2, comment: "Slower than quoted, but acceptable work." });
    expect(createRes.status).toBe(201);
    expect(createRes.body.companyName).toBe("Amir Cohen Construction");
    reviewId = createRes.body.id;
    amirContractorProfileId = createRes.body.contractorProfileId;

    const dupRes = await request(server)
      .post(`/api/v1/projects/${projectId}/reviews`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ contractId, rating: 5 });
    expect(dupRes.status).toBe(409);
  });

  it("only the reviewed contractor's own linked user can dispute a review (owner is 403'd, Amir succeeds)", async () => {
    const ownerAttempt = await request(server)
      .post(`/api/v1/reviews/${reviewId}/disputes`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ reason: "I disagree with this review" });
    expect(ownerAttempt.status).toBe(403);

    const amirAttempt = await request(server)
      .post(`/api/v1/reviews/${reviewId}/disputes`)
      .set("Authorization", `Bearer ${amirToken}`)
      .send({ reason: "The delay was caused by a late plan revision, not us" });
    expect(amirAttempt.status).toBe(201);
    expect(amirAttempt.body.status).toBe("open");
    disputeId = amirAttempt.body.id;

    const secondDispute = await request(server)
      .post(`/api/v1/reviews/${reviewId}/disputes`)
      .set("Authorization", `Bearer ${amirToken}`)
      .send({ reason: "trying again" });
    expect(secondDispute.status).toBe(409);
  });

  it("staff sees the open dispute, upholds it, and the review is excluded from the Trust Score afterward", async () => {
    const listRes = await request(server).get("/api/v1/admin/disputes").set("Authorization", `Bearer ${staffToken}`);
    expect(listRes.status).toBe(200);
    expect(listRes.body.some((d: { id: string }) => d.id === disputeId)).toBe(true);

    const resolveRes = await request(server)
      .post(`/api/v1/admin/disputes/${disputeId}/resolve`)
      .set("Authorization", `Bearer ${staffToken}`)
      .send({ upheld: true, resolutionNote: "Confirmed: delay was a plan-revision issue, not the contractor's." });
    expect(resolveRes.status).toBe(201);
    expect(resolveRes.body.status).toBe("upheld");

    const doubleResolve = await request(server)
      .post(`/api/v1/admin/disputes/${disputeId}/resolve`)
      .set("Authorization", `Bearer ${staffToken}`)
      .send({ upheld: false });
    expect(doubleResolve.status).toBe(400);

    // The rejected review no longer counts toward Amir's disputes component.
    const scoreRes = await request(server)
      .get(`/api/v1/contractor-profiles/${amirContractorProfileId}/trust-score`)
      .set("Authorization", `Bearer ${ownerToken}`);
    const disputesComponent = scoreRes.body.components.find((c: { key: string }) => c.key === "disputes");
    expect(disputesComponent.value).toBe(0.7); // neutral: no published reviews left
  });

  it("RAG chat answers a budget question grounded in real data, with a citation, and persists history", async () => {
    const sendRes = await request(server)
      .post(`/api/v1/projects/${projectId}/chat/messages`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ content: "How much contingency is left?" });
    expect(sendRes.status).toBe(201);
    expect(sendRes.body.userMessage.role).toBe("user");
    expect(sendRes.body.assistantMessage.role).toBe("assistant");
    expect(sendRes.body.assistantMessage.citations.length).toBeGreaterThan(0);
    expect(sendRes.body.assistantMessage.content).toMatch(/contingency/i);

    const historyRes = await request(server)
      .get(`/api/v1/projects/${projectId}/chat/messages`)
      .set("Authorization", `Bearer ${ownerToken}`);
    expect(historyRes.status).toBe(200);
    expect(historyRes.body).toHaveLength(2);
  });

  it("RAG chat gives a grounded no-info refusal for an off-topic question", async () => {
    const res = await request(server)
      .post(`/api/v1/projects/${projectId}/chat/messages`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ content: "what's the weather like today" });
    expect(res.status).toBe(201);
    expect(res.body.assistantMessage.citations).toEqual([]);
    expect(res.body.assistantMessage.content).toMatch(/don't have information/i);
  });

  it("CAD viewer returns the demo drawing's layers, and a measurement is computed and persisted", async () => {
    const docsRes = await request(server)
      .get(`/api/v1/projects/${projectId}/documents`)
      .set("Authorization", `Bearer ${ownerToken}`);
    const cadDoc = docsRes.body.find((d: { kind: string }) => d.kind === "cad");
    expect(cadDoc).toBeDefined();

    const viewerRes = await request(server)
      .get(`/api/v1/projects/${projectId}/documents/${cadDoc.id}/cad/viewer`)
      .set("Authorization", `Bearer ${ownerToken}`);
    expect(viewerRes.status).toBe(200);
    expect(viewerRes.body.layers.length).toBeGreaterThan(0);
    const scale = viewerRes.body.scaleMetersPerPixel;

    const measureRes = await request(server)
      .post(`/api/v1/projects/${projectId}/documents/${cadDoc.id}/cad/measurements`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ kind: "length", points: [{ x: 0, y: 0 }, { x: 100, y: 0 }] });
    expect(measureRes.status).toBe(201);
    expect(measureRes.body.valueMeters).toBeCloseTo(100 * scale, 5);

    const listRes = await request(server)
      .get(`/api/v1/projects/${projectId}/documents/${cadDoc.id}/cad/measurements`)
      .set("Authorization", `Bearer ${ownerToken}`);
    expect(listRes.status).toBe(200);
    expect(listRes.body.some((m: { id: string }) => m.id === measureRes.body.id)).toBe(true);
  });

  it("CAD viewer 404s for a document outside the caller's project", async () => {
    const res = await request(server)
      .get(`/api/v1/projects/${projectId}/documents/00000000-0000-0000-0000-000000000000/cad/viewer`)
      .set("Authorization", `Bearer ${ownerToken}`);
    expect(res.status).toBe(404);
  });
});
