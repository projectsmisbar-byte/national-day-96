const SCRIPT_URL =
  "https://script.google.com/macros/s/AKfycbydJWVzPiZJapy7hfw5YJ_V7vn5HVxo6XMZFF2yAxIwtUsL-47woL6_423q0sr1sjGw8w/exec";

// نفس حدّ الواجهة (25 ميجابايت)
const MAX_FILE_BYTES = 25 * 1024 * 1024;

// نفس الصيغ المقبولة في الواجهة
const ALLOWED_TYPES = [
  "image/jpeg", "image/png", "image/webp", "image/heic", "image/heif", "image/gif",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "video/mp4", "video/quicktime"
];

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}

function toBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 8192) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  }
  return btoa(binary);
}

function isValidLink(value) {
  try {
    const u = new URL(value);
    return u.protocol === "https:" || u.protocol === "http:";
  } catch (_) {
    return false;
  }
}

export async function onRequestPost({ request }) {
  try {
    const form = await request.formData();

    const fullName = String(form.get("name") || form.get("fullName") || "").trim();
    const phone = String(form.get("phone") || "").trim();
    const email = String(form.get("email") || "").trim();
    const title = String(form.get("title") || form.get("path") || form.get("track") || "").trim();
    const description = String(form.get("description") || form.get("idea") || "").trim();
    const fileLink = String(form.get("fileLink") || "").trim();

    if (!fullName || !phone || !email || !description) {
      return json({ ok: false, error: "يرجى إكمال البيانات المطلوبة." }, 400);
    }

    const payload = {
      fullName,
      phone,
      email,
      title,
      description,
      fileLink: "",
      consent: true
    };

    const file = form.get("file") || form.get("image");
    const hasFile = file && typeof file.arrayBuffer === "function" && file.size > 0;

    // الأولوية لرابط الملف (Google Drive)
    if (fileLink) {
      if (!isValidLink(fileLink)) {
        return json({ ok: false, error: "رابط الملف غير صحيح." }, 400);
      }
      payload.fileLink = fileLink;
    } else if (hasFile) {
      if (file.size > MAX_FILE_BYTES) {
        return json({ ok: false, error: "الحد الأقصى للملف 25 ميجابايت. أرسل رابط Drive بدلاً من ذلك." }, 400);
      }
      const type = file.type || "";
      if (type && !ALLOWED_TYPES.includes(type)) {
        return json({ ok: false, error: "صيغة الملف غير مدعومة. المسموح: الصور، PDF، Word، MP4، MOV." }, 400);
      }
      payload.fileName = file.name;
      payload.fileType = type || "application/octet-stream";
      payload.fileBase64 = toBase64(await file.arrayBuffer());
    } else {
      return json({ ok: false, error: "يرجى إرفاق رابط الملف أو رفع الملف." }, 400);
    }

    const response = await fetch(SCRIPT_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(payload),
      redirect: "follow"
    });

    // Apps Script قد يعيد صفحة HTML (صلاحيات أو خطأ) بدل JSON
    const raw = await response.text();
    let result;
    try {
      result = JSON.parse(raw);
    } catch (_) {
      console.log("Apps Script non-JSON response", response.status, raw.slice(0, 500));
      return json({
        ok: false,
        error: "استجابة غير متوقعة من Google Apps Script (تأكد أن النشر متاح لـ Anyone وأنك نشرت نسخة جديدة)."
      }, 502);
    }

    if (!response.ok || !result.success) {
      console.log("Apps Script error", response.status, raw.slice(0, 500));
      return json({ ok: false, error: result.message || "تعذر حفظ المشاركة." }, 502);
    }

    return json({
      ok: true,
      entryNumber: result.entryNumber || result.row || undefined,
      message: "تم استلام مشاركتك بنجاح!"
    });
  } catch (error) {
    console.log("submit error", error && error.stack ? error.stack : error);
    return json({
      ok: false,
      error: "حدث خطأ أثناء إرسال المشاركة: " + (error && error.message ? error.message : "غير معروف")
    }, 500);
  }
}

export function onRequestGet() {
  return json({ ok: false, error: "Method not allowed" }, 405);
}
