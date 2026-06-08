// Set PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc =
  "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

// ─── Main mode switching (translate ↔ speech) ─────────────────────────────────
function switchMainMode(mode) {
  const translatePanel = document.getElementById("translatePanel");
  const speechPanel = document.getElementById("speechPanel");
  const modeTabTranslate = document.getElementById("modeTabTranslate");
  const modeTabSpeech = document.getElementById("modeTabSpeech");
  if (!translatePanel || !speechPanel) return;

  if (mode === 'translate') {
    translatePanel.style.display = "block";
    speechPanel.style.display = "none";
    modeTabTranslate.classList.add("active");
    modeTabSpeech.classList.remove("active");
  } else {
    translatePanel.style.display = "none";
    speechPanel.style.display = "flex";
    modeTabTranslate.classList.remove("active");
    modeTabSpeech.classList.add("active");
  }
}

const googleLangCodes = {
  auto: "auto", en: "en", ja: "ja", ko: "ko",
  zh: "zh-CN", fr: "fr", de: "de", es: "es", ar: "ar", th: "th",
};

let pdfDoc = null;
let totalPages = 0;
let txtContent = "";
let docxContent = "";
let currentMode = "text"; // 'text' | 'pdf' | 'txt' | 'docx'

// ─── Character count ───────────────────────────────────────────────────────────
document.getElementById("inputText").addEventListener("input", function () {
  document.getElementById("charCount").textContent = `${this.value.length} ตัวอักษร`;
});

// ─── Drag & drop ───────────────────────────────────────────────────────────────
const uploadZone = document.getElementById("pdfUploadZone");
uploadZone.addEventListener("dragover", (e) => { e.preventDefault(); uploadZone.classList.add("drag-over"); });
uploadZone.addEventListener("dragleave", () => uploadZone.classList.remove("drag-over"));
uploadZone.addEventListener("drop", (e) => {
  e.preventDefault();
  uploadZone.classList.remove("drag-over");
  const file = e.dataTransfer.files[0];
  if (file) routeFile(file);
  else showError("ไม่พบไฟล์");
});

// ─── File input handler ────────────────────────────────────────────────────────
function handleFileUpload(event) {
  const file = event.target.files[0];
  if (file) routeFile(file);
}

function routeFile(file) {
  const ext = file.name.split(".").pop().toLowerCase();
  if (ext === "pdf" || file.type === "application/pdf") {
    loadPdf(file);
  } else if (ext === "txt" || file.type === "text/plain") {
    loadTxt(file);
  } else if (ext === "docx" || ext === "doc" || file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
    loadDocx(file);
  } else {
    showError("รองรับเฉพาะไฟล์ .pdf, .txt และ .docx เท่านั้น");
  }
}

// ─── Load PDF ──────────────────────────────────────────────────────────────────
async function loadPdf(file) {
  const arrayBuffer = await file.arrayBuffer();
  pdfDoc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  totalPages = pdfDoc.numPages;

  document.getElementById("fileIcon").textContent = "📄";
  document.getElementById("pdfFileName").textContent = file.name;
  document.getElementById("pdfPageCount").textContent = `${totalPages} หน้า`;
  document.getElementById("pdfInfo").style.display = "flex";

  document.getElementById("pageFrom").value = 1;
  document.getElementById("pageFrom").max = totalPages;
  document.getElementById("pageTo").value = totalPages;
  document.getElementById("pageTo").max = totalPages;

  document.getElementById("tabPdf").style.display = "inline-flex";
  document.getElementById("tabTxt").style.display = "none";
  document.getElementById("tabRow").style.display = "flex";
  switchTab("pdf");
  renderPreview(1);
}

// ─── Load TXT ──────────────────────────────────────────────────────────────────
async function loadTxt(file) {  txtContent = await file.text();

  document.getElementById("fileIcon").textContent = "📝";
  document.getElementById("pdfFileName").textContent = file.name;
  document.getElementById("pdfPageCount").textContent = `${txtContent.length.toLocaleString()} ตัวอักษร`;
  document.getElementById("pdfInfo").style.display = "flex";

  // Show txt preview
  const preview = document.getElementById("txtPreview");
  preview.textContent = txtContent.length > 500
    ? txtContent.slice(0, 500) + "\n\n… (แสดงแค่ 500 ตัวอักษรแรก)"
    : txtContent;

  document.getElementById("tabTxt").style.display = "inline-flex";
  document.getElementById("tabPdf").style.display = "none";
  document.getElementById("tabDocx").style.display = "none";
  document.getElementById("tabRow").style.display = "flex";
  switchTab("txt");
}

