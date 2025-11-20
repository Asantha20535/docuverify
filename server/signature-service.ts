import crypto from "crypto";
import fs from "fs/promises";
import { PDFDocument } from "pdf-lib";
import type { Document } from "@shared/schema";
import { getSignatureBlockForRole } from "./signature-blocks";
import type { SignatureBlockDefinition } from "./signature-blocks";

export interface ParsedDataUrl {
  mimeType: string;
  buffer: Buffer;
}

export interface SignaturePlacementResult {
  hash: string;
  buffer: Buffer;
  metadata: Record<string, any>;
}

export interface NormalizedSignaturePlacement {
  page: number;
  x: number;
  y: number;
  width?: number;
  height?: number;
}

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

const DEFAULT_SIGNATURE_WIDTH = 150;
const DEFAULT_SIGNATURE_HEIGHT = 56;

const DATA_URL_REGEX = /^data:(?<mime>[^;]+);base64,(?<data>.+)$/;

export const parseSignatureDataUrl = (value: string): ParsedDataUrl | null => {
  const match = value.match(DATA_URL_REGEX);
  if (!match || !match.groups?.mime || !match.groups?.data) {
    return null;
  }

  return {
    mimeType: match.groups.mime.toLowerCase(),
    buffer: Buffer.from(match.groups.data, "base64"),
  };
};

const loadDocumentBytes = async (document: Document): Promise<Buffer | null> => {
  if (document.filePath) {
    try {
      return await fs.readFile(document.filePath);
    } catch {
      // fall back to DB-stored content
    }
  }

  if ((document as any).fileContent) {
    try {
      return Buffer.from((document as any).fileContent, "base64");
    } catch {
      return null;
    }
  }

  return null;
};

const buildMetadata = (document: Document, role: string, block: SignatureBlockDefinition) => {
  const metadata = (document.fileMetadata && typeof document.fileMetadata === "object")
    ? { ...(document.fileMetadata as Record<string, any>) }
    : {};

  const placements = Array.isArray(metadata.signaturePlacements)
    ? [...metadata.signaturePlacements]
    : [];

  const filtered = placements.filter((placement) => placement.role !== role);

  filtered.push({
    role,
    page: block?.page ?? 0,
    coordinates: {
      x: block?.x,
      y: block?.y,
      width: block?.width,
      height: block?.height,
    },
    signedAt: new Date().toISOString(),
  });

  metadata.signaturePlacements = filtered;
  return metadata;
};

const createBlockFromNormalizedPlacement = (pdfDoc: PDFDocument, placement: NormalizedSignaturePlacement): SignatureBlockDefinition => {
  const pageIndex = Math.max(0, Math.floor((placement.page ?? 1) - 1));
  while (pdfDoc.getPageCount() <= pageIndex) {
    pdfDoc.addPage();
  }
  const page = pdfDoc.getPage(pageIndex);
  const pageWidth = page.getWidth();
  const pageHeight = page.getHeight();
  const width = placement.width ?? DEFAULT_SIGNATURE_WIDTH;
  const height = placement.height ?? DEFAULT_SIGNATURE_HEIGHT;
  const normalizedX = clamp(Number.isFinite(placement.x) ? placement.x : 0.5, 0, 1);
  const normalizedY = clamp(Number.isFinite(placement.y) ? placement.y : 0.5, 0, 1);
  const centerX = normalizedX * pageWidth;
  const centerYFromTop = normalizedY * pageHeight;
  const centerYFromBottom = pageHeight - centerYFromTop;
  const drawX = clamp(centerX - width / 2, 0, pageWidth - width);
  const drawY = clamp(centerYFromBottom - height / 2, 0, pageHeight - height);
  return {
    page: pageIndex,
    x: drawX,
    y: drawY,
    width,
    height,
  };
};

const resolveSignatureBlock = (
  pdfDoc: PDFDocument,
  documentType: string,
  role: string,
  placement?: NormalizedSignaturePlacement,
): SignatureBlockDefinition | null => {
  if (placement) {
    return createBlockFromNormalizedPlacement(pdfDoc, placement);
  }
  return getSignatureBlockForRole(documentType, role) ?? null;
};

export async function applySignatureToPdf(
  document: Document,
  role: string,
  signatureData: string,
  options?: { normalizedPlacement?: NormalizedSignaturePlacement },
): Promise<SignaturePlacementResult | null> {
  if (!signatureData?.startsWith("data:image")) {
    return null;
  }

  const parsedSignature = parseSignatureDataUrl(signatureData);
  if (!parsedSignature) {
    return null;
  }

  const existingPdfBytes = await loadDocumentBytes(document);
  if (!existingPdfBytes) {
    return null;
  }

  const pdfDoc = await PDFDocument.load(existingPdfBytes);
  const block = resolveSignatureBlock(pdfDoc, document.type, role, options?.normalizedPlacement);
  if (!block) {
    return null;
  }

  while (pdfDoc.getPageCount() <= block.page) {
    pdfDoc.addPage();
  }

  const page = pdfDoc.getPage(block.page);
  const mime = parsedSignature.mimeType;
  const isPng = mime.includes("png");
  const isJpg = mime.includes("jpeg") || mime.includes("jpg");

  if (!isPng && !isJpg) {
    return null;
  }

  const image = isPng
    ? await pdfDoc.embedPng(parsedSignature.buffer)
    : await pdfDoc.embedJpg(parsedSignature.buffer);

  const imageDims = image.scale(1);
  const widthScale = block.width / imageDims.width;
  const heightScale = block.height / imageDims.height;
  const scale = Math.min(widthScale, heightScale) || 1;
  const drawWidth = imageDims.width * scale;
  const drawHeight = imageDims.height * scale;
  const drawX = block.x + (block.width - drawWidth) / 2;
  const drawY = block.y + (block.height - drawHeight) / 2;

  page.drawImage(image, {
    x: drawX,
    y: drawY,
    width: drawWidth,
    height: drawHeight,
    opacity: 0.95,
  });

  const pdfBytes = await pdfDoc.save();
  const buffer = Buffer.from(pdfBytes);

  if (document.filePath) {
    await fs.writeFile(document.filePath, buffer);
  }

  const metadata = buildMetadata(document, role, block);
  const hash = crypto.createHash("sha256").update(buffer).digest("hex");

  return {
    hash,
    buffer,
    metadata,
  };
}

