/** Local, free PDF text extraction. This is a layout heuristic, not AI or OCR. */
export const MAX_PDF_BYTES = 20 * 1024 * 1024;
export const MAX_PDF_PAGES = 300;

export interface PdfTextPage { page: number; text: string }
export interface PdfSuggestion { title: string; chapter: string; page_start: number; page_end: number; minutes: number }
export interface PdfExtraction { pages: number; suggestions: PdfSuggestion[]; textPages: PdfTextPage[]; warnings: string[] }
interface TextLine { text: string; height: number }

export class PdfReadError extends Error {
  constructor(public readonly code: 'type' | 'size' | 'empty' | 'scanned' | 'locked' | 'corrupt' | 'pages' | 'unavailable', message: string) {
    super(message);
    this.name = 'PdfReadError';
  }
}

export function validatePdfFile(file: Pick<File, 'name' | 'size' | 'type'>): void {
  if (!/\.pdf$/i.test(file.name) || (file.type && !['application/pdf', 'application/octet-stream'].includes(file.type))) {
    throw new PdfReadError('type', 'اختر ملف PDF. تقدر تضيف الجزئيات يدويًا إذا كان ملفك بصيغة ثانية.');
  }
  if (!file.size) throw new PdfReadError('empty', 'الملف فارغ. جرّب نسخة ثانية، أو أضف الجزئيات يدويًا.');
  if (file.size > MAX_PDF_BYTES) throw new PdfReadError('size', 'حجم الملف أكبر من ٢٠ ميجابايت. قسّمه إلى ملفات أصغر أو أضف الجزئيات يدويًا.');
}

export function validatePdfHeader(bytes: Uint8Array): void {
  const header = new TextDecoder('latin1').decode(bytes.subarray(0, 1024));
  if (!header.includes('%PDF-')) throw new PdfReadError('corrupt', 'محتوى الملف ليس PDF مقروءًا. جرّب تصديره من المصدر مرة ثانية.');
}

const chapterPattern = /^(?:(?:chapter|unit|part|lecture|module)\s+(?:\d+|[ivxlcdm]+)\b|(?:الفصل|الوحدة|الباب|المحاضرة|الشابتر)\s+\S+)/iu;
const sectionPattern = /^(?:\d+(?:\.\d+)+[.)]?\s+|[٠-٩]+(?:[.٫][٠-٩]+)+[.)]?\s+|(?:الفصل|الوحدة|الباب|المحاضرة|الشابتر)\s+|(?:chapter|unit|part|lecture|module)\s+)/iu;
function meaningful(text: string): boolean { return (text.match(/\p{L}/gu) ?? []).length >= 4; }
function eligibleHeading(text: string): boolean { return meaningful(text) && text.length <= 180; }

/** Text is retained from the PDF. No chapter name is generated from the filename. */
export function suggestPdfSections(textPages: PdfTextPage[], layoutHeadings: Record<number, string[]> = {}): Pick<PdfExtraction, 'suggestions' | 'warnings'> {
  const warnings: string[] = ['هذا تقسيم أولي من نص الملف وتنسيقه، بدون تحليل ذكي. راجع العناوين والصفحات والمدة قبل الاعتماد.'];
  const suggestions: PdfSuggestion[] = [];
  let currentChapter = '';
  let fallbackCount = 0;
  const unreadablePages: number[] = [];

  for (const page of textPages) {
    const lines = page.text.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
    if (!lines.some(meaningful)) { unreadablePages.push(page.page); continue; }
    const candidates = lines.filter(line => eligibleHeading(line) && sectionPattern.test(line));
    for (const heading of layoutHeadings[page.page] ?? []) {
      if (eligibleHeading(heading) && lines.includes(heading) && !candidates.includes(heading)) candidates.push(heading);
    }
    // Retain document order rather than sorting by font size or inferred importance.
    const headings = [...new Set(candidates)].sort((a, b) => lines.indexOf(a) - lines.indexOf(b));
    if (!headings.length) {
      const first = lines.find(meaningful);
      // A PDF can contain readable paragraphs without any short heading line.
      // Use a verbatim excerpt in that case, and explicitly mark it uncertain.
      if (first) { headings.push(first.slice(0, 180)); fallbackCount++; }
      else { unreadablePages.push(page.page); continue; }
    }
    for (const heading of headings) {
      if (chapterPattern.test(heading)) currentChapter = heading;
      suggestions.push({title: heading, chapter: currentChapter, page_start: page.page, page_end: page.page, minutes: 25});
    }
  }
  if (!suggestions.length) {
    throw new PdfReadError('scanned', 'ما لقينا نصًا واضحًا قابلًا للاستخراج. قد يكون الملف مصوّرًا أو ترميزه غير مقروء. ارفع نسخة نصية أو أضف العناوين والصفحات يدويًا؛ ما سوّينا OCR.');
  }
  if (fallbackCount) warnings.push(`لم تتضح العناوين في ${fallbackCount} صفحة؛ استُخدم مقتطف من أول سطر موجود فيها كاقتراح، وليس عنوانًا مؤكدًا.`);
  if (unreadablePages.length) warnings.push(`لم نستخرج نصًا مناسبًا من الصفحات: ${unreadablePages.join('، ')}. أضف محتواها يدويًا إذا كان مطلوبًا.`);
  warnings.push('مدة ٢٥ دقيقة نقطة بداية قابلة للتعديل، وليست تقديرًا لصعوبة المحتوى. أرقام الصفحات هي ترتيب الصفحات داخل ملف PDF.');
  return {suggestions, warnings};
}