// ─── Load DOCX ─────────────────────────────────────────────────────────────────
async function loadDocx(file) {
  const arrayBuffer = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer });
  docxContent = result.value;

  document.getElementById("fileIcon").textContent = "📘";
  document.getElementById("pdfFileName").textContent = file.name;
  document.getElementById("pdfPageCount").textContent = `${docxContent.length.toLocaleString()} ตัวอักษร`;
  document.getElementById("pdfInfo").style.display = "flex";

  const preview = document.getElementById("docxPreview");
  preview.textContent = docxContent.length > 500
    ? docxContent.slice(0, 500) + "\n\n… (แสดงแค่ 500 ตัวอักษรแรก)"
    : docxContent;

  document.getElementById("tabDocx").style.display = "inline-flex";
  document.getElementById("tabTxt").style.display = "none";
  document.getElementById("tabPdf").style.display = "none";
  document.getElementById("tabRow").style.display = "flex";
  switchTab("docx");
}

// ─── Render PDF thumbnail ──────────────────────────────────────────────────────
async function renderPreview(pageNum) {
  if (!pdfDoc) return;
  if (isNaN(pageNum) || pageNum < 1 || pageNum > totalPages) return;
  const page = await pdfDoc.getPage(pageNum);
  const viewport = page.getViewport({ scale: 0.4 });
  const canvas = document.createElement("canvas");
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  await page.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;

  const preview = document.getElementById("pdfPreview");
  preview.innerHTML = "";
  const wrapper = document.createElement("div");
  wrapper.className = "preview-thumb";
  const label = document.createElement("span");
  label.textContent = `หน้า ${pageNum}`;
  wrapper.appendChild(canvas);
  wrapper.appendChild(label);
  preview.appendChild(wrapper);
}

// ─── Clean OCR noise ───────────────────────────────────────────────────────────
function cleanOcrText(raw) {
  return raw
    .split("\n")
    .map(line => line.trim())
    .filter(line => {
      if (line.length === 0) return false;
      if (line.length < 4) return false;

      const thaiChars   = (line.match(/[\u0E00-\u0E7F]/g) || []).length;
      const engChars    = (line.match(/[a-zA-Z]/g) || []).length;
      const digitChars  = (line.match(/[0-9]/g) || []).length;
      const spaceChars  = (line.match(/\s/g) || []).length;
      const totalLen    = line.length;
      const meaningful  = thaiChars + engChars + digitChars;

      // ต้องมีตัวอักษร/ตัวเลขที่อ่านได้ >= 60% ของความยาวบรรทัด
      if (meaningful / totalLen < 0.6) return false;

      // บรรทัดสั้น (< 8 ตัว) ที่ไม่ใช่ภาษาไทยเลย → ขยะ
      if (totalLen < 8 && thaiChars === 0) return false;

      // ถ้ามีภาษาอังกฤษมากกว่าไทยในบรรทัดสั้นๆ และดูเหมือน noise
      const letterCount = thaiChars + engChars;
      if (letterCount > 0) {
        const engRatio = engChars / letterCount;
        // บรรทัดสั้น + อังกฤษเยอะ + ไทยน้อย = likely noise
        if (totalLen < 25 && engRatio > 0.55 && thaiChars < 3) return false;
      }

      // Pattern เฉพาะของ OCR noise: ตัวอักษรเดี่ยวๆ คั่นด้วย space เยอะ
      // เช่น "= a v ซ่ o dda" หรือ "ะ อิดะ ฮะ"
      const tokens = line.split(/\s+/).filter(Boolean);
      if (tokens.length >= 3) {
        const shortTokens = tokens.filter(t => t.length <= 2).length;
        // > 70% ของ tokens เป็นตัวสั้น (1-2 ตัวอักษร) → noise
        if (shortTokens / tokens.length > 0.7) return false;
      }

      return true;
    })
    .map(line => line.replace(/\s{2,}/g, " "))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// ─── Extract PDF text (with OCR fallback for scanned pages) ───────────────────
async function extractPdfText(from, to, onProgress) {
  let fullText = "";

  for (let i = from; i <= to; i++) {
    const page = await pdfDoc.getPage(i);

    // 1) ลองดึง text layer ก่อน
    const content = await page.getTextContent();
    const layerText = content.items.map(item => item.str).join(" ").trim();

    if (layerText.length > 10) {
      fullText += layerText + "\n\n";
    } else {
      // ไม่มี text layer → render เป็น canvas แล้ว OCR
      if (onProgress) onProgress(i, to, "ocr");

      const scale = 3; // ความละเอียดสูง = OCR แม่นขึ้น
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement("canvas");
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext("2d");

      // พื้นหลังขาว ก่อน render เพื่อให้ OCR แม่นขึ้น
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: ctx, viewport }).promise;

      const { data: { text } } = await Tesseract.recognize(canvas, "tha+eng", {
        logger: () => {},
        tessedit_pageseg_mode: "1",       // automatic page segmentation
        preserve_interword_spaces: "1",
      });

      const cleaned = cleanOcrText(text);
      if (cleaned) fullText += cleaned + "\n\n";
    }
  }

  return fullText.trim();
}

