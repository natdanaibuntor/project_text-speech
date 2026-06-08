let currentSpeechMode = 'live';
let recognition = null;
let isRecording = false;
let liveTranslatedBuffer = "";
let uploadedAudioFile = null;

const whisperLangs = {
  'auto': null,
  'th-TH': 'thai',
  'en-US': 'english',
  'ja-JP': 'japanese',
  'ko-KR': 'korean',
  'zh-CN': 'chinese'
};

const whisperToGoogleLang = {
  'auto':  'en',
  'th-TH': 'th',
  'en-US': 'en',
  'ja-JP': 'ja',
  'ko-KR': 'ko',
  'zh-CN': 'zh-CN',
};

// ─── 1. ระบบ Web Speech API (ใช้สำหรับโหมดไมโครโฟนพูดสด) ──────────────────
if ('webkitSpeechRecognition' in window || 'speechRecognition' in window) {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  recognition = new SpeechRecognition();
  recognition.continuous = true;
  recognition.interimResults = true;

  recognition.onresult = function(event) {
    if (currentSpeechMode !== 'live') return;
    let finalTranscript = '';
    let interimTranscript = '';

    for (let i = event.resultIndex; i < event.results.length; ++i) {
      if (event.results[i].isFinal) {
        finalTranscript += event.results[i][0].transcript;
      } else {
        interimTranscript += event.results[i][0].transcript;
      }
    }

    const outputEl = document.getElementById("liveOutputText");
    if (!finalTranscript && !interimTranscript) return;

    // interim: แสดงจุดบอกว่ากำลังฟัง 
    if (interimTranscript && !finalTranscript) {
      outputEl.style.color = "var(--text-placeholder)";
      outputEl.textContent = "🎤 กำลังฟัง...";
      return;
    }

    // final: ส่งแปลทันที
    if (finalTranscript) {
      translateLiveText(finalTranscript.trim(), outputEl);
    }
  };

  recognition.onerror = function(event) {
    if (currentSpeechMode === 'live') {
      let errMsg = "เกิดข้อผิดพลาดในการรับเสียง";
      if (event.error === 'not-allowed') {
        errMsg = "เบราว์เซอร์ถูกปฏิเสธสิทธิ์เข้าถึงไมค์ กรุณกดอนุญาตให้ใช้งานไมโครโฟนครับ";
      } else if (event.error === 'no-speech') {
        errMsg = "ระบบตรวจไม่พบเสียงพูด กรุณาลองใหม่อีกครั้ง";
      } else if (event.error === 'network') {
        errMsg = "เกิดข้อผิดพลาดในการเชื่อมต่อเครือข่ายสำหรับการประมวลผลเสียง";
      }
      showSpeechError(errMsg);
      stopRecordingStyle();
    }
  };

  recognition.onend = function() {
    if (isRecording && currentSpeechMode === 'live') {
      stopRecordingStyle();
    }
  };
} else {
  // ไม่รองรับ Web Speech API
  document.addEventListener("DOMContentLoaded", () => {
    const recordBtn = document.getElementById("recordBtn");
    const recordStatus = document.getElementById("recordStatus");
    if (recordBtn) {
      recordBtn.disabled = true;
      recordBtn.style.opacity = "0.5";
      recordBtn.style.cursor = "not-allowed";
    }
    if (recordStatus) {
      recordStatus.innerHTML = "⚠️ เบราว์เซอร์ของคุณไม่รองรับการแปลเสียงสดเรียลไทม์ (แนะนำให้ใช้ Google Chrome หรือ Safari)";
      recordStatus.style.color = "var(--error)";
    }
  });
}

