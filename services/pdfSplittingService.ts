import { PDFDocument } from 'pdf-lib';

export interface SplitRange {
  studentName: string;
  startPage: number; // 1-indexed
  endPage: number;   // 1-indexed
}

export const splitPdfByRanges = async (
  originalFile: File, 
  ranges: SplitRange[]
): Promise<{ studentName: string; blob: Blob }[]> => {
  const arrayBuffer = await originalFile.arrayBuffer();
  const pdfDoc = await PDFDocument.load(arrayBuffer);
  
  const results = [];

  for (const range of ranges) {
    // Create a new PDF for this student
    const subDocument = await PDFDocument.create();
    
    // Calculate 0-indexed page indices
    // startPage 1 means index 0
    const pageIndices = [];
    for (let i = range.startPage; i <= range.endPage; i++) {
      // Ensure we don't go out of bounds
      if (i - 1 < pdfDoc.getPageCount()) {
        pageIndices.push(i - 1);
      }
    }

    if (pageIndices.length > 0) {
      // Copy pages from source
      const copiedPages = await subDocument.copyPages(pdfDoc, pageIndices);
      copiedPages.forEach((page) => subDocument.addPage(page));

      // Save to bytes
      const pdfBytes = await subDocument.save();
      const blob = new Blob([pdfBytes], { type: 'application/pdf' });
      
      results.push({
        studentName: range.studentName,
        blob
      });
    }
  }

  return results;
};

export const blobToBase64 = (blob: Blob): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      // Remove data:application/pdf;base64, prefix
      const base64 = result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
};