let currentSpeechMode = 'live';
let recognition = null;
let isRecording = false;
let liveTranslatedBuffer = "";
let uploadedAudioFile = null;
let whisperTranscriber = null; // ตัวเก็บโมเดล AI

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
  const ext = file.name.split(".").pop().toLowerCase();
  const allowedExts = ["mp4", "mov", "avi", "mp3", "wav", "m4a"];
  if (allowedExts.includes(ext) || file.type.startsWith("audio/") || file.type.startsWith("video/")) {
    uploadedAudioFile = file;
    document.getElementById("audioFileName").textContent = file.name;
    document.getElementById("audioFileInfo").style.display = "flex";
    document.getElementById("processAudioBtn").disabled = false;
    clearOutputArea();
  } else {
    showSpeechError("รองรับเฉพาะไฟล์วิดีโอและไฟล์เสียง (.mp4, .mov, .avi, .mp3, .wav, .m4a) เท่านั้น");
  }
}

function clearAudioFile() {
  uploadedAudioFile = null;
  document.getElementById("audioFileInput").value = "";
  document.getElementById("audioFileInfo").style.display = "none";
  document.getElementById("processAudioBtn").disabled = true;
  clearOutputArea();
}

// ฟังก์ชันหลักในการถอดความและ "แปลออกมาเป็นภาษาไทย" อัตโนมัติ
async function processAudioFile() {
  if (!uploadedAudioFile) return;

  const btn = document.getElementById("processAudioBtn");
  const outputEl = document.getElementById("speechOutputText");
  const resultBox = document.getElementById("speechResultBox");

  btn.disabled = true;
  btn.querySelector(".btn-text").textContent = "กำลังเตรียมระบบ AI...";
  resultBox.classList.add("loading");
  
  outputEl.textContent = "กำลังโหลดชุดโมเดล AI (Xenova/whisper-small)...\n(หากเป็นการใช้งานรอบแรกจะใช้เวลาดาวน์โหลดโมเดลประมาณ 1-2 นาที รอบถัดไปจะประมวลผลทันที)";
  outputEl.style.color = "var(--text-placeholder)";

  try {
    // ตรวจสอบความพร้อมของ Pipeline
    if (!window.aiPipeline) {
      throw new Error("โมเดล AI (Transformers.js) โหลดไม่สำเร็จหรือถูกบล็อกโดยเครือข่าย กรุณารีเฟรชหน้าหรือตรวจเช็คการเชื่อมต่ออินเทอร์เน็ต");
    }

    if (!whisperTranscriber) {
      whisperTranscriber = await window.aiPipeline('automatic-speech-recognition', 'Xenova/whisper-small');
    }

    outputEl.textContent = "กำลังแยกสัญญาณเสียงดิจิทัลออกจากไฟล์...";
    
    // 1. อ่านไฟล์เสียง/วิดีโอด้วย FileReader เป็น ArrayBuffer
    const fileReader = new FileReader();

    fileReader.onload = async function(e) {
      let audioBuffer;
      // ใช้ Context ปกติถอดรหัสสัญญาณดั้งเดิมก่อน
      const tempCtx = new (window.AudioContext || window.webkitAudioContext)();
      
      try {
        audioBuffer = await tempCtx.decodeAudioData(e.target.result);
      } catch (decodeError) {
        showSpeechError("ไม่สามารถถอดรหัสไฟล์เสียงได้ กรุณาใช้ไฟล์คลิปมาตรฐาน เช่น .mp3, .wav, .m4a หรือ .mp4");
        tempCtx.close();
        btn.disabled = false;
        btn.querySelector(".btn-text").textContent = "เริ่มถอดความจากไฟล์คลิป";
        resultBox.classList.remove("loading");
        return;
      }
      tempCtx.close();

      try {
        // 2. Resample + Mono
        const targetSampleRate = 16000;
        const totalDuration = audioBuffer.duration;
        const durationMin = Math.round(totalDuration / 60 * 10) / 10;
        const segmentSec = 120; // ตัดทีละ 2 นาที ป้องกัน RAM เกิน
        const totalSegments = Math.ceil(totalDuration / segmentSec);

        outputEl.textContent = `⏳ เตรียมประมวลผลไฟล์ ${durationMin} นาที (${totalSegments} ส่วน)...`;

        // 4. ตั้งค่าภาษา
        const selectedLangCode = document.getElementById("speechLang").value;
        const whisperLang = whisperLangs[selectedLangCode] || null;

        // chunk_length_s=30 คือหน้าต่างที่ Whisper ประมวลผลต่อครั้ง
        // stride_length_s=8 คือ overlap ระหว่างหน้าต่างเพื่อรักษา context คำพูดต่อเนื่อง
        const whisperOptions = {
          chunk_length_s: 30,
          stride_length_s: 8,
          task: 'transcribe',
          return_timestamps: false,
          no_repeat_ngram_size: 5,    // ป้องกัน hallucination ซ้ำวนลูป
          repetition_penalty: 1.3,   // ลงโทษคำซ้ำเพิ่มเติม
          temperature: 0,            // greedy decoding — แม่นยำกว่า sampling
        };
        if (whisperLang) whisperOptions.language = whisperLang;

        // 5. วนประมวลผลทีละ segment พร้อม overlap ระหว่างส่วน
        const segOverlap = 10; // วินาที overlap ระหว่าง segment ใหญ่ (ป้องกันคำขาดกลาง)
        let fullTranscript = "";
        let lastContextWords = ""; // เก็บคำท้ายส่วนก่อนเพื่อส่งเป็น context prompt

        for (let seg = 0; seg < totalSegments; seg++) {
          const startSec = Math.max(0, seg * segmentSec - (seg > 0 ? segOverlap : 0));
          const endSec = Math.min(startSec + segmentSec + segOverlap, totalDuration);
          const segDuration = endSec - startSec;

          outputEl.textContent = `⏳ ถอดความส่วนที่ ${seg + 1}/${totalSegments} (${Math.round(startSec/60*10)/10}–${Math.round(endSec/60*10)/10} นาที)...`;

          // Resample เฉพาะ segment นี้
          const offlineCtx = new (window.OfflineAudioContext || window.webkitOfflineAudioContext)(
            1,
            Math.round(segDuration * targetSampleRate),
            targetSampleRate
          );
          const bufferSource = offlineCtx.createBufferSource();
          bufferSource.buffer = audioBuffer;
          bufferSource.connect(offlineCtx.destination);
          bufferSource.start(0, startSec, segDuration);
          const resampledBuffer = await offlineCtx.startRendering();
          const audioData = resampledBuffer.getChannelData(0);

          // Normalize แบบ RMS (ไม่ทำเมื่อเสียงดังปกติแล้ว เพื่อไม่บิดเสียง)
          let sumSq = 0;
          for (let i = 0; i < audioData.length; i++) sumSq += audioData[i] * audioData[i];
          const rms = Math.sqrt(sumSq / audioData.length);
          if (rms > 0 && rms < 0.08) {
            const gain = 0.08 / rms;
            for (let i = 0; i < audioData.length; i++) audioData[i] = Math.max(-1, Math.min(1, audioData[i] * gain));
          }

          // ส่ง context จากส่วนก่อนหน้าให้ Whisper รักษาความต่อเนื่อง
          const segOpts = { ...whisperOptions };
          if (lastContextWords) segOpts.prompt = lastContextWords;

          const segResponse = await whisperTranscriber(audioData, segOpts);
          let segText = segResponse?.text?.trim() || "";

          if (segText) {
            // ตัด overlap ที่ซ้ำกับ segment ก่อนหน้าออก (เปรียบเทียบ 30 คำท้ายของ fullTranscript)
            if (seg > 0 && fullTranscript) {
              const prevWords = fullTranscript.trim().split(/\s+/).slice(-30).join(" ");
              const segWords = segText.split(/\s+/);
              // หาตำแหน่งที่ segText เริ่มต้นใหม่ (ไม่ซ้ำกับส่วนท้ายก่อนหน้า)
              let overlapEnd = 0;
              for (let w = Math.min(segWords.length - 1, 25); w >= 3; w--) {
                const candidate = segWords.slice(0, w).join(" ");
                if (prevWords.includes(candidate)) { overlapEnd = w; break; }
              }
              if (overlapEnd > 0) segText = segWords.slice(overlapEnd).join(" ");
            }

            fullTranscript += (fullTranscript ? " " : "") + segText;
            // เก็บ 50 คำหลังสุดเป็น context สำหรับส่วนถัดไป
            lastContextWords = segText.split(/\s+/).slice(-50).join(" ");
          }
        }

        const response = { text: deduplicateText(fullTranscript.trim()) };

        if (response && response.text && response.text.trim() !== "") {
          const transcribedText = response.text.trim();
          outputEl.style.color = "var(--text)";

          // อ่านภาษาเป้าหมายจาก UI
          const speechLangVal = document.getElementById("speechLang")?.value || "th-TH";
          const srcGoogleLang = whisperToGoogleLang[speechLangVal] || "auto";
          const targetLangEl = document.getElementById("targetSpeechLang");
          const targetLang = targetLangEl ? targetLangEl.value : "th";
          const flagMap = { th:"🇹🇭", en:"🇺🇸", ja:"🇯🇵", ko:"🇰🇷", "zh-CN":"🇨🇳", fr:"🇫🇷", de:"🇩🇪", es:"🇪🇸", ar:"🇸🇦" };
          outputEl.textContent = `${flagMap[targetLang] || "🌐"} กำลังแปล...`;
          try {
            const normalize = (s) => s.replace(/\s+/g, " ").trim().toLowerCase();
            let finalText;
            // กรณี source = target: วนผ่าน en เป็นตัวกลาง
            if (srcGoogleLang !== "auto" && srcGoogleLang === targetLang) {
              const toEn = await translateTo(transcribedText, srcGoogleLang, "en");
              finalText = await translateTo(toEn, "en", targetLang);
            } else {
              let translated = await translateTo(transcribedText, "auto", targetLang);
              const isSame = !translated || normalize(translated) === normalize(transcribedText);
              if (isSame) translated = await translateTo(transcribedText, srcGoogleLang !== "auto" ? srcGoogleLang : "en", targetLang);
              finalText = translated;
            }
            outputEl.textContent = deduplicateText(finalText);
          } catch (transError) {
            outputEl.textContent = `⚠️ แปลไม่สำเร็จ: ${transError.message}`;
          }
        } else {
          outputEl.textContent = "⚠️ ไม่พบเนื้อหาเสียงพูด หรือระบบไม่สามารถจำแนกคำพูดจากไฟล์นี้ได้";
        }

      } catch (whisperError) {
        showSpeechError("เกิดข้อผิดพลาดในการประมวลผลโมเดล AI: " + whisperError.message);
      } finally {
        btn.disabled = false;
        btn.querySelector(".btn-text").textContent = "เริ่มถอดความจากไฟล์คลิป";
        resultBox.classList.remove("loading");
      }
    };

    fileReader.readAsArrayBuffer(uploadedAudioFile);

  } catch (err) {
    showSpeechError("ระบบโมเดล AI เกิดข้อผิดพลาดในการเตรียมระบบ: " + err.message);
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

    summaryEl.style.color = "var(--text)";
    summaryEl.textContent = summary || "ไม่สามารถสรุปข้อความได้";
  } catch (err) {
    summaryEl.style.color = "var(--error)";
    summaryEl.textContent = "⚠️ สรุปไม่สำเร็จ: " + err.message;
  } finally {
    summaryBox.classList.remove("loading");
    btn.disabled = false;
  }
}

function copySummaryResult() {
  const text = document.getElementById("summaryOutputText").textContent;
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