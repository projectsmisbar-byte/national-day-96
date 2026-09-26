// Cloudflare Pages Function: POST /api/submit
// Bindings required:
//   DB       -> D1 database (submissions / entries)
//   UPLOADS  -> R2 bucket

const MAX_FILE_BYTES = 20 * 1024 * 1024; // 20 MB
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}

function badRequest(message) {
  return json({ ok: false, error: message }, 400);
}

// 1. حل مشكلة 405 عبر معالجة CORS Preflight
export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}

export async function onRequestPost(context) {
  const { request, env } = context;

  let form;
  try {
    form = await request.formData();
  } catch {
    return badRequest("طلب غير صالح.");
  }

  // دعم استلام المسميات المزدوجة لتفادي أي اختلاف في الواجهة
  const name = (form.get("name") || "").toString().trim();
  const phone = (form.get("phone") || "").toString().trim();
  const email = (form.get("email") || "").toString().trim();
  const path = (form.get("path") || form.get("track") || "").toString().trim();
  const description = (form.get("description") || form.get("idea") || "").toString().trim();
  const file = form.get("file") || form.get("image"); // File | null

  // --- التحقق من البيانات الأساسية ---
  if (!name || name.length > 200) return badRequest("الاسم مطلوب.");
  if (!phone || phone.length > 30) return badRequest("رقم الجوال مطلوب.");
  if (!email || email.length > 200 || !EMAIL_RE.test(email)) {
    return badRequest("البريد الإلكتروني غير صالح.");
  }
  if (!description || description.length > 1000) {
    return badRequest("وصف الفكرة مطلوب.");
  }

  const entryUid = crypto.randomUUID();
  let fileKey = null;
  let fileName = null;
  let fileType = null;

  // رفع الملف لمخزن R2 عند توفره
  if (file && typeof file === "object" && "arrayBuffer" in file && file.size > 0) {
    if (file.size > MAX_FILE_BYTES) {
      return badRequest("حجم الملف أكبر من الحد المسموح (20 ميجابايت).");
    }
    if (!env.UPLOADS) {
      return json({ ok: false, error: "تخزين الملفات R2 غير مُفعّل على الخادم." }, 500);
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
    return json({ ok: false, error: "قاعدة البيانات D1 غير مُفعّلة على الخادم." }, 500);
  }

  // الإدراج المزدوج المتوافق مع جدول submissions وجدول entries
  try {
    await env.DB.prepare(
      `INSERT INTO submissions (name, phone, email, track, idea, image_url)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
      .bind(name, phone, email, path, description, fileKey)
      .run();

    return json({ ok: true, message: "تمت إضافة المشاركة بنجاح!", entryUid });
  } catch (err1) {
    // محاولة الإدراج في جدول entries في حال عدم وجود submissions
    try {
      await env.DB.prepare(
        `INSERT INTO entries (entry_uid, name, phone, email, path, description, file_key, file_name, file_type, submitted_at, ip_hash)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
        .bind(entryUid, name, phone, email, path, description, fileKey, fileName, fileType, submittedAt, ipHash)
        .run();

      return json({ ok: true, message: "تمت إضافة المشاركة بنجاح!", entryUid });
    } catch (err2) {
      return json({ ok: false, error: "خطأ حفظ القاعدة: " + err2.message }, 500);
    }
  }
}

export async function onRequestGet() {
  return json({ ok: false, error: "Method not allowed" }, 405);
}

async function hashIp(ip) {
  if (!ip) return null;
  const enc = new TextEncoder().encode(ip);
  const digest = await crypto.subtle.digest("SHA-256", enc);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