// ─── Tab switching ─────────────────────────────────────────────────────────────
function switchTab(tab) {
  currentMode = tab;
  ["text", "pdf", "txt", "docx"].forEach((t) => {
    document.getElementById(`tab${t.charAt(0).toUpperCase() + t.slice(1)}`)?.classList.toggle("active", t === tab);
  });
  document.getElementById("textPanel").style.display = tab === "text" ? "block" : "none";
  document.getElementById("pdfPageSelector").style.display = tab === "pdf" ? "block" : "none";
  document.getElementById("txtPanel").style.display = tab === "txt" ? "block" : "none";
  document.getElementById("docxPanel").style.display = tab === "docx" ? "block" : "none";
}

function selectAllPages() {
  document.getElementById("pageFrom").value = 1;
  document.getElementById("pageTo").value = totalPages;
}

// ─── Clear file ────────────────────────────────────────────────────────────────
function clearFile() {
  pdfDoc = null; totalPages = 0; txtContent = ""; docxContent = "";
  document.getElementById("pdfInfo").style.display = "none";
  document.getElementById("pdfPageSelector").style.display = "none";
  document.getElementById("txtPanel").style.display = "none";
  document.getElementById("docxPanel").style.display = "none";
  document.getElementById("tabRow").style.display = "none";
  document.getElementById("pdfPreview").innerHTML = "";
  document.getElementById("txtPreview").textContent = "";
  document.getElementById("docxPreview").textContent = "";
  document.getElementById("fileInput").value = "";
  switchTab("text");
}