// ─── Live translate helper ────────────────────────────────────────────────────
async function translateLiveText(text, outputEl) {
  const flagMap = { th:"🇹🇭", en:"🇺🇸", ja:"🇯🇵", ko:"🇰🇷", "zh-CN":"🇨🇳", fr:"🇫🇷", de:"🇩🇪", es:"🇪🇸", ar:"🇸🇦" };

  try {
    // อ่านภาษาเป้าหมายที่ user เลือกไว้
    const targetLangEl = document.getElementById("targetSpeechLang");
    const targetLang = targetLangEl ? targetLangEl.value : "th";

    // detect ภาษาต้นทาง + แปลในครั้งเดียว
    const transUrl = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${targetLang}&dt=t&q=${encodeURIComponent(text)}`;
    const res = await fetch(transUrl);
    const data = await res.json();
    const detectedLang = data[2]; // "th", "en", etc.

    let translated = data[0]?.filter(s => Array.isArray(s) && s[0]).map(s => s[0]).join("") || text;

    // ถ้าภาษาต้นทาง = ภาษาเป้าหมาย → วนผ่าน en เป็นตัวกลาง
    const normalize = (s) => s?.replace(/\s+/g, " ").trim().toLowerCase();
    const isSame = detectedLang === targetLang || normalize(translated) === normalize(text);
    if (isSame) {
      const pivot = await fetch(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=${detectedLang}&tl=en&dt=t&q=${encodeURIComponent(text)}`);
      const pivotData = await pivot.json();
      const pivotText = pivotData[0]?.filter(s => Array.isArray(s) && s[0]).map(s => s[0]).join("") || text;
      const finalRes = await fetch(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=${targetLang}&dt=t&q=${encodeURIComponent(pivotText)}`);
      const finalData = await finalRes.json();
      translated = finalData[0]?.filter(s => Array.isArray(s) && s[0]).map(s => s[0]).join("") || pivotText;
    }

    outputEl.style.color = "var(--text)";
    outputEl.textContent = translated;
  } catch {
    outputEl.style.color = "var(--text)";
    outputEl.textContent = text;
  }
}

function copyLiveResult() {
  const text = document.getElementById("liveOutputText")?.textContent;
  if (!text || text === "ข้อความที่ได้จากเสียงจะแสดงที่นี่..." || text.startsWith("⚠️") || text.startsWith("🎤")) return;
  navigator.clipboard.writeText(text).then(() => {
    const btn = document.querySelector("#liveResultBox .copy-btn");
    if (btn) { btn.textContent = "✅"; setTimeout(() => (btn.textContent = "📋"), 1500); }
  });
}

// ─── 2. ระบบจัดการแท็บหน้าจอ ───────────────────────────────────────────────
function switchSpeechMode(mode) {
  currentSpeechMode = mode;
  document.getElementById("tabLive").classList.toggle("active", mode === 'live');
  document.getElementById("tabAudioFile").classList.toggle("active", mode === 'file');

  document.getElementById("livePanel").style.display = mode === 'live' ? 'block' : 'none';
  document.getElementById("audioFilePanel").style.display = mode === 'file' ? 'block' : 'none';

  if (isRecording) { stopRecordingStyle(); }
  clearOutputArea();
}

// ─── 3. ฟังก์ชันสำหรับแท็บ "พูดสดเรียลไทม์" ─────────────────────────────────
function toggleBtnRecord() {
  if (!recognition) {
    showSpeechError("เบราว์เซอร์ของคุณไม่รองรับระบบแปลเสียงพูดสดเรียลไทม์");
    return;
  }
  const btn = document.getElementById("recordBtn");
  const text = document.getElementById("recordText");
  const icon = document.getElementById("recordIcon");
  const status = document.getElementById("recordStatus");
  const outputEl = document.getElementById("liveOutputText");

  if (!isRecording) {
    isRecording = true;
    
    // ไม่ fix ภาษา เพื่อให้รับทั้งไทยและอังกฤษได้
    const selectedLang = document.getElementById("speechLang").value;
    recognition.lang = selectedLang === "auto" ? "" : selectedLang;

    try {
      liveTranslatedBuffer = "";
      recognition.start();
      btn.style.background = "var(--error)";
      text.textContent = "กำลังบันทึกเสียง... (กดเพื่อหยุด)";
      icon.textContent = "⏹️";
      status.textContent = "📢 ระบบกำลังฟังเสียงสดของคุณ พูดใส่ไมโครโฟนได้เลย...";
      outputEl.textContent = "กำลังรอฟังเสียงพูดสด...";
      outputEl.style.color = "var(--text-placeholder)";
      document.getElementById("liveResultBox").classList.add("loading");
    } catch(e) { isRecording = false; }
  } else {
    stopRecordingStyle();
  }
}

function stopRecordingStyle() {
  isRecording = false;
  if (recognition) { try { recognition.stop(); } catch(e) {} }
  const btn = document.getElementById("recordBtn");
  if (btn) btn.style.background = "var(--accent)";
  if (document.getElementById("recordText")) document.getElementById("recordText").textContent = "เริ่มบันทึกเสียง";
  if (document.getElementById("recordIcon")) document.getElementById("recordIcon").textContent = "🔴";
  if (document.getElementById("recordStatus")) document.getElementById("recordStatus").textContent = "กดปุ่มด้านบนแล้วเริ่มพูดได้ทันที ระบบจะพิมพ์ตามคำพูดของคุณ";
  document.getElementById("liveResultBox").classList.remove("loading");
}

// ─── 4. ระบบถอดความเสียงและแปลเป็นภาษาไทยจากไฟล์คลิปวิดีโอ ───────────────────────
function handleAudioUpload(event) {
  const file = event.target.files[0];
  if (file) routeAudioFile(file);
}

function routeAudioFile(file) {
  // รองรับทุกไฟล์เสียง/วิดีโอ — ไม่จำกัดนามสกุล
  uploadedAudioFile = file;
  document.getElementById("audioFileName").textContent = file.name;
  document.getElementById("audioFileInfo").style.display = "flex";
  document.getElementById("processAudioBtn").disabled = false;
  clearOutputArea();
}

function clearAudioFile() {
  uploadedAudioFile = null;
  document.getElementById("audioFileInput").value = "";
  document.getElementById("audioFileInfo").style.display = "none";
  document.getElementById("processAudioBtn").disabled = true;
  clearOutputArea();
}

// ─── API: ใช้ Claude (Anthropic) ถอดความเสียงแทน ASR Server ──────────────────
const ANTHROPIC_MODEL = "claude-sonnet-4-20250514";


// ─── แปลงไฟล์เป็น base64 ──────────────────────────────────────────────────────
async function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(",")[1]);
    reader.onerror = () => reject(new Error("อ่านไฟล์ไม่ได้"));
    reader.readAsDataURL(file);
  });
}

// ─── หา media_type จากไฟล์ ────────────────────────────────────────────────────
function getMediaType(file) {
  if (file.type && file.type !== "application/octet-stream") return file.type;
  const ext = file.name.split(".").pop().toLowerCase();
  const map = {
    mp3: "audio/mpeg", wav: "audio/wav", m4a: "audio/mp4",
    ogg: "audio/ogg", flac: "audio/flac", webm: "audio/webm",
    mp4: "video/mp4", mov: "video/quicktime", avi: "video/x-msvideo",
    aac: "audio/aac", wma: "audio/x-ms-wma", opus: "audio/opus",
    aiff: "audio/aiff", aif: "audio/aiff",
  };
  return map[ext] || "audio/mpeg";
}

// ─── ลอง ping ASR server ว่าออนไลน์ไหม (timeout 3 วินาที) ──────────────────────
async function checkAsrServer() {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 3000);
    const res = await fetch(`${ASR_SERVER_URL}/health`, { method: "GET", signal: ctrl.signal });
    clearTimeout(timer);
    return res.ok;
  } catch {
    return false;
  }
}

// ─── ถอดความผ่าน ASR Server (Whisper) พร้อมแสดง % อัปโหลด ──────────────────
async function transcribeViaAsrServer(wavFile, selectedLangCode, targetLang, onProgress) {
  return new Promise((resolve, reject) => {
    const formData = new FormData();
    formData.append("file", wavFile);
    formData.append("source_lang", selectedLangCode === "auto" ? "auto" : (whisperToGoogleLang[selectedLangCode] || "auto"));
    formData.append("mode", "original");
    formData.append("target_lang", targetLang);

    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${ASR_SERVER_URL}/transcribe`);

    // ─── progress อัปโหลด ─────────────────────────────────────────────────
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) {
        const pct = Math.round((e.loaded / e.total) * 100);
        onProgress(`⬆️ กำลังส่งไฟล์ไปยัง ASR Server... ${pct}%`);
      }
    };

    xhr.upload.onload = () => {
      if (onProgress) onProgress("⏳ ASR Server กำลังถอดความ กรุณารอสักครู่...");
    };

    xhr.onload = () => {
      const rawText = xhr.responseText;
      if (xhr.status < 200 || xhr.status >= 300) {
        let detail = rawText;
        try {
          const j = JSON.parse(rawText);
          detail = j.error || j.detail || j.message || j.msg || JSON.stringify(j);
          if (typeof detail === "object") detail = JSON.stringify(detail);
        } catch {}
        return reject(new Error(`ASR Server HTTP ${xhr.status}: ${detail}`));
      }
      let data;
      try { data = JSON.parse(rawText); } catch { return reject(new Error("ASR Server ตอบไม่ใช่ JSON: " + rawText.slice(0, 200))); }
      resolve((data.text || data.transcript || data.result || "").trim());
    };

    xhr.onerror = () => reject(new Error("เชื่อมต่อ ASR Server ล้มเหลว"));
    xhr.send(formData);
  });
}

