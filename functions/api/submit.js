// Cloudflare Pages Function: POST /api/submit

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

// معالجة طلبات OPTIONS المبدئية (لتفادي خطأ 405 و CORS)
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

  // القراءة بمرونة تناسب الواجهة والمسميات المختلفة
  const name = (form.get("name") || "").toString().trim();
  const phone = (form.get("phone") || "").toString().trim();
  const email = (form.get("email") || "").toString().trim();
  const track = (form.get("track") || form.get("path") || "").toString().trim();
  const idea = (form.get("idea") || form.get("description") || "").toString().trim();
  const file = form.get("image") || form.get("file"); 

  // --- التحقق من البيانات ---
  if (!name) return badRequest("الاسم مطلوب.");
  if (!phone) return badRequest("رقم الجوال مطلوب.");
  if (!email || !EMAIL_RE.test(email)) return badRequest("البريد الإلكتروني غير صالح.");
  if (!idea) return badRequest("وصف الفكرة مطلوب.");

  let imageUrl = null;

  // رفع الصورة لـ R2 إذا كانت موجودة
  if (file && typeof file === "object" && "arrayBuffer" in file && file.size > 0) {
    if (file.size > MAX_FILE_BYTES) {
      return badRequest("حجم الملف أكبر من الحد المسموح (20 ميجابايت).");
    }
    if (!env.UPLOADS) {
      return json({ ok: false, error: "تخزين الملفات R2 غير مُفعّل على الخادم." }, 500);
    }

    const safeName = (file.name || "upload").replace(/[^\w.\-\u0600-\u06FF ]+/g, "_");
    const fileKey = `uploads/${Date.now()}-${safeName}`;

    await env.UPLOADS.put(fileKey, file.stream(), {
      httpMetadata: { contentType: file.type || "application/octet-stream" },
    });

    imageUrl = fileKey;
  }

  if (!env.DB) {
    return json({ ok: false, error: "قاعدة البيانات D1 غير مُفعّلة على الخادم." }, 500);
  }

  try {
    // الإدراج في جدول submissions المعتمد
    await env.DB.prepare(
      `INSERT INTO submissions (name, phone, email, track, idea, image_url)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
      .bind(name, phone, email, track, idea, imageUrl)
      .run();

    return json({ ok: true, message: "تمت إضافة المشاركة بنجاح!" });
  } catch (err) {
    return json({ ok: false, error: "تعذر حفظ المشاركة في قاعدة البيانات: " + err.message }, 500);
  }
}
