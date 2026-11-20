type WebFrame = {
  style: { cssText: string }
  srcdoc: string
  onload: (() => void) | null
  contentWindow: { focus: () => void; print: () => void; document: { title: string } } | null
  remove: () => void
}

type WebDocument = {
  title: string
  body: { appendChild: (el: WebFrame) => void }
  createElement: (tag: 'iframe') => WebFrame
}

/**
 * Web only: print an HTML document through a hidden iframe so the browser's
 * "Save as PDF" gets that document. `expo-print` on web prints the whole app page instead.
 * `fileName` becomes the suggested PDF name (browsers use the page title).
 */
export function printHtmlOnWeb(html: string, fileName: string): Promise<void> {
  const doc = (globalThis as { document?: WebDocument }).document
  if (!doc) return Promise.reject(new Error('Printing is not available here.'))

  return new Promise((resolve) => {
    const frame = doc.createElement('iframe')
    frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;'
    const previousTitle = doc.title
    frame.onload = () => {
      const title = fileName.replace(/\.pdf$/i, '')
      doc.title = title
      try {
        if (frame.contentWindow) frame.contentWindow.document.title = title
        frame.contentWindow?.focus()
        frame.contentWindow?.print()
      } finally {
        // print() blocks until the dialog closes in most browsers; the delay covers the rest.
        setTimeout(() => {
          doc.title = previousTitle
          frame.remove()
          resolve()
        }, 500)
      }
    }
    frame.srcdoc = html
    doc.body.appendChild(frame)
  })
}
