// Cloudflare Worker untuk Telegram Bot Dashboard
// Terintegrasi dengan R2 Storage

// Handler utama
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    
    // CORS headers untuk semua response
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };
    
    // Handle OPTIONS (preflight)
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }
    
    // ============ API ENDPOINTS ============
    
    // 1. Endpoint untuk mendapatkan info bot
    if (path === '/api/bot-info' && request.method === 'GET') {
      try {
        const token = env.TELEGRAM_BOT_TOKEN;
        const response = await fetch(`https://api.telegram.org/bot${token}/getMe`);
        const data = await response.json();
        
        return new Response(JSON.stringify(data.result), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      } catch (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }
    
    // 2. Endpoint untuk kirim pesan ke Telegram
    if (path === '/api/send-message' && request.method === 'POST') {
      try {
        const { chatId, text } = await request.json();
        const token = env.TELEGRAM_BOT_TOKEN;
        
        const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            text: text,
            parse_mode: 'HTML'
          })
        });
        
        const result = await response.json();
        
        return new Response(JSON.stringify(result), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      } catch (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }
    
    // 3. Endpoint untuk upload file ke R2 dan kirim ke Telegram
    if (path === '/api/upload-to-telegram' && request.method === 'POST') {
      try {
        const formData = await request.formData();
        const file = formData.get('file');
        const caption = formData.get('caption') || '';
        const token = env.TELEGRAM_BOT_TOKEN;
        
        if (!file) {
          return new Response(JSON.stringify({ error: 'No file uploaded' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }
        
        // Upload ke R2 dulu sebagai backup
        const key = `${Date.now()}-${file.name}`;
        const fileBuffer = await file.arrayBuffer();
        await env.MY_BUCKET.put(key, fileBuffer, {
          httpMetadata: { contentType: file.type }
        });
        
        // Kirim ke Telegram
        const telegramForm = new FormData();
        telegramForm.append('chat_id', '@taman_depan_bot'); // Ganti dengan chat ID target
        telegramForm.append('document', file, file.name);
        if (caption) telegramForm.append('caption', caption);
        
        const telegramResponse = await fetch(`https://api.telegram.org/bot${token}/sendDocument`, {
          method: 'POST',
          body: telegramForm
        });
        
        const telegramResult = await telegramResponse.json();
        
        return new Response(JSON.stringify({
          success: true,
          r2Key: key,
          telegram: telegramResult
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      } catch (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }
    
    // 4. Endpoint untuk ambil daftar file dari R2
    if (path === '/api/files' && request.method === 'GET') {
      try {
        const objects = await env.MY_BUCKET.list();
        const files = objects.objects.map(obj => ({
          key: obj.key,
          size: obj.size,
          uploaded: obj.uploaded
        }));
        
        return new Response(JSON.stringify(files), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      } catch (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }
    
    // 5. Webhook untuk menerima pesan dari Telegram
    if (path === '/webhook' && request.method === 'POST') {
      try {
        const update = await request.json();
        
        // Proses pesan masuk
        if (update.message) {
          const chatId = update.message.chat.id;
          const text = update.message.text;
          const from = update.message.from.first_name;
          const messageId = update.message.message_id;
          
          // Simpan ke R2 sebagai log
          const logKey = `messages/${Date.now()}-${messageId}.json`;
          await env.MY_BUCKET.put(logKey, JSON.stringify({
            chatId,
            text,
            from,
            timestamp: new Date().toISOString(),
            raw: update.message
          }));
          
          // Auto-reply untuk command /start
          if (text === '/start') {
            await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                chat_id: chatId,
                text: `🤖 Halo ${from}! Selamat datang di Telegram Bot Dashboard.\n\n📱 Website: ${url.origin}\n\nKirim pesan atau file apapun ke sini, nanti bisa dilihat di dashboard.`,
                parse_mode: 'HTML'
              })
            });
          }
          
          // Auto-reply untuk command /help
          if (text === '/help') {
            await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                chat_id: chatId,
                text: `📋 <b>Daftar Perintah:</b>\n\n/start - Mulai bot\n/help - Bantuan ini\n/info - Info bot\n\n💡 Kamu juga bisa kirim file/gambar!`,
                parse_mode: 'HTML'
              })
            });
          }
        }
        
        return new Response(JSON.stringify({ status: 'ok' }), {
          headers: { ...corsHeaders, 'Content-Type':application/json' }
        });
      } catch (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }
    
    // 6. Endpoint untuk ambil pesan terbaru dari R2
    if (path === '/api/get-updates' && request.method === 'GET') {
      try {
        const objects = await env.MY_BUCKET.list({ prefix: 'messages/' });
        const messages = [];
        
        // Ambil 20 pesan terakhir
        const lastMessages = objects.objects.slice(-20).reverse();
        
        for (const obj of lastMessages) {
          const data = await env.MY_BUCKET.get(obj.key);
          const message = await data.json();
          messages.push(message);
        }
        
        return new Response(JSON.stringify({ messages }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      } catch (error) {
        return new Response(JSON.stringify({ messages: [] }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }
    
    // ============ SERVE STATIC FILES (Frontend) ============
    
    // Serve index.html untuk root path
    if (path === '/' || path === '/index.html') {
      try {
        const html = await fetchStaticFile('index.html', env);
        return new Response(html, {
          headers: { 'Content-Type': 'text/html;charset=UTF-8' }
        });
      } catch (error) {
        return new Response(`<h1>404 - Page Not Found</h1><p>${error.message}</p>`, {
          status: 404,
          headers: { 'Content-Type': 'text/html' }
        });
      }
    }
    
    // Serve static files dari public directory
    const staticFile = await fetchStaticFile(path.substring(1), env);
    if (staticFile) {
      const contentType = getContentType(path);
      return new Response(staticFile, {
        headers: { 'Content-Type': contentType }
      });
    }
    
    // Default 404
    return new Response('404 - Not Found', { status: 404 });
  }
};

// Helper function untuk mengambil file statis
async function fetchStaticFile(path, env) {
  // Untuk development, baca dari file system
  // Untuk production, seharusnya sudah di-bundle
  
  const staticFiles = {
    'index.html': `<!DOCTYPE html>
<html lang="id">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Telegram Bot Dashboard</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            padding: 20px;
        }
        .container {
            max-width: 800px;
            margin: 0 auto;
            background: white;
            border-radius: 20px;
            box-shadow: 0 20px 60px rgba(0,0,0,0.3);
            overflow: hidden;
        }
        .header {
            background: linear-gradient(135deg, #0088cc, #0055aa);
            color: white;
            padding: 30px;
            text-align: center;
        }
        .header h1 { font-size: 28px; margin-bottom: 10px; }
        .status {
            display: inline-block;
            padding: 5px 15px;
            background: rgba(255,255,255,0.2);
            border-radius: 20px;
            font-size: 14px;
        }
        .content { padding: 30px; }
        .section {
            background: #f8f9fa;
            border-radius: 15px;
            padding: 20px;
            margin-bottom: 25px;
        }
        .section h3 {
            margin-bottom: 15px;
            color: #333;
            display: flex;
            align-items: center;
            gap: 10px;
        }
        input, textarea, button {
            width: 100%;
            padding: 12px;
            margin: 8px 0;
            border: 2px solid #e0e0e0;
            border-radius: 10px;
            font-size: 14px;
            transition: all 0.3s;
        }
        input:focus, textarea:focus {
            outline: none;
            border-color: #0088cc;
        }
        button {
            background: linear-gradient(135deg, #0088cc, #0055aa);
            color: white;
            border: none;
            cursor: pointer;
            font-weight: bold;
        }
        button:hover { transform: translateY(-2px); box-shadow: 0 5px 15px rgba(0,136,204,0.3); }
        .message-list {
            max-height: 300px;
            overflow-y: auto;
            margin-top: 15px;
        }
        .message {
            background: white;
            padding: 10px;
            margin: 8px 0;
            border-radius: 10px;
            border-left: 4px solid #0088cc;
            font-size: 14px;
        }
        .message small { color: #888; display: block; margin-top: 5px; }
        .file-preview { margin-top: 10px; max-width: 100%; border-radius: 10px; }
        .loading { text-align: center; padding: 20px; color: #888; }
        .toast {
            position: fixed;
            bottom: 20px;
            right: 20px;
            background: #333;
            color: white;
            padding: 12px 20px;
            border-radius: 10px;
            animation: slideIn 0.3s;
            z-index: 1000;
        }
        @keyframes slideIn {
            from { transform: translateX(100%); opacity: 0; }
            to { transform: translateX(0); opacity: 1; }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🤖 Telegram Bot Dashboard</h1>
            <div class="status" id="botStatus">Loading...</div>
        </div>
        
        <div class="content">
            <!-- Kirim Pesan -->
            <div class="section">
                <h3>📨 Kirim Pesan ke Telegram</h3>
                <input type="text" id="chatId" placeholder="Chat ID atau Username (contoh: @username atau 123456789)">
                <textarea id="messageText" rows="3" placeholder="Ketik pesan..."></textarea>
                <button onclick="sendMessage()">Kirim Pesan</button>
            </div>
            
            <!-- Upload File -->
            <div class="section">
                <h3>📎 Upload & Kirim File</h3>
                <input type="file" id="fileInput">
                <input type="text" id="fileCaption" placeholder="Caption (opsional)">
                <button onclick="uploadAndSend()">Upload ke Telegram</button>
                <div id="filePreview"></div>
            </div>
            
            <!-- Pesan Masuk -->
            <div class="section">
                <h3>📥 Pesan Terbaru dari Telegram</h3>
                <button onclick="loadMessages()" style="background: #28a745; margin-bottom: 10px;">🔄 Refresh</button>
                <div id="messages" class="message-list">
                    <div class="loading">Klik refresh untuk melihat pesan...</div>
                </div>
            </div>
        </div>
    </div>

    <script>
        let botInfo = null;
        
        async function loadBotInfo() {
            try {
                const response = await fetch('/api/bot-info');
                const data = await response.json();
                botInfo = data;
                document.getElementById('botStatus').innerHTML = \`✅ Online: @\${botInfo.username}\`;
                showToast(\`Bot @\${botInfo.username} terhubung!\`);
            } catch (error) {
                document.getElementById('botStatus').innerHTML = '❌ Gagal koneksi';
                console.error(error);
            }
        }
        
        async function sendMessage() {
            const chatId = document.getElementById('chatId').value;
            const text = document.getElementById('messageText').value;
            
            if (!chatId || !text) {
                showToast('Isi Chat ID dan pesan!', 'error');
                return;
            }
            
            try {
                const response = await fetch('/api/send-message', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ chatId, text })
                });
                const result = await response.json();
                
                if (result.ok) {
                    showToast('✅ Pesan terkirim!');
                    document.getElementById('messageText').value = '';
                } else {
                    showToast('❌ Gagal: ' + result.description, 'error');
                }
            } catch (error) {
                showToast('Error: ' + error.message, 'error');
            }
        }
        
        async function uploadAndSend() {
            const file = document.getElementById('fileInput').files[0];
            const caption = document.getElementById('fileCaption').value;
            
            if (!file) {
                showToast('Pilih file dulu!', 'error');
                return;
            }
            
            const formData = new FormData();
            formData.append('file', file);
            formData.append('caption', caption);
            
            // Preview
            if (file.type.startsWith('image/')) {
                const reader = new FileReader();
                reader.onload = (e) => {
                    document.getElementById('filePreview').innerHTML = \`<img src="\${e.target.result}" class="file-preview" style="max-width: 200px;">\`;
                };
                reader.readAsDataURL(file);
            }
            
            try {
                showToast('⏫ Uploading...');
                const response = await fetch('/api/upload-to-telegram', {
                    method: 'POST',
                    body: formData
                });
                const result = await response.json();
                
                if (result.success) {
                    showToast('✅ File terkirim ke Telegram!');
                    document.getElementById('fileInput').value = '';
                    document.getElementById('fileCaption').value = '';
                }
            } catch (error) {
                showToast('Upload gagal!', 'error');
            }
        }
        
        async function loadMessages() {
            try {
                const response = await fetch('/api/get-updates');
                const data = await response.json();
                
                const messagesDiv = document.getElementById('messages');
                if (data.messages && data.messages.length > 0) {
                    messagesDiv.innerHTML = data.messages.map(msg => \`
                        <div class="message">
                            <strong>\${msg.from || 'User'}:</strong> \${msg.text || '(Media)'}
                            <small>\${new Date(msg.timestamp).toLocaleString()}</small>
                        </div>
                    \`).join('');
                } else {
                    messagesDiv.innerHTML = '<div class="loading">Belum ada pesan. Kirim pesan ke bot kamu!</div>';
                }
            } catch (error) {
                console.error('Gagal load messages:', error);
            }
        }
        
        function showToast(message, type = 'success') {
            const toast = document.createElement('div');
            toast.className = 'toast';
            toast.style.background = type === 'error' ? '#dc3545' : '#28a745';
            toast.textContent = message;
            document.body.appendChild(toast);
            setTimeout(() => toast.remove(), 3000);
        }
        
        loadBotInfo();
        setInterval(loadMessages, 10000);
    </script>
</body>
</html>`
  };
  
  return staticFiles[path] || null;
}

function getContentType(path) {
  if (path.endsWith('.html')) return 'text/html';
  if (path.endsWith('.css')) return 'text/css';
  if (path.endsWith('.js')) return 'application/javascript';
  if (path.endsWith('.png')) return 'image/png';
  if (path.endsWith('.jpg')) return 'image/jpeg';
  if (path.endsWith('.svg')) return 'image/svg+xml';
  if (path.endsWith('.json')) return 'application/json';
  return 'text/plain';
                    }