// ─── ถอดความผ่าน Whisper ใน Browser (xenova/transformers) ─────────────────────
let whisperPipeline = null;
let whisperLoading = false;

async function transcribeViaWhisper(file, selectedLangCode, onProgress) {
  // โหลด pipeline ครั้งแรก
  if (!whisperPipeline) {
    if (whisperLoading) {
      // รอจนกว่าจะโหลดเสร็จ
      await new Promise(resolve => {
        const check = setInterval(() => { if (!whisperLoading) { clearInterval(check); resolve(); } }, 300);
      });
    } else {
      whisperLoading = true;
      onProgress("🤖 กำลังโหลดโมเดล Whisper (ครั้งแรกอาจใช้เวลา 1–2 นาที)...");
      const pipeline = window.aiPipeline;
      if (!pipeline) throw new Error("โหลด @xenova/transformers ไม่สำเร็จ — กรุณารีเฟรชหน้า");
      whisperPipeline = await pipeline("automatic-speech-recognition", "Xenova/whisper-small", {
        progress_callback: (p) => {
          if (p.status === "downloading") {
            const pct = p.total ? Math.round((p.loaded / p.total) * 100) : "?";
            onProgress(`⬇️ กำลังดาวน์โหลดโมเดล Whisper... ${pct}%`);
          }
        }
      });
      whisperLoading = false;
    }
  }

  onProgress("⏳ กำลังเตรียมไฟล์เสียง...");

  // แปลงไฟล์เป็น AudioBuffer → Float32Array (16kHz mono)
  const arrayBuffer = await file.arrayBuffer();
  const audioCtx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
  let decoded;
  try {
    decoded = await audioCtx.decodeAudioData(arrayBuffer);
  } catch {
    audioCtx.close();
    throw new Error("ไม่สามารถอ่านไฟล์เสียงนี้ได้ — ลองใช้ไฟล์ .mp3, .mp4, .m4a, .wav หรือ .webm");
  }
  audioCtx.close();

  const durationMin = (decoded.duration / 60).toFixed(1);
  onProgress(`⏳ กำลังถอดความด้วย Whisper... (ความยาว ${durationMin} นาที)`);

  // ดึง mono channel แรก
  const channelData = decoded.getChannelData(0);

  // resample เป็น 16kHz ถ้ายังไม่ใช่
  let pcm = channelData;
  if (decoded.sampleRate !== 16000) {
    const offCtx = new OfflineAudioContext(1, Math.ceil(decoded.duration * 16000), 16000);
    const src = offCtx.createBufferSource();
    src.buffer = decoded;
    src.connect(offCtx.destination);
    src.start(0);
    const rendered = await offCtx.startRendering();
    pcm = rendered.getChannelData(0);
  }

  const langOpt = selectedLangCode === "auto" ? {} : { language: whisperLangs[selectedLangCode] || null };

  // ─── แบ่ง chunk สำหรับคลิปยาว พร้อมแสดง % ───────────────────────────────
  const CHUNK_SEC = 60;        // รองรับยาวขึ้น (เดิม 30 วิ)
  const STRIDE_SEC = 3;        // overlap น้อยลง → เร็วขึ้น (เดิม 5 วิ)
  const SR = 16000;
  const chunkSize = CHUNK_SEC * SR;
  const strideSize = STRIDE_SEC * SR;
  const totalChunks = Math.ceil(pcm.length / (chunkSize - strideSize));

  // ถ้าไฟล์สั้น — ส่งทีเดียวเลย
  if (pcm.length <= chunkSize) {
    onProgress("⏳ กำลังถอดความด้วย Whisper (0%)...");
    const result = await whisperPipeline(pcm, {
      ...langOpt,
      chunk_length_s: CHUNK_SEC,
      stride_length_s: STRIDE_SEC,
      return_timestamps: false,
    });
    onProgress("⏳ กำลังถอดความด้วย Whisper (100%)...");
    return (result.text || "").trim();
  }

  // ไฟล์ยาว — แบ่งเป็น chunk แล้วต่อกัน
  let fullText = "";
  let offset = 0;
  let chunkIdx = 0;
  while (offset < pcm.length) {
    const slice = pcm.slice(offset, offset + chunkSize);
    const pct = Math.round((chunkIdx / totalChunks) * 100);
    const elapsedSec = Math.round(offset / SR);
    const mm = String(Math.floor(elapsedSec / 60)).padStart(2, "0");
    const ss = String(elapsedSec % 60).padStart(2, "0");
    onProgress(`⏳ กำลังถอดความ... ${pct}% (${mm}:${ss} / ${durationMin} นาที)`);

    const result = await whisperPipeline(slice, {
      ...langOpt,
      chunk_length_s: CHUNK_SEC,
      stride_length_s: STRIDE_SEC,
      return_timestamps: false,
    });
    fullText += (result.text || "") + " ";
    offset += chunkSize - strideSize;
    chunkIdx++;
  }
  onProgress("⏳ กำลังถอดความ... 100%");
  return fullText.trim();
}

