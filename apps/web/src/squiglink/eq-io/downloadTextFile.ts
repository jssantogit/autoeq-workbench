export function downloadTextFile(
  filename: string,
  text: string,
  documentRef: Document = document,
  urlApi: Pick<typeof URL, 'createObjectURL' | 'revokeObjectURL'> = URL,
): void {
  const blobUrl = urlApi.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }))
  let anchor: HTMLAnchorElement | undefined

  try {
    anchor = documentRef.createElement('a')
    anchor.download = filename
    anchor.href = blobUrl
    if (!anchor.isConnected) documentRef.body.append(anchor)
    anchor.click()
  } finally {
    anchor?.remove()
    urlApi.revokeObjectURL(blobUrl)
  }
}
