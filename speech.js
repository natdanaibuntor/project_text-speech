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

    // interim: แสดงจุดบอกว่ากำลังฟัง ไม่แสดงข้อความดิบ
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

// ─── แปลงไฟล์เสียง/วิดีโอเป็น WAV (16kHz, mono, PCM) ก่อนส่ง server ──────────
async function convertToWav(file) {
  // ถ้าเป็น WAV อยู่แล้ว ส่งตรงเลยไม่ต้อง convert
  if (file.name.toLowerCase().endsWith(".wav") || file.type === "audio/wav") {
    return new File([file], "audio.wav", { type: "audio/wav" });
  }
  const arrayBuffer = await file.arrayBuffer();
  const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
  audioCtx.close();

  const targetSampleRate = 16000;
  const offlineCtx = new OfflineAudioContext(
    1, // mono
    Math.ceil(audioBuffer.duration * targetSampleRate),
    targetSampleRate
  );
  const source = offlineCtx.createBufferSource();
  source.buffer = audioBuffer;
  source.connect(offlineCtx.destination);
  source.start(0);
  const rendered = await offlineCtx.startRendering();
  const pcmData = rendered.getChannelData(0);

  // เขียน WAV header + PCM 16-bit samples
  const numSamples = pcmData.length;
  const wavBuffer = new ArrayBuffer(44 + numSamples * 2);
  const view = new DataView(wavBuffer);
  const writeStr = (off, str) => { for (let i = 0; i < str.length; i++) view.setUint8(off + i, str.charCodeAt(i)); };

  writeStr(0, "RIFF");
  view.setUint32(4, 36 + numSamples * 2, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);           // PCM
  view.setUint16(22, 1, true);           // mono
  view.setUint32(24, targetSampleRate, true);
  view.setUint32(28, targetSampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, "data");
  view.setUint32(40, numSamples * 2, true);

  let offset = 44;
  for (let i = 0; i < numSamples; i++) {
    const s = Math.max(-1, Math.min(1, pcmData[i]));
    view.setInt16(offset, s < 0 ? s * 32768 : s * 32767, true);
    offset += 2;
  }

  return new File([wavBuffer], "audio.wav", { type: "audio/wav" });
}

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