// ─── Progress Bar helper ──────────────────────────────────────────────────────
function setProgress(pct, label) {
  const wrap = document.getElementById("uploadProgressWrap");
  const bar  = document.getElementById("uploadProgressBar");
  const pctEl = document.getElementById("uploadProgressPct");
  const lblEl = document.getElementById("uploadProgressLabel");
  if (!wrap) return;
  if (pct === null) {
    wrap.style.display = "none";
    return;
  }
  wrap.style.display = "block";
  bar.style.width = pct + "%";
  pctEl.textContent = pct + "%";
  if (label) lblEl.textContent = label;
}

// ─── ฟังก์ชันหลัก: ลอง ASR Server ก่อน → fallback Claude ────────────────────
async function processAudioFile() {
  if (!uploadedAudioFile) return;

  const btn = document.getElementById("processAudioBtn");
  const outputEl = document.getElementById("speechOutputText");
  const resultBox = document.getElementById("speechResultBox");
  const flagMap = { th:"🇹🇭", en:"🇺🇸", ja:"🇯🇵", ko:"🇰🇷", "zh-CN":"🇨🇳", fr:"🇫🇷", de:"🇩🇪", es:"🇪🇸", ar:"🇸🇦" };

  const toErrStr = (e) => {
    if (!e) return "unknown error";
    if (typeof e === "string") return e;
    if (e instanceof Error) return e.message;
    try { return JSON.stringify(e); } catch { return String(e); }
  };

  btn.disabled = true;
  btn.querySelector(".btn-text").textContent = "กำลังตรวจสอบ Server...";
  resultBox.classList.add("loading");
  outputEl.style.color = "var(--text-placeholder)";
  outputEl.textContent = "⏳ กำลังตรวจสอบ ASR Server...";
  setProgress(0, "กำลังตรวจสอบ Server...");

  try {
    const selectedLangCode = document.getElementById("speechLang")?.value || "auto";
    const targetLang = document.getElementById("targetSpeechLang")?.value || "th";
    const targetLangName = {
      th: "ภาษาไทย", en: "English", ja: "ภาษาญี่ปุ่น", ko: "ภาษาเกาหลี",
      "zh-CN": "ภาษาจีนกลาง", fr: "ภาษาฝรั่งเศส", de: "ภาษาเยอรมัน",
      es: "ภาษาสเปน", ar: "ภาษาอาหรับ"
    }[targetLang] || targetLang;
    const flag = flagMap[targetLang] || "🌐";

    // ─── ลอง ASR Server ก่อน ─────────────────────────────────────────────────
    const asrOnline = await checkAsrServer();

    if (asrOnline) {
      // ─── เส้นทาง ASR Server — ส่งไฟล์ต้นฉบับตรงๆ ─────────────────────────
      const fileMB = (uploadedAudioFile.size / 1024 / 1024).toFixed(1);
      outputEl.textContent = `⏳ กำลังเตรียมส่งไฟล์ (${fileMB} MB)...`;
      btn.querySelector(".btn-text").textContent = "กำลังอัปโหลด...";
      setProgress(5, "กำลังเตรียมไฟล์...");

      const transcribedText = await transcribeViaAsrServer(
        uploadedAudioFile, selectedLangCode, targetLang,
        (msg) => {
          outputEl.textContent = msg;
          // parse % จาก msg เช่น "45%"
          const m = msg.match(/(\d+)%/);
          if (m) {
            const raw = parseInt(m[1]);
            // อัปโหลด = 10–60%, ถอดความ server = 60–90%
            const mapped = msg.includes("ส่งไฟล์") ? 10 + Math.round(raw * 0.5) : 60 + Math.round(raw * 0.3);
            setProgress(Math.min(mapped, 90), msg.replace(/⬆️|⏳/g, "").trim());
          }
        }
      );

      if (!transcribedText) {
        outputEl.style.color = "var(--text-placeholder)";
        outputEl.textContent = "⚠️ ไม่พบเนื้อหาเสียงพูดในไฟล์นี้";
        return;
      }

      outputEl.style.color = "var(--text-placeholder)";
      outputEl.textContent = `กำลังแปลภาษา...`;
      setProgress(92, "กำลังแปลภาษา...");
      try {
        const srcGoogleLang = whisperToGoogleLang[selectedLangCode] || "auto";
        const normalize = (s) => s.replace(/\s+/g, " ").trim().toLowerCase();
        const timeout30s = (p) => Promise.race([p, new Promise(r => setTimeout(() => r(null), 30000))]);
        let finalText;
        if (srcGoogleLang !== "auto" && srcGoogleLang === targetLang) {
          const pivot = await timeout30s(translateTo(transcribedText, srcGoogleLang, "en"));
          finalText = pivot ? await timeout30s(translateTo(pivot, "en", targetLang)) : transcribedText;
        } else {
          let translated = await timeout30s(translateTo(transcribedText, "auto", targetLang));
          if (!translated || normalize(translated) === normalize(transcribedText))
            translated = await timeout30s(translateTo(transcribedText, srcGoogleLang !== "auto" ? srcGoogleLang : "en", targetLang));
          finalText = translated || transcribedText;
        }
        const deduped = deduplicateText(finalText);
        outputEl.textContent = (deduped && normalize(deduped) !== normalize(transcribedText)) ? deduped : transcribedText;
      } catch {
        outputEl.textContent = transcribedText;
      }

    } else {
      // ─── Fallback: Whisper ใน Browser ────────────────────────────────────
      outputEl.textContent = "⚠️ ASR Server ไม่ตอบสนอง กำลังใช้ Whisper ใน Browser แทน...";
      btn.querySelector(".btn-text").textContent = "กำลังโหลด Whisper...";
      setProgress(5, "กำลังโหลด Whisper...");

      const transcribedText = await transcribeViaWhisper(
        uploadedAudioFile,
        selectedLangCode,
        (msg) => {
          outputEl.textContent = msg;
          const m = msg.match(/(\d+)%/);
          if (m) {
            const raw = parseInt(m[1]);
            // Whisper = 10–90%
            setProgress(10 + Math.round(raw * 0.8), msg.replace(/[⏳⬇️🤖]/g, "").trim());
          } else if (msg.includes("โหลดโมเดล")) {
            setProgress(8, "กำลังโหลดโมเดล Whisper...");
          } else if (msg.includes("เตรียมไฟล์")) {
            setProgress(15, "กำลังเตรียมไฟล์เสียง...");
          }
        }
      );

      if (!transcribedText) {
        outputEl.style.color = "var(--text-placeholder)";
        outputEl.textContent = "⚠️ ไม่พบเนื้อหาเสียงพูดในไฟล์นี้";
        return;
      }

      outputEl.style.color = "var(--text-placeholder)";
      outputEl.textContent = `กำลังแปลภาษา...`;
      setProgress(92, "กำลังแปลภาษา...");

      try {
        const deduped = deduplicateText(transcribedText);
        // แปลพร้อม timeout รวม 30 วิ — ถ้าเกินให้ใช้ข้อความต้นฉบับ
        const translatePromise = translateTo(deduped, "auto", targetLang);
        const timeoutPromise = new Promise(r => setTimeout(() => r(null), 30000));
        const translated = await Promise.race([translatePromise, timeoutPromise]);
        const normalize = (s) => s.replace(/\s+/g, " ").trim().toLowerCase();
        outputEl.textContent = (translated && normalize(translated) !== normalize(deduped)) ? translated : deduped;
      } catch {
        outputEl.textContent = transcribedText;
      }
    }

  } catch (err) {
    console.error("[processAudioFile] error:", err);
    outputEl.style.color = "var(--error, #f87171)";
    outputEl.textContent = "❌ " + toErrStr(err);
  } finally {
    btn.disabled = false;
    btn.querySelector(".btn-text").textContent = "เริ่มถอดความจากไฟล์คลิป";
    resultBox.classList.remove("loading");
    setProgress(null);
  }
}

