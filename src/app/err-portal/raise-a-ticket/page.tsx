'use client'

import { useEffect, useId, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  GITHUB_RAISE_TICKET_LABELS,
  RAISE_TICKET_LABEL_I18N_KEYS,
  RAISE_TICKET_PRIORITIES,
} from '@/lib/raiseTicketGithub'
import {
  RAISE_TICKET_IMAGE_MAX_BYTES,
  RAISE_TICKET_IMAGE_MAX_COUNT,
  isAllowedRaiseTicketImageMime,
} from '@/lib/githubIssueAttachments'
import { useAllowedFunctions } from '@/hooks/useAllowedFunctions'
import { GithubProjectBoardCard } from '@/app/err-portal/raise-a-ticket/GithubProjectBoardCard'
import '@/i18n/config'

type ImageDraft = {
  id: string
  file: File
  previewUrl: string
}

export default function RaiseATicketPage () {
  const { t } = useTranslation(['err', 'common'])
  const router = useRouter()
  const fileInputId = useId()
  const { can, isLoading: permissionsLoading } = useAllowedFunctions()
  const canViewPage = can('raise_ticket_page')
  const [ready, setReady] = useState(false)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [label, setLabel] = useState<string>('')
  const [priority, setPriority] = useState<string>('')
  const [images, setImages] = useState<ImageDraft[]>([])
  const imagesRef = useRef(images)
  imagesRef.current = images
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [issueUrl, setIssueUrl] = useState<string | null>(null)

  useEffect(() => {
    return () => {
      for (const img of imagesRef.current) URL.revokeObjectURL(img.previewUrl)
    }
  }, [])

  useEffect(() => {
    if (!permissionsLoading && !canViewPage) {
      router.replace('/err-portal')
    }
  }, [canViewPage, permissionsLoading, router])

  useEffect(() => {
    if (permissionsLoading || !canViewPage) return
    const checkAuth = async () => {
      try {
        const res = await fetch('/api/users/me')
        if (!res.ok) {
          if (res.status === 401) {
            window.location.href = '/login'
            return
          }
          setError(t('err:raise_ticket_load_error', 'Could not verify your session.'))
          return
        }
        const data = await res.json()
        if (data.status !== 'active') {
          window.location.href = '/login'
          return
        }
        setReady(true)
      } catch {
        setError(t('err:raise_ticket_load_error', 'Could not verify your session.'))
      }
    }
    void checkAuth()
  }, [t, permissionsLoading, canViewPage])

  const clearImages = () => {
    setImages((prev) => {
      for (const img of prev) URL.revokeObjectURL(img.previewUrl)
      return []
    })
  }

  const removeImage = (id: string) => {
    setImages((prev) => {
      const next: ImageDraft[] = []
      for (const img of prev) {
        if (img.id === id) URL.revokeObjectURL(img.previewUrl)
        else next.push(img)
      }
      return next
    })
  }

  const onImagesSelected = (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return
    setError(null)
    const incoming = Array.from(fileList)
    const remaining = RAISE_TICKET_IMAGE_MAX_COUNT - images.length
    if (remaining <= 0) {
      setError(
        t('err:raise_ticket_images_too_many', {
          count: RAISE_TICKET_IMAGE_MAX_COUNT,
        })
      )
      return
    }
    const accepted: ImageDraft[] = []
    for (const file of incoming.slice(0, remaining)) {
      if (!isAllowedRaiseTicketImageMime(file.type)) {
        setError(t('err:raise_ticket_images_type_error', 'Use PNG, JPEG, WebP, or GIF.'))
        continue
      }
      if (file.size > RAISE_TICKET_IMAGE_MAX_BYTES) {
        setError(
          t('err:raise_ticket_images_size_error', {
            mb: Math.round(RAISE_TICKET_IMAGE_MAX_BYTES / (1024 * 1024)),
          })
        )
        continue
      }
      accepted.push({
        id: `${file.name}-${file.size}-${file.lastModified}-${Math.random().toString(36).slice(2)}`,
        file,
        previewUrl: URL.createObjectURL(file),
      })
    }
    if (incoming.length > remaining) {
      setError(
        t('err:raise_ticket_images_too_many', {
          count: RAISE_TICKET_IMAGE_MAX_COUNT,
        })
      )
    }
    if (accepted.length > 0) {
      setImages((prev) => [...prev, ...accepted].slice(0, RAISE_TICKET_IMAGE_MAX_COUNT))
    }
  }

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setIssueUrl(null)
    if (!label) {
      setError(t('err:raise_ticket_select_issue_type', 'Please select an issue type.'))
      return
    }
    if (!priority) {
      setError(t('err:raise_ticket_select_priority', 'Please select a priority.'))
      return
    }
    if (images.length > RAISE_TICKET_IMAGE_MAX_COUNT) {
      setError(
        t('err:raise_ticket_images_too_many', {
          count: RAISE_TICKET_IMAGE_MAX_COUNT,
        })
      )
      return
    }
    for (const img of images) {
      if (!isAllowedRaiseTicketImageMime(img.file.type)) {
        setError(t('err:raise_ticket_images_type_error', 'Use PNG, JPEG, WebP, or GIF.'))
        return
      }
      if (img.file.size > RAISE_TICKET_IMAGE_MAX_BYTES) {
        setError(
          t('err:raise_ticket_images_size_error', {
            mb: Math.round(RAISE_TICKET_IMAGE_MAX_BYTES / (1024 * 1024)),
          })
        )
        return
      }
    }
    setSubmitting(true)
    try {
      const form = new FormData()
      form.set('title', title.trim())
      form.set('description', description.trim())
      form.set('label', label)
      form.set('priority', priority)
      for (const img of images) {
        form.append('images', img.file, img.file.name)
      }
      const res = await fetch('/api/support/github-issue', {
        method: 'POST',
        body: form,
      })
      const data = (await res.json().catch(() => ({}))) as {
        error?: string
        html_url?: string
        detail?: string
        retryAfter?: number
      }
      if (!res.ok) {
        if (res.status === 403) {
          setError(
            t(
              'err:raise_ticket_forbidden',
              'You do not have permission to raise tickets. Ask an admin if you need access.'
            )
          )
          return
        }
        if (res.status === 429 && typeof data.retryAfter === 'number' && data.retryAfter > 0) {
          const sec = data.retryAfter
          setError(
            sec < 90
              ? t('err:raise_ticket_rate_limited_seconds', { count: sec })
              : t('err:raise_ticket_rate_limited_minutes', {
                  count: Math.max(1, Math.ceil(sec / 60)),
                })
          )
        } else if (
          typeof data.error === 'string' &&
          data.error.toLowerCase().includes('upload')
        ) {
          setError(
            data.detail
              ? t('err:raise_ticket_images_upload_error_detail', {
                  detail: data.detail,
                })
              : t(
                  'err:raise_ticket_images_upload_error',
                  'Could not upload image to GitHub. Ticket was not created.'
                )
          )
        } else {
          setError(data.detail ?? data.error ?? t('err:raise_ticket_submit_error', 'Something went wrong.'))
        }
        return
      }
      if (data.html_url) {
        setIssueUrl(data.html_url)
        setTitle('')
        setDescription('')
        setLabel('')
        setPriority('')
        clearImages()
      }
    } catch {
      setError(t('err:raise_ticket_submit_error', 'Something went wrong.'))
    } finally {
      setSubmitting(false)
    }
  }

  if (permissionsLoading) {
    return <div className="p-6">{t('common:loading', 'Loading...')}</div>
  }
  if (!canViewPage) return null
  if (!ready && !error) {
    return <div className="p-6">{t('common:loading', 'Loading...')}</div>
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      <div className="mx-auto max-w-3xl space-y-6">
        <Link
          href="/err-portal"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground -ml-2"
        >
          <ArrowLeft className="h-4 w-4" />
          {t('common:back_to_home')}
        </Link>
        <h1 className="text-3xl font-bold">
          {t('err:raise_ticket_title', 'Raise a ticket')}
        </h1>
        <p className="text-muted-foreground">
          {t(
            'err:raise_ticket_intro',
            'Report a bug or request an improvement. This opens an issue in the Mutual Aid Portal GitHub repository for the dev team.'
          )}
        </p>
        <p className="text-sm text-muted-foreground border-l-2 border-muted pl-3">
          {t(
            'err:raise_ticket_triage_note',
            'Choose an issue type and priority to help triage.'
          )}
        </p>
        <p className="text-sm">
          <Link
            href="/err-portal/ticket-dashboard"
            className="text-primary underline font-medium"
          >
            {t('err:raise_ticket_link_dashboard', 'View ticket dashboard')}
          </Link>
        </p>

        {error && (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        )}

        {issueUrl && (
          <p className="text-sm text-muted-foreground">
            {t('err:raise_ticket_success', 'Issue created:')}{' '}
            <a href={issueUrl} className="text-primary underline font-medium" target="_blank" rel="noopener noreferrer">
              {issueUrl}
            </a>
          </p>
        )}

        <Card>
          <CardHeader>
            <CardTitle>{t('err:raise_ticket_form_title', 'New issue')}</CardTitle>
            <CardDescription>
              {t(
                'err:raise_ticket_form_desc',
                'Be specific enough that someone can reproduce or understand the request. Avoid sharing sensitive personal data.'
              )}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={onSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="ticket-label">{t('err:raise_ticket_field_issue_type', 'Issue Type')}</Label>
                <Select
                  value={label || undefined}
                  onValueChange={setLabel}
                  disabled={!ready || submitting}
                >
                  <SelectTrigger id="ticket-label" className="w-full max-w-full">
                    <SelectValue
                      placeholder={t('err:raise_ticket_issue_type_placeholder', 'Select issue type')}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {GITHUB_RAISE_TICKET_LABELS.map((value) => (
                      <SelectItem key={value} value={value}>
                        {t(`err:${RAISE_TICKET_LABEL_I18N_KEYS[value]}`, value)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {t(
                    'err:raise_ticket_label_hint',
                    'Matches labels in the Mutual-Aid-Portal repo so the issue is tagged correctly.'
                  )}
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="ticket-priority">{t('err:raise_ticket_field_priority', 'Priority')}</Label>
                <Select
                  value={priority || undefined}
                  onValueChange={setPriority}
                  disabled={!ready || submitting}
                >
                  <SelectTrigger id="ticket-priority" className="w-full max-w-full">
                    <SelectValue
                      placeholder={t('err:raise_ticket_priority_placeholder', 'Select priority')}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {RAISE_TICKET_PRIORITIES.map((p) => (
                      <SelectItem key={p} value={p}>
                        {t(`err:raise_ticket_priority_${p}`, p)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {t(
                    'err:raise_ticket_priority_hint',
                    'Added to the issue description for context; project fields can be set during the weekly triage.'
                  )}
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="ticket-title">{t('err:raise_ticket_field_title', 'Title')}</Label>
                <Input
                  id="ticket-title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  required
                  minLength={3}
                  maxLength={200}
                  placeholder={t('err:raise_ticket_title_placeholder', 'Short summary of the problem or idea')}
                  disabled={!ready || submitting}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ticket-desc">{t('err:raise_ticket_field_description', 'Description')}</Label>
                <Textarea
                  id="ticket-desc"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  required
                  minLength={10}
                  maxLength={8000}
                  rows={8}
                  placeholder={t(
                    'err:raise_ticket_desc_placeholder',
                    'What happened, what you expected, steps to reproduce, browser/device if relevant…'
                  )}
                  disabled={!ready || submitting}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor={fileInputId}>
                  {t('err:raise_ticket_field_images', 'Screenshots (optional)')}
                </Label>
                <Input
                  id={fileInputId}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  multiple
                  disabled={!ready || submitting || images.length >= RAISE_TICKET_IMAGE_MAX_COUNT}
                  onChange={(e) => {
                    onImagesSelected(e.target.files)
                    e.target.value = ''
                  }}
                />
                <p className="text-xs text-muted-foreground">
                  {t('err:raise_ticket_images_hint', {
                    count: RAISE_TICKET_IMAGE_MAX_COUNT,
                    mb: Math.round(RAISE_TICKET_IMAGE_MAX_BYTES / (1024 * 1024)),
                  })}
                </p>
                {images.length > 0 && (
                  <ul className="flex flex-wrap gap-3 pt-1">
                    {images.map((img) => (
                      <li
                        key={img.id}
                        className="relative h-20 w-20 overflow-hidden rounded-md border bg-muted"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={img.previewUrl}
                          alt={img.file.name}
                          className="h-full w-full object-cover"
                        />
                        <button
                          type="button"
                          className="absolute right-1 top-1 rounded-full bg-background/90 p-0.5 text-foreground shadow-sm hover:bg-background"
                          aria-label={t('err:raise_ticket_images_remove', 'Remove image')}
                          disabled={submitting}
                          onClick={() => removeImage(img.id)}
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <Button type="submit" disabled={!ready || submitting}>
                {submitting
                  ? t('err:raise_ticket_submitting', 'Submitting…')
                  : t('err:raise_ticket_submit', 'Submit to GitHub')}
              </Button>
            </form>
          </CardContent>
        </Card>

        <GithubProjectBoardCard />
      </div>
    </div>
  )
}