// ─── ถอดความผ่าน ASR Server (Whisper) ────────────────────────────────────────
async function transcribeViaAsrServer(wavFile, selectedLangCode, targetLang) {
  const formData = new FormData();
  formData.append("file", wavFile);
  formData.append("source_lang", selectedLangCode === "auto" ? "auto" : (whisperToGoogleLang[selectedLangCode] || "auto"));
  formData.append("mode", "original");
  formData.append("target_lang", targetLang);

  const response = await fetch(`${ASR_SERVER_URL}/transcribe`, { method: "POST", body: formData });
  const rawText = await response.text();
  if (!response.ok) {
    let detail = rawText;
    try {
      const j = JSON.parse(rawText);
      detail = j.error || j.detail || j.message || j.msg || JSON.stringify(j);
      if (typeof detail === "object") detail = JSON.stringify(detail);
    } catch {}
    throw new Error(`ASR Server HTTP ${response.status}: ${detail}`);
  }

  let data;
  try { data = JSON.parse(rawText); } catch { throw new Error("ASR Server ตอบไม่ใช่ JSON: " + rawText.slice(0, 200)); }

  const transcribedText = (data.text || data.transcript || data.result || "").trim();
  return transcribedText;
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

  onProgress("⏳ กำลังถอดความด้วย Whisper...");

  // แปลงไฟล์เป็น AudioBuffer → Float32Array (16kHz mono)
  const arrayBuffer = await file.arrayBuffer();
  const audioCtx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
  let decoded;
  try {
    decoded = await audioCtx.decodeAudioData(arrayBuffer);
  } catch {
    audioCtx.close();
    throw new Error("ไม่สามารถอ่านไฟล์เสียงนี้ได้ — ลองใช้ .mp3 หรือ .wav");
  }
  audioCtx.close();

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

  const result = await whisperPipeline(pcm, {
    ...langOpt,
    chunk_length_s: 30,
    stride_length_s: 5,
    return_timestamps: false,
  });

  return (result.text || "").trim();
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
      // ─── เส้นทาง ASR Server ───────────────────────────────────────────────
      outputEl.textContent = "✅ เชื่อมต่อ ASR Server สำเร็จ กำลังแปลงไฟล์เป็น WAV...";
      btn.querySelector(".btn-text").textContent = "กำลังแปลงไฟล์เสียง...";

      let wavFile;
      try {
        wavFile = await convertToWav(uploadedAudioFile);
      } catch (convertErr) {
        throw new Error("แปลงไฟล์เสียงไม่สำเร็จ: " + toErrStr(convertErr));
      }

      outputEl.textContent = `⏳ กำลังส่งถอดความผ่าน ASR Server... (${(wavFile.size / 1024 / 1024).toFixed(1)} MB)`;
      btn.querySelector(".btn-text").textContent = "กำลังถอดความ (ASR)...";

      const transcribedText = await transcribeViaAsrServer(wavFile, selectedLangCode, targetLang);

      if (!transcribedText) {
        outputEl.style.color = "var(--text-placeholder)";
        outputEl.textContent = "⚠️ ไม่พบเนื้อหาเสียงพูดในไฟล์นี้";
        return;
      }

      outputEl.style.color = "var(--text)";
      outputEl.textContent = `${flag} กำลังแปลภาษา...`;

      // แปลภาษาผ่าน Google Translate
      try {
        const srcGoogleLang = whisperToGoogleLang[selectedLangCode] || "auto";
        const normalize = (s) => s.replace(/\s+/g, " ").trim().toLowerCase();
        let finalText;
        if (srcGoogleLang !== "auto" && srcGoogleLang === targetLang) {
          finalText = await translateTo(await translateTo(transcribedText, srcGoogleLang, "en"), "en", targetLang);
        } else {
          let translated = await translateTo(transcribedText, "auto", targetLang);
          if (!translated || normalize(translated) === normalize(transcribedText))
            translated = await translateTo(transcribedText, srcGoogleLang !== "auto" ? srcGoogleLang : "en", targetLang);
          finalText = translated;
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

      const transcribedText = await transcribeViaWhisper(
        uploadedAudioFile,
        selectedLangCode,
        (msg) => { outputEl.textContent = msg; }
      );

      if (!transcribedText) {
        outputEl.style.color = "var(--text-placeholder)";
        outputEl.textContent = "⚠️ ไม่พบเนื้อหาเสียงพูดในไฟล์นี้";
        return;
      }

      outputEl.style.color = "var(--text)";
      outputEl.textContent = `${flag} กำลังแปลภาษา...`;

      try {
        const deduped = deduplicateText(transcribedText);
        const translated = await translateTo(deduped, "auto", targetLang);
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


// ─── ตัดประโยค/วลีซ้ำที่ Whisper hallucinate ออก ────────────────────────────
function deduplicateText(text) {
  if (!text) return text;
  const words = text.split(/\s+/);
  const deduped = [];
  let i = 0;
  while (i < words.length) {
    let found = false;
    for (let len = Math.min(15, Math.floor((words.length - i) / 2)); len >= 3; len--) {
      const phrase = words.slice(i, i + len).join(" ");
      const next = words.slice(i + len, i + len * 2).join(" ");
      if (phrase === next) {
        deduped.push(...words.slice(i, i + len));
        let skip = i + len;
        while (skip + len <= words.length && words.slice(skip, skip + len).join(" ") === phrase) { skip += len; }
        i = skip;
        found = true;
        break;
      }
    }
    if (!found) { deduped.push(words[i]); i++; }
  }
  return deduped.join(" ").trim();
}

// translateTo: รองรับทุกภาษาเป้าหมาย
async function translateTo(text, sourceLang = "auto", targetLang = "th") {
  const chunks = splitText(text, 1000);
  let translated = "";
  for (const chunk of chunks) {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${sourceLang}&tl=${targetLang}&dt=t&q=${encodeURIComponent(chunk)}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (data && data[0]) {
      translated += data[0].filter((s) => Array.isArray(s) && s[0]).map((s) => s[0]).join("") + "\n";
    }
  }
  return translated.trim();
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