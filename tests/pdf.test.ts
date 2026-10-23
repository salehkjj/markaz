import { describe, expect, it } from 'vitest';
import { MAX_PDF_BYTES, PdfReadError, pdfFailure, pdfItemsToLines, suggestPdfSections, validatePdfFile, validatePdfHeader } from '../src/lib/pdf';

describe('PDF validation and honest failure handling', () => {
  it('rejects oversized or non-PDF files before invoking the worker', () => {
    expect(() => validatePdfFile({name:'notes.pdf', type:'application/pdf', size:MAX_PDF_BYTES + 1})).toThrow('٢٠ ميجابايت');
    expect(() => validatePdfFile({name:'notes.html', type:'application/pdf', size:10})).toThrow('اختر ملف PDF');
    expect(() => validatePdfFile({name:'notes.pdf', type:'text/html', size:10})).toThrow('اختر ملف PDF');
    expect(() => validatePdfHeader(new TextEncoder().encode('<html>not a pdf</html>'))).toThrow('ليس PDF');
  });
  it('accepts iOS files with missing MIME only when the filename/header fit', () => {
    expect(() => validatePdfFile({name:'المحاضرة.PDF', type:'', size:80})).not.toThrow();
    expect(() => validatePdfHeader(new TextEncoder().encode('%PDF-1.7\n'))).not.toThrow();
  });
  it('explains scanned/page-number-only files without inventing content', () => {
    expect(() => suggestPdfSections([{page:1,text:'1'}, {page:2,text:''}])).toThrow('ما سوّينا OCR');
  });
  it('keeps password/corruption failures actionable and distinguishable', () => {
    expect(pdfFailure({name:'PasswordException'}).code).toBe('locked');
    expect(pdfFailure({name:'InvalidPDFException'}).code).toBe('corrupt');
    const original = new PdfReadError('scanned', 'scanned');
    expect(pdfFailure(original)).toBe(original);
  });
});

describe('PDF text suggestions', () => {
  it('uses only existing headings and their real page numbers', () => {
    const result = suggestPdfSections([{page:3,text:'Chapter 2 Operations Research\n2.1 Linear Programming\nA longer paragraph explaining the content of the lecture.'}]);
    expect(result.suggestions.map(s => s.title)).toEqual(['Chapter 2 Operations Research', '2.1 Linear Programming']);
    expect(result.suggestions.every(s => s.page_start === 3 && s.page_end === 3 && s.chapter === 'Chapter 2 Operations Research')).toBe(true);
  });
  it('marks first-line fallback as uncertain and never invents a chapter', () => {
    const result = suggestPdfSections([{page:7,text:'مقدمة في بحوث العمليات\nهذا نص المادة الموجود في الملف.'}]);
    expect(result.suggestions[0]).toEqual({title:'مقدمة في بحوث العمليات',chapter:'',page_start:7,page_end:7,minutes:25});
    expect(result.warnings.some(w => w.includes('ليس عنوانًا مؤكدًا'))).toBe(true);
  });
  it('ignores injected layout headings absent from source text and flags unreadable pages', () => {
    const result = suggestPdfSections([{page:1,text:'Original material'}, {page:2,text:'2'}], {1:['Invented title']});
    expect(result.suggestions.map(s => s.title)).toEqual(['Original material']);
    expect(result.warnings.some(w => w.includes('الصفحات: 2'))).toBe(true);
  });
  it('does not mislabel readable long paragraphs as a scanned PDF', () => {
    const paragraph = 'This paragraph contains useful course content without an explicit short heading. '.repeat(5);
    const result = suggestPdfSections([{page:1,text:paragraph}]);
    expect(result.suggestions[0].title).toBe(paragraph.slice(0,180));
    expect(result.suggestions[0].chapter).toBe('');
  });
  it('reconstructs PDF line breaks while ignoring non-text marked content', () => {
    const lines = pdfItemsToLines([{type:'beginMarkedContent'}, {str:'Chapter', transform:[1,0,0,12,0,100],height:12}, {str:'1',transform:[1,0,0,12,50,100],height:12,hasEOL:true}, {str:'Body text',transform:[1,0,0,10,0,80],height:10}]);
    expect(lines.map(line => line.text)).toEqual(['Chapter 1','Body text']);
  });
});
