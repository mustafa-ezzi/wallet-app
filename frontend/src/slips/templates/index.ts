import type { SlipTemplate } from '../types'
import { classicTemplate } from './classic'

export const SLIP_TEMPLATES: SlipTemplate[] = [classicTemplate]

export const DEFAULT_SLIP_TEMPLATE_ID = classicTemplate.id

export function getSlipTemplate(id?: string | null): SlipTemplate {
  return SLIP_TEMPLATES.find((t) => t.id === id) ?? classicTemplate
}
