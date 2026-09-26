
const SCRIPT_URL =
  "https://script.google.com/macros/s/AKfycbyrbXmMQ-Wbrvkfges1dm_GsM-Q6gOirZRHbjMBlj2IHcjWdfT18xxhV7rgkv2rM3tz6A/exec";

const MAX_FILE_BYTES = 10 * 1024 * 1024;

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

export async function onRequestPost({ request }) {
  try {
    const form = await request.formData();

    const fullName = String(
      form.get("name") || form.get("fullName") || ""
    ).trim();
    const phone = String(form.get("phone") || "").trim();
    const email = String(form.get("email") || "").trim();
    const title = String(
      form.get("title") || form.get("path") || form.get("track") || ""
    ).trim();
    const description = String(
      form.get("description") || form.get("idea") || ""
    ).trim();

    if (!fullName || !phone || !email || !description) {
      return json({ ok: false, error: "يرجى إكمال البيانات المطلوبة." }, 400);
    }

    const payload = {
      fullName,
      phone,
      email,
      title,
      description,
      consent: true
    };

    const file = form.get("file") || form.get("image");

    if (file && typeof file.arrayBuffer === "function" && file.size > 0) {
      if (file.size > MAX_FILE_BYTES) {
        return json({ ok: false, error: "الحد الأقصى للملف 10 ميجابايت." }, 400);
      }

      if (!["image/jpeg", "image/png", "application/pdf"].includes(file.type)) {
        return json({ ok: false, error: "يسمح بملفات JPG وPNG وPDF فقط." }, 400);
      }

      payload.fileName = file.name;
      payload.fileType = file.type;
      payload.fileBase64 = toBase64(await file.arrayBuffer());
    }

    const response = await fetch(SCRIPT_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(payload),
      redirect: "follow"
    });

    const result = await response.json();

    if (!response.ok || !result.success) {
      return json({
        ok: false,
        error: result.message || "تعذر حفظ المشاركة."
      }, 502);
    }

    return json({
      ok: true,
      message: "تم استلام مشاركتك بنجاح!"
    });
  } catch (error) {
    return json({
      ok: false,
      error: "حدث خطأ أثناء إرسال المشاركة."
    }, 500);
  }
}

export function onRequestGet() {
  return json({ ok: false, error: "Method not allowed" }, 405);
}
