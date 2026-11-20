import * as Print from 'expo-print'
import * as Sharing from 'expo-sharing'
import { File, Paths } from 'expo-file-system'
import { Platform } from 'react-native'
import { printHtmlOnWeb } from '@/src/utils/printHtmlWeb'
import { slipFileName } from './slipData'
import { getSlipTemplate } from './templates'
import type { SlipData } from './types'

/** Give the PDF a readable name (WhatsApp shows it); keep the original if renaming fails. */
async function renameForSharing(uri: string, fileName: string): Promise<string> {
  try {
    const target = new File(Paths.cache, fileName)
    if (target.exists) target.delete()
    await new File(uri).move(target)
    return target.uri
  } catch {
    return uri
  }
}

export async function createSlipPdf(data: SlipData, templateId?: string | null): Promise<{ uri: string; fileName: string }> {
  const html = getSlipTemplate(templateId).render(data)
  const fileName = slipFileName(data.counterparty, data.generatedAt)
  const { uri } = await Print.printToFileAsync({ html, base64: false })
  return { uri: await renameForSharing(uri, fileName), fileName }
}

/** Build the slip PDF and open the native share sheet (web: the browser's print / Save as PDF dialog). */
export async function shareSlipPdf(data: SlipData, templateId?: string | null): Promise<string | null> {
  if (Platform.OS === 'web') {
    const html = getSlipTemplate(templateId).render(data)
    await printHtmlOnWeb(html, slipFileName(data.counterparty, data.generatedAt))
    return null
  }
  const { uri, fileName } = await createSlipPdf(data, templateId)
  if (!(await Sharing.isAvailableAsync())) throw new Error('Sharing is not available on this device.')
  await Sharing.shareAsync(uri, {
    mimeType: 'application/pdf',
    dialogTitle: fileName,
    UTI: 'com.adobe.pdf',
  })
  return uri
}
