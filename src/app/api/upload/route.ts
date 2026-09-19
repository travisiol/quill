import { mkdir, writeFile, access } from "fs/promises";
import { constants } from "fs";
import path from "path";
import crypto from "crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 5 * 1024 * 1024;
const TYPES: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif" };

/**
 * Avatar upload for the Manage page. With BLOB_READ_WRITE_TOKEN the file goes
 * to Vercel Blob (a public URL that outlives the deployment). Without it the
 * file lands in public/uploads — fine on a machine with a disk, refused on a
 * read-only host. The URL is what gets written to the `avatar` record; the
 * record itself is capped at 512 bytes on chain.
 */
export async function POST(req: Request) {
  const type = req.headers.get("content-type") ?? "";
  const ext = TYPES[type];
  if (!ext) return new Response("Unsupported image type", { status: 415 });
  const buf = Buffer.from(await req.arrayBuffer());
  if (buf.length === 0 || buf.length > MAX_BYTES) return new Response("Image must be between 1 byte and 5 MB", { status: 413 });
  const name = `${crypto.randomBytes(8).toString("hex")}.${ext}`;

  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (token) {
    const res = await fetch(`https://blob.vercel-storage.com/avatars/${name}`, {
      method: "PUT",
      headers: { authorization: `Bearer ${token}`, "content-type": type, "x-api-version": "7", "x-content-type": type },
      body: buf,
    });
    if (!res.ok) return new Response(`Blob upload failed: ${res.status}`, { status: 502 });
    const json = (await res.json()) as { url: string };
    return Response.json({ url: json.url });
  }

  const dir = path.join(process.cwd(), "public", "uploads");
  try {
    await mkdir(dir, { recursive: true });
    await access(dir, constants.W_OK);
    await writeFile(path.join(dir, name), buf);
  } catch {
    return new Response("Uploads need a writable disk or BLOB_READ_WRITE_TOKEN. Use the URL tab instead.", { status: 507 });
  }
  const origin = new URL(req.url).origin;
  return Response.json({ url: `${origin}/uploads/${name}` });
}
