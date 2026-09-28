import "reflect-metadata";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../src/app.module";

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
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
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
