import { useCallback, useEffect, useState } from 'react'
import { Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { Screen, PrimaryButton, ErrorBanner } from '@/src/components/ui'
import api from '@/src/api/client'
import { useRemoteConfig } from '@/src/config/RemoteConfigContext'
import { useColors } from '@/src/theme/ThemeContext'
import { radii, spacing, typography } from '@/src/theme/colors'

type Message = {
  id: number
  sender: 'user' | 'staff'
  body: string
  created_at: string | null
}

type Thread = {
  id: number
  subject: string
  category: string
  status: string
  updated_at: string | null
  last_message_preview?: string
  messages?: Message[]
}

const CATEGORIES = [
  { value: 'account', label: 'Account / login' },
  { value: 'billing', label: 'Billing / Premium' },
  { value: 'bug', label: 'Bug' },
  { value: 'other', label: 'Other' },
]

export default function SupportScreen() {
  const colors = useColors()
  const router = useRouter()
  const { config } = useRemoteConfig()
  const params = useLocalSearchParams<{ threadId?: string }>()
  const [threads, setThreads] = useState<Thread[]>([])
  const [active, setActive] = useState<Thread | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [composing, setComposing] = useState(false)
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [category, setCategory] = useState('other')
  const [reply, setReply] = useState('')

  const loadList = useCallback(async () => {
    try {
      const { data } = await api.get<Thread[]>('/support/threads/')
      setThreads(Array.isArray(data) ? data : [])
    } catch {
      setError('Could not load support tickets. Check your connection.')
    }
  }, [])

  const openThread = useCallback(async (id: number) => {
    setBusy(true)
    setError('')
    try {
      const { data } = await api.get<Thread>(`/support/threads/${id}/`)
      setActive(data)
      setComposing(false)
    } catch {
      setError('Could not open ticket.')
    } finally {
      setBusy(false)
    }
  }, [])

  useEffect(() => {
    void loadList()
  }, [loadList])

  useEffect(() => {
    const id = Number(params.threadId)
    if (Number.isFinite(id) && id > 0) {
      void openThread(id)
    }
  }, [params.threadId, openThread])

  async function createTicket() {
    if (!subject.trim() || !body.trim()) {
      setError('Subject and message are required.')
      return
    }
    setBusy(true)
    setError('')
    try {
      const { data } = await api.post<Thread>('/support/threads/', {
        subject: subject.trim(),
        body: body.trim(),
        category,
      })
      setSubject('')
      setBody('')
      setComposing(false)
      await loadList()
      setActive(data)
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setError(typeof detail === 'string' ? detail : 'Could not create ticket.')
    } finally {
      setBusy(false)
    }
  }

  async function sendReply() {
    if (!active || !reply.trim()) return
    setBusy(true)
    setError('')
    try {
      const { data } = await api.post<Thread>(`/support/threads/${active.id}/reply/`, {
        body: reply.trim(),
      })
      setReply('')
      setActive(data)
      await loadList()
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setError(typeof detail === 'string' ? detail : 'Could not send reply.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.pad} keyboardShouldPersistTaps="handled">
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <Text style={{ color: colors.primary, fontWeight: '700', marginBottom: spacing.md }}>← Back</Text>
        </Pressable>
        <Text style={[styles.title, { color: colors.text }]}>Help & Support</Text>
        <Text style={[styles.hint, { color: colors.textMuted }]}>
          Message WalletTrails support. We’ll reply in this chat (and notify you if push is on).
        </Text>

        {(() => {
          const raw = (config.support_whatsapp || '').trim()
          if (!raw) return null
          const url = raw.startsWith('http')
            ? raw
            : `https://wa.me/${raw.replace(/[^\d]/g, '')}?text=${encodeURIComponent('Hi WalletTrails support')}`
          return (
            <Pressable
              style={[styles.waBtn, { borderColor: colors.border, backgroundColor: colors.surfaceMuted }]}
              onPress={() => {
                void Linking.openURL(url)
              }}
            >
              <Text style={[styles.waText, { color: colors.primaryDark }]}>Prefer WhatsApp</Text>
            </Pressable>
          )
        })()}

        {error ? <ErrorBanner message={error} /> : null}

        {!active && !composing ? (
          <>
            <PrimaryButton
              title="New ticket"
              onPress={() => {
                setComposing(true)
                setError('')
              }}
            />
            <Text style={[styles.section, { color: colors.primaryDark }]}>Your tickets</Text>
            {threads.length === 0 ? (
              <Text style={[styles.hint, { color: colors.textMuted }]}>No tickets yet.</Text>
            ) : (
              threads.map((t) => (
                <Pressable
                  key={t.id}
                  style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
                  onPress={() => void openThread(t.id)}
                >
                  <Text style={[styles.rowTitle, { color: colors.text }]}>
                    #{t.id} {t.subject}
                  </Text>
                  <Text style={[styles.hint, { color: colors.textMuted }]}>
                    {t.status.replace('_', ' ')}
                    {t.last_message_preview ? ` · ${t.last_message_preview}` : ''}
                  </Text>
                </Pressable>
              ))
            )}
          </>
        ) : null}

        {composing ? (
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.rowTitle, { color: colors.text }]}>New ticket</Text>
            <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Category</Text>
            <View style={styles.chips}>
              {CATEGORIES.map((c) => (
                <Pressable
                  key={c.value}
                  onPress={() => setCategory(c.value)}
                  style={[
                    styles.chip,
                    {
                      backgroundColor: category === c.value ? colors.primary : colors.surfaceMuted,
                      borderColor: colors.border,
                    },
                  ]}
                >
                  <Text
                    style={{
                      color: category === c.value ? '#fff' : colors.text,
                      fontWeight: '600',
                      fontSize: 12,
                    }}
                  >
                    {c.label}
                  </Text>
                </Pressable>
              ))}
            </View>
            <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Subject</Text>
            <TextInput
              value={subject}
              onChangeText={setSubject}
              maxLength={160}
              style={[styles.input, { backgroundColor: colors.surfaceMuted, borderColor: colors.border, color: colors.text }]}
              placeholder="Short summary"
              placeholderTextColor={colors.textMuted}
            />
            <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Message</Text>
            <TextInput
              value={body}
              onChangeText={setBody}
              maxLength={4000}
              multiline
              style={[
                styles.input,
                styles.area,
                { backgroundColor: colors.surfaceMuted, borderColor: colors.border, color: colors.text },
              ]}
              placeholder="Describe the issue (no need to paste wallet balances)"
              placeholderTextColor={colors.textMuted}
            />
            <PrimaryButton title={busy ? 'Sending…' : 'Submit'} onPress={() => void createTicket()} />
            <Pressable onPress={() => setComposing(false)} style={{ marginTop: spacing.md }}>
              <Text style={{ color: colors.textMuted, textAlign: 'center' }}>Cancel</Text>
            </Pressable>
          </View>
        ) : null}

        {active ? (
          <View>
            <Pressable
              onPress={() => {
                setActive(null)
                void loadList()
              }}
            >
              <Text style={{ color: colors.primary, fontWeight: '700', marginBottom: spacing.sm }}>
                ← All tickets
              </Text>
            </Pressable>
            <Text style={[styles.rowTitle, { color: colors.text }]}>
              #{active.id} {active.subject}
            </Text>
            <Text style={[styles.hint, { color: colors.textMuted, marginBottom: spacing.md }]}>
              {active.status.replace('_', ' ')} · {active.category}
            </Text>
            {(active.messages || []).map((m) => (
              <View
                key={m.id}
                style={[
                  styles.bubble,
                  {
                    backgroundColor: m.sender === 'staff' ? '#d1fae5' : colors.surfaceMuted,
                    alignSelf: m.sender === 'staff' ? 'flex-start' : 'flex-end',
                  },
                ]}
              >
                <Text style={{ fontSize: 11, color: colors.textMuted, marginBottom: 4 }}>
                  {m.sender === 'staff' ? 'Support' : 'You'}
                  {m.created_at ? ` · ${new Date(m.created_at).toLocaleString()}` : ''}
                </Text>
                <Text style={{ color: colors.text, lineHeight: 20 }}>{m.body}</Text>
              </View>
            ))}
            {active.status !== 'closed' ? (
              <View style={{ marginTop: spacing.md }}>
                <TextInput
                  value={reply}
                  onChangeText={setReply}
                  maxLength={4000}
                  multiline
                  style={[
                    styles.input,
                    styles.area,
                    { backgroundColor: colors.surfaceMuted, borderColor: colors.border, color: colors.text },
                  ]}
                  placeholder="Write a reply…"
                  placeholderTextColor={colors.textMuted}
                />
                <PrimaryButton title={busy ? 'Sending…' : 'Send reply'} onPress={() => void sendReply()} />
              </View>
            ) : (
              <Text style={[styles.hint, { color: colors.textMuted }]}>This ticket is closed.</Text>
            )}
          </View>
        ) : null}
      </ScrollView>
    </Screen>
  )
}

const styles = StyleSheet.create({
  pad: { padding: spacing.lg, paddingBottom: spacing.xxl + 80 },
  title: { fontSize: typography.title, fontWeight: '800', marginBottom: spacing.sm },
  hint: { fontSize: 13, lineHeight: 18, marginBottom: spacing.md },
  waBtn: {
    borderWidth: 1,
    borderRadius: radii.md,
    paddingVertical: 12,
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  waText: { fontWeight: '800', fontSize: typography.body },
  section: { fontSize: typography.subtitle, fontWeight: '800', marginTop: spacing.lg, marginBottom: spacing.sm },
  card: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radii.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  rowTitle: { fontWeight: '700', fontSize: 15, marginBottom: 4 },
  fieldLabel: { fontSize: 12, fontWeight: '600', marginTop: spacing.sm, marginBottom: 6 },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radii.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: spacing.sm,
  },
  area: { minHeight: 100, textAlignVertical: 'top' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: spacing.sm },
  chip: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  bubble: {
    maxWidth: '92%',
    borderRadius: radii.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
})
