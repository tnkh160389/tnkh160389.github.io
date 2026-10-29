export default async function handler(req, res) {
  // Bật CORS để cho phép Frontend từ GitHub Pages gọi vào thoải mái
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  // Phản hồi ngay lập tức cho request thăm dò OPTIONS từ trình duyệt
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  const { uid, username, amount } = req.body;
  const PI_API_KEY = process.env.PI_API_KEY; 
  
  if (!uid) {
    return res.status(400).json({ error: 'Missing target uid' });
  }

  try {
    const response = await fetch('https://api.minepi.com/v2/payments', {
      method: 'POST',
      headers: {
        'Authorization': `Key ${PI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        amount: amount || 1,
        memo: `Lovely Animals Sandbox to @${username || 'user'}`,
        metadata: { target_uid: uid },
        uid: uid
      })
    });
    
    const data = await response.json();
    if (!response.ok) {
      throw new Error(JSON.stringify(data));
    }
    
    return res.status(200).json({ success: true, paymentId: data.identifier, data });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
