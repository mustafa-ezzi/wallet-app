/** Print an HTML slip through a hidden iframe so "Save as PDF" gets only the slip. */
export function printHtml(html: string, fileName: string): Promise<void> {
  return new Promise((resolve, reject) => {
    try {
      const frame = document.createElement('iframe')
      frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;'
      const previousTitle = document.title
      const title = fileName.replace(/\.pdf$/i, '')
      frame.onload = () => {
        document.title = title
        try {
          if (frame.contentWindow) frame.contentWindow.document.title = title
          frame.contentWindow?.focus()
          frame.contentWindow?.print()
        } finally {
          setTimeout(() => {
            document.title = previousTitle
            frame.remove()
            resolve()
          }, 500)
        }
      }
      frame.srcdoc = html
      document.body.appendChild(frame)
    } catch (err) {
      reject(err)
    }
  })
}
