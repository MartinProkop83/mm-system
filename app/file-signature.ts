// The browser-reported File.type is just a client-supplied label and is trivially
// spoofable (rename a file, or craft the multipart request directly). Detect the
// real file type from its leading bytes instead, and use that — not the client's
// claim — to decide whether an upload is accepted and what content-type gets
// stored and served back for it.

type Signature = { type: string; extension: string; check: (bytes: Uint8Array) => boolean };

const signatures: Signature[] = [
  {
    type: "image/png",
    extension: "png",
    check: (b) => b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a,
  },
  {
    type: "image/jpeg",
    extension: "jpg",
    check: (b) => b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  },
  {
    type: "image/webp",
    extension: "webp",
    check: (b) => b.length >= 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50,
  },
  {
    type: "application/pdf",
    extension: "pdf",
    check: (b) => b.length >= 5 && b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46 && b[4] === 0x2d,
  },
];

export async function sniffFileType(file: File): Promise<{ type: string; extension: string } | null> {
  const head = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  for (const signature of signatures) {
    if (signature.check(head)) return { type: signature.type, extension: signature.extension };
  }
  return null;
}
