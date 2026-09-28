/**
 * The RAG seam (design doc §7.2, README "Known simplifications"): swapping
 * this one binding (see RagModule) for a real hybrid-retrieval + LLM
 * pipeline is the entire integration point for the future RAG service — no
 * controller, schema, or frontend-contract change required, because the
 * boundary is this interface plus the Message/citations shape the schema
 * already defines.
 */
export interface RagCitation {
  documentId: string | null;
  documentTitle: string | null;
  snippet: string;
}

export interface RagQuestionInput {
  projectId: string;
  question: string;
}

export interface RagAnswer {
  content: string;
  citations: RagCitation[];
}

export abstract class RagService {
  abstract answer(input: RagQuestionInput): Promise<RagAnswer>;
}