// ─── 5. Helpers ────────────────────────────────────────────────────────────────
function clearOutputArea() {
  // reset live panel
  const liveEl = document.getElementById("liveOutputText");
  if (liveEl) { liveEl.textContent = "ข้อความที่ได้จากเสียงจะแสดงที่นี่..."; liveEl.style.color = "var(--text-placeholder)"; }
  const liveBox = document.getElementById("liveResultBox");
  if (liveBox) liveBox.classList.remove("loading");

  // reset file panel
  const outputEl = document.getElementById("speechOutputText");
  if (outputEl) { outputEl.textContent = "ข้อความที่ได้จากเสียงจะแสดงที่นี่..."; outputEl.style.color = "var(--text-placeholder)"; }
  const speechBox = document.getElementById("speechResultBox");
  if (speechBox) speechBox.classList.remove("loading");

  liveTranslatedBuffer = "";
  // ซ่อน summary box
  const summaryBox = document.getElementById("summaryResultBox");
  if (summaryBox) {
    summaryBox.style.display = "none";
    summaryBox.classList.remove("loading");
    const summaryEl = document.getElementById("summaryOutputText");
    if (summaryEl) { summaryEl.textContent = "ผลสรุปจะแสดงที่นี่..."; summaryEl.style.color = "var(--text-placeholder)"; }
  }
}

