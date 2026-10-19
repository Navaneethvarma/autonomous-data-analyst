import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';

export interface PdfExportOptions {
  format?: 'A4' | 'Letter';
  landscape?: boolean;
  margin?: {
    top?: string;
    right?: string;
    bottom?: string;
    left?: string;
  };
  printBackground?: boolean;
}

/**
 * Searches well-known system paths for an installed Chromium/Chrome/Edge browser executable.
 */
export function detectBrowserExecutable(): string | null {
  // 1. Explicit environment variable override
  if (process.env.PUPPETEER_EXECUTABLE_PATH && fs.existsSync(process.env.PUPPETEER_EXECUTABLE_PATH)) {
    return process.env.PUPPETEER_EXECUTABLE_PATH;
  }
  if (process.env.CHROME_BIN && fs.existsSync(process.env.CHROME_BIN)) {
    return process.env.CHROME_BIN;
  }

  // 2. Platform-specific known locations
  const candidates: string[] = [];

  if (process.platform === 'win32') {
    const localAppData = process.env.LOCALAPPDATA || '';
    const programFiles = process.env['ProgramFiles'] || 'C:\\Program Files';
    const programFilesX86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';

    candidates.push(
      path.join(programFiles, 'Google', 'Chrome', 'Application', 'chrome.exe'),
      path.join(programFilesX86, 'Google', 'Chrome', 'Application', 'chrome.exe'),
      path.join(programFilesX86, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
      path.join(programFiles, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
      path.join(localAppData, 'Google', 'Chrome', 'Application', 'chrome.exe'),
      path.join(localAppData, 'Microsoft', 'Edge', 'Application', 'msedge.exe')
    );
  } else if (process.platform === 'darwin') {
    candidates.push(
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
      '/Applications/Chromium.app/Contents/MacOS/Chromium'
    );
  } else {
    // Linux and containerized environments
    candidates.push(
      '/usr/bin/google-chrome',
      '/usr/bin/google-chrome-stable',
      '/usr/bin/chromium',
      '/usr/bin/chromium-browser',
      '/snap/bin/chromium'
    );
  }

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
}

/**
 * Returns true if a compatible browser executable is available in the current environment.
 */
export function isPdfGenerationSupported(): boolean {
  return detectBrowserExecutable() !== null;
}

/**
 * Renders HTML into a high-fidelity PDF buffer and optionally writes it to disk.
 */
export async function exportPdfFromHtml(
  html: string,
  outputPath?: string,
  options?: PdfExportOptions
): Promise<{ buffer: Buffer; outputPath?: string }> {
  const executablePath = detectBrowserExecutable();

  if (!executablePath) {
    throw new Error(
      'PDF generation failed: No compatible Chromium, Google Chrome, or Microsoft Edge binary was found. ' +
      'Deployment Requirement: Set the PUPPETEER_EXECUTABLE_PATH environment variable to a valid browser binary, ' +
      'or install chromium/google-chrome-stable on the host machine.'
    );
  }

  const browser = await puppeteer.launch({
    executablePath,
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--font-render-hinting=none',
    ],
  });

  try {
    const page = await browser.newPage();
    await page.setContent(html, {
      waitUntil: 'load',
      timeout: 30000,
    });

    const pdfUint8Array = await page.pdf({
      format: options?.format || 'A4',
      landscape: options?.landscape || false,
      printBackground: options?.printBackground !== false,
      margin: options?.margin || {
        top: '15mm',
        right: '15mm',
        bottom: '15mm',
        left: '15mm',
      },
    });

    const buffer = Buffer.from(pdfUint8Array);

    if (outputPath) {
      const dir = path.dirname(outputPath);
      if (!fs.existsSync(dir)) {
        await fs.promises.mkdir(dir, { recursive: true });
      }
      await fs.promises.writeFile(outputPath, buffer);
    }

    return { buffer, outputPath };
  } finally {
    await browser.close().catch(() => {});
  }
}
