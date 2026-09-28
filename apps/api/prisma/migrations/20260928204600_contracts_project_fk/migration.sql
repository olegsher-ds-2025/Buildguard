-- Contract.projectId was missing its foreign key in the initial
-- tenders_and_contracts migration — added here to match the Project
-- relation added to schema.prisma afterwards.

ALTER TABLE "contracts" ADD CONSTRAINT "contracts_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
