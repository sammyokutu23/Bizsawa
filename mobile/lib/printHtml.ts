// Web-only: print a standalone HTML document (e.g. buildInvoiceHtml output).
// expo-print's web build ignores `html` and prints the whole app page, and
// printToFileAsync returns nothing. A hidden iframe prints just the document;
// the browser dialog's "Save as PDF" covers download.
export function printHtmlDocument(html: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const frame = document.createElement('iframe')
    frame.setAttribute('aria-hidden', 'true')
    Object.assign(frame.style, {
      position: 'fixed',
      right: '0',
      bottom: '0',
      width: '0',
      height: '0',
      border: '0',
    })
    frame.onload = () => {
      const win = frame.contentWindow
      if (!win) {
        frame.remove()
        reject(new Error('Could not open print preview'))
        return
      }
      // print() blocks until the dialog closes in Chromium/Firefox/Safari.
      win.focus()
      win.print()
      setTimeout(() => frame.remove(), 1000)
      resolve()
    }
    frame.srcdoc = html
    document.body.appendChild(frame)
  })
}