// ─── Translate ─────────────────────────────────────────────────────────────────
async function translateText() {
  const btn = document.getElementById("translateBtn");
  const outputEl = document.getElementById("outputText");
  const sl = googleLangCodes[document.getElementById("sourceLang").value] || "auto";
  const tl = googleLangCodes[document.getElementById("targetLang").value] || "th";
  let text = "";

  if (currentMode === "pdf" && pdfDoc) {
    const from = parseInt(document.getElementById("pageFrom").value);
    const to = parseInt(document.getElementById("pageTo").value);
    if (isNaN(from) || isNaN(to) || from < 1 || to > totalPages || from > to) {
      showError(`กรุณาระบุหน้าที่ถูกต้อง (1–${totalPages})`); return;
    }
    btn.disabled = true;
    btn.querySelector(".btn-text").textContent = "กำลังอ่าน PDF...";
    btn.querySelector(".btn-icon").textContent = "⏳";
    text = await extractPdfText(from, to, (cur, total, mode) => {
      if (mode === "ocr") {
        btn.querySelector(".btn-text").textContent = `OCR หน้า ${cur}/${total}...`;
      }
    });
    if (!text) { showError("ไม่สามารถอ่านข้อความจาก PDF ได้"); resetBtn(btn); return; }

  } else if (currentMode === "txt") {
    text = txtContent;
    if (!text) { showError("ไม่พบข้อความในไฟล์ TXT"); return; }

  } else if (currentMode === "docx") {
    text = docxContent;
    if (!text) { showError("ไม่พบข้อความในไฟล์ Word"); return; }

  } else {
    text = document.getElementById("inputText").value.trim();
    if (!text) { showError("กรุณาพิมพ์ข้อความที่ต้องการแปล"); return; }
  }

  btn.disabled = true;
  btn.querySelector(".btn-text").textContent = "กำลังแปล...";
  btn.querySelector(".btn-icon").textContent = "⏳";
  outputEl.textContent = "";
  outputEl.classList.remove("error");
  document.getElementById("resultBox").classList.add("loading");

  try {
    // fetch พร้อม timeout + retry 1 ครั้ง
    async function fetchChunk(chunk, srcLang, timeoutMs = 8000) {
      const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${srcLang}&tl=${tl}&hl=${tl}&dt=t&dt=bd&dj=1&q=${encodeURIComponent(chunk)}`;
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), timeoutMs);
      try {
        const res = await fetch(url, { signal: ctrl.signal });
        clearTimeout(timer);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (data && data.sentences) return data.sentences.filter(s => s.trans).map(s => s.trans).join("");
        if (data && data[0]) return data[0].filter(s => Array.isArray(s) && s[0]).map(s => s[0]).join("");
        return chunk;
      } catch (e) {
        clearTimeout(timer);
        throw e;
      }
    }

    async function doTranslate(srcLang) {
      const chunks = splitText(text, 1000);
      const CONCURRENCY = 3;
      const results = new Array(chunks.length);
      for (let i = 0; i < chunks.length; i += CONCURRENCY) {
        const batch = chunks.slice(i, i + CONCURRENCY);
        const settled = await Promise.allSettled(
          batch.map(chunk =>
            fetchChunk(chunk, srcLang, 8000)
              .catch(() => fetchChunk(chunk, srcLang, 12000)) // retry
          )
        );
        settled.forEach((r, j) => { results[i + j] = r.status === "fulfilled" ? r.value : chunks[i + j]; });
      }
      return results.join("\n").trim();
    }

    const timeout30s = (p) => Promise.race([p, new Promise(r => setTimeout(() => r(null), 30000))]);
    let translated = await timeout30s(doTranslate("auto"));
    if (!translated || translated === text.trim()) {
      translated = await timeout30s(doTranslate(sl !== "auto" ? sl : "en"));
    }
    outputEl.textContent = translated || "ไม่ได้รับผลการแปล";
  } catch (err) {
    showError("เกิดข้อผิดพลาด: " + err.message);
  } finally {
    resetBtn(btn);
    document.getElementById("resultBox").classList.remove("loading");
  }
}

// ─── Helpers ───────────────────────────────────────────────────────────────────
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

function resetBtn(btn) {
  btn.disabled = false;
  btn.querySelector(".btn-text").textContent = "แปลภาษา";
  btn.querySelector(".btn-icon").textContent = "✦";
}

function showError(msg) {
  const outputEl = document.getElementById("outputText");
  outputEl.textContent = "⚠️ " + msg;
  outputEl.classList.add("error");
  document.getElementById("resultBox").classList.remove("loading");
  resetBtn(document.getElementById("translateBtn"));
}

function copyResult() {
  const text = document.getElementById("outputText")?.textContent?.trim();
  if (!text || text === "ผลลัพธ์จะแสดงที่นี่..." || text.startsWith("⚠️")) return;
  const btn = document.querySelector("#resultBox .copy-btn");
  navigator.clipboard.writeText(text).then(() => {
    if (btn) { btn.textContent = "✅"; setTimeout(() => (btn.textContent = "📋"), 1500); }
  }).catch(() => {
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

document.getElementById("inputText").addEventListener("keydown", (e) => {
  if (e.ctrlKey && e.key === "Enter") translateText();
});

document.addEventListener("change", (e) => {
  if (e.target.id === "pageFrom" || e.target.id === "pageTo") {
    renderPreview(parseInt(document.getElementById("pageFrom").value) || 1);
  }
});
// ─── Download dispatcher ───────────────────────────────────────────────────────
function downloadTranslation() {
  const fmt = document.getElementById("downloadFormat").value;
  if (fmt === "docx") downloadTranslationWord();
  else downloadTranslationPdf();
}

// ─── Format picker ─────────────────────────────────────────────────────────────

function selectFormat(fmt) {
  document.getElementById("downloadFormat").value = fmt;

  const badge = document.getElementById("downloadBadge");
  const subLabel = document.getElementById("dlSubLabel");

  if (fmt === "docx") {
    if (badge) badge.textContent = "Word";
    if (subLabel) subLabel.textContent = "บันทึกผลการแปลเป็น Word (.docx)";
    // pills
    const pillPdf  = document.getElementById("pillPdf");
    const pillDocx = document.getElementById("pillDocx");
    if (pillDocx) { pillDocx.style.background = "var(--accent)"; pillDocx.style.color = "#fff"; pillDocx.style.boxShadow = "0 2px 8px rgba(99,102,241,0.4)"; }
    if (pillPdf)  { pillPdf.style.background  = "transparent";   pillPdf.style.color  = "var(--text-placeholder)"; pillPdf.style.boxShadow = "none"; }
  } else {
    if (badge) badge.textContent = "PDF";
    if (subLabel) subLabel.textContent = "บันทึกผลการแปลเป็น PDF";
    const pillPdf  = document.getElementById("pillPdf");
    const pillDocx = document.getElementById("pillDocx");
    if (pillPdf)  { pillPdf.style.background  = "var(--accent)"; pillPdf.style.color  = "#fff"; pillPdf.style.boxShadow = "0 2px 8px rgba(99,102,241,0.4)"; }
    if (pillDocx) { pillDocx.style.background = "transparent";   pillDocx.style.color = "var(--text-placeholder)"; pillDocx.style.boxShadow = "none"; }
  }
}

function updateDownloadBadge() {} // kept for compatibility

// ─── Download Translation as Word (.docx) ─────────────────────────────────────
async function downloadTranslationWord() {
  const outputEl = document.getElementById("outputText");
  const text = outputEl?.textContent?.trim();
  if (!text || text === "ผลลัพธ์จะแสดงที่นี่..." || outputEl.classList.contains("error")) {
    alert("⚠️ ยังไม่มีผลการแปล กรุณาแปลภาษาก่อน");
    return;
  }

  const btn = document.getElementById("downloadPdfBtn");
  btn.querySelector(".btn-text").textContent = "⏳ กำลังสร้าง...";
  btn.disabled = true;

  try {
    const { Document, Packer, Paragraph, TextRun, AlignmentType } = docx;

    const paragraphs = text.split(/\n+/).filter(p => p.trim().length > 0);

    const doc = new Document({
      styles: {
        default: {
          document: { run: { font: "Cordia New", size: 26 } }
        }
      },
      sections: [{
        properties: {
          page: { margin: { top: 1440, bottom: 1440, left: 1800, right: 1800 } }
        },
        children: paragraphs.map(p => new Paragraph({
          children: [new TextRun({ text: p, size: 26, font: "Cordia New" })],
          spacing: { after: 200, line: 360 }
        }))
      }]
    });

    const blob = await Packer.toBlob(doc);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `translation_${new Date().toISOString().slice(0, 10)}.docx`;
    a.click();
    URL.revokeObjectURL(url);
  } catch (err) {
    alert("เกิดข้อผิดพลาด: " + err.message);
  } finally {
    btn.querySelector(".btn-text").textContent = "ดาวน์โหลดไฟล์";
    btn.disabled = false;
  }
}

// ─── Download Translation as PDF ──────────────────────────────────────────────
async function downloadTranslationPdf() {
  const outputEl = document.getElementById("outputText");
  const text = outputEl?.textContent?.trim();
  if (!text || text === "ผลลัพธ์จะแสดงที่นี่..." || outputEl.classList.contains("error")) {
    alert("⚠️ ยังไม่มีผลการแปล กรุณาแปลภาษาก่อน");
    return;
  }

  const btn = document.getElementById("downloadPdfBtn");
  btn.querySelector(".btn-text").textContent = "⏳ กำลังสร้าง...";
  btn.disabled = true;

  try {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const margin = 18;
    const maxLineW = pageW - margin * 2;
    let y = margin;

    // render ข้อความผ่าน canvas (รองรับ Thai/JP/ZH/AR)
    const canvas = document.createElement("canvas");
    const dpi = 2;
    const pxW = Math.round(maxLineW * 3.7795 * dpi);
    canvas.width = pxW;

    const ctx = canvas.getContext("2d");
    const fontSize = 14 * dpi;
    ctx.font = `${fontSize}px Sarabun, Arial, sans-serif`;
    const lineH = fontSize * 1.6;

    // word-wrap
    const rawLines = text.split("\n");
    const finalLines = [];
    for (const raw of rawLines) {
      if (raw.trim() === "") { finalLines.push(""); continue; }
      const words = raw.split(" ");
      let cur = "";
      for (const w of words) {
        const test = cur ? cur + " " + w : w;
        if (ctx.measureText(test).width > pxW - 10) {
          if (cur) finalLines.push(cur);
          cur = w;
        } else { cur = test; }
      }
      if (cur) finalLines.push(cur);
    }

    canvas.height = Math.ceil(finalLines.length * lineH + 20 * dpi);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#111111";
    ctx.font = `${fontSize}px Sarabun, Arial, sans-serif`;
    ctx.textBaseline = "top";
    finalLines.forEach((line, i) => ctx.fillText(line, 5, i * lineH + 8));

    const imgData = canvas.toDataURL("image/png");
    const imgWmm = maxLineW;
    const imgHmm = (canvas.height / dpi) / 3.7795;
    const availH = pageH - margin * 2;

    if (imgHmm <= availH) {
      doc.addImage(imgData, "PNG", margin, y, imgWmm, imgHmm);
    } else {
      const pxPerPage = Math.floor(availH * 3.7795 * dpi);
      let srcY = 0;
      while (srcY < canvas.height) {
        const sliceCanvas = document.createElement("canvas");
        sliceCanvas.width = canvas.width;
        sliceCanvas.height = Math.min(pxPerPage, canvas.height - srcY);
        sliceCanvas.getContext("2d").drawImage(canvas, 0, -srcY);
        const sliceHmm = sliceCanvas.height / dpi / 3.7795;
        doc.addImage(sliceCanvas.toDataURL("image/png"), "PNG", margin, y, imgWmm, sliceHmm);
        srcY += pxPerPage;
        if (srcY < canvas.height) { doc.addPage(); y = margin; }
      }
    }

    doc.save(`translation_${new Date().toISOString().slice(0,10)}.pdf`);
  } catch (err) {
    alert("เกิดข้อผิดพลาด: " + err.message);
  } finally {
    btn.querySelector(".btn-text").textContent = "ดาวน์โหลดไฟล์";
    btn.disabled = false;
  }
}
// ─── Summary (Extractive, no API) ─────────────────────────────────────────────
function extractiveSummarize(text, maxSentences) {
  const raw = text.replace(/([.?!\n])\s*/g, "$1\n").split("\n").map(s => s.trim()).filter(s => s.length > 10);
  if (raw.length === 0) return text;
  if (raw.length <= maxSentences) return raw.join("\n");

  const stopwords = new Set(["และ","ที่","ใน","ของ","ว่า","ให้","แล้ว","ก็","จะ","ได้","มี","เป็น","กับ","ไม่","แต่","หรือ","the","a","an","is","are","was","were","to","of","and","in","that","it","for","on","with","as","at","by","this","be","from","or","but","not","have","had","has","i","you","he","she","they","we","do","did","will","would","can","could","should","about","so","if","up","out","also","just","into","more","than","then","its","your","our","their","been","which","what","when","there","said","all","some","other","new","how","time","no","may","these","people","like","use"]);

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

  return scores.sort((a, b) => b.score - a.score).slice(0, maxSentences).sort((a, b) => a.idx - b.idx).map(t => raw[t.idx]).join("\n");
}

async function summarizeTranscript() {
  const outputEl = document.getElementById("speechOutputText");
  const text = outputEl?.textContent?.trim();
  const placeholder = "ข้อความที่ได้จากเสียงจะแสดงที่นี่...";

  if (!text || text === placeholder || text.startsWith("⚠️") || text.startsWith("กำลัง")) {
    alert("กรุณาถอดความเสียงให้เสร็จก่อน แล้วค่อยกดสรุป");
    return;
  }

  const summaryBox = document.getElementById("summaryResultBox");
  const summaryEl  = document.getElementById("summaryOutputText");
  const btn        = document.getElementById("summarizeBtn");

  summaryBox.style.display = "block";
  summaryEl.style.color = "var(--text-placeholder)";
  summaryEl.textContent = "✨ กำลังสรุปข้อความ...";
  summaryBox.classList.add("loading");
  btn.disabled = true;

  try {
    const wordCount = text.split(/\s+/).length;
    const maxSent   = wordCount < 100 ? 3 : wordCount < 300 ? 4 : wordCount < 600 ? 5 : 7;
    const summary   = extractiveSummarize(text, maxSent);

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
  const items = el.querySelectorAll(".summary-text");
  const text = items.length
    ? Array.from(items).map(el => el.textContent.trim()).join("\n")
    : el.textContent.trim();
  if (!text || text.startsWith("⚠️") || text.startsWith("✨") || text === "ผลสรุปจะแสดงที่นี่...") return;
  navigator.clipboard.writeText(text).then(() => {
    const btns = document.querySelectorAll("#summaryResultBox .copy-btn");
    btns.forEach(b => { b.textContent = "✅"; setTimeout(() => (b.textContent = "📋"), 1500); });
  });
}