function copySpeechResult() {
  const text = document.getElementById("speechOutputText")?.textContent?.trim();
  if (!text || text === "ข้อความที่ได้จากเสียงจะแสดงที่นี่..." || text.startsWith("⚠️") || text.startsWith("กำลัง")) return;
  const btn = document.querySelector("#speechResultBox .copy-btn");
  navigator.clipboard.writeText(text).then(() => {
    if (btn) { btn.textContent = "✅"; setTimeout(() => (btn.textContent = "📋"), 1500); }
  }).catch(() => {
    // fallback สำหรับ browser ที่ไม่รองรับ clipboard API
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed"; ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
    if (btn) { btn.textContent = "✅"; setTimeout(() => (btn.textContent = "📋"), 1500); }
  });
}

function showSpeechError(msg) {
  const outputEl = document.getElementById("liveOutputText");
  if (outputEl) { outputEl.textContent = "⚠️ " + msg; outputEl.style.color = "var(--error)"; }
  const liveBox = document.getElementById("liveResultBox");
  if (liveBox) liveBox.classList.remove("loading");
}

function splitText(text, maxLen) {
  const chunks = [];
  let start = 0;
  while (start < text.length) {
    let end = start + maxLen;
    if (end < text.length) {
      let b = text.lastIndexOf("\n", end);
      if (b > start) {
        end = b;
      } else {
        b = text.lastIndexOf(" ", end);
        if (b > start) end = b;
      }
    }
    chunks.push(text.slice(start, end));
    start = end;
  }
  return chunks;
}


