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
let currentMode = "text"; // 'text' | 'pdf' | 'txt'

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
  } else {
    showError("รองรับเฉพาะไฟล์ .pdf และ .txt เท่านั้น");
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
async function loadTxt(file) {
  txtContent = await file.text();

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
  document.getElementById("tabRow").style.display = "flex";
  switchTab("txt");
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

// ─── Extract PDF text ──────────────────────────────────────────────────────────
async function extractPdfText(from, to) {
  let text = "";
  for (let i = from; i <= to; i++) {
    const page = await pdfDoc.getPage(i);
    const content = await page.getTextContent();
    text += content.items.map((item) => item.str).join(" ") + "\n\n";
  }
  return text.trim();
}

// ─── Tab switching ─────────────────────────────────────────────────────────────
function switchTab(tab) {
  currentMode = tab;
  ["text", "pdf", "txt"].forEach((t) => {
    document.getElementById(`tab${t.charAt(0).toUpperCase() + t.slice(1)}`)?.classList.toggle("active", t === tab);
  });
  document.getElementById("textPanel").style.display = tab === "text" ? "block" : "none";
  document.getElementById("pdfPageSelector").style.display = tab === "pdf" ? "block" : "none";
  document.getElementById("txtPanel").style.display = tab === "txt" ? "block" : "none";
}

function selectAllPages() {
  document.getElementById("pageFrom").value = 1;
  document.getElementById("pageTo").value = totalPages;
}

// ─── Clear file ────────────────────────────────────────────────────────────────
function clearFile() {
  pdfDoc = null; totalPages = 0; txtContent = "";
  document.getElementById("pdfInfo").style.display = "none";
  document.getElementById("pdfPageSelector").style.display = "none";
  document.getElementById("txtPanel").style.display = "none";
  document.getElementById("tabRow").style.display = "none";
  document.getElementById("pdfPreview").innerHTML = "";
  document.getElementById("txtPreview").textContent = "";
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
    text = await extractPdfText(from, to);
    if (!text) { showError("ไม่พบข้อความใน PDF นี้ (อาจเป็นไฟล์สแกน)"); resetBtn(btn); return; }

  } else if (currentMode === "txt") {
    text = txtContent;
    if (!text) { showError("ไม่พบข้อความในไฟล์ TXT"); return; }

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
    async function doTranslate(srcLang) {
      const chunks = splitText(text, 1000);
      let result = "";
      for (const chunk of chunks) {
        const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${srcLang}&tl=${tl}&hl=${tl}&dt=t&dt=bd&dj=1&q=${encodeURIComponent(chunk)}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (data && data.sentences) {
          result += data.sentences.filter(s => s.trans).map(s => s.trans).join("") + "\n";
        } else if (data && data[0]) {
          result += data[0].filter((s) => Array.isArray(s) && s[0]).map((s) => s[0]).join("") + "\n";
        }
      }
      return result.trim();
    }

    let translated = await doTranslate("auto");
    if (!translated || translated === text.trim()) {
      translated = await doTranslate(sl !== "auto" ? sl : "en");
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
  const text = document.getElementById("outputText").textContent;
  if (!text || text === "ผลลัพธ์จะแสดงที่นี่...") return;
  navigator.clipboard.writeText(text).then(() => {
    const btn = document.querySelector(".copy-btn");
    btn.textContent = "✅";
    setTimeout(() => (btn.textContent = "📋"), 1500);
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
// ─── Download Translation as PDF ──────────────────────────────────────────────
async function downloadTranslationPdf() {
  const outputEl = document.getElementById("outputText");
  const text = outputEl?.textContent?.trim();

  // ตรวจว่ามีผลการแปลแล้ว
  if (!text || text === "ผลลัพธ์จะแสดงที่นี่..." || outputEl.classList.contains("error")) {
    alert("⚠️ ยังไม่มีผลการแปล กรุณาแปลภาษาก่อน");
    return;
  }

  const btn = document.getElementById("downloadPdfBtn");
  btn.textContent = "⏳";
  btn.disabled = true;

  try {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const margin = 18;
    const maxLineW = pageW - margin * 2;
    let y = margin;

    // ── Header ──
    doc.setFillColor(99, 102, 241);
    doc.rect(0, 0, pageW, 22, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(13);
    doc.setFont("helvetica", "bold");
    doc.text("Translation Result", margin, 14);

    // วันที่/เวลา
    const now = new Date().toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" });
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.text(now, pageW - margin, 14, { align: "right" });

    y = 32;

    // ── ข้อมูลภาษา ──
    const srcLang = document.getElementById("sourceLang")?.options[document.getElementById("sourceLang")?.selectedIndex]?.text || "-";
    const tgtLang = document.getElementById("targetLang")?.options[document.getElementById("targetLang")?.selectedIndex]?.text || "-";
    doc.setTextColor(80, 80, 120);
    doc.setFontSize(9);
    doc.setFont("helvetica", "italic");
    doc.text(`${srcLang}  →  ${tgtLang}`, margin, y);
    y += 8;

    // เส้นคั่น
    doc.setDrawColor(200, 200, 230);
    doc.line(margin, y, pageW - margin, y);
    y += 7;

    // ── เนื้อหาผลการแปล ──
    doc.setTextColor(30, 30, 50);
    doc.setFontSize(11);
    doc.setFont("helvetica", "normal");

    // jsPDF ไม่มี Thai font → render ข้อความผ่าน canvas แล้วฝังเป็น image
    // วิธีนี้รองรับทุกภาษารวมถึงไทย จีน ญี่ปุ่น อาหรับ
    const canvas = document.createElement("canvas");
    const dpi = 2; // retina
    const pxW = Math.round(maxLineW * 3.7795 * dpi); // mm → px
    canvas.width = pxW;

    // วัดความสูงที่ต้องการก่อน
    const ctx = canvas.getContext("2d");
    const fontSize = 14 * dpi;
    ctx.font = `${fontSize}px Sarabun, Arial, sans-serif`;
    const lineH = fontSize * 1.55;
    const words = text.split(" ");
    let linesBuf = [], curLine = "";
    for (const word of words) {
      const test = curLine ? curLine + " " + word : word;
      if (ctx.measureText(test).width > pxW - 10) {
        if (curLine) linesBuf.push(curLine);
        curLine = word;
      } else {
        curLine = test;
      }
    }
    if (curLine) linesBuf.push(curLine);
    // handle newlines in original text
    const finalLines = [];
    for (const l of linesBuf) {
      for (const sub of l.split("\n")) finalLines.push(sub);
    }

    const totalH = finalLines.length * lineH + 20 * dpi;
    canvas.height = Math.ceil(totalH);

    // วาดจริง
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#1e1e32";
    ctx.font = `${fontSize}px Sarabun, Arial, sans-serif`;
    ctx.textBaseline = "top";
    finalLines.forEach((line, i) => {
      ctx.fillText(line, 5, i * lineH + 8);
    });

    const imgData = canvas.toDataURL("image/png");
    // แปลง px → mm สำหรับ jsPDF
    const imgWmm = maxLineW;
    const imgHmm = (canvas.height / dpi) / 3.7795;

    // ถ้าสูงเกินหน้า ให้แบ่งหน้า
    const availH = pageH - y - margin;
    if (imgHmm <= availH) {
      doc.addImage(imgData, "PNG", margin, y, imgWmm, imgHmm);
      y += imgHmm;
    } else {
      // slice canvas ตามหน้า
      const pxPerPage = Math.floor(availH * 3.7795 * dpi);
      let srcY = 0;
      let firstPage = true;
      while (srcY < canvas.height) {
        const sliceH = firstPage ? pxPerPage : Math.floor((pageH - margin * 2) * 3.7795 * dpi);
        const sliceCanvas = document.createElement("canvas");
        sliceCanvas.width = canvas.width;
        sliceCanvas.height = Math.min(sliceH, canvas.height - srcY);
        const sc = sliceCanvas.getContext("2d");
        sc.drawImage(canvas, 0, -srcY);
        const sliceImg = sliceCanvas.toDataURL("image/png");
        const sliceHmm = sliceCanvas.height / dpi / 3.7795;
        doc.addImage(sliceImg, "PNG", margin, y, imgWmm, sliceHmm);
        srcY += sliceH;
        if (srcY < canvas.height) {
          doc.addPage();
          y = margin + 6;
        }
        firstPage = false;
      }
    }

    // ── Footer ──
    const totalPages = doc.internal.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setTextColor(160, 160, 180);
      doc.text(`หน้า ${i} / ${totalPages}`, pageW / 2, pageH - 8, { align: "center" });
    }

    // ── Save ──
    const filename = `translation_${new Date().toISOString().slice(0,10)}.pdf`;
    doc.save(filename);
  } catch (err) {
    alert("เกิดข้อผิดพลาด: " + err.message);
  } finally {
    btn.textContent = "⬇️ดาวโหลดไฟล์ PDF ";
    btn.disabled = false;
  }
}