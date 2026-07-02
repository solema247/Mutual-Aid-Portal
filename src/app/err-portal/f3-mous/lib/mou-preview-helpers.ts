import type { MOUDetail, MOU, Signature } from '../types'

export function splitApprovedAccountBlocks(text: string): string[] {
  return text
    .split(/\n\s*[─-]{3,}\s*\n/g)
    .map((block) => block.trim())
    .filter(Boolean)
}

export function hasArabic(s?: string): boolean {
  return !!s && /[\u0600-\u06FF]/.test(s)
}

export function buildEditingMouForEdit(
  activeMou: MOU,
  detail: MOUDetail | null,
  aggregatedBanking: string | null
): Partial<MOU> {
  const currentBanking = activeMou?.banking_details_override || aggregatedBanking || ''
  const currentPartnerContact =
    activeMou?.partner_contact_override ||
    (detail?.partner
      ? `${detail.partner.name}${detail.partner.contact_person ? `\nRepresentative: ${detail.partner.contact_person}` : ''}${detail.partner.position ? `\nPosition: ${detail.partner.position}` : ''}${detail.partner.email ? `\nEmail: ${detail.partner.email}` : ''}${detail.partner.phone_number ? `\nPhone: ${detail.partner.phone_number}` : ''}`
      : activeMou?.partner_name || '')
  const currentErrContact =
    activeMou?.err_contact_override ||
    `${activeMou?.err_name || ''}${(detail?.projects && detail.projects[0]?.program_officer_name) || detail?.project?.program_officer_name ? `\nRepresentative: ${(detail?.projects && detail.projects[0]?.program_officer_name) || detail?.project?.program_officer_name}` : ''}${(detail?.projects && detail.projects[0]?.program_officer_phone) || detail?.project?.program_officer_phone ? `\nPhone: ${(detail?.projects && detail.projects[0]?.program_officer_phone) || detail?.project?.program_officer_phone}` : ''}`

  let initialSignatures: Signature[] = Array.isArray(activeMou?.signatures)
    ? [...activeMou.signatures]
    : []

  const hasLegacyPartner = initialSignatures.some((sig) => sig.id?.startsWith('legacy-partner-'))
  const hasLegacyErr = initialSignatures.some((sig) => sig.id?.startsWith('legacy-err-'))

  let partnerSignatureName = activeMou?.partner_signature || ''
  let partnerSignatureRole = 'Partner'

  if (!partnerSignatureName && detail?.partner) {
    partnerSignatureName = detail.partner.contact_person || ''
    partnerSignatureRole = detail.partner.position || 'Partner'
  }

  if (!partnerSignatureName && activeMou?.partner_contact_override) {
    const repMatch = activeMou.partner_contact_override.match(/Representative:\s*([^\n]+)/i)
    if (repMatch) partnerSignatureName = repMatch[1].trim()
    const posMatch = activeMou.partner_contact_override.match(/Position:\s*([^\n]+)/i)
    if (posMatch) partnerSignatureRole = posMatch[1].trim()
  }
  if (
    partnerSignatureName &&
    partnerSignatureRole === 'Partner' &&
    activeMou?.partner_contact_override
  ) {
    const posMatch = activeMou.partner_contact_override.match(/Position:\s*([^\n]+)/i)
    if (posMatch) partnerSignatureRole = posMatch[1].trim()
  }

  let errSignatureName = activeMou?.err_signature || ''

  if (!errSignatureName) {
    errSignatureName =
      (detail?.projects && detail.projects[0]?.program_officer_name) ||
      detail?.project?.program_officer_name ||
      ''
  }

  if (!errSignatureName && activeMou?.err_contact_override) {
    const repMatch = activeMou.err_contact_override.match(/Representative:\s*([^\n]+)/i)
    if (repMatch) errSignatureName = repMatch[1].trim()
  }

  const hasNoNewSignatures =
    !Array.isArray(activeMou?.signatures) || activeMou.signatures.length === 0

  if (hasNoNewSignatures) {
    if (!hasLegacyPartner) {
      initialSignatures.push({
        id: `legacy-partner-${activeMou.id}`,
        name: partnerSignatureName,
        role: partnerSignatureRole,
        date: activeMou?.signature_date || new Date().toISOString().split('T')[0],
      })
    }

    if (!hasLegacyErr) {
      initialSignatures.push({
        id: `legacy-err-${activeMou.id}`,
        name: errSignatureName,
        role: 'ERR',
        date: activeMou?.signature_date || new Date().toISOString().split('T')[0],
      })
    }
  } else {
    if (!hasLegacyPartner) {
      const nameToUse = activeMou?.partner_signature || partnerSignatureName
      if (nameToUse) {
        initialSignatures.push({
          id: `legacy-partner-${activeMou.id}`,
          name: nameToUse,
          role: partnerSignatureRole,
          date: activeMou.signature_date || new Date().toISOString().split('T')[0],
        })
      }
    }
    if (!hasLegacyErr) {
      const nameToUse = activeMou?.err_signature || errSignatureName
      if (nameToUse) {
        initialSignatures.push({
          id: `legacy-err-${activeMou.id}`,
          name: nameToUse,
          role: 'ERR',
          date: activeMou.signature_date || new Date().toISOString().split('T')[0],
        })
      }
    }
  }

  const finalSignatures = initialSignatures.length > 0 ? initialSignatures : null

  return {
    partner_name: activeMou?.partner_name || '',
    err_name: activeMou?.err_name || '',
    banking_details_override:
      activeMou?.banking_details_override !== null &&
      activeMou?.banking_details_override !== undefined
        ? activeMou.banking_details_override
        : currentBanking,
    partner_contact_override:
      activeMou?.partner_contact_override !== null &&
      activeMou?.partner_contact_override !== undefined
        ? activeMou.partner_contact_override
        : currentPartnerContact,
    err_contact_override:
      activeMou?.err_contact_override !== null &&
      activeMou?.err_contact_override !== undefined
        ? activeMou.err_contact_override
        : currentErrContact,
    start_date: activeMou?.start_date || null,
    end_date: activeMou?.end_date || null,
    signatures: finalSignatures,
  }
}