// ─── ตัดคำ/วลีซ้ำที่ Whisper hallucinate ออก (รองรับไทย, คำเดี่ยว, วลียาว) ──────
function deduplicateText(text) {
  if (!text) return text;
  let prev = null;
  let words = text.split(/\s+/).filter(Boolean);
  // วน pass ซ้ำจนกว่า output ไม่เปลี่ยนแปลงอีก
  while (true) {
    const deduped = [];
    let i = 0;
    while (i < words.length) {
      let found = false;
      // ตรวจ len ตั้งแต่ยาว → สั้น รวมถึง len=1 (คำเดี่ยว)
      for (let len = Math.min(15, Math.floor((words.length - i) / 2)); len >= 1; len--) {
        const phrase = words.slice(i, i + len).join(" ");
        const next   = words.slice(i + len, i + len * 2).join(" ");
        if (phrase === next) {
          deduped.push(...words.slice(i, i + len));
          let skip = i + len;
          // กลืนทุก occurrence ที่ตามมาติดกัน
          while (
            skip + len <= words.length &&
            words.slice(skip, skip + len).join(" ") === phrase
          ) skip += len;
          i = skip;
          found = true;
          break;
        }
      }
      if (!found) { deduped.push(words[i]); i++; }
    }
    const result = deduped.join(" ");
    if (result === prev) break; // ไม่มีอะไรเปลี่ยนแล้ว — หยุด
    prev = result;
    words = deduped;
  }
  return (prev || "").trim();
}

// ─── translateTo: รองรับทุกภาษา + timeout + retry + parallel chunks ──────────
async function fetchTranslate(chunk, sourceLang, targetLang, timeoutMs = 8000) {
  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${sourceLang}&tl=${targetLang}&dt=t&q=${encodeURIComponent(chunk)}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return data?.[0]?.filter(s => Array.isArray(s) && s[0]).map(s => s[0]).join("") || chunk;
  } catch (e) {
    clearTimeout(timer);
    throw e;
  }
}

async function translateTo(text, sourceLang = "auto", targetLang = "th") {
  if (!text || !text.trim()) return text;

  // ถ้าภาษาต้นทาง = เป้าหมาย คืนข้อความเดิมทันที (ไม่แปล)
  const srcNorm = sourceLang === "auto" ? null : sourceLang.split("-")[0];
  const tgtNorm = targetLang.split("-")[0];
  if (srcNorm && srcNorm === tgtNorm) return text;

  const chunks = splitText(text, 1000);

  // ส่งแปลแบบ parallel (สูงสุด 3 ก้อนพร้อมกัน) + retry 1 ครั้งถ้า timeout
  const CONCURRENCY = 3;
  const results = new Array(chunks.length);

  for (let i = 0; i < chunks.length; i += CONCURRENCY) {
    const batch = chunks.slice(i, i + CONCURRENCY);
    const settled = await Promise.allSettled(
      batch.map((chunk, j) =>
        fetchTranslate(chunk, sourceLang, targetLang, 8000)
          .catch(() => fetchTranslate(chunk, sourceLang, targetLang, 12000)) // retry
      )
    );
    settled.forEach((r, j) => {
      results[i + j] = r.status === "fulfilled" ? r.value : chunks[i + j]; // fallback = ต้นฉบับ
    });
  }

  return results.join("\n").trim();
}

// alias เดิมสำหรับ backward compat
async function translateToThai(text, sourceLang = "en") {
  return translateTo(text, sourceLang, "th");
}

// ─── 6. ระบบสรุปข้อความแบบ Extractive (ไม่ใช้ API) ───────────────────────────

