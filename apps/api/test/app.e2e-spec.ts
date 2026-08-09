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
  let projectId: string;

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
});