/** Reconstruct lines using PDF coordinates and explicit end-of-line markers. */
export function pdfItemsToLines(items: readonly unknown[]): TextLine[] {
  const lines: TextLine[] = [];
  let current = '';
  let currentY: number | null = null;
  let currentHeight = 0;
  const flush = () => {
    if (current.trim()) lines.push({text: current.trim(), height: currentHeight});
    current = ''; currentY = null; currentHeight = 0;
  };
  for (const raw of items) {
    if (!raw || typeof raw !== 'object' || !('str' in raw) || typeof raw.str !== 'string') continue;
    const item = raw as {str: string; transform?: number[]; height?: number; hasEOL?: boolean};
    const y = item.transform?.[5] ?? null;
    const height = Math.abs(item.height ?? item.transform?.[3] ?? 0);
    if (currentY !== null && y !== null && Math.abs(currentY - y) > Math.max(2, currentHeight * 0.45)) flush();
    if (current && !/\s$/.test(current) && item.str && !/^\s/.test(item.str)) current += ' ';
    current += item.str;
    currentY = y;
    currentHeight = Math.max(currentHeight, height);
    if (item.hasEOL) flush();
  }
  flush();
  return lines;
}

export function pdfFailure(error: unknown): PdfReadError {
  if (error instanceof PdfReadError) return error;
  const name = error && typeof error === 'object' && 'name' in error ? String(error.name) : '';
  if (name === 'PasswordException') return new PdfReadError('locked', 'الملف محمي بكلمة مرور. افتحه وصدّر نسخة غير محمية، أو أدخل الجزئيات يدويًا.');
  if (['InvalidPDFException', 'MissingPDFException', 'FormatError', 'UnknownErrorException'].includes(name)) {
    return new PdfReadError('corrupt', 'تعذّرت قراءة ملف PDF. قد يكون تالفًا أو غير مدعوم؛ جرّب نسخة ثانية أو الإدخال اليدوي.');
  }
  return new PdfReadError('unavailable', 'تعذّر تشغيل قارئ PDF. حدّث الصفحة وحاول ثانية، أو أضف الجزئيات يدويًا.');
}

export async function extractPdf(file: File): Promise<PdfExtraction> {
  validatePdfFile(file);
  let loadingTask: { destroy: () => Promise<void> } | undefined;
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    validatePdfHeader(bytes);
    const pdfjs = await import('pdfjs-dist');
    pdfjs.GlobalWorkerOptions.workerSrc = '/markaz/pdf.worker.min.mjs';
    const task = pdfjs.getDocument({data: bytes, useSystemFonts: true});
    loadingTask = task;
    const document = await task.promise;
    if (document.numPages > MAX_PDF_PAGES) throw new PdfReadError('pages', 'الملف أكثر من ٣٠٠ صفحة. قسّمه إلى أجزاء أصغر حتى تكون المراجعة والاستخراج أخف.');
    const textPages: PdfTextPage[] = [];
    const layoutHeadings: Record<number, string[]> = {};
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber++) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      const lines = pdfItemsToLines(content.items);
      const heights = lines.filter(line => meaningful(line.text) && line.height > 0).map(line => line.height).sort((a, b) => a - b);
      const median = heights[Math.floor(heights.length / 2)] ?? 0;
      layoutHeadings[pageNumber] = lines.filter(line => median > 0 && line.height > median * 1.18 && eligibleHeading(line.text)).map(line => line.text);
      textPages.push({page: pageNumber, text: lines.map(line => line.text).join('\n')});
      page.cleanup();
    }
    return {pages: document.numPages, textPages, ...suggestPdfSections(textPages, layoutHeadings)};
  } catch (error) {
    throw pdfFailure(error);
  } finally {
    // A cleanup error must not replace a useful extraction/error result.
    if (loadingTask) await loadingTask.destroy().catch(() => undefined);
  }
}