function extractiveSummarize(text, maxSentences) {
  const raw = text.replace(/([.?!\n])\s*/g, "$1\n").split("\n").map(s => s.trim()).filter(s => s.length > 10);
  if (raw.length === 0) return text;
  if (raw.length <= maxSentences) return raw.join("\n");

  const stopwords = new Set(["และ","ที่","ใน","ของ","ว่า","ให้","แล้ว","ก็","จะ","ได้","มี","เป็น","กับ","ไม่","แต่","หรือ","the","a","an","is","are","was","were","to","of","and","in","that","it","for","on","with","as","at","by","this","be","from","or","but","not","have","had","has","i","you","he","she","they","we","do","did","will","would","can","could","should","about","so","if","up","out","also","just","into","more","than","then","its","your","our","their","been","which","what","when","there","said","all","one","two","some","other","new","how","time","no","may","these","people","like","use"]);

  const wordFreq = {};
  raw.forEach(s => {
    s.toLowerCase().split(/[\s,.!?():;]+/).filter(w => w.length > 1 && !stopwords.has(w)).forEach(w => {
      wordFreq[w] = (wordFreq[w] || 0) + 1;
    });
  });

  const scores = raw.map((s, idx) => {
    const words = s.toLowerCase().split(/[\s,.!?():;]+/).filter(w => w.length > 1 && !stopwords.has(w));
    const tfScore = words.reduce((sum, w) => sum + (wordFreq[w] || 0), 0) / (words.length || 1);
    const posBonus = (idx === 0 || idx === raw.length - 1) ? 2 : (idx < Math.ceil(raw.length * 0.2)) ? 1.3 : 1;
    const lenBonus = Math.min(s.length / 80, 1.5);
    return { idx, score: tfScore * posBonus * lenBonus };
  });

  const top = scores.sort((a, b) => b.score - a.score).slice(0, maxSentences).sort((a, b) => a.idx - b.idx);
  return top.map(t => raw[t.idx]).join("\n");
}

async function summarizeTranscript() {
  const outputEl = document.getElementById("speechOutputText");
  const text = outputEl?.textContent?.trim();

  const placeholder = "ข้อความที่ได้จากเสียงจะแสดงที่นี่...";
  const isInvalid = !text || text === placeholder || text.startsWith("⚠️") || text.startsWith("กำลัง");

  if (isInvalid) {
    alert("กรุณาถอดความเสียงให้เสร็จก่อน แล้วค่อยกดสรุป");
    return;
  }

  const summaryBox = document.getElementById("summaryResultBox");
  const summaryEl = document.getElementById("summaryOutputText");
  const btn = document.getElementById("summarizeBtn");

  summaryBox.style.display = "block";
  summaryEl.style.color = "var(--text-placeholder)";
  summaryEl.textContent = "✨ กำลังสรุปข้อความ...";
  summaryBox.classList.add("loading");
  btn.disabled = true;

  try {
    const wordCount = text.split(/\s+/).length;
    const maxSent = wordCount < 100 ? 3 : wordCount < 300 ? 4 : wordCount < 600 ? 5 : 7;
    const summary = extractiveSummarize(text, maxSent);

    if (!summary) {
      summaryEl.style.color = "var(--text-placeholder)";
      summaryEl.innerHTML = "ไม่สามารถสรุปข้อความได้";
      return;
    }

    const sentences = summary.split("\n").map(s => s.trim()).filter(Boolean);
    summaryEl.style.color = "var(--text)";
    summaryEl.innerHTML = sentences.map(s => `
      <div class="summary-item">
        <span class="summary-text">${s}</span>
      </div>
    `).join("");
  } catch (err) {
    summaryEl.style.color = "var(--error)";
    summaryEl.innerHTML = "⚠️ สรุปไม่สำเร็จ: " + err.message;
  } finally {
    summaryBox.classList.remove("loading");
    btn.disabled = false;
  }
}

function copySummaryResult() {
  const el = document.getElementById("summaryOutputText");
  if (!el) return;
  // ดึงข้อความจาก .summary-text ทุกตัว
  const items = el.querySelectorAll(".summary-text");
  const text = items.length
    ? Array.from(items).map(el => el.textContent.trim()).join("\n")
    : el.textContent.trim();
  if (!text || text.startsWith("⚠️") || text.startsWith("✨") || text === "ผลสรุปจะแสดงที่นี่...") return;
  navigator.clipboard.writeText(text).then(() => {
    const btns = document.querySelectorAll("#summaryResultBox .copy-btn");
    btns.forEach(btn => { btn.textContent = "✅"; setTimeout(() => (btn.textContent = "📋"), 1500); });
  });
}

document.addEventListener("DOMContentLoaded", () => {
  const audioZone = document.getElementById("audioUploadZone");
  if (audioZone) {
    audioZone.addEventListener("dragover", (e) => { e.preventDefault(); audioZone.classList.add("drag-over"); });
    audioZone.addEventListener("dragleave", () => audioZone.classList.remove("drag-over"));
    audioZone.addEventListener("drop", (e) => {
      e.preventDefault();
      audioZone.classList.remove("drag-over");
      const file = e.dataTransfer.files[0];
      if (file) routeAudioFile(file);
    });
  }
});
function copyLiveResult() {
  const text = document.getElementById("liveOutputText").textContent;
  if (!text || text === "ข้อความที่ได้จากเสียงจะแสดงที่นี่..." || text.startsWith("⚠️") || text.startsWith("กำลัง")) return;
  navigator.clipboard.writeText(text).then(() => {
    const btn = document.querySelector("#liveResultBox .copy-btn");
    if (btn) { btn.textContent = "✅"; setTimeout(() => (btn.textContent = "📋"), 1500); }
  });
}