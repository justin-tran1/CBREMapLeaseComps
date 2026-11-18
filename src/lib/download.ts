/** Hand a file to the browser to save, under the name given. */
export function downloadBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  // Revoking at once can cancel the save in some browsers, so the URL lives a minute.
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
}
