export default async function handler(req, res) {
  // FIX CORS triệt để cho Pi Browser
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With");
  
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  const PI_API_KEY = process.env.PI_API_KEY;
  console.log("[Lovely Final] PI_API_KEY exists:", !!PI_API_KEY);

  if (!PI_API_KEY) {
    return res.status(500).json({ success: false, error: "Missing PI_API_KEY" });
  }

  // Cho phép GET để test backend sống không
  if (req.method === "GET") {
    return res.status(200).json({ ok: true, msg: "Lovely Animals backend is alive", hasKey: !!PI_API_KEY });
  }

  if (req.method !== "POST") {
    return res.status(405).json({ success: false, error: "Method Not Allowed" });
  }

  const body = req.body || {};
  let targetList = [];
  if (Array.isArray(body.uids) && body.uids.length > 0) {
    targetList = body.uids.map(u => String(u).trim()).filter(Boolean);
  }

  const DEFAULT_5UIDS = [
    "42e4b976-a279-43e3-afc1-3f3e75db0e16",
    "42e3690a-ca9d-4726-bc94-43abd7cecb60",
    "6d7867e6-9abb-4f76-9cb4-85e146eee486",
    "6b6080ea-081c-4e34-8b81-91fd173b7c36",
    "a46fa764-7725-4f23-bbfc-554b358e33d3"
  ];
  
  if (targetList.length === 0) targetList = DEFAULT_5UIDS;
  const amount = Number(body.amount) || 1;

  async function piFetch(path, method, payload) {
    const r = await fetch(`https://api.minepi.com${path}`, {
      method,
      headers: {
        Authorization: `Key ${PI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: payload ? JSON.stringify(payload) : undefined,
    });
    const text = await r.text();
    let data;
    try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text.slice(0,2000)}; }
    console.log(`[Pi] ${method} ${path} -> ${r.status}`);
    return { ok: r.ok, status: r.status, data };
  }

  const results = [];
  for (let i = 0; i < targetList.length; i++) {
    const uid = targetList[i];
    const piPayload = {
      payment: {
        amount,
        memo: `Lovely ${uid.slice(0,4)} ${i+1}/5`,
        metadata: { target_uid: uid, batch: "lovely-final" },
        uid,
      },
    };
    const pr = await piFetch("/v2/payments", "POST", piPayload);
    if (pr.ok) results.push({ uid, success: true, pi: pr.data });
    else results.push({ uid, success: false, error: pr.data?.error || pr.data, status: pr.status });
    if (i < targetList.length - 1) await new Promise(r => setTimeout(r, 700));
  }

  const successCount = results.filter(r=>r.success).length;
  return res.status(successCount===results.length ? 200 : 207).json({
    success: successCount===results.length,
    successCount,
    total: results.length,
    results
  });
}
