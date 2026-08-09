import { IsIn, IsNotEmpty, IsString } from "class-validator";
import type { DocumentKind } from "@buildguard/shared-types";

const DOCUMENT_KINDS: DocumentKind[] = ["plan", "contract", "other"];

export class ConfirmDocumentUploadDto {
  @IsString()
  @IsNotEmpty()
  title!: string;

  @IsIn(DOCUMENT_KINDS)
  kind!: DocumentKind;
}
