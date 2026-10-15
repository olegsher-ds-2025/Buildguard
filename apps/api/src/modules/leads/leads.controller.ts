import { Body, Controller, Headers, Post, Req, Res } from "@nestjs/common";
import type { LeadKind } from "@buildguard/shared-types";
import type { Request, Response } from "express";
import { LeadsService } from "./leads.service";

/**
 * Public and unguarded: reached from the landing page through its nginx,
 * which also rate-limits per IP. The body is typed as a plain record so the
 * global ValidationPipe leaves it alone; LeadsService validates it itself to
 * answer with `{ errors: { field: code } }` and to drop bots before validating.
 */
@Controller("leads")
export class LeadsController {
  constructor(private readonly leads: LeadsService) {}

  @Post("register")
  register(@Body() body: Record<string, unknown>, @Headers("origin") origin: string | undefined, @Req() req: Request, @Res() res: Response) {
    return this.handle("register", body, origin, req, res);
  }

  @Post("contact")
  contact(@Body() body: Record<string, unknown>, @Headers("origin") origin: string | undefined, @Req() req: Request, @Res() res: Response) {
    return this.handle("contact", body, origin, req, res);
  }

  private async handle(kind: LeadKind, body: Record<string, unknown>, origin: string | undefined, req: Request, res: Response) {
    await this.leads.submit(kind, body, origin);
    // A no-JS form post gets a page to land on instead of a JSON body.
    if (req.is("application/x-www-form-urlencoded")) res.redirect(303, "/thanks.html");
    else res.status(201).json({ ok: true });
  }
}
