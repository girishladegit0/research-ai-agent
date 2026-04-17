export interface ParsedFile {
  fileName: string;
  fileType: string;
  content: string;
}

export async function parseFile(file: File): Promise<ParsedFile> {
  const extension = file.name.split('.').pop()?.toLowerCase() || '';
  let content = '';

  if (extension === 'pdf') {
    content = await parsePDF(file);
  } else if (['doc', 'docx'].includes(extension)) {
    content = await parseWord(file);
  } else if (['csv'].includes(extension)) {
    content = await parseCSV(file);
  } else if (['txt', 'md', 'json'].includes(extension)) {
    content = await parseText(file);
  } else if (['png', 'jpg', 'jpeg'].includes(extension)) {
    content = await parseImageOCR(file);
  } else {
    throw new Error(`Unsupported file type: ${extension}`);
  }

  return {
    fileName: file.name,
    fileType: file.type || extension,
    content: content.trim(),
  };
}

async function parsePDF(file: File): Promise<string> {
  // Dynamically import pdfjsLib to avoid SSR "DOMMatrix is not defined" issues
  const pdfjsLib = await import('pdfjs-dist');

  // Setup PDF.js worker - use https:// explicitly to avoid protocol-relative URL issues
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  let text = '';
  
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    text += textContent.items.map((item: any) => item.str).join(' ') + '\n';
  }
  
  return text;
}

async function parseWord(file: File): Promise<string> {
  // Dynamically import mammoth
  const mammothModule = await import('mammoth');
  const mammoth = mammothModule.default || mammothModule;
  const arrayBuffer = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer });
  return result.value;
}

async function parseCSV(file: File): Promise<string> {
  // Dynamically import papaparse
  const PapaModule = await import('papaparse');
  const Papa = PapaModule.default || PapaModule;
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      complete: (results: any) => {
        const rows = results.data as string[][];
        const text = rows.map((row: string[]) => row.join(', ')).join('\n');
        resolve(text);
      },
      error: (error: any) => {
        reject(error);
      }
    });
  });
}

async function parseText(file: File): Promise<string> {
  return await file.text();
}

async function parseImageOCR(file: File): Promise<string> {
  // Dynamically import tesseract.js
  const TesseractModule = await import('tesseract.js');
  const Tesseract = TesseractModule.default || TesseractModule;
  const url = URL.createObjectURL(file);
  try {
    const result = await Tesseract.recognize(url, 'eng', {
      logger: (m: any) => console.log(m)
    });
    return result.data.text;
  } finally {
    URL.revokeObjectURL(url);
  }
}
