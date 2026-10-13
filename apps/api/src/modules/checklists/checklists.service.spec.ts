import { NotFoundException } from "@nestjs/common";
import { ChecklistsService } from "./checklists.service";
import type { PrismaService } from "../../prisma/prisma.service";
import type { AuditService } from "../audit/audit.service";

describe("ChecklistsService", () => {
  const source = {
    id: "tpl-1",
    stageNo: 5,
    title: "אינסטלציה",
    version: 1,
    ownerUserId: null,
    basedOnTemplateId: null,
    standards: [],
    notes: [],
    items: [
      {
        id: "i1",
        templateId: "tpl-1",
        sortOrder: 0,
        subStage: null,
        section: "לפני",
        phaseKind: "before",
        text: "בדיקת לחץ",
        standardRef: null,
        itemType: "lab_test",
        mandatory: true,
        thresholds: [],
        thresholdsReviewed: false,
      },
    ],
    holdPoints: [{ id: "h1", templateId: "tpl-1", sortOrder: 0, subStage: null, text: "אין טיח לפני בדיקה" }],
    commonDefects: [{ id: "d1", templateId: "tpl-1", subStage: null, text: "שיפוע הפוך", costMinMinor: null, costMaxMinor: null }],
  };

  function makeService(found: unknown = source, latestVersion: number | null = null) {
    const prisma = {
      checklistTemplate: {
        findFirst: jest
          .fn()
          .mockResolvedValueOnce(found)
          .mockResolvedValueOnce(latestVersion === null ? null : { version: latestVersion }),
        create: jest.fn().mockImplementation(({ data }) =>
          Promise.resolve({
            ...source,
            id: "tpl-copy",
            version: data.version,
            ownerUserId: data.ownerUserId,
            basedOnTemplateId: data.basedOnTemplateId,
          }),
        ),
      },
    } as unknown as PrismaService;
    const audit = { record: jest.fn() } as unknown as AuditService;
    return { service: new ChecklistsService(prisma, audit), prisma, audit };
  }

  it("404s for a template that is missing or private to someone else", async () => {
    const { service } = makeService(null);
    await expect(service.get("tpl-1", "user-1")).rejects.toThrow(NotFoundException);
  });

  it("clones a system template into a private v1 copy and audits it", async () => {
    const { service, prisma, audit } = makeService();
    const copy = await service.clone("tpl-1", "user-1");

    expect(copy.isSystem).toBe(false);
    expect(copy.version).toBe(1);
    expect(copy.basedOnTemplateId).toBe("tpl-1");
    const data = (prisma.checklistTemplate.create as jest.Mock).mock.calls[0][0].data;
    expect(data.items.create[0]).not.toHaveProperty("id");
    expect(data.items.create[0]).not.toHaveProperty("templateId");
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: "checklist_template_cloned", entityId: "tpl-copy" }));
  });

  it("bumps the version when the user already has a copy of that stage", async () => {
    const { service } = makeService(source, 2);
    const copy = await service.clone("tpl-1", "user-1");
    expect(copy.version).toBe(3);
  });
});
