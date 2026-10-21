export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ success: false, error: "Method Not Allowed" });
  }

  const PI_API_KEY = process.env.PI_API_KEY;
  if (!PI_API_KEY) {
    return res.status(500).json({ success: false, error: "Missing PI_API_KEY" });
  }

  const body = req.body || {};
  const uid = typeof body.uid === "string" ? body.uid.trim() : "";
  const username = typeof body.username === "string" ? body.username.trim() : "";
  const amount = Number(body.amount) || 1;

  if (!uid) {
    return res.status(400).json({ success: false, error: "Missing uid" });
  }

  async function piFetch(path, method = "GET", payload) {
    const r = await fetch(`https://api.minepi.com${path}`, {
      method,
      headers: {
        Authorization: `Key ${PI_API_KEY}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: payload ? JSON.stringify(payload) : undefined,
    });
    const text = await r.text();
    let data;
    try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text.slice(0,3000)}; }
    return { ok: r.ok, status: r.status, data };
  }

  async function cancelOngoingIfFound(piErrorData) {
    try {
      let paymentId = null;
      if (piErrorData && piErrorData.payment && piErrorData.payment.identifier) paymentId = piErrorData.payment.identifier;
      if (!paymentId && piErrorData && piErrorData.identifier) paymentId = piErrorData.identifier;
      if (!paymentId && piErrorData && piErrorData.ongoing_payment && piErrorData.ongoing_payment.identifier) paymentId = piErrorData.ongoing_payment.identifier;
      
      if (!paymentId) {
        const inc = await piFetch("/v2/payments/incomplete", "GET");
        const list = inc.data?.incomplete_payments || inc.data || [];
        if (Array.isArray(list) && list.length > 0) {
          paymentId = list[0].identifier;
        }
      }

      if (paymentId) {
        let result = await piFetch(`/v2/payments/${paymentId}/complete`, "POST", { txid: "a2u_retry_complete" });
        if (!result.ok) {
          result = await piFetch(`/v2/payments/${paymentId}/cancel`, "POST");
        }
        return { cancelled: result.ok, paymentId };
      }
    } catch (e) {}
    return { cancelled: false };
  }

  let attempt = 0;
  while (attempt < 3) {
    attempt++;
    const piPayload = {
      payment: {
        amount,
        memo: `Lovely Animals A2U to @${username || uid.substring(0,6)}`,
        metadata: { target_uid: uid, attempt },
        uid,
      },
    };

    const piResponse = await piFetch("/v2/payments", "POST", piPayload);

    if (piResponse.ok) {
      return res.status(200).json({
        success: true,
        pi_response: piResponse.data,
        attempts: attempt
      });
    } else {
      const errStr = JSON.stringify(piResponse.data).toLowerCase();
      if (errStr.includes("ongoing_payment_found") || errStr.includes("ongoing payment")) {
        const cancelRes = await cancelOngoingIfFound(piResponse.data);
        if (cancelRes.cancelled) continue; // retry
        else return res.status(409).json({ success: false, error: "ongoing_payment_found but cannot cancel", details: piResponse.data });
      } else {
        return res.status(piResponse.status).json({
          success: false,
          error: "Pi Platform API rejected",
          details: piResponse.data,
          attempts: attempt
        });
      }
    }
  }

  return res.status(500).json({ success: false, error: "Failed after 3 retries" });
}
