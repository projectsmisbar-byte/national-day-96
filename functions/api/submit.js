// Cloudflare Pages Function: POST /api/submit
// Bindings required (set in Cloudflare dashboard: Pages > Settings > Functions):
//   DB       -> D1 database (schema.sql)
//   UPLOADS  -> R2 bucket (for uploaded files/images)
//
// Optional: KV/Turnstile can be added later for spam protection.

const MAX_FILE_BYTES = 20 * 1024 * 1024; // 20 MB
const ALLOWED_PATHS = ["بصمة وطن", "وطن في صورة", "فك الشفرة"];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

function badRequest(message) {
  return json({ ok: false, error: message }, 400);
}

export async function onRequestPost(context) {
  const { request, env } = context;

  let form;
  try {
    form = await request.formData();
  } catch {
    return badRequest("طلب غير صالح.");
  }

  const name = (form.get("name") || "").toString().trim();
  const phone = (form.get("phone") || "").toString().trim();
  const email = (form.get("email") || "").toString().trim();
  const path = (form.get("path") || "").toString().trim();
  const description = (form.get("description") || "").toString().trim();
  const file = form.get("file"); // File | null

  // --- Validation ---
  if (!name || name.length > 200) return badRequest("الاسم مطلوب.");
  if (!phone || phone.length > 30) return badRequest("رقم الجوال مطلوب.");
  if (!email || email.length > 200 || !EMAIL_RE.test(email)) {
    return badRequest("البريد الإلكتروني غير صالح.");
  }
  if (!ALLOWED_PATHS.includes(path)) return badRequest("مسار غير صالح.");
  if (!description || description.length > 500) {
    return badRequest("الوصف مطلوب (بحد أقصى 500 حرف).");
  }

  const entryUid = crypto.randomUUID();
  let fileKey = null;
  let fileName = null;
  let fileType = null;

  if (file && typeof file === "object" && "arrayBuffer" in file) {
    if (file.size > MAX_FILE_BYTES) {
      return badRequest("حجم الملف أكبر من الحد المسموح (20 ميجابايت).");
    }
    if (!env.UPLOADS) {
      return json({ ok: false, error: "تخزين الملفات غير مُفعّل على الخادم." }, 500);
    }

    const safeName = (file.name || "file").replace(/[^\w.\-\u0600-\u06FF ]+/g, "_").slice(0, 150);
    fileKey = `entries/${entryUid}/${safeName}`;
    fileName = file.name || safeName;
    fileType = file.type || "application/octet-stream";

    await env.UPLOADS.put(fileKey, file.stream(), {
      httpMetadata: { contentType: fileType },
    });
  }

  const submittedAt = new Date().toISOString();
  const ipHash = await hashIp(request.headers.get("CF-Connecting-IP") || "");

  if (!env.DB) {
    return json({ ok: false, error: "قاعدة البيانات غير مُفعّلة على الخادم." }, 500);
  }

  try {
    await env.DB.prepare(
      `INSERT INTO entries (entry_uid, name, phone, email, path, description, file_key, file_name, file_type, submitted_at, ip_hash)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(entryUid, name, phone, email, path, description, fileKey, fileName, fileType, submittedAt, ipHash)
      .run();

    const countRow = await env.DB.prepare(`SELECT COUNT(*) AS c FROM entries`).first();
    const entryNumber = (countRow && countRow.c) || 1;

    return json({ ok: true, entryNumber, entryUid });
  } catch (err) {
    return json({ ok: false, error: "تعذر حفظ المشاركة، حاول مرة أخرى." }, 500);
  }
}

// Reject non-POST methods on this route.
export async function onRequestGet() {
  return json({ ok: false, error: "Method not allowed" }, 405);
}

async function hashIp(ip) {
  if (!ip) return null;
  const enc = new TextEncoder().encode(ip);
  const digest = await crypto.subtle.digest("SHA-256", enc);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